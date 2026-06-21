import type { WorkerMetrics } from './contracts.js';

export class MetricsRegistry implements WorkerMetrics {
  readonly #counters = new Map<string, number>();
  readonly #gauges = new Map<string, number>();

  increment(
    name: string,
    labels: Record<string, string> = {},
    value = 1,
  ): void {
    const key = metricKey(name, labels);
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + value);
  }

  gauge(
    name: string,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    this.#gauges.set(metricKey(name, labels), value);
  }

  render(): string {
    const lines = [
      '# HELP agentops_worker_info AgentOps worker build information.',
      '# TYPE agentops_worker_info gauge',
    ];
    for (const [key, value] of [...this.#gauges, ...this.#counters].sort()) {
      lines.push(`${key} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

function metricKey(name: string, labels: Record<string, string>) {
  const values = Object.entries(labels).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return values.length === 0
    ? name
    : `${name}{${values.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function escapeLabel(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n');
}
