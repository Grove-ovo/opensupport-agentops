# Buyer Due Diligence

Use this page to evaluate whether the USD 12,000 or USD 15,000 offer is a fit.

Start from the [buyer deal room](./buyer-deal-room.md) for the complete proof
and intake path.

## Fit Checklist

The sprint or pilot is a good fit when at least three are true:

- An agent workflow is already used by customers, operators, engineers, or
  internal teams.
- Memory, context, or tool behavior affects trust or safety.
- Stale context, permission drift, or sensitive data would create real business
  risk.
- The team can provide one workflow owner and one technical reviewer.
- The team wants replay tests and implementation guidance more than a slide
  deck.

It is not a good fit when:

- The agent is still a throwaway prototype.
- No one can approve the fixed fee.
- The team wants a full SaaS platform rather than a scoped sprint or pilot.
- The workflow cannot be narrowed to one high-value path.

## Questions A Buyer Should Ask

### What exactly is delivered?

For the memory sprint:

- workflow map,
- memory taxonomy,
- threat model,
- 8-12 replay tests,
- reliability scorecard,
- 48h / 2w / 6w implementation plan,
- optional bounded prototype patch.

For the OpenSupport pilot:

- workflow selection and risk map,
- support integration plan,
- guardrails and approval policy,
- replay and security evals,
- cost/latency report,
- rollout and rollback plan,
- optional implementation branch.

### What is not included?

- Enterprise-wide transformation.
- Formal legal/compliance certification.
- Production hosting operated by Grove.
- Unlimited workflows.
- Guarantee of model behavior outside the selected workflow.

### What access is needed?

Minimum:

- public docs or workflow description,
- examples of memory/context failures,
- constraints around PII, secrets, retention, permissions, and deployment.

Better:

- private docs/screenshots,
- relevant prompts and tool definitions,
- repo access,
- staging workflow or logs with sensitive data removed.

### Why fixed fee?

The buyer is paying for a concrete technical artifact, not open-ended advisory
time. Fixed scope keeps the work bounded and makes acceptance easier.

### What proves completion?

Completion means the buyer receives written deliverables and can inspect the
replay tests, scorecard, and implementation path for the selected workflow.

For implementation or prototype work, completion also requires:

- documented commands,
- known gaps,
- and acceptance criteria tied to the selected workflow.

## Red Flags To Resolve Before Starting

- The buyer wants more than one workflow in the same fixed fee.
- The buyer cannot name a memory failure or risk.
- The buyer expects production rollout without staging access.
- Sensitive data is required but no data handling process exists.
- The buyer cannot assign a reviewer.

## Acceptance Language

Use this acceptance test:

```text
The work is accepted when the selected workflow has a written memory/context
risk map, replay tests for the highest-risk failures, a scorecard, and a
specific implementation path that the buyer can assign or run.
```

## Payment Milestones

Memory sprint:

- USD 6,000 upfront.
- USD 6,000 on delivery.

OpenSupport pilot:

- USD 7,500 upfront.
- USD 7,500 on delivery.

If the agreed concrete replay suite and implementation path are not delivered,
the second payment is waived.
