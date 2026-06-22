interface MetricLabels {
  [key: string]: string;
}

export class MetricsRegistry {
  readonly #counters = new Map<string, number>();
  readonly #gauges = new Map<string, number>();

  increment(name: string, labels: MetricLabels = {}, value = 1): void {
    const key = metricKey(name, labels);
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + value);
  }

  gauge(name: string, value: number, labels: MetricLabels = {}): void {
    this.#gauges.set(metricKey(name, labels), value);
  }

  render(): string {
    const lines = [
      '# HELP agentops_info AgentOps service build information.',
      '# TYPE agentops_info gauge',
    ];

    for (const [key, value] of [...this.#gauges.entries()].sort()) {
      lines.push(`${key} ${value}`);
    }
    for (const [key, value] of [...this.#counters.entries()].sort()) {
      lines.push(`${key} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

function metricKey(name: string, labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) {
    return name;
  }
  const encoded = entries
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',');
  return `${name}{${encoded}}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}
