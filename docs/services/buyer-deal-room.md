# Buyer Deal Room

This page collects the commercial paths and proof assets for buyers evaluating
agent memory reliability or ecommerce support AgentOps work.

## Choose The Path

| Path | Fixed fee | Best fit | Start here |
| --- | ---: | --- | --- |
| Agent Memory Reliability Sprint | USD 12,000 | Teams already shipping AI agents where memory, context, permissions, or stale decisions can create business risk | [Sprint details](./agent-memory-reliability-sprint.md) |
| OpenSupport AgentOps Pilot | USD 15,000 | Ecommerce support teams that want guarded support automation before uncontrolled auto-replies | [Pilot details](./opensupport-agentops-pilot.md) |

## Why This Is Not A Generic AI Consulting Offer

The work is scoped around reliability artifacts that a technical buyer can
inspect:

- replay tests,
- security cases,
- immutable traces,
- runtime modes,
- human approval flows,
- release gates,
- cost and load reports,
- deployment and recovery runbooks.

The point is to make one workflow safer and more measurable, not to sell a vague
AI transformation project.

## Proof Before Intake

| Need | Link |
| --- | --- |
| Repository evidence map | [OpenSupport AgentOps proof pack](./proof-pack.md) |
| Example memory sprint deliverable | [Sample sprint report](./sample-memory-sprint-report.md) |
| Qualification and due diligence | [Buyer due diligence](./buyer-due-diligence.md) |
| Runtime modes | [Runtime modes](../runtime_modes.md) |
| Approval flow | [Approval flow](../approval_flow.md) |
| Eval framework | [Eval framework](../eval_framework.md) |
| Release gate | [Release gate](../release_gate.md) |
| Deployment runbook | [Deployment runbook](../operations/deployment-runbook.md) |

## What A Good Buyer Brings

For the memory sprint:

- one agent workflow that matters,
- one owner who knows the current memory/context design,
- examples of stale, missing, unsafe, or over-permissive context,
- constraints around secrets, PII, retention, permissions, and deployment,
- ability to approve USD 12,000 this month if scope is tight.

For the OpenSupport pilot:

- one ecommerce support workflow,
- current support stack and policies,
- examples of risky or repetitive tickets,
- preferred pilot mode: shadow, assist, or low-risk auto,
- ability to approve USD 15,000 this month if scope is tight.

## How The Engagement Starts

1. Open an intake issue.
2. Share the selected workflow and constraints.
3. Confirm the fixed-fee scope and payment method.
4. Start after upfront payment and access are agreed.
5. Receive written deliverables and acceptance evidence.

Intake links:

- [Start Agent Memory Reliability Sprint intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=agent-memory-reliability-sprint.yml)
- [Start OpenSupport AgentOps Pilot intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=opensupport-agentops-pilot.yml)

## Acceptance Test

For the memory sprint, work is accepted when the selected workflow has:

- a written memory/context risk map,
- a memory taxonomy,
- 8-12 replay tests or test specifications,
- a reliability scorecard,
- and a specific implementation path that the buyer can assign or run.

For the OpenSupport pilot, work is accepted when the selected support workflow
has:

- a workflow map,
- guardrails and approval policy,
- replay/security eval plan,
- cost/latency visibility,
- and a rollout or rollback decision.

## Honest Limits

- This is not a full SaaS signup flow.
- The repository is a production-style proof point, not a claim of live hosted
  production traffic.
- Formal compliance certification is out of scope.
- The engagement must stay focused on one selected workflow unless separately
  scoped.
