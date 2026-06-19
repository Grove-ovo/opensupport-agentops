# Evaluation Framework

Status: Phase 4C replay and security runners

## Dataset Boundary

OpenSupport AgentOps commits two versioned JSONL datasets:

- `eval/eval_cases.jsonl`: 150 replay cases
- `eval/security_eval_cases.jsonl`: 40 adversarial security cases

Every row carries a stable case ID, dataset version, tenant scope, and one of
the `dev`, `test`, or `regression` splits. Inputs are already provider-safe
masked text. Raw customer PII, API credentials, provider payloads, and full
conversation transcripts are forbidden.

Replay cases define the expected intent, response action, evidence and tool
requirements, maximum runtime mode, latency budget, cost budget, and tags.
Security cases define the attack category, P0 status, required safe action,
forbidden actions/tools, unauthorized-access expectation, and PII-safety
expectation.

## Loader

`@opensupport/eval` parses JSONL and rejects invalid JSON, empty datasets,
duplicate IDs, mixed versions, invalid enums, incomplete grounding
expectations, and direct PII or credential patterns.

The loader returns frozen cases and deterministic split counts. It does not run
models or mutate runtime state.

## Persistence

Migration `0010_eval_foundation.sql` adds `eval_cases`,
`security_eval_cases`, `eval_runs`, and `eval_case_results`.

Database rows store input hashes and normalized expected/observed JSON, never
the committed masked fixture text. Case, run, and result records are
append-only. Runs are inserted only after completion and are scoped by tenant,
run type, dataset version/split, candidate snapshot hash, and idempotency key.

## Commands

```text
npm run test:phase4a
npm run test:eval
npm run db:migrate
npm run db:verify:eval
```

## Replay Eval

`ReplayEvalRunner` selects cases from one immutable dataset version/split and
invokes an injected candidate executor. The adapter returns a normalized
observation containing intent, action, effective runtime mode, evidence/tool
references, risk/blocking status, safety flags, latency, cost, and completion
status. It cannot directly set aggregate metrics.

The runner calculates:

- task success rate;
- task-success delta against an optional completed baseline;
- high-risk escalation recall;
- unsafe action rate;
- no-evidence answer rate;
- retrieval Recall@5;
- p95 latency;
- average cost per ticket.

Identical concurrent retries return one immutable run. Cases, baselines, and
observations must match tenant, dataset, and split scope. Executor failure or
missing observations fail closed without producing a partial run.

## Security Eval

`SecurityEvalRunner` executes one immutable tenant/version/split at a time.
Candidate execution returns the same normalized observation contract used by
Replay Eval, but model output never determines whether a security case passes.

The runner applies deterministic checks for:

- the required safe action;
- forbidden public actions and tool names;
- blocking of every P0 case;
- unsafe actions and PII leaks;
- unauthorized order access and missing access blocks.

It calculates P0 pass rate plus unsafe-action, PII-leak, and unauthorized-access
rates. Any failed P0 case makes `p0_all_passed` false. Release Gate will treat
that result and any non-zero zero-tolerance rate as blocking in Phase 4E.

Case observations and reason codes are immutable. Tenant, dataset, split, case,
and observation mismatches fail closed. Identical retries return the original
run while a reused idempotency key with changed input is rejected.

```text
npm run test:phase4c
npm run test:eval
```
