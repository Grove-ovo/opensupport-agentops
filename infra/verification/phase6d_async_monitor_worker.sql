\set ON_ERROR_STOP on

SELECT version, migration_name
FROM agentops_schema_migrations
WHERE version = 16;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'async_job_executions',
    'monitor_trace_results',
    'operational_aggregates'
  )
ORDER BY table_name;

SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name IN (
    'runtime_execution_enqueue_async',
    'release_gate_enqueue_materialization'
  )
ORDER BY trigger_name;
