# Commercial Services

This directory is the buyer-facing entry point for fixed-fee agent reliability
work backed by this repository.

## Start Here

Public CX offer page:
[CX AI Agent Reliability Sprint](https://cx-ai-offer-site-425661492480.us-central1.run.app),
[public intake form](https://cx-ai-offer-site-425661492480.us-central1.run.app/intake.html),
and
[ROI calculator](https://cx-ai-offer-site-425661492480.us-central1.run.app/roi.html).

| Offer | Fixed fee | Timeline | Best fit | Intake |
| --- | ---: | --- | --- | --- |
| [CX AI Agent Reliability Sprint](./cx-ai-agent-reliability-sprint.md) | USD 18,000 | 12 business days | Support AI, eval, observability, guardrail, and agent-security teams that need replay tests and scorecards for one high-risk workflow | [Open public intake](https://cx-ai-offer-site-425661492480.us-central1.run.app/intake.html) |
| [CX AI Diagnostic Teardown](./sample-cx-ai-diagnostic-teardown.md) | USD 3,000 | 5 business days | Teams that need one workflow mapped and five replay tests before approving the full sprint | [Open public intake](https://cx-ai-offer-site-425661492480.us-central1.run.app/intake.html) |
| [Agent Memory Reliability Sprint](./agent-memory-reliability-sprint.md) | USD 12,000 | 10 business days | Teams shipping AI agents where memory, context, stale decisions, permissions, or secrets create business risk | [Open sprint intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=agent-memory-reliability-sprint.yml) |
| [OpenSupport AgentOps Pilot](./opensupport-agentops-pilot.md) | USD 15,000 | 15 business days | Ecommerce support teams that want guarded shadow/assist automation before rollout | [Open pilot intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=opensupport-agentops-pilot.yml) |

Payment methods can include Wise, PayPal, Stripe invoice, bank transfer, or
USDC after scope is confirmed.

## Proof Before Buying

- [Buyer deal room](./buyer-deal-room.md)
- [CX AI buyer packet](./cx-ai-buyer-packet.md)
- [Sample CX AI reliability report](./sample-cx-ai-reliability-report.md)
- [Sample CX AI diagnostic teardown](./sample-cx-ai-diagnostic-teardown.md)
- [CX AI replay case catalog](./cx-ai-replay-case-catalog.md)
- [CX AI scorecard template](./cx-ai-scorecard-template.md)
- [Proof pack](./proof-pack.md)
- [Outcomes and acceptance criteria](./outcomes-and-acceptance.md)
- [First 48 hours after yes](./first-48-hours.md)
- [Agent memory replay test catalog](./agent-memory-replay-catalog.md)
- [Sample sprint report](./sample-memory-sprint-report.md)
- [Public memory teardown examples](./public-memory-teardowns.md)
- [Buyer due diligence](./buyer-due-diligence.md)

## What Makes This Concrete

The offers are scoped around artifacts a technical buyer can inspect:

- a selected workflow,
- a memory or support risk map,
- replay and security tests,
- scorecards,
- guarded rollout criteria,
- written implementation paths,
- optional bounded prototype patches when repo access is available.

The repository is the proof point: it contains typed traces, guarded side
effects, replay and security datasets, release gates, cost reports, operator
approvals, and runbooks. The service applies that discipline to one buyer
workflow rather than selling generic AI advice.

## Fast Qualification

A buyer is probably qualified when they can name:

1. one workflow that loses, leaks, misuses, or over-trusts context;
2. one owner who can explain the current implementation;
3. one reviewer who can accept the delivered scorecard and tests;
4. the cost of the current failure mode;
5. the payment path for a USD 12,000 or USD 15,000 fixed-fee engagement.
   For CX AI reliability work, use USD 18,000 as the approval threshold.

If the workflow cannot be narrowed, the right next step is not a paid sprint.
It is a short discovery conversation that identifies one bounded path.

## Buyer Decision Path

1. Read the [buyer deal room](./buyer-deal-room.md).
2. Check the [outcomes and acceptance criteria](./outcomes-and-acceptance.md).
3. Review the [first 48 hours after yes](./first-48-hours.md).
4. For CX AI reliability, review the
   [sample CX AI reliability report](./sample-cx-ai-reliability-report.md),
   [replay case catalog](./cx-ai-replay-case-catalog.md), and
   [scorecard template](./cx-ai-scorecard-template.md).
5. If USD 18,000 needs scope review first, open the
   [public CX AI intake form](https://cx-ai-offer-site-425661492480.us-central1.run.app/intake.html),
   choose the USD 3,000 diagnostic path, and use the
   [sample diagnostic teardown](./sample-cx-ai-diagnostic-teardown.md).
6. For memory reliability, review the
   [agent memory replay test catalog](./agent-memory-replay-catalog.md) and
   [sample sprint report](./sample-memory-sprint-report.md).
7. Open the relevant intake issue or public intake form.
8. Confirm scope, access, payment method, and start date.
9. For the USD 18,000 CX AI sprint, use the
   [CX AI buyer packet](./cx-ai-buyer-packet.md) for approval text, billing
   details, and data handling boundaries.
