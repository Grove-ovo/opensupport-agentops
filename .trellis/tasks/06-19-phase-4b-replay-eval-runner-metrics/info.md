# Technical Design

`ReplayEvalRunner` receives an `EvalCandidateExecutor` adapter. It freezes each
normalized observation into an `EvalCaseResult` and derives one immutable
`EvalRun` summary using project-owned metric functions.
