# Technical Design

Status: Implemented

Implemented a pure policy engine over `AgentPipelineRun` plus immutable runtime
configuration. Requested mode remains immutable; decisions record effective
mode, action, and stable downgrade reasons. Side effects remain adapters owned
by later children.
