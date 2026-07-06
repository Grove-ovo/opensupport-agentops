# CX AI Agent Reliability Sprint

Fixed fee: **USD 18,000**.

Timeline: **12 business days** after kickoff payment, access, and scope
confirmation.

Payment shape: **USD 9,000 kickoff** and **USD 9,000 on accepted delivery**.

Procurement packet: [CX AI buyer packet](./cx-ai-buyer-packet.md).

## Best Fit

This sprint is for teams shipping or evaluating customer-support AI agents,
LLM support workflows, eval platforms, observability systems, guardrails, or
AI agent security products.

The work is most useful when one workflow can affect customer trust, refunds,
credits, account actions, escalation, private customer context, or release
quality.

## Scope

One selected workflow. Examples:

- support answer grounded in policies and account context,
- refund or credit eligibility,
- human handoff and escalation,
- source-grounded AI answer evaluation,
- agent tool-call approval,
- LLM observability release gate,
- prompt-injection or connected-agent boundary test.

## Deliverables

- workflow map covering user, AI agent, tools, policies, context, and reviewer,
- threat model for policy freshness, PII, source grounding, tool actions, and
  escalation,
- 10-14 replay tests or test specifications,
- scorecard for acceptance and regression checks,
- 48h / 2w / 6w implementation path,
- optional bounded prototype or fixture when access is available and the change
  is narrow.

## Public Samples

- [Sample CX AI reliability report](./sample-cx-ai-reliability-report.md)
- [CX AI replay case catalog](./cx-ai-replay-case-catalog.md)
- [CX AI scorecard template](./cx-ai-scorecard-template.md)

## Default Data Handling

The default sprint does not require production credentials or raw private
customer data. Useful inputs are approved policies, sanitized workflow notes,
anonymized transcripts, screenshots, current eval examples, and reviewer
judgment.

Do not send secrets, private keys, raw payment data, regulated health records,
or full customer exports unless a separate written agreement and transfer
method are approved first.

## Acceptance

The work is accepted when the selected workflow has:

- a written workflow map,
- a risk and guardrail model,
- replay cases with expected and must-not behavior,
- a scorecard the reviewer can apply,
- and a specific implementation path with owners and sequencing.

## Start

Open the intake issue or email `chinesegrove@gmail.com` with:

- selected workflow,
- highest-risk failure mode,
- whether the agent can take actions,
- current policy or context sources,
- reviewer / owner,
- preferred payment route,
- kickoff timing.

[Start CX AI Agent Reliability Sprint intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=cx-ai-agent-reliability-sprint.yml)

For procurement, billing, data handling, and approval text, use the
[CX AI buyer packet](./cx-ai-buyer-packet.md).
