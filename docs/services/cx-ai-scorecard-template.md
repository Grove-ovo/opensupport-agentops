# CX AI Scorecard Template

Status: public template, not customer work.

This scorecard is used to turn replay findings into reviewer-facing acceptance
evidence for one selected CX AI workflow.

## Template

| Area | Score 1-5 | Evidence | Highest risk | Recommendation | Owner | Next review date |
| --- | ---: | --- | --- | --- | --- | --- |
| Source grounding |  |  |  |  |  |  |
| Policy freshness |  |  |  |  |  |  |
| Customer-context scope |  |  |  |  |  |  |
| PII and secret handling |  |  |  |  |  |  |
| Refund/credit/action authority |  |  |  |  |  |  |
| Escalation reliability |  |  |  |  |  |  |
| Memory deletion and correction |  |  |  |  |  |  |
| Internal note boundary |  |  |  |  |  |  |
| Observability and traces |  |  |  |  |  |  |
| Rollout readiness |  |  |  |  |  |  |

## CSV Version

```csv
area,score_1_to_5,evidence,highest_risk,recommendation,owner,next_review_date
Source grounding,,,,,,
Policy freshness,,,,,,
Customer-context scope,,,,,,
PII and secret handling,,,,,,
Refund/credit/action authority,,,,,,
Escalation reliability,,,,,,
Memory deletion and correction,,,,,,
Internal note boundary,,,,,,
Observability and traces,,,,,,
Rollout readiness,,,,,,
```

## Scoring Guide

| Score | Meaning |
| ---: | --- |
| 1 | No reliable evidence; release should not proceed for this area |
| 2 | Partial evidence exists, but one or more high-risk gaps remain |
| 3 | Basic controls exist; replay coverage or ownership needs tightening |
| 4 | Release-ready for the selected workflow with documented residual risk |
| 5 | Strong evidence, clear owner, repeatable replay gate, and trace coverage |

## Acceptance Use

For the USD 18,000 CX AI Agent Reliability Sprint, the final scorecard should:

- map every critical replay case to a scorecard area,
- name the owner for each recommended change,
- distinguish release blockers from follow-up improvements,
- document what should not be automated yet,
- give the reviewer a pass/fail basis for accepted delivery.

Related:

- [Sample CX AI reliability report](./sample-cx-ai-reliability-report.md)
- [CX AI replay case catalog](./cx-ai-replay-case-catalog.md)
- [CX AI buyer packet](./cx-ai-buyer-packet.md)
