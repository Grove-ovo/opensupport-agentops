import { spawnSync } from 'node:child_process';

export const DEFAULT_REAL_INTEGRATION_OPTIONS = Object.freeze({
  composeFile: 'infra/docker/compose.phase1.yml',
  postgresHost: '127.0.0.1',
  postgresPort: '55432',
  redisHost: '127.0.0.1',
  redisPort: '56379',
});

export function buildRealIntegrationEnvironment(
  inputEnv = process.env,
  options = {},
) {
  const defaults = {
    ...DEFAULT_REAL_INTEGRATION_OPTIONS,
    ...options,
  };
  const postgresUser = composeValue(inputEnv.AGENTOPS_POSTGRES_USER, 'agentops');
  const postgresPassword = composeValue(
    inputEnv.AGENTOPS_POSTGRES_PASSWORD,
    'agentops',
  );
  const postgresDb = composeValue(inputEnv.AGENTOPS_POSTGRES_DB, 'agentops');
  const postgresPort = portValue(
    composeValue(inputEnv.AGENTOPS_POSTGRES_PORT, defaults.postgresPort),
  );
  const redisPassword = composeValue(
    inputEnv.AGENTOPS_REDIS_PASSWORD,
    'agentops',
  );
  const redisPort = portValue(
    composeValue(inputEnv.AGENTOPS_REDIS_PORT, defaults.redisPort),
  );

  return {
    ...inputEnv,
    AGENTOPS_POSTGRES_USER: postgresUser,
    AGENTOPS_POSTGRES_PASSWORD: postgresPassword,
    AGENTOPS_POSTGRES_DB: postgresDb,
    AGENTOPS_POSTGRES_PORT: postgresPort,
    AGENTOPS_REDIS_PASSWORD: redisPassword,
    AGENTOPS_REDIS_PORT: redisPort,
    DATABASE_URL: postgresUrl({
      user: postgresUser,
      password: postgresPassword,
      host: defaults.postgresHost,
      port: postgresPort,
      database: postgresDb,
    }),
    REDIS_URL: redisUrl({
      password: redisPassword,
      host: defaults.redisHost,
      port: redisPort,
    }),
    AGENTOPS_RUN_INTEGRATION: '1',
  };
}

export function buildRealIntegrationPlan(options = {}) {
  const env = buildRealIntegrationEnvironment(options.env, options);
  const composeFile =
    options.composeFile ?? DEFAULT_REAL_INTEGRATION_OPTIONS.composeFile;
  const npm = options.npmCommand ?? npmCommand(options.platform);
  const steps = [
    commandStep('compose_config', 'docker', [
      'compose',
      '-f',
      composeFile,
      'config',
    ]),
  ];
  if (options.skipComposeUp !== true) {
    steps.push(
      commandStep('compose_up', 'docker', [
        'compose',
        '-f',
        composeFile,
        'up',
        '-d',
        '--wait',
      ]),
    );
  }
  steps.push(
    commandStep('migrate', npm, ['run', 'db:migrate:node']),
    commandStep('api_integration', npm, ['run', 'test:api:integration'], {
      assertNoSkippedTests: true,
    }),
    commandStep('api_e2e', npm, ['run', 'test:e2e'], {
      assertNoSkippedTests: true,
    }),
    commandStep('worker_integration', npm, ['run', 'test:worker:integration'], {
      assertNoSkippedTests: true,
    }),
  );
  return steps.map((step) => ({ ...step, env }));
}

export function buildRealIntegrationTeardownStep(options = {}) {
  const composeFile =
    options.composeFile ?? DEFAULT_REAL_INTEGRATION_OPTIONS.composeFile;
  const args = ['compose', '-f', composeFile, 'down'];
  if (options.volumes === true) {
    args.push('-v');
  }
  return commandStep('compose_down', 'docker', args);
}

