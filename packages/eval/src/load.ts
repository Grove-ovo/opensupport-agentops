import { createHash } from 'node:crypto';
import {
  monitorEventLoopDelay,
  performance,
  type IntervalHistogram,
} from 'node:perf_hooks';
import {
  isUuid,
  type LoadEventLoopMetrics,
  type LoadIterationResult,
  type LoadScenarioConfig,
  type LoadScenarioMetrics,
  type LoadScenarioResult,
} from '@opensupport/shared';

export interface LoadWorkloadInvocation {
  readonly scenario_id: string;
  readonly tenant_id: string;
  readonly workload_version: string;
  readonly workload_item_ref: string;
  readonly phase: 'warmup' | 'measured';
  readonly iteration_index: number;
  readonly signal: AbortSignal;
}

export interface LoadWorkloadExecutor {
  execute(
    invocation: LoadWorkloadInvocation,
  ): void | Promise<void>;
}

export interface RunLoadScenarioCommand {
  readonly run_id: string;
  readonly scenario: LoadScenarioConfig;
  readonly idempotency_key: string;
  readonly created_at?: string | undefined;
}

export interface LoadExecutionResult {
  readonly status: 'created' | 'duplicate';
  readonly result: LoadScenarioResult;
}

export interface LoadEventLoopProbe {
  start(): void;
  stop(): LoadEventLoopMetrics;
}

export interface LoadHarnessDependencies {
  readonly monotonic_now?: (() => number) | undefined;
  readonly wall_now?: (() => Date | string) | undefined;
  readonly event_loop_probe_factory?:
    | (() => LoadEventLoopProbe)
    | undefined;
}

export type LoadHarnessErrorCode =
  | 'invalid_command'
  | 'idempotency_conflict'
  | 'warmup_failed';

export class LoadHarnessError extends Error {
  constructor(readonly code: LoadHarnessErrorCode, message: string) {
    super(message);
    this.name = 'LoadHarnessError';
  }
}

interface StoredLoadRun {
  readonly input_hash: string;
  readonly result: Promise<LoadExecutionResult>;
}

interface PoolResult {
  readonly results: readonly LoadIterationResult[];
  readonly max_observed_concurrency: number;
}

export class ApplicationLoadHarness {
  readonly #runs = new Map<string, StoredLoadRun>();
  readonly #runScopes = new Map<string, string>();
  readonly #monotonicNow: () => number;
  readonly #wallNow: () => Date | string;
  readonly #eventLoopProbeFactory: () => LoadEventLoopProbe;

  constructor(
    readonly executor: LoadWorkloadExecutor,
    dependencies: LoadHarnessDependencies = {},
  ) {
    this.#monotonicNow =
      dependencies.monotonic_now ?? (() => performance.now());
    this.#wallNow = dependencies.wall_now ?? (() => new Date());
    this.#eventLoopProbeFactory =
      dependencies.event_loop_probe_factory ??
      (() => new NodeEventLoopProbe());
  }

  async run(
    command: RunLoadScenarioCommand,
  ): Promise<LoadExecutionResult> {
    validateCommand(command);
    const createdAt = normalizeTimestamp(
      command.created_at ?? this.#wallNow(),
    );
    const inputHash = hashStable(command);
    const scope = `${command.scenario.tenant_id}:${command.idempotency_key}`;
    const existing = this.#runs.get(scope);
    if (existing !== undefined) {
      if (existing.input_hash !== inputHash) {
        throw new LoadHarnessError(
          'idempotency_conflict',
          'load key was reused with different input',
        );
      }
      const original = await existing.result;
      return Object.freeze({ ...original, status: 'duplicate' });
    }
    const existingRunScope = this.#runScopes.get(command.run_id);
    if (existingRunScope !== undefined && existingRunScope !== scope) {
      throw new LoadHarnessError(
        'idempotency_conflict',
        'load run ID was reused with a different key',
      );
    }
    const result = this.#execute(command, createdAt, inputHash);
    this.#runs.set(scope, { input_hash: inputHash, result });
    this.#runScopes.set(command.run_id, scope);
    return result;
  }

