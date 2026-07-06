# Sample Agent Memory Reliability Sprint Report

This is a fictional sample deliverable for a support agent workflow. It shows
the shape of a USD 12,000 sprint output without using private client data.

## Selected Workflow

Support agent drafts replies for repeat customers across tickets. It can use
documentation retrieval, prior ticket context, account preferences, and order
status tools. Human approval is required before sending.

## Executive Summary

The workflow needs memory because repeat support tickets depend on stable
account facts, communication preferences, prior decisions, resolved errors, and
known constraints. The primary risk is over-recall: stale or permission-scoped
context can appear helpful while producing the wrong answer.

Recommended implementation path:

1. Write only typed memories after explicit triggers.
2. Recall memories only by account, workflow, user role, and recency.
3. Add secret/PII exclusion before every durable write.
4. Add replay tests before enabling assist or auto mode.

## Memory Taxonomy

| Type | Example | Write trigger | Recall scope |
| --- | --- | --- | --- |
| Account fact | Customer uses Shopify Plus | Confirmed support context | Account |
| Preference | Prefers short Slack updates | Explicit statement | User/account |
| Decision | Use refund policy exception A | Human-approved decision | Account/workflow |
| Error | OAuth refresh failed due clock skew | Resolved incident | Account/tool |
| Instruction | Never mention beta API | Explicit policy | Account/workflow |
| Artifact reference | Redacted log bundle ID | Sensitive artifact seen | Account/operator |

## Threat Model

| Threat | Failure mode | Control | Replay test |
| --- | --- | --- | --- |
| Stale decision | Old refund exception used after policy changed | Supersede decision memories by timestamp and status | AMR-004 |
| Permission drift | Agent recalls private ticket after role change | Recall-time authorization check | AMR-006 |
| Secret capture | API token stored from logs | Pre-write redaction and denylist | AMR-003 |
| Cross-account leakage | Account A preference used for Account B | Namespace by account and tenant | AMR-002 |
| Contradiction | New CRM fact conflicts with old memory | Store contradiction case and require review | AMR-005 |

## Replay Tests

| ID | Scenario | Expected result |
| --- | --- | --- |
| AMR-001 | User states a communication preference, opens later ticket | Preference is recalled only for that account |
| AMR-002 | Two accounts define conflicting shipping preferences | Recall stays account-scoped |
| AMR-003 | Ticket includes token-like log output | Raw token is not stored or recalled |
| AMR-004 | Refund decision changes after earlier exception | Latest decision supersedes old memory |
| AMR-005 | CRM account tier conflicts with remembered tier | Agent labels contradiction and asks for review |
| AMR-006 | Operator loses access to a private ticket | Private-ticket memory is not returned |
| AMR-007 | Resolved OAuth error appears again | Prior fix is recalled with source |
| AMR-008 | Customer asks for deleted preference | Deleted memory is not recalled |

## Scorecard

| Dimension | Score | Notes |
| --- | ---: | --- |
| Memory need | 5 | Repeat support tickets depend on continuity |
| Write policy | 2 | Current approach stores too much conversation context |
| Retrieval scope | 3 | Account filters exist, role filters need proof |
| Provenance | 2 | Source ticket IDs are not attached to memories |
| Contradiction handling | 1 | Old and new facts can coexist |
| Secret exclusion | 2 | Basic redaction exists but no replay tests |
| Evaluation | 1 | No memory-specific replay suite |
| User/operator control | 2 | Delete/export path is unclear |

## 48h Implementation Path

Day 1:

- Add typed memory write gate.
- Add account/workflow/source/timestamp metadata.
- Add pre-write redaction for token-like, key-like, password-like, and private
  URL values.
- Add recall filters for account, workflow, user role, and recency.

Day 2:

- Implement AMR-001 to AMR-004 replay tests.
- Add debug output showing written memories and recalled memories.
- Document known gaps for permission drift, contradiction review, and deletion.

## 2-Week Path

- Implement remaining replay tests.
- Add contradiction queue.
- Add operator inspect/delete flow.
- Integrate release gate so memory changes cannot promote to assist mode unless
  P0 replay tests pass.

## 6-Week Path

- Expand to two additional workflows.
- Add privacy/export controls.
- Add dashboard view for memory provenance and evaluation failures.
- Add rollout policy for shadow -> assist -> auto.

## Acceptance Criteria

The first implementation is acceptable when:

- typed memory write and recall paths exist,
- AMR-001 to AMR-004 pass,
- secret-like input is not stored raw,
- source metadata is visible during debugging,
- and gaps are documented for the next milestone.
