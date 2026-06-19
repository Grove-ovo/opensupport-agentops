# Technical Design

Add a Phase 3 orchestrator above `AgentPipelineRun`. It owns state and side
effects through injected repositories/adapters and remains independent of
future eval/release services.
