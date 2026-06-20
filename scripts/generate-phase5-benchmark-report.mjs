import { readFile, writeFile } from 'node:fs/promises';
import {
  createBenchmarkComparison,
} from './phase5-report-fixtures.mjs';

const reportPath = 'reports/benchmark_report.md';
const checkOnly = process.argv.includes('--check');
const comparison = await createBenchmarkComparison();
const content = renderReport(comparison);

if (checkOnly) {
  const current = await readFile(reportPath, 'utf8').catch(() => '');
  if (current !== content) {
    console.error(
      `${reportPath} is not reproducible; regenerate the Phase 5 benchmark report`,
    );
    process.exit(1);
  }
  console.log('Phase 5 benchmark report is reproducible');
} else {
  await writeFile(reportPath, content, 'utf8');
  console.log(`generated ${reportPath}`);
}

function renderReport(result) {
  const metricRows = result.runs
    .map(
      (run) =>
        `| ${run.variant} | ${percent(run.metrics.task_success_rate)} | ${percent(run.metrics.retrieval_recall_at_5)} | ${percent(run.metrics.tool_call_accuracy)} | ${percent(run.metrics.unsafe_action_rate)} | ${percent(run.metrics.no_evidence_answer_rate)} | ${percent(run.metrics.human_edit_rate)} | ${run.metrics.p95_latency_ms} | ${money(run.metrics.average_cost_per_ticket)} |`,
    )
    .join('\n');
  const deltaRows = result.v3_deltas
    .map(
      (item) =>
        `| ${item.baseline_variant} | ${signedPercent(item.metrics.task_success_rate)} | ${signedPercent(item.metrics.retrieval_recall_at_5)} | ${signedPercent(item.metrics.tool_call_accuracy)} | ${signedPercent(item.metrics.unsafe_action_rate)} | ${signedPercent(item.metrics.no_evidence_answer_rate)} | ${signedPercent(item.metrics.human_edit_rate)} | ${signedNumber(item.metrics.p95_latency_ms)} ms | ${signedMoney(item.metrics.average_cost_per_ticket)} |`,
    )
    .join('\n');
  const rankingRows = result.ranking
    .map(
      (item) =>
        `| ${item.rank} | ${item.variant} | ${percent(item.metrics.unsafe_action_rate)} | ${percent(item.metrics.task_success_rate)} | ${percent(item.metrics.tool_call_accuracy)} |`,
    )
    .join('\n');
  return `# Phase 5 Architecture Benchmark

Generated: ${result.created_at}

> Deterministic reference-fixture architecture comparison. These results do not measure production model, provider, network, Chatwoot, or commerce-system quality.

## Immutable Scope

| Item | Value |
|------|------:|
| Dataset version | ${result.dataset_version} |
| Dataset split | ${result.dataset_split} |
| Evaluated cases | ${result.case_count} |
| Workload version | ${result.workload_version} |
| Config hash | \`${result.config_hash}\` |
| Scope hash | \`${result.scope_hash}\` |

All four variants executed the same ordered case set, budget fields, edit threshold, configuration hash, and workload version. The shared scope hash excludes variant identity and idempotency keys.

## Metrics

| Variant | Task Success | Retrieval Recall@5 | Tool Accuracy | Unsafe Action | No-evidence Answer | Human Edit | p95 Latency (ms) | Avg Cost/Ticket |
|---------|-------------:|-------------------:|--------------:|--------------:|-------------------:|-----------:|-----------------:|----------------:|
${metricRows}

## V3 Pairwise Deltas

Each delta is \`v3_selective_pipeline - baseline\`. Lower values are better for unsafe action, no-evidence answer, human edit, latency, and cost. Higher values are better for task success, retrieval recall, and tool accuracy.

| Baseline | Task Success | Retrieval Recall@5 | Tool Accuracy | Unsafe Action | No-evidence Answer | Human Edit | p95 Latency | Avg Cost/Ticket |
|----------|-------------:|-------------------:|--------------:|--------------:|-------------------:|-----------:|------------:|----------------:|
${deltaRows}

## Safety-first Ranking

Any variant with a non-zero Unsafe Action Rate ranks below every zero-unsafe variant. Remaining ties are resolved deterministically by task success, tool accuracy, retrieval recall, no-evidence rate, human edit rate, latency, cost, and variant ID.

| Rank | Variant | Unsafe Action | Task Success | Tool Accuracy |
|-----:|---------|--------------:|-------------:|--------------:|
${rankingRows}

## Interpretation Boundary

- V0-V3 are deterministic project-owned architecture fixtures.
- V3 executes the existing selective Agent pipeline with injected deterministic adapters.
- No live LLM provider, external HTTP request, Chatwoot delivery, approval action, or mutable commerce operation occurs.
- This report supports architecture regression and reproducibility checks; it is not a production capacity or model-quality claim.
`;
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function signedPercent(value) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function signedNumber(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function money(value) {
  return `$${value.toFixed(4)}`;
}

function signedMoney(value) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(4)}`;
}
