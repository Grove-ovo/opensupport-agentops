# OpenSupport AgentOps Pilot

Fixed fee: USD 15,000

Timeline: 15 business days after kickoff, access, and upfront payment.

Payment: USD 7,500 upfront, USD 7,500 on delivery. Redeemable methods include
Wise, PayPal, Stripe invoice, bank transfer, or USDC.

## Who It Is For

Ecommerce teams that want AI support automation without jumping directly to
uncontrolled auto-replies.

Best fit:

- Chatwoot users,
- self-hosted support teams,
- teams evaluating agentic support but blocked by safety, traceability, and
  rollout risk,
- founders or operators who need a pilot that can survive technical review.

## Pilot Outcome

One bounded support workflow is connected and evaluated in shadow or assist
mode. The team gets an operator dashboard path, replay/security evaluation,
guardrails, cost visibility, and a rollout decision.

## Deliverables

1. Workflow selection and risk map.
2. Chatwoot webhook/agent-bot integration plan.
3. Tenant/model configuration plan with BYOK option.
4. Guardrail and approval policy for the selected workflow.
5. Replay dataset for common support cases.
6. Security eval cases for PII, unsafe promises, and policy conflicts.
7. Cost and latency report.
8. Shadow/assist-mode rollout plan with rollback criteria.
9. Optional implementation patch or deployment branch when access is provided.

## Proof Point

This repository already includes:

- Fastify API and React operator dashboard,
- Redis Streams worker,
- Chatwoot delivery contracts,
- deterministic safety gates,
- immutable execution snapshots,
- replay/security evals,
- reports for cost, load, failures, and deployment readiness,
- production-style Compose, Prometheus/Grafana, runbooks, and recovery drills.

See the buyer-facing evidence map:

- [Buyer deal room](./buyer-deal-room.md)
- [Commercial services](./README.md)
- [Outcomes and acceptance criteria](./outcomes-and-acceptance.md)
- [OpenSupport AgentOps proof pack](./proof-pack.md)
- [Buyer due diligence](./buyer-due-diligence.md)
- [Sample sprint report](./sample-memory-sprint-report.md)

## Guarantee

If the pilot does not produce a concrete workflow map, eval suite, and rollout
plan, the second payment is waived.

## Intake

Open an issue with the pilot template:

https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=opensupport-agentops-pilot.yml
