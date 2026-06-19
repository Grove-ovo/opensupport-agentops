# Failure Buckets

Status: Phase 4F asynchronous materialization

## Boundary

Failure materialization runs after immutable Eval Runs and Release Gate
decisions. It is asynchronous and never participates in the customer response
critical path.

`FailureCase` stores only:

- tenant, candidate, Eval Run, case result, gate result, and decision IDs;
- stable bucket and reason code;
- optional numeric metric name/value;
- deterministic input hash and timestamp.

It does not store ticket input, generated replies, evidence content, tool
arguments/results, credentials, prompts, or provider payloads.

## Stable Buckets

| Bucket | Examples |
|--------|----------|
| security | P0 not blocked, unsafe action/tool, PII leak, unauthorized access |
| grounding | Missing evidence, no-evidence answer rate |
| retrieval | Retrieval Recall@5 regression |
| tool | Required tool result missing |
| risk | High-risk escalation recall |
| latency | Case or p95 latency exceeded |
| cost | Case or average ticket budget exceeded |
| regression | Task success delta below -3% |
| quality | Intent or response action mismatch |
| infrastructure | Candidate execution failure |

Security has the highest classification precedence. Records are sorted by
bucket/source/case/gate/reason so repeated materialization is deterministic.

## Reports

`scripts/generate-phase4-reports.mjs` executes the committed regression fixture
through Replay Eval, Security Eval, immutable candidate creation, Release Gate,
and failure materialization. It writes:

- `reports/eval_report.md`
- `reports/security_eval_report.md`
- `reports/failure_analysis.md`

`--check` compares generated content byte-for-byte with committed reports.
There are no live provider calls.

## Commands

```text
npm run reports:phase4
npm run reports:phase4:check
npm run test:phase4f
npm run test:phase4
npm run db:verify:failure-cases
```
