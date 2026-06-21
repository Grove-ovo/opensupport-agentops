\set ON_ERROR_STOP on

SELECT version, migration_name
FROM agentops_schema_migrations
WHERE version = 14;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'canonical_inbound_events',
    'async_job_outbox',
    'operational_aggregates'
  )
ORDER BY table_name;

DO $$
DECLARE
  tenant_id_value uuid := gen_random_uuid();
  event_id_value uuid;
BEGIN
  INSERT INTO tenants (id, slug, display_name)
  VALUES (
    tenant_id_value,
    'phase6a-' || substr(replace(tenant_id_value::text, '-', ''), 1, 12),
    'Phase 6A Verification'
  );

  INSERT INTO canonical_inbound_events (
    tenant_id,
    source,
    conversation_id,
    message_id,
    event_type,
    dedupe_key,
    delivery_keys,
    payload_hash,
    is_customer_message,
    is_self_outgoing,
    decision
  )
  VALUES (
    tenant_id_value,
    'agent_bot',
    'conversation-1',
    'message-1',
    'message_created',
    tenant_id_value::text || ':conversation-1:message-1:message_created',
    ARRAY['delivery-1'],
    repeat('a', 64),
    true,
    false,
    'pipeline_seeded'
  )
  RETURNING id INTO event_id_value;

  BEGIN
    INSERT INTO canonical_inbound_events (
      tenant_id,
      source,
      conversation_id,
      message_id,
      event_type,
      dedupe_key,
      payload_hash,
      is_customer_message,
      is_self_outgoing,
      decision
    )
    VALUES (
      tenant_id_value,
      'account_webhook',
      'conversation-1',
      'message-1',
      'message_created',
      tenant_id_value::text || ':conversation-1:message-1:message_created',
      repeat('a', 64),
      true,
      false,
      'duplicate'
    );
    RAISE EXCEPTION 'duplicate canonical event was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  DELETE FROM tenants WHERE id = tenant_id_value;
END;
$$;