  async #execute(
    command: RunLoadScenarioCommand,
    createdAt: string,
    inputHash: string,
  ): Promise<LoadExecutionResult> {
    if (command.scenario.warmup_iterations > 0) {
      const warmup = await this.#runPool(
        command.scenario,
        'warmup',
        command.scenario.warmup_iterations,
      );
      if (warmup.results.some((result) => result.status !== 'succeeded')) {
        throw new LoadHarnessError(
          'warmup_failed',
          'load warmup did not complete successfully',
        );
      }
    }
    const eventLoopProbe = this.#eventLoopProbeFactory();
    eventLoopProbe.start();
    const startedAt = this.#monotonicNow();
    let measured: PoolResult;
    let eventLoop: LoadEventLoopMetrics;
    try {
      measured = await this.#runPool(
        command.scenario,
        'measured',
        command.scenario.iterations,
      );
    } finally {
      eventLoop = eventLoopProbe.stop();
    }
    const durationMs = this.#monotonicNow() - startedAt;
    const metrics = calculateLoadMetrics(
      measured.results,
      durationMs,
      measured.max_observed_concurrency,
      eventLoop,
    );
    const result: LoadScenarioResult = Object.freeze({
      schema_version: 'load-scenario.v1',
      run_id: command.run_id,
      scenario: freezeScenario(command.scenario),
      status: 'completed',
      metrics,
      iteration_results: measured.results,
      idempotency_key: command.idempotency_key,
      input_hash: inputHash,
      created_at: createdAt,
      completed_at: normalizeTimestamp(this.#wallNow()),
    });
    return Object.freeze({ status: 'created', result });
  }

  async #runPool(
    scenario: LoadScenarioConfig,
    phase: LoadWorkloadInvocation['phase'],
    iterations: number,
  ): Promise<PoolResult> {
    const results = new Array<LoadIterationResult>(iterations);
    let nextIndex = 0;
    let active = 0;
    let maximumActive = 0;
    const workerCount = Math.min(scenario.concurrency, iterations);
    const worker = async (): Promise<void> => {
      while (nextIndex < iterations) {
        const iterationIndex = nextIndex;
        nextIndex += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          results[iterationIndex] = await this.#executeIteration(
            scenario,
            phase,
            iterationIndex,
          );
        } finally {
          active -= 1;
        }
      }
    };
    await Promise.all(
      Array.from({ length: workerCount }, async () => worker()),
    );
    if (results.some((result) => result === undefined)) {
      throw new LoadHarnessError(
        'invalid_command',
        'load runner produced incomplete results',
      );
    }
    return Object.freeze({
      results: Object.freeze(results),
      max_observed_concurrency: maximumActive,
    });
  }

  async #executeIteration(
    scenario: LoadScenarioConfig,
    phase: LoadWorkloadInvocation['phase'],
    iterationIndex: number,
  ): Promise<LoadIterationResult> {
    const workloadItemRef =
      scenario.workload_item_refs[
        iterationIndex % scenario.workload_item_refs.length
      ]!;
    const controller = new AbortController();
    const startedAt = this.#monotonicNow();
    let timer: NodeJS.Timeout | undefined;
    let operationSettled = false;
    const operation = Promise.resolve()
      .then(() =>
        this.executor.execute({
          scenario_id: scenario.scenario_id,
          tenant_id: scenario.tenant_id,
          workload_version: scenario.workload_version,
          workload_item_ref: workloadItemRef,
          phase,
          iteration_index: iterationIndex,
          signal: controller.signal,
        }),
      )
      .then(
        () => {
          operationSettled = true;
          return 'succeeded' as const;
        },
        () => {
          operationSettled = true;
          return 'error' as const;
        },
      );
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timeout');
      }, scenario.timeout_ms);
    });
    const status = await Promise.race([operation, timeout]);
    const finishedAt = this.#monotonicNow();
    if (timer !== undefined) clearTimeout(timer);
    if (!operationSettled) await operation;
    return Object.freeze({
      iteration_index: iterationIndex,
      workload_item_ref: workloadItemRef,
      status,
      error_code:
        status === 'timeout'
          ? 'timeout'
          : status === 'error'
            ? 'executor_error'
            : null,
      latency_ms: rounded(Math.max(0, finishedAt - startedAt)),
    });
  }
}

