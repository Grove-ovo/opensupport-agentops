-- Phase 1C: immutable tenant model config versions and single-active semantics.

BEGIN;

ALTER TABLE tenant_model_configs
ADD COLUMN IF NOT EXISTS version integer;

UPDATE tenant_model_configs
SET version = 1
WHERE version IS NULL;

ALTER TABLE tenant_model_configs
ALTER COLUMN version SET NOT NULL;

ALTER TABLE tenant_model_configs
ALTER COLUMN version DROP DEFAULT;

ALTER TABLE tenant_model_configs
ADD COLUMN IF NOT EXISTS config_fingerprint text;

UPDATE tenant_model_configs
SET config_fingerprint = encode(digest(id::text || ':legacy', 'sha256'), 'hex')
WHERE config_fingerprint IS NULL;

ALTER TABLE tenant_model_configs
ALTER COLUMN config_fingerprint SET NOT NULL;

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_tenant_uniq;

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_tenant_version_uniq;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_tenant_version_uniq
UNIQUE (tenant_id, version);

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_version_chk;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_version_chk
CHECK (version > 0);

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_fingerprint_chk;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_fingerprint_chk
CHECK (config_fingerprint ~ '^[a-f0-9]{64}$');

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_provider_canonical_chk;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_provider_canonical_chk
CHECK (provider = lower(trim(provider)) AND length(provider) > 0);

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_models_canonical_chk;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_models_canonical_chk
CHECK (
  fast_model = trim(fast_model) AND length(fast_model) > 0 AND
  strong_model = trim(strong_model) AND length(strong_model) > 0 AND
  embedding_model = trim(embedding_model) AND length(embedding_model) > 0 AND
  fallback_model = trim(fallback_model) AND length(fallback_model) > 0
);

ALTER TABLE tenant_model_configs
DROP CONSTRAINT IF EXISTS tenant_model_configs_encrypted_ref_chk;

ALTER TABLE tenant_model_configs
ADD CONSTRAINT tenant_model_configs_encrypted_ref_chk
CHECK (
  encrypted_api_key_ref ~
  '^enc:v1:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
);

DROP INDEX IF EXISTS tenant_model_configs_one_active_idx;
CREATE UNIQUE INDEX tenant_model_configs_one_active_idx
ON tenant_model_configs (tenant_id)
WHERE is_active;

CREATE OR REPLACE FUNCTION prevent_tenant_model_config_mutation()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW.id,
    NEW.tenant_id,
    NEW.version,
    NEW.provider,
    NEW.fast_model,
    NEW.strong_model,
    NEW.embedding_model,
    NEW.fallback_model,
    NEW.timeout_ms,
    NEW.max_cost_per_ticket,
    NEW.daily_budget,
    NEW.budget_currency,
    NEW.encrypted_api_key_ref,
    NEW.config_fingerprint,
    NEW.metadata,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.id,
    OLD.tenant_id,
    OLD.version,
    OLD.provider,
    OLD.fast_model,
    OLD.strong_model,
    OLD.embedding_model,
    OLD.fallback_model,
    OLD.timeout_ms,
    OLD.max_cost_per_ticket,
    OLD.daily_budget,
    OLD.budget_currency,
    OLD.encrypted_api_key_ref,
    OLD.config_fingerprint,
    OLD.metadata,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'tenant model config versions are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenant_model_configs_prevent_mutation
ON tenant_model_configs;

CREATE TRIGGER tenant_model_configs_prevent_mutation
BEFORE UPDATE ON tenant_model_configs
FOR EACH ROW
EXECUTE FUNCTION prevent_tenant_model_config_mutation();

COMMENT ON COLUMN tenant_model_configs.version IS
'Monotonic tenant-scoped immutable model config version.';

COMMENT ON COLUMN tenant_model_configs.config_fingerprint IS
'SHA-256 fingerprint of normalized non-secret model config fields.';

COMMIT;
