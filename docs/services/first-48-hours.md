# First 48 Hours After Yes

This page explains how a fixed-fee CX AI Agent Reliability Sprint, Agent Memory
Reliability Sprint, or OpenSupport AgentOps Pilot starts after a buyer decides
the scope is worth pursuing.

## Goal

Turn a positive reply into a bounded kickoff without creating procurement or
access sprawl. The first 48 hours should confirm one workflow, one owner, one
reviewer, one payment route, and one acceptance test.

## Step 1: Confirm The Selected Workflow

The buyer names one workflow and one failure mode that matters.

Good examples:

- "The support agent recalls stale account policy after the customer changes
  plan."
- "The coding agent remembers a private repo decision after access changes."
- "The assistant writes useful preferences, but we cannot prove why a memory was
  recalled."

Not ready yet:

- "Audit all agent memory."
- "Make our AI system production ready."
- "Review the whole codebase before we choose a workflow."

## Step 2: Confirm Commercial Terms

For the CX AI Agent Reliability Sprint:

- fixed fee: USD 18,000,
- kickoff payment: USD 9,000,
- delivery payment: USD 9,000,
- timeline: 12 business days after kickoff, access, and upfront payment.

For the Agent Memory Reliability Sprint:

- fixed fee: USD 12,000,
- kickoff payment: USD 6,000,
- delivery payment: USD 6,000,
- timeline: 10 business days after kickoff, access, and upfront payment.

For the OpenSupport AgentOps Pilot:

- fixed fee: USD 15,000,
- kickoff payment: USD 7,500,
- delivery payment: USD 7,500,
- timeline: 15 business days after kickoff, access, and upfront payment.

Payment can be handled by Wise, PayPal, Stripe invoice, bank transfer, or USDC
after scope is confirmed.

For CX AI procurement details, use the
[CX AI buyer packet](./cx-ai-buyer-packet.md).

## Step 3: Send The Minimum Useful Input

Minimum input:

- workflow description,
- current memory/context approach,
- one concrete failure or risk,
- constraints around PII, secrets, permissions, retention, and deployment.

Better input:

- relevant README or docs,
- prompts and tool definitions,
- safe sample logs or screenshots,
- repo access for the bounded workflow,
- existing evals or test cases.

Production credentials and private user data are not needed for the default
assessment.

## Step 4: First Working Pass

Within the first 48 hours after access and kickoff payment, the buyer should see
the shape of the engagement:

- workflow and memory boundary draft,
- top failure hypotheses,
- initial replay test outline,
- access or data gaps,
- acceptance checklist for the final handoff.

This early pass is meant to catch scope drift while it is still cheap to fix.

## Step 5: Delivery And Acceptance

The final delivery is accepted when the selected workflow has written evidence:

- risk map,
- taxonomy or guardrail policy,
- replay or security tests,
- scorecard,
- implementation path,
- known gaps and next steps.

For prototype work, the delivery also includes the branch, patch, or commands
needed for technical review.

## Start

Open the relevant intake issue:

- [Start CX AI Agent Reliability Sprint intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=cx-ai-agent-reliability-sprint.yml)
- [Start Agent Memory Reliability Sprint intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=agent-memory-reliability-sprint.yml)
- [Start OpenSupport AgentOps Pilot intake](https://github.com/Grove-ovo/opensupport-agentops/issues/new?template=opensupport-agentops-pilot.yml)
