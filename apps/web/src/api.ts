import type {
  ApiFailure,
  AuthSession,
  Approval,
  Overview,
  Page,
  PolicyDocument,
  PolicyVersion,
  ReleaseCandidate,
  ReleaseDetail,
  RetrievalSmokeTestResult,
  Settings,
  Tenant,
  Trace,
  TraceDetail,
} from './types.js';

let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const api = {
  session: async () => {
    const session = await request<AuthSession>('/api/v1/auth/session');
    csrfToken = session.csrf_token;
    return session;
  },
  logout: async () => {
    await request<void>('/api/v1/auth/logout', { method: 'POST' });
    csrfToken = null;
  },
  tenants: () => request<Page<Tenant>>('/api/v1/tenants?limit=100&offset=0'),
  ready: () =>
    request<{ status: string; checks: Record<string, unknown> }>('/health/ready'),
  overview: (tenantId: string) =>
    request<Overview>(`/api/v1/tenants/${tenantId}/overview`),
  traces: (tenantId: string, limit = 50, offset = 0) =>
    request<Page<Trace>>(
      `/api/v1/tenants/${tenantId}/traces?limit=${limit}&offset=${offset}`,
    ),
  trace: (tenantId: string, traceId: string) =>
    request<TraceDetail>(`/api/v1/tenants/${tenantId}/traces/${traceId}`),
  approvals: (tenantId: string, state?: Approval['state']) =>
    request<Page<Approval>>(
      `/api/v1/tenants/${tenantId}/approvals?limit=100&offset=0${
        state ? `&state=${state}` : ''
      }`,
    ),
  approvalAction: (
    tenantId: string,
    approvalId: string,
    input: {
      action: 'approve' | 'edit' | 'reject' | 'escalate';
      edited_reply?: string;
      idempotency_key: string;
      confirm: true;
    },
  ) =>
    request<Approval>(
      `/api/v1/tenants/${tenantId}/approvals/${approvalId}/actions`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  releases: (tenantId: string) =>
    request<Page<ReleaseCandidate>>(
      `/api/v1/tenants/${tenantId}/release-candidates?limit=100&offset=0`,
    ),
  release: (tenantId: string, candidateId: string) =>
    request<ReleaseDetail>(
      `/api/v1/tenants/${tenantId}/releases/${candidateId}`,
    ),
  releaseTransition: (
    tenantId: string,
    candidateId: string,
    input: {
      action: 'start_evaluation' | 'archive';
      idempotency_key: string;
      confirm: true;
    },
  ) =>
    request<ReleaseDetail>(
      `/api/v1/tenants/${tenantId}/releases/${candidateId}/transitions`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  settings: (tenantId: string) =>
    request<Settings>(`/api/v1/tenants/${tenantId}/settings`),
  updateTenant: (
    tenantId: string,
    input: {
      display_name: string;
      status: Tenant['status'];
      metadata: Record<string, unknown>;
    },
  ) =>
    request<Tenant>(`/api/v1/tenants/${tenantId}/settings/tenant`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  updateModel: (tenantId: string, input: Record<string, unknown>) =>
    request<Settings['model_config']>(
      `/api/v1/tenants/${tenantId}/settings/model-config`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
  updateChatwoot: (tenantId: string, input: Record<string, unknown>) =>
    request<Settings['chatwoot']>(
      `/api/v1/tenants/${tenantId}/settings/chatwoot`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
  policyVersions: (tenantId: string) =>
    request<PolicyVersion[]>(
      `/api/v1/tenants/${tenantId}/policy-versions`,
    ),
  policyDocuments: (tenantId: string, policyVersionId: string) =>
    request<PolicyDocument[]>(
      `/api/v1/tenants/${tenantId}/policy-versions/${policyVersionId}/documents`,
    ),
  createPolicyVersion: (
    tenantId: string,
    input: {
      name: string;
      documents: Array<{
        source_key: string;
        title: string;
        content: string;
      }>;
    },
  ) =>
    request<PolicyVersion>(
      `/api/v1/tenants/${tenantId}/policy-versions`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  publishPolicyVersion: (tenantId: string, policyVersionId: string) =>
    request<PolicyVersion>(
      `/api/v1/tenants/${tenantId}/policy-versions/${policyVersionId}/publish`,
      { method: 'PUT' },
    ),
  runRetrievalSmokeTest: (
    tenantId: string,
    input: { query: string; limit?: number },
  ) =>
    request<RetrievalSmokeTestResult[]>(
      `/api/v1/tenants/${tenantId}/policy-retrieval-smoke-test`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
};

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(isMutation(init.method) && csrfToken
        ? { 'x-csrf-token': csrfToken }
        : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | ApiFailure
    | null;
  if (!response.ok) {
    const failure = body as ApiFailure | null;
    const error = new ApiError(
      failure?.error.code ?? `http_${response.status}`,
      response.status,
    );
    if (response.status === 401 && url !== '/api/v1/auth/session') {
      csrfToken = null;
      window.dispatchEvent(new Event('agentops:session-expired'));
    }
    throw error;
  }
  return body as T;
}

function isMutation(method: string | undefined): boolean {
  return method !== undefined && !['GET', 'HEAD', 'OPTIONS'].includes(method);
}
