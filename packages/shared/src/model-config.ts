export interface TenantModelConfig {
  id: string;
  tenant_id: string;
  version: number;
  provider: string;
  fast_model: string;
  strong_model: string;
  embedding_model: string;
  fallback_model: string;
  timeout_ms: number;
  max_cost_per_ticket: number;
  daily_budget: number;
  budget_currency: string;
  encrypted_api_key_ref: string;
  is_active: boolean;
  config_fingerprint: string;
}
