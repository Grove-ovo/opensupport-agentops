import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'packages/shared/src/evidence.ts',
  'packages/rag/src/pipeline.ts',
  'packages/rag/src/eval.ts',
  'packages/rag/src/rag.test.ts',
  'docs/rag_pipeline.md',
  'reports/rag_eval_baseline.md',
  '.trellis/spec/agent/phase-2d-rag-evidence.md',
];
const failures = [];
for (const path of requiredPaths) {
  if (!existsSync(path)) failures.push(`missing Phase 2D artifact: ${path}`);
}

const shared = read('packages/shared/src/evidence.ts');
const pipeline = read('packages/rag/src/pipeline.ts');
const report = read('reports/rag_eval_baseline.md');
const pkg = read('package.json');

for (const value of [
  'EvidenceRef',
  'EvidenceBundle',
  'EvidenceGateDecision',
  'MergedRetrievalCandidate',
]) {
  if (!shared.includes(value)) failures.push(`shared evidence must include ${value}`);
}
for (const value of [
  'runRAGEvidencePipeline',
  'stale_version',
  'injected_document',
  'conflict_detected',
  'no_evidence',
  'raw_lexical_candidates',
  'raw_vector_candidates',
]) {
  if (!pipeline.includes(value)) failures.push(`RAG pipeline must include ${value}`);
}
for (const value of ['Retrieval Recall@5', 'Evidence Hit Rate', '100%']) {
  if (!report.includes(value)) failures.push(`baseline report must include ${value}`);
}
for (const value of ['test:phase2d', 'test:rag']) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}

if (failures.length) {
  console.error('Phase 2D validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 2D validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
