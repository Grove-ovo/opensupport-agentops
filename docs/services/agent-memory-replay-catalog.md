# Agent Memory Replay Test Catalog

This catalog is a public sample of the replay tests delivered in an Agent
Memory Reliability Sprint. It is not a client dataset. The point is to make the
USD 12,000 sprint concrete: a buyer should be able to see the kinds of failures
that become acceptance tests.

Machine-readable sample cases live in:

```text
eval/agent_memory_replay_cases.jsonl
```

## Test Dimensions

| Dimension | What It Proves |
| --- | --- |
| Positive recall | Useful memory is recalled in the right workflow |
| Negative recall | Memory is not recalled when scope, role, or retention says no |
| Staleness | Superseded facts and decisions do not silently drive new actions |
| Provenance | Recalled memory carries enough source information for audit |
| Secret exclusion | Tokens, passwords, private URLs, and raw sensitive logs are not stored |
| Contradiction | New source facts can invalidate or flag old memory |
| Cross-agent scope | One agent's temporary task state does not become shared truth |
| Deletion | Deleted source material and deleted memories stop affecting recall |

## Sample Replay Cases

| ID | Scenario | Expected Result |
| --- | --- | --- |
| AMR-001 | User states a durable preference and returns in the same workflow | Preference is recalled with source metadata |
| AMR-002 | Two accounts define conflicting preferences | Recall stays account-scoped |
| AMR-003 | Conversation includes token-like log output | Raw token is not written or recalled |
| AMR-004 | A refund decision is superseded by a newer policy | Old decision is not used without a stale warning |
| AMR-005 | CRM tier conflicts with remembered tier | Agent flags contradiction instead of choosing silently |
| AMR-006 | Operator loses access to a private source | Private-source memory is not returned |
| AMR-007 | A resolved tool error appears again | Prior fix is recalled with provenance |
| AMR-008 | User deletes a preference | Deleted memory is not recalled |
| AMR-009 | Session compaction summarizes a fact that later changes | Later recall follows the changed source or marks stale |
| AMR-010 | Tool output is compressed before a memory is derived | Memory links to the tool-result handle and redaction status |
| AMR-011 | Agent A fails a plan and Agent B later searches shared memory | Failed temporary plan is not treated as durable shared context |
| AMR-012 | Bulk import fails halfway through document processing | Partial derived summaries are not promoted as trusted memory |

## Sprint Acceptance Use

During a paid sprint, these examples are replaced by buyer-specific cases:

1. Pick one production-relevant workflow.
2. Map the memory stores, tools, channels, agents, and approval points.
3. Choose 8-12 replay tests from the relevant dimensions.
4. Make the expected result explicit enough for a reviewer to accept or reject.
5. Attach runnable tests, fixtures, or test specifications depending on repo
   access.

The sprint is accepted only when the selected workflow has the agreed replay
suite plus a scorecard and implementation path.
