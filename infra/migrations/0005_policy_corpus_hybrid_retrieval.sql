-- Phase 2C: tenant policy corpus, immutable versions, FTS, and pgvector.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  content_hash text NOT NULL,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_versions_tenant_id_uniq UNIQUE (tenant_id, id),
  CONSTRAINT policy_versions_tenant_version_uniq UNIQUE (tenant_id, version),
  CONSTRAINT policy_versions_version_chk CHECK (version > 0),
  CONSTRAINT policy_versions_name_chk CHECK (
    name = trim(name) AND length(name) BETWEEN 1 AND 256
  ),
  CONSTRAINT policy_versions_status_chk CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT policy_versions_hash_chk CHECK (
    content_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT policy_versions_publication_chk CHECK (
    (status = 'draft' AND published_at IS NULL) OR
    (status IN ('published', 'archived') AND published_at IS NOT NULL)
  ),
  CONSTRAINT policy_versions_metadata_chk CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_one_published_idx
ON policy_versions (tenant_id)
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS policy_versions_tenant_status_idx
ON policy_versions (tenant_id, status, version DESC);

DROP TRIGGER IF EXISTS policy_versions_set_updated_at ON policy_versions;
CREATE TRIGGER policy_versions_set_updated_at
BEFORE UPDATE ON policy_versions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION guard_policy_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'published or archived policy versions cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft', 'published') THEN
      RAISE EXCEPTION 'draft policy versions can only remain draft or publish'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'published' AND NEW.status = 'archived' AND (
    NEW.id,
    NEW.tenant_id,
    NEW.version,
    NEW.name,
    NEW.content_hash,
    NEW.published_at,
    NEW.metadata,
    NEW.created_at
  ) IS NOT DISTINCT FROM (
    OLD.id,
    OLD.tenant_id,
    OLD.version,
    OLD.name,
    OLD.content_hash,
    OLD.published_at,
    OLD.metadata,
    OLD.created_at
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'published policy versions are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS policy_versions_guard_mutation ON policy_versions;
CREATE TRIGGER policy_versions_guard_mutation
BEFORE UPDATE OR DELETE ON policy_versions
FOR EACH ROW
EXECUTE FUNCTION guard_policy_version_mutation();

CREATE TABLE IF NOT EXISTS policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  source_key text NOT NULL,
  title text NOT NULL,
  media_type text NOT NULL DEFAULT 'text/plain',
  normalized_content text NOT NULL,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_documents_tenant_id_uniq UNIQUE (tenant_id, id),
  CONSTRAINT policy_documents_policy_id_uniq UNIQUE (
    tenant_id,
    policy_version_id,
    id
  ),
  CONSTRAINT policy_documents_source_uniq UNIQUE (
    tenant_id,
    policy_version_id,
    source_key
  ),
  CONSTRAINT policy_documents_policy_fk FOREIGN KEY (
    tenant_id,
    policy_version_id
  ) REFERENCES policy_versions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT policy_documents_source_key_chk CHECK (
    source_key = trim(source_key) AND length(source_key) BETWEEN 1 AND 512
  ),
  CONSTRAINT policy_documents_title_chk CHECK (
    title = trim(title) AND length(title) BETWEEN 1 AND 512
  ),
  CONSTRAINT policy_documents_media_type_chk CHECK (
    media_type = lower(trim(media_type)) AND length(media_type) BETWEEN 3 AND 128
  ),
  CONSTRAINT policy_documents_content_chk CHECK (
    length(normalized_content) > 0
  ),
  CONSTRAINT policy_documents_hash_chk CHECK (
    content_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT policy_documents_metadata_chk CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS policy_documents_tenant_policy_idx
ON policy_documents (tenant_id, policy_version_id, created_at);

CREATE TABLE IF NOT EXISTS policy_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  document_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  char_start integer NOT NULL,
  char_end integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  token_count integer NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', content)
  ) STORED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_chunks_tenant_id_uniq UNIQUE (tenant_id, id),
  CONSTRAINT policy_chunks_policy_id_uniq UNIQUE (
    tenant_id,
    policy_version_id,
    id
  ),
  CONSTRAINT policy_chunks_document_index_uniq UNIQUE (
    tenant_id,
    document_id,
    chunk_index
  ),
  CONSTRAINT policy_chunks_policy_fk FOREIGN KEY (
    tenant_id,
    policy_version_id
  ) REFERENCES policy_versions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT policy_chunks_document_fk FOREIGN KEY (
    tenant_id,
    policy_version_id,
    document_id
  ) REFERENCES policy_documents (
    tenant_id,
    policy_version_id,
    id
  ) ON DELETE CASCADE,
  CONSTRAINT policy_chunks_index_chk CHECK (chunk_index >= 0),
  CONSTRAINT policy_chunks_offsets_chk CHECK (
    char_start >= 0 AND char_end > char_start
  ),
  CONSTRAINT policy_chunks_content_chk CHECK (length(content) > 0),
  CONSTRAINT policy_chunks_hash_chk CHECK (
    content_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT policy_chunks_token_count_chk CHECK (token_count > 0),
  CONSTRAINT policy_chunks_metadata_chk CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS policy_chunks_search_idx
ON policy_chunks USING gin (search_vector);

CREATE INDEX IF NOT EXISTS policy_chunks_tenant_policy_idx
ON policy_chunks (tenant_id, policy_version_id, document_id, chunk_index);

CREATE TABLE IF NOT EXISTS policy_chunk_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL DEFAULT 1536,
  embedding vector(1536) NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_chunk_embeddings_tenant_id_uniq UNIQUE (tenant_id, id),
  CONSTRAINT policy_chunk_embeddings_chunk_model_uniq UNIQUE (
    tenant_id,
    chunk_id,
    embedding_model
  ),
  CONSTRAINT policy_chunk_embeddings_policy_fk FOREIGN KEY (
    tenant_id,
    policy_version_id
  ) REFERENCES policy_versions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT policy_chunk_embeddings_chunk_fk FOREIGN KEY (
    tenant_id,
    policy_version_id,
    chunk_id
  ) REFERENCES policy_chunks (
    tenant_id,
    policy_version_id,
    id
  ) ON DELETE CASCADE,
  CONSTRAINT policy_chunk_embeddings_model_chk CHECK (
    embedding_model = trim(embedding_model) AND
    length(embedding_model) BETWEEN 1 AND 256
  ),
  CONSTRAINT policy_chunk_embeddings_dimensions_chk CHECK (
    embedding_dimensions = 1536 AND
    vector_dims(embedding) = embedding_dimensions
  ),
  CONSTRAINT policy_chunk_embeddings_hash_chk CHECK (
    content_hash ~ '^[a-f0-9]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS policy_chunk_embeddings_vector_idx
ON policy_chunk_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS policy_chunk_embeddings_tenant_policy_idx
ON policy_chunk_embeddings (tenant_id, policy_version_id, chunk_id);

CREATE OR REPLACE FUNCTION search_policy_chunks_lexical(
  target_tenant_id uuid,
  target_policy_version_id uuid,
  query_text text,
  candidate_limit integer DEFAULT 20
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  content_hash text,
  score real
) AS $$
  SELECT
    chunk.id,
    chunk.document_id,
    chunk.chunk_index,
    chunk.content,
    chunk.content_hash,
    ts_rank_cd(
      chunk.search_vector,
      websearch_to_tsquery('simple', query_text)
    ) AS score
  FROM policy_chunks AS chunk
  WHERE
    chunk.tenant_id = target_tenant_id AND
    chunk.policy_version_id = target_policy_version_id AND
    chunk.search_vector @@ websearch_to_tsquery('simple', query_text)
  ORDER BY score DESC, chunk.document_id, chunk.chunk_index, chunk.id
  LIMIT LEAST(GREATEST(candidate_limit, 1), 200);
$$ LANGUAGE sql STABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION search_policy_chunks_vector(
  target_tenant_id uuid,
  target_policy_version_id uuid,
  target_embedding_model text,
  query_embedding vector(1536),
  candidate_limit integer DEFAULT 20
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  content_hash text,
  score double precision
) AS $$
  SELECT
    chunk.id,
    chunk.document_id,
    chunk.chunk_index,
    chunk.content,
    chunk.content_hash,
    1 - (embedding.embedding <=> query_embedding) AS score
  FROM policy_chunk_embeddings AS embedding
  JOIN policy_chunks AS chunk
    ON chunk.tenant_id = embedding.tenant_id
    AND chunk.policy_version_id = embedding.policy_version_id
    AND chunk.id = embedding.chunk_id
  WHERE
    embedding.tenant_id = target_tenant_id AND
    embedding.policy_version_id = target_policy_version_id AND
    embedding.embedding_model = target_embedding_model
  ORDER BY
    embedding.embedding <=> query_embedding,
    chunk.document_id,
    chunk.chunk_index,
    chunk.id
  LIMIT LEAST(GREATEST(candidate_limit, 1), 200);
$$ LANGUAGE sql STABLE PARALLEL SAFE;

CREATE TABLE IF NOT EXISTS retrieval_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  lexical_weight numeric(5, 4) NOT NULL,
  vector_weight numeric(5, 4) NOT NULL,
  lexical_limit integer NOT NULL,
  vector_limit integer NOT NULL,
  top_k integer NOT NULL,
  score_threshold numeric(6, 5) NOT NULL,
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL DEFAULT 1536,
  is_active boolean NOT NULL DEFAULT false,
  config_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retrieval_config_versions_tenant_id_uniq UNIQUE (tenant_id, id),
  CONSTRAINT retrieval_config_versions_tenant_version_uniq UNIQUE (
    tenant_id,
    version
  ),
  CONSTRAINT retrieval_config_versions_version_chk CHECK (version > 0),
  CONSTRAINT retrieval_config_versions_weights_chk CHECK (
    lexical_weight >= 0 AND vector_weight >= 0 AND
    lexical_weight + vector_weight = 1
  ),
  CONSTRAINT retrieval_config_versions_limits_chk CHECK (
    lexical_limit BETWEEN 1 AND 200 AND
    vector_limit BETWEEN 1 AND 200 AND
    top_k BETWEEN 1 AND 100 AND
    top_k <= lexical_limit + vector_limit
  ),
  CONSTRAINT retrieval_config_versions_threshold_chk CHECK (
    score_threshold BETWEEN 0 AND 1
  ),
  CONSTRAINT retrieval_config_versions_embedding_model_chk CHECK (
    embedding_model = trim(embedding_model) AND
    length(embedding_model) BETWEEN 1 AND 256
  ),
  CONSTRAINT retrieval_config_versions_dimensions_chk CHECK (
    embedding_dimensions = 1536
  ),
  CONSTRAINT retrieval_config_versions_hash_chk CHECK (
    config_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT retrieval_config_versions_metadata_chk CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS retrieval_config_versions_one_active_idx
ON retrieval_config_versions (tenant_id)
WHERE is_active;

CREATE INDEX IF NOT EXISTS retrieval_config_versions_tenant_idx
ON retrieval_config_versions (tenant_id, version DESC);

DROP TRIGGER IF EXISTS retrieval_config_versions_set_updated_at
ON retrieval_config_versions;
CREATE TRIGGER retrieval_config_versions_set_updated_at
BEFORE UPDATE ON retrieval_config_versions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION prevent_retrieval_config_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW.id,
    NEW.tenant_id,
    NEW.version,
    NEW.lexical_weight,
    NEW.vector_weight,
    NEW.lexical_limit,
    NEW.vector_limit,
    NEW.top_k,
    NEW.score_threshold,
    NEW.embedding_model,
    NEW.embedding_dimensions,
    NEW.config_hash,
    NEW.metadata,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.id,
    OLD.tenant_id,
    OLD.version,
    OLD.lexical_weight,
    OLD.vector_weight,
    OLD.lexical_limit,
    OLD.vector_limit,
    OLD.top_k,
    OLD.score_threshold,
    OLD.embedding_model,
    OLD.embedding_dimensions,
    OLD.config_hash,
    OLD.metadata,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'retrieval config versions are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retrieval_config_versions_prevent_mutation
ON retrieval_config_versions;
CREATE TRIGGER retrieval_config_versions_prevent_mutation
BEFORE UPDATE ON retrieval_config_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_retrieval_config_version_mutation();

CREATE OR REPLACE FUNCTION guard_policy_content_mutation()
RETURNS trigger AS $$
DECLARE
  target_tenant_id uuid;
  target_policy_version_id uuid;
  target_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_tenant_id := OLD.tenant_id;
    target_policy_version_id := OLD.policy_version_id;
  ELSE
    target_tenant_id := NEW.tenant_id;
    target_policy_version_id := NEW.policy_version_id;
  END IF;

  SELECT status
  INTO target_status
  FROM policy_versions
  WHERE
    tenant_id = target_tenant_id AND
    id = target_policy_version_id;

  IF target_status IS NOT NULL AND target_status <> 'draft' THEN
    RAISE EXCEPTION 'published policy content is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS policy_documents_guard_mutation ON policy_documents;
CREATE TRIGGER policy_documents_guard_mutation
BEFORE INSERT OR UPDATE OR DELETE ON policy_documents
FOR EACH ROW
EXECUTE FUNCTION guard_policy_content_mutation();

DROP TRIGGER IF EXISTS policy_chunks_guard_mutation ON policy_chunks;
CREATE TRIGGER policy_chunks_guard_mutation
BEFORE INSERT OR UPDATE OR DELETE ON policy_chunks
FOR EACH ROW
EXECUTE FUNCTION guard_policy_content_mutation();

DROP TRIGGER IF EXISTS policy_chunk_embeddings_guard_mutation
ON policy_chunk_embeddings;
CREATE TRIGGER policy_chunk_embeddings_guard_mutation
BEFORE INSERT OR UPDATE OR DELETE ON policy_chunk_embeddings
FOR EACH ROW
EXECUTE FUNCTION guard_policy_content_mutation();

COMMENT ON TABLE policy_versions IS
'Tenant-scoped policy snapshots. Published and archived versions are immutable.';
COMMENT ON TABLE policy_documents IS
'Normalized source documents owned by one tenant policy version.';
COMMENT ON TABLE policy_chunks IS
'Deterministic document chunks with PostgreSQL simple-dictionary FTS.';
COMMENT ON TABLE policy_chunk_embeddings IS
'1536-dimensional immutable chunk embeddings for cosine retrieval.';
COMMENT ON TABLE retrieval_config_versions IS
'Immutable tenant retrieval settings with one active version per tenant.';

COMMIT;