export function calculateLoadMetrics(
  results: readonly LoadIterationResult[],
  durationMs: number,
  maxObservedConcurrency: number,
  eventLoop: LoadEventLoopMetrics,
): LoadScenarioMetrics {
  if (
    results.length === 0 ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isInteger(maxObservedConcurrency) ||
    maxObservedConcurrency <= 0 ||
    !validEventLoopMetrics(eventLoop)
  ) {
    throw new LoadHarnessError(
      'invalid_command',
      'load metrics require complete positive measurements',
    );
  }
  const seen = new Set<number>();
  for (const result of results) {
    if (
      !Number.isInteger(result.iteration_index) ||
      result.iteration_index < 0 ||
      seen.has(result.iteration_index) ||
      result.workload_item_ref.trim().length === 0 ||
      !Number.isFinite(result.latency_ms) ||
      result.latency_ms < 0 ||
      (result.status === 'succeeded' && result.error_code !== null) ||
      (result.status === 'error' &&
        result.error_code !== 'executor_error') ||
      (result.status === 'timeout' && result.error_code !== 'timeout')
    ) {
      throw new LoadHarnessError(
        'invalid_command',
        'invalid load iteration result',
      );
    }
    seen.add(result.iteration_index);
  }
  const latencies = results.map((result) => result.latency_ms);
  return Object.freeze({
    measured_iterations: results.length,
    success_count: results.filter(
      (result) => result.status === 'succeeded',
    ).length,
    error_count: results.filter((result) => result.status === 'error').length,
    timeout_count: results.filter(
      (result) => result.status === 'timeout',
    ).length,
    max_observed_concurrency: maxObservedConcurrency,
    duration_ms: rounded(durationMs),
    throughput_per_second: rounded(results.length / (durationMs / 1000)),
    p50_latency_ms: percentile(latencies, 0.5),
    p95_latency_ms: percentile(latencies, 0.95),
    p99_latency_ms: percentile(latencies, 0.99),
    event_loop: Object.freeze({ ...eventLoop }),
  });
}

class NodeEventLoopProbe implements LoadEventLoopProbe {
  #histogram: IntervalHistogram | undefined;
  #startUtilization:
    | ReturnType<typeof performance.eventLoopUtilization>
    | undefined;

  start(): void {
    this.#histogram = monitorEventLoopDelay({ resolution: 10 });
    this.#histogram.enable();
    this.#startUtilization = performance.eventLoopUtilization();
  }

  stop(): LoadEventLoopMetrics {
    const histogram = this.#histogram;
    const startUtilization = this.#startUtilization;
    if (histogram === undefined || startUtilization === undefined) {
      throw new LoadHarnessError(
        'invalid_command',
        'event-loop probe was not started',
      );
    }
    const utilization =
      performance.eventLoopUtilization(startUtilization).utilization;
    histogram.disable();
    this.#histogram = undefined;
    this.#startUtilization = undefined;
    const delayP95Ms = nanosecondsToMilliseconds(
      histogram.percentile(95),
    );
    return Object.freeze({
      utilization: rounded(utilization),
      delay_p95_ms: delayP95Ms,
      delay_max_ms: Math.max(
        delayP95Ms,
        nanosecondsToMilliseconds(histogram.max),
      ),
    });
  }
}

function validateCommand(command: RunLoadScenarioCommand): void {
  const scenario = command.scenario;
  if (
    !isUuid(command.run_id) ||
    !isUuid(scenario.scenario_id) ||
    !isUuid(scenario.tenant_id) ||
    !validVersion(scenario.workload_version) ||
    scenario.workload_item_refs.length === 0 ||
    new Set(scenario.workload_item_refs).size !==
      scenario.workload_item_refs.length ||
    scenario.workload_item_refs.some(
      (item) => !/^[A-Za-z0-9._:-]{1,256}$/u.test(item),
    ) ||
    !validInteger(scenario.warmup_iterations, 0, 100_000) ||
    !validInteger(scenario.iterations, 1, 1_000_000) ||
    !validInteger(scenario.concurrency, 1, 10_000) ||
    !validInteger(scenario.timeout_ms, 1, 3_600_000) ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(command.idempotency_key)
  ) {
    throw new LoadHarnessError('invalid_command', 'invalid load command');
  }
}

function freezeScenario(
  scenario: LoadScenarioConfig,
): LoadScenarioConfig {
  return Object.freeze({
    ...scenario,
    workload_item_refs: Object.freeze([...scenario.workload_item_refs]),
  });
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return rounded(
    sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0,
  );
}

function validEventLoopMetrics(value: LoadEventLoopMetrics): boolean {
  return (
    Number.isFinite(value.utilization) &&
    value.utilization >= 0 &&
    value.utilization <= 1 &&
    Number.isFinite(value.delay_p95_ms) &&
    value.delay_p95_ms >= 0 &&
    Number.isFinite(value.delay_max_ms) &&
    value.delay_max_ms >= value.delay_p95_ms
  );
}

function validVersion(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
}

function validInteger(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return (
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function nanosecondsToMilliseconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return rounded(value / 1_000_000);
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new LoadHarnessError(
      'invalid_command',
      'load timestamp is invalid',
    );
  }
  return date.toISOString();
}

function hashStable(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new LoadHarnessError(
        'invalid_command',
        'cannot hash non-finite number',
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${stableJson(record[key])}`,
      );
    return `{${fields.join(',')}}`;
  }
  throw new LoadHarnessError(
    'invalid_command',
    'unsupported hash input',
  );
}
