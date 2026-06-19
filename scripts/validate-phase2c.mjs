import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'infra/migrations/0005_policy_corpus_hybrid_retrieval.sql',
  'infra/verification/phase2c_policy_retrieval.sql',
  'packages/shared/src/retrieval.ts',
  'packages/retrieval/src/ingestion.ts',
  'packages/retrieval/src/candidates.ts',
  'packages/retrieval/src/retrieval.test.ts',
  'docs/policy_retrieval.md',
  '.trellis/spec/infra/phase-2c-policy-retrieval.md',
];
const failures = [];

for (const path of requiredPaths) {
  if (!existsSync(path)) {
    failures.push(`missing Phase 2C artifact: ${path}`);
  }
}

const migration = read('infra/migrations/0005_policy_corpus_hybrid_retrieval.sql');
const compose = read('infra/docker/compose.phase1.yml');
const shared = read('packages/shared/src/retrieval.ts');
const ingestion = read('packages/retrieval/src/ingestion.ts');
const candidates = read('packages/retrieval/src/candidates.ts');
const packageJson = read('package.json');
const spec = read('.trellis/spec/infra/phase-2c-policy-retrieval.md');

for (const value of [
  'CREATE EXTENSION IF NOT EXISTS vector',
  'policy_versions',
  'policy_documents',
  'policy_chunks',
  'policy_chunk_embeddings',
  'retrieval_config_versions',
  'search_policy_chunks_lexical',
  'search_policy_chunks_vector',
  'vector(1536)',
  'search_vector',
  'published policy content is immutable',
  'retrieval config versions are immutable',
]) {
  if (!migration.includes(value)) {
    failures.push(`retrieval migration must include ${value}`);
  }
}

if (!compose.includes('pgvector/pgvector:pg16')) {
  failures.push('local PostgreSQL runtime must use the pgvector pg16 image');
}

for (const value of [
  'PolicyIngestionPlan',
  'RetrievalCandidate',
  'RetrievalConfigVersion',
]) {
  if (!shared.includes(value)) {
    failures.push(`shared retrieval contracts must include ${value}`);
  }
}

for (const value of [
  'createPolicyIngestionPlan',
  'normalizePolicyContent',
  'deterministicUuid',
  'content_hash',
]) {
  if (!ingestion.includes(value)) {
    failures.push(`ingestion must include ${value}`);
  }
}

for (const value of [
  'retrieveLexicalCandidates',
  'retrieveVectorCandidates',
  'cosineSimilarity',
  'tenant_id === input.tenantId',
]) {
  if (!candidates.includes(value)) {
    failures.push(`candidate retrieval must include ${value}`);
  }
}

for (const value of [
  '0005_policy_corpus_hybrid_retrieval.sql',
  'db:verify:retrieval',
  'test:phase2c',
  'test:retrieval',
]) {
  if (!packageJson.includes(value)) {
    failures.push(`package.json must include ${value}`);
  }
}

for (const section of [
  '### 1. Scope / Trigger',
  '### 2. Signatures',
  '### 3. Contracts',
  '### 4. Validation & Error Matrix',
  '### 5. Good/Base/Bad Cases',
  '### 6. Tests Required',
  '### 7. Wrong vs Correct',
]) {
  if (!spec.includes(section)) {
    failures.push(`Phase 2C infra spec must include ${section}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 2C validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Phase 2C validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
