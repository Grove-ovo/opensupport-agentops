# Phase 4 Failure Analysis

Generated: 2026-06-19T00:00:00.000Z

## Summary

| Item | Value |
|------|------:|
| Materialized failure records | 12 |
| Failed replay behavior cases | 8 |
| Failed security cases | 0 |
| Failed release gates | 3 |
| Final promotion state | shadow |

## Failure Buckets

| Bucket | Records |
|--------|--------:|
| grounding | 4 |
| latency | 2 |
| quality | 4 |
| regression | 1 |
| tool | 1 |

## Reason Codes

| Reason | Records |
|--------|--------:|
| intent_mismatch | 4 |
| evidence_missing | 3 |
| latency_budget_exceeded | 1 |
| latency_exceeded | 1 |
| no_evidence_rate_exceeded | 1 |
| task_success_regression | 1 |
| tool_result_missing | 1 |

Failure records contain only tenant/run/case/candidate/gate references, stable reasons, numeric metrics, and hashes. Inputs, replies, evidence payloads, tool arguments, credentials, and provider payloads are excluded.