export function runCommandPlan(steps, options = {}) {
  const runner = options.runner ?? spawnSync;
  const stepResults = [];
  const stepsRun = [];
  for (const step of steps) {
    const stdio =
      step.assertNoSkippedTests === true ? 'pipe' : (options.stdio ?? 'inherit');
    const startedAt = Date.now();
    const result = runner(step.command, step.args, {
      cwd: options.cwd ?? process.cwd(),
      env: step.env ?? process.env,
      stdio,
      encoding: 'utf8',
      maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024,
    });
    const durationMs = Date.now() - startedAt;
    relayCapturedOutput(result, stdio, options.relayOutput !== false);
    if (result.error) {
      stepResults.push(failedStepResult(step, durationMs, result.error.message));
      return failure(step, 1, result.error.message, stepsRun, stepResults);
    }
    if (result.status !== 0) {
      const detail = result.signal ?? null;
      stepResults.push(failedStepResult(step, durationMs, detail));
      return failure(step, result.status ?? 1, detail, stepsRun, stepResults);
    }
    let skippedTests = null;
    if (step.assertNoSkippedTests === true) {
      const skipped = parseSkippedSummary(result);
      if (skipped === null) {
        stepResults.push(
          failedStepResult(step, durationMs, 'skipped_summary_missing'),
        );
        return failure(
          step,
          1,
          'skipped_summary_missing',
          stepsRun,
          stepResults,
        );
      }
      if (skipped > 0) {
        const detail = `skipped_tests:${skipped}`;
        stepResults.push(
          failedStepResult(step, durationMs, detail, { skippedTests: skipped }),
        );
        return failure(step, 1, detail, stepsRun, stepResults);
      }
      skippedTests = skipped;
    }
    stepsRun.push(step.id);
    stepResults.push(passedStepResult(step, durationMs, skippedTests));
  }
  return {
    status: 'passed',
    exitCode: 0,
    failedStep: null,
    stepsRun,
    stepResults,
  };
}

function commandStep(id, command, args, options = {}) {
  return Object.freeze({
    id,
    command,
    args: Object.freeze(args),
    ...options,
  });
}

function failure(step, exitCode, detail, stepsRun, stepResults) {
  return {
    status: 'failed',
    exitCode,
    failedStep: step.id,
    detail,
    stepsRun,
    stepResults,
  };
}

function passedStepResult(step, durationMs, skippedTests) {
  const result = {
    id: step.id,
    status: 'passed',
    duration_ms: durationMs,
  };
  if (skippedTests !== null) {
    result.skipped_tests = skippedTests;
  }
  return result;
}

function failedStepResult(step, durationMs, detail, options = {}) {
  const result = {
    id: step.id,
    status: 'failed',
    duration_ms: durationMs,
    detail,
  };
  if (typeof options.skippedTests === 'number') {
    result.skipped_tests = options.skippedTests;
  }
  return result;
}

function postgresUrl(input) {
  return `postgresql://${encodeURIComponent(input.user)}:${encodeURIComponent(
    input.password,
  )}@${input.host}:${input.port}/${encodeURIComponent(input.database)}`;
}

function redisUrl(input) {
  if (input.password.length === 0) {
    return `redis://${input.host}:${input.port}/0`;
  }
  return `redis://:${encodeURIComponent(input.password)}@${input.host}:${input.port}/0`;
}

function relayCapturedOutput(result, stdio, enabled) {
  if (stdio !== 'pipe' || !enabled) return;
  if (typeof result.stdout === 'string' && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (typeof result.stderr === 'string' && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
}

function parseSkippedSummary(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const matches = [...output.matchAll(/^# skipped (\d+)$/gmu)];
  if (matches.length === 0) return null;
  return matches.reduce((total, match) => total + Number(match[1]), 0);
}

function composeValue(value, fallback) {
  return value === undefined || value === '' ? fallback : value;
}

function portValue(value) {
  if (!/^\d{1,5}$/u.test(String(value))) {
    throw new Error('invalid_port');
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65_535) {
    throw new Error('invalid_port');
  }
  return String(number);
}

function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}
