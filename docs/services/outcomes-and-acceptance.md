# Outcomes And Acceptance Criteria

This page turns the USD 12,000 and USD 15,000 offers into concrete buyer
acceptance tests. It is intentionally practical: the engagement is accepted
only when the selected workflow has inspectable evidence.

## Commercial Terms

| Offer | Fixed fee | Payment milestone | Delivery milestone |
| --- | ---: | --- | --- |
| Agent Memory Reliability Sprint | USD 12,000 | USD 6,000 upfront | USD 6,000 on accepted delivery |
| OpenSupport AgentOps Pilot | USD 15,000 | USD 7,500 upfront | USD 7,500 on accepted delivery |

The second payment is waived if the agreed replay suite plus implementation
path is not delivered for the selected workflow.

## Agent Memory Reliability Sprint

The sprint is accepted when one production-relevant agent workflow has all of
the following:

| Acceptance item | Evidence delivered |
| --- | --- |
| Workflow and memory boundary | Written map of actors, sessions, tools, memory stores, and recall points |
| Memory taxonomy | Classification for instructions, facts, decisions, preferences, goals, errors, artifacts, provenance, retention, and deletion |
| Risk model | Stale memory, permission drift, sensitive data, contradiction, cross-agent contamination, and provenance risks |
| Replay tests | 8-12 test cases or runnable tests for recall, non-recall, staleness, contradiction, redaction, provenance, and permission scope |
| Reliability scorecard | Ranked findings across write policy, retrieval policy, permissions, observability, evaluation, and user control |
| Implementation path | 48h, 2w, and 6w plan with owners, sequence, dependencies, and known gaps |
| Optional bounded patch | Pull request, branch, or patch file when repo access is available and scope is narrow enough |

### Minimum Quality Bar

- Tests include at least two negative cases where memory must not be recalled.
- Tests include at least one stale or superseded-memory case.
- Sensitive data handling is explicit even when the buyer does not provide
  production data.
- The implementation path names what should not be built yet.
- The report is written so a technical reviewer can assign the next change
  without another strategy session.

## OpenSupport AgentOps Pilot

The pilot is accepted when one ecommerce support workflow has all of the
following:

| Acceptance item | Evidence delivered |
| --- | --- |
| Workflow selection | One bounded ticket path with business value and risk rationale |
| Integration plan | Chatwoot or support-stack connection path, webhook/agent-bot boundary, and data handling assumptions |
| Guardrail policy | Approval, escalation, unsafe-promise, PII, refund, discount, and policy-conflict rules |
| Runtime mode plan | Shadow, assist, or low-risk auto path with rollout and rollback criteria |
| Eval suite | Replay and security tests for the selected workflow |
| Cost and latency visibility | Cost estimate method, latency budget, and measurement points |
| Rollout decision | Go, no-go, or staged rollout recommendation with evidence |
| Optional implementation branch | Bounded branch or patch when access is available and deployment scope is approved |

### Minimum Quality Bar

- The first rollout mode avoids uncontrolled auto-replies unless explicitly
  approved.
- Unsafe side effects have approval gates.
- Buyer policies are represented as testable cases, not only prose.
- Rollback conditions are written before rollout.
- Known gaps are included in the final report.

## Out Of Scope Unless Separately Scoped

- More than one primary workflow.
- Formal compliance certification.
- Production hosting operated by Grove.
- Unlimited support or unlimited revisions.
- Full customer support SaaS buildout.
- Guarantees about model behavior outside the selected workflow.

## Buyer Responsibilities

The buyer provides:

- one workflow owner,
- one technical reviewer,
- examples of success and failure,
- current prompts, policies, tools, or architecture where available,
- access to repositories or staging systems only when implementation work is
  included,
- a safe process for sharing any sensitive data.

## Delivery Format

Default delivery includes:

- Markdown report,
- replay test cases or test specifications,
- scorecard,
- prioritized implementation plan,
- links to any branch, patch, or prototype artifact,
- final acceptance checklist.

See [Agent Memory Replay Test Catalog](./agent-memory-replay-catalog.md) for a
public sample of the replay case format.

See [First 48 Hours After Yes](./first-48-hours.md) for the kickoff sequence
after a buyer agrees the scope is worth pursuing.

## Final Acceptance Checklist

```text
The selected workflow has a written risk map, a scoped taxonomy or guardrail
policy, replay/security tests for the highest-risk failures, a scorecard, and
a concrete implementation path that the buyer can assign or run.
```
