\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  first_tenant_id uuid := gen_random_uuid();
  second_tenant_id uuid := gen_random_uuid();
  first_policy_id uuid := gen_random_uuid();
  second_policy_id uuid := gen_random_uuid();
  first_document_id uuid := gen_random_uuid();
  first_chunk_id uuid := gen_random_uuid();
  unit_embedding vector(1536) :=
    array_prepend(
      1::real,
      array_fill(0::real, ARRAY[1535])
    )::vector(1536);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'vector extension is not enabled';
  END IF;

  INSERT INTO tenants (id, slug, display_name)
  VALUES
    (first_tenant_id, 'phase2c-first', 'Phase 2C First Tenant'),
    (second_tenant_id, 'phase2c-second', 'Phase 2C Second Tenant');

  INSERT INTO policy_versions (
    id,
    tenant_id,
    version,
    name,
    status,
    content_hash
  )
  VALUES
    (
      first_policy_id,
      first_tenant_id,
      1,
      'Returns v1',
      'draft',
      repeat('a', 64)
    ),
    (
      second_policy_id,
      second_tenant_id,
      1,
      'Returns v1',
      'draft',
      repeat('b', 64)
    );

  INSERT INTO policy_documents (
    id,
    tenant_id,
    policy_version_id,
    source_key,
    title,
    normalized_content,
    content_hash
  )
  VALUES (
    first_document_id,
    first_tenant_id,
    first_policy_id,
    'returns.md',
    'Returns',
    'Returns are accepted within 30 days.',
    repeat('c', 64)
  );

  INSERT INTO policy_chunks (
    id,
    tenant_id,
    policy_version_id,
    document_id,
    chunk_index,
    char_start,
    char_end,
    content,
    content_hash,
    token_count
  )
  VALUES (
    first_chunk_id,
    first_tenant_id,
    first_policy_id,
    first_document_id,
    0,
    0,
    36,
    'Returns are accepted within 30 days.',
    repeat('d', 64),
    6
  );

  INSERT INTO policy_chunk_embeddings (
    tenant_id,
    policy_version_id,
    chunk_id,
    embedding_model,
    embedding,
    content_hash
  )
  VALUES (
    first_tenant_id,
    first_policy_id,
    first_chunk_id,
    'text-embedding-3-small',
    unit_embedding,
    repeat('d', 64)
  );

  IF (
    SELECT vector_dims(embedding)
    FROM policy_chunk_embeddings
    WHERE chunk_id = first_chunk_id
  ) <> 1536 THEN
    RAISE EXCEPTION 'stored embedding does not have 1536 dimensions';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM policy_chunks
    WHERE
      id = first_chunk_id AND
      search_vector @@ plainto_tsquery('simple', 'returns accepted')
  ) THEN
    RAISE EXCEPTION 'policy chunk full-text search vector is not queryable';
  END IF;

  IF (
    SELECT count(*)
    FROM search_policy_chunks_lexical(
      first_tenant_id,
      first_policy_id,
      'returns accepted',
      10
    )
  ) <> 1 THEN
    RAISE EXCEPTION 'tenant-scoped lexical retrieval did not return one chunk';
  END IF;

  IF (
    SELECT count(*)
    FROM search_policy_chunks_vector(
      first_tenant_id,
      first_policy_id,
      'text-embedding-3-small',
      unit_embedding,
      10
    )
  ) <> 1 THEN
    RAISE EXCEPTION 'tenant-scoped vector retrieval did not return one chunk';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM search_policy_chunks_lexical(
      second_tenant_id,
      first_policy_id,
      'returns',
      10
    )
  ) THEN
    RAISE EXCEPTION 'cross-tenant lexical retrieval returned policy content';
  END IF;

  BEGIN
    INSERT INTO policy_documents (
      tenant_id,
      policy_version_id,
      source_key,
      title,
      normalized_content,
      content_hash
    )
    VALUES (
      first_tenant_id,
      second_policy_id,
      'cross-tenant.md',
      'Cross tenant',
      'This must fail.',
      repeat('e', 64)
    );
    RAISE EXCEPTION 'cross-tenant policy reference was not rejected';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO policy_chunk_embeddings (
      tenant_id,
      policy_version_id,
      chunk_id,
      embedding_model,
      embedding,
      content_hash
    )
    VALUES (
      first_tenant_id,
      first_policy_id,
      first_chunk_id,
      'invalid-dimensions',
      ARRAY[1, 2]::real[]::vector,
      repeat('f', 64)
    );
    RAISE EXCEPTION 'invalid embedding dimensions were not rejected';
  EXCEPTION
    WHEN data_exception THEN NULL;
  END;

  UPDATE policy_versions
  SET
    status = 'published',
    published_at = now()
  WHERE id = first_policy_id;

  BEGIN
    UPDATE policy_versions
    SET name = 'Changed published policy'
    WHERE id = first_policy_id;
    RAISE EXCEPTION 'published policy mutation was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE policy_chunks
    SET content = 'Changed published content'
    WHERE id = first_chunk_id;
    RAISE EXCEPTION 'published policy content mutation was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  INSERT INTO retrieval_config_versions (
    tenant_id,
    version,
    lexical_weight,
    vector_weight,
    lexical_limit,
    vector_limit,
    top_k,
    score_threshold,
    embedding_model,
    is_active,
    config_hash
  )
  VALUES (
    first_tenant_id,
    1,
    0.4,
    0.6,
    20,
    20,
    8,
    0.25,
    'text-embedding-3-small',
    true,
    repeat('1', 64)
  );

  BEGIN
    UPDATE retrieval_config_versions
    SET lexical_weight = 0.5
    WHERE tenant_id = first_tenant_id AND version = 1;
    RAISE EXCEPTION 'retrieval config mutation was not rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO retrieval_config_versions (
      tenant_id,
      version,
      lexical_weight,
      vector_weight,
      lexical_limit,
      vector_limit,
      top_k,
      score_threshold,
      embedding_model,
      is_active,
      config_hash
    )
    VALUES (
      first_tenant_id,
      2,
      0.5,
      0.5,
      20,
      20,
      8,
      0.25,
      'text-embedding-3-small',
      true,
      repeat('2', 64)
    );
    RAISE EXCEPTION 'multiple active retrieval configs were not rejected';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\echo Phase 2C live database verification passed
