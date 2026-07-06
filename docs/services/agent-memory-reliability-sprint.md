# Agent Memory Reliability Sprint

Fixed fee: USD 12,000

Timeline: 10 business days after kickoff, access, and upfront payment.

Payment: USD 6,000 upfront, USD 6,000 on delivery. Redeemable methods include
Wise, PayPal, Stripe invoice, bank transfer, or USDC.

## Who It Is For

Teams already shipping or piloting AI agents that need continuity across
sessions, users, repos, tickets, customers, or workflows.

The sprint is for teams that have moved past a demo and now need memory to be
auditable, scoped, testable, and safe.

## The Problem

Agent memory often fails in ways that are expensive but hard to see in a single
demo:

- permission-scoped memory remains recallable after access is revoked,
- stale decisions drive new actions,
- secrets, tokens, or PII become durable memory,
- different agents write contradictory state,
- nobody can explain why a memory was recalled,
- memory tests only cover happy-path personalization.

## Deliverables

For one selected workflow:

1. Workflow map and memory boundary.
2. Memory taxonomy: instructions, facts, decisions, preferences, goals, errors,
   artifacts, provenance, retention, and deletion.
3. Threat model for stale memory, permission drift, secrets, PII, contradiction,
   and cross-agent contamination.
4. 8-12 replay tests covering recall, non-recall, staleness, contradiction,
   provenance, and redaction.
5. Reliability scorecard across write policy, retrieval, permissions,
   observability, evaluation, and user control.
6. Prioritized 48h / 2w / 6w implementation plan.
7. Optional prototype patch when repo access is available and the change is
   bounded to the selected workflow.

## Proof Point

OpenSupport AgentOps demonstrates the adjacent reliability practices I bring to
agent memory systems:

- deterministic safety gates,
- immutable execution snapshots,
- replay and security evaluation datasets,
- human approval flows,
- guarded delivery modes,
- cost and load reports,
- release gates and recovery drills,
- production-style deployment documentation.

## Guarantee

If the sprint does not produce a concrete replay suite plus implementation path
for the selected workflow, the second payment is waived.

## Intake

Open an issue with the sprint intake template:

https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=agent-memory-reliability-sprint.yml

Include the workflow that loses the most context today, what it must remember,
what it must never remember, and who can approve a USD 12,000 fixed-fee sprint.
