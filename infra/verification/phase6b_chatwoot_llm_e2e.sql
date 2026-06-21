\set ON_ERROR_STOP on

SELECT version, migration_name
FROM agentops_schema_migrations
WHERE version = 15;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'mock_orders',
    'chatwoot_delivery_attempts',
    'runtime_execution_audits'
  )
ORDER BY table_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'canonical_inbound_events'
  AND column_name IN (
    'processing_status',
    'processing_started_at',
    'processed_at',
    'error_code'
  )
ORDER BY column_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'runtime_execution_audits'
  AND column_name IN ('latency_ms', 'estimated_cost')
ORDER BY column_name;
