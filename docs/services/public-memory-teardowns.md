# Public Agent Memory Teardown Examples

These are public-artifact teardowns, not customer engagements. They use visible
READMEs, docs, issues, and release notes to show the shape of an Agent Memory
Reliability Sprint: concrete failure modes, replay tests, and an implementation
path for one stateful agent workflow.

## Why These Exist

Agent memory failures are easiest to dismiss until a product has multiple
surfaces, users, channels, tools, or long-running sessions. The examples below
show the kinds of questions I turn into runnable replay tests during a paid
sprint.

## Example Teardowns

| Project | Memory Reliability Angle | Replay Tests |
| --- | --- | --- |
| OpenSquilla | Compaction, channel scope, tool-handle provenance, and MCP handoff after the 0.5 preview release. | stale compacted summary, cross-channel recall, compressed tool result provenance, session delete cleanup |
| MindOS | Local-first durable context shared through MCP, Skills, imports, agent runs, and Git sync. | partial import promotion, cross-agent scope, correction invalidation, secret-like content exclusion |
| Macro | Workspace-wide memory across email, messages, docs, tasks, calls, CRM, PRs, and channel permissions. | permission-scoped memory drift, nightly refresh staleness, secret exclusion |
| Ratel | Boundary between tool catalog context and durable task memory. | renamed tools, repeated failure memory, catalog contamination |
| Cogtrix | Memory-mode boundaries across local assistant, tools, and messaging daemon surfaces. | mode scoping, secret exclusion, chat isolation |
| Kaelio ktx | Semantic analytics context versus durable user/team memory. | user-scoped notes, unresolved contradictions, stale business decisions |
| FastAPI LangGraph Template | Long-term memory write policy around full-history ingestion and chit-chat exclusion. | irrelevant chit-chat, tool result promotion, per-user scope |
| Nex | Cross-agent provenance and permission-aware workplace memory. | CRM contradiction, permission drift, secret exclusion |
| Agentailor LangGraph.js Template | Runtime state, human approval scope, and MCP secret exclusion. | approved action memory, transient state, MCP token exclusion |

## Sprint Output

For a selected workflow, the paid sprint turns the same teardown pattern into:

1. A workflow map and memory boundary.
2. A memory taxonomy for facts, decisions, preferences, errors, artifacts,
   provenance, retention, and deletion.
3. A threat model for stale memory, permission drift, secrets, PII,
   contradiction, and cross-agent contamination.
4. 8-12 replay tests that can be kept in the repo.
5. A reliability scorecard and 48h / 2w / 6w implementation path.

See the fixed-fee offer: [Agent Memory Reliability Sprint](./agent-memory-reliability-sprint.md).
