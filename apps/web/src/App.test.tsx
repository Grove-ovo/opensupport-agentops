import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000002';

describe('operations dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(mockFetch));
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000099' });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders overview metrics and runtime health', async () => {
    render(<App />);
    expect(await screen.findByText('18')).toBeInTheDocument();
    expect(screen.getByText('64.0%')).toBeInTheDocument();
    expect(screen.getByText('Runtime ready')).toBeInTheDocument();
  });

  it('requires confirmation before approving a public reply', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('18');
    await user.click(screen.getAllByRole('button', { name: 'Approvals' })[0]!);
    expect(await screen.findByText('Order ORD-100 is shipped.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('public reply');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/approvals/${APPROVAL_ID}/actions`),
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          headers: expect.objectContaining({
            'x-csrf-token': 'test-csrf',
          }),
        }),
      );
    });
  });

  it('shows an unavailable state when tenant loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/v1/auth/session') {
          return authSession();
        }
        return new Response(
          JSON.stringify({ error: { code: 'dependency_unavailable', message: 'Unavailable' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    render(<App />);
    expect(await screen.findByText('AgentOps unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('explains local mock identity provider on the signed-out screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: { code: 'authentication_required', message: 'Sign in' } }, 401),
      ),
    );
    render(<App />);
    expect(await screen.findByText(/Local demo uses the bundled mock identity provider/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with identity provider' })).toHaveAttribute('href', '/api/v1/auth/login');
  });

  it('prefills dry-run tool samples and runs the selected tool', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('18');
    await user.click(screen.getAllByRole('button', { name: 'Tools' })[0]!);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Tool' }), 'check_refund_eligibility');
    expect(screen.getByDisplayValue(/DRYRUN-100/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Dry-run succeeded (ok)')).toBeInTheDocument();
  });
});

async function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url === '/api/v1/auth/session') {
    return authSession();
  }
  if (url === '/api/v1/tenants?limit=100&offset=0') {
    return json({
      items: [{
        id: TENANT_ID,
        slug: 'northstar',
        display_name: 'Northstar Commerce',
        status: 'active',
        metadata: {},
        created_at: '2026-06-21T00:00:00.000Z',
        updated_at: '2026-06-21T00:00:00.000Z',
      }],
      total: 1,
      limit: 100,
      offset: 0,
    });
  }
  if (url === '/health/ready') {
    return json({ status: 'ready', checks: {} });
  }
  if (url.endsWith('/overview')) {
    return json({
      active_conversations: 18,
      auto_rate: 64,
      approval_backlog: 1,
      p95_latency_ms: 740,
      daily_cost: 0.42,
      failure_count: 2,
      workload: [{ bucket: '2026-06-21T08:00:00.000Z', traces: 8, p95_latency_ms: 740, estimated_cost: 0.2 }],
    });
  }
  if (url.includes('/approvals?')) {
    return json({
      items: [{
        approval_id: APPROVAL_ID,
        tenant_id: TENANT_ID,
        trace_id: '00000000-0000-4000-8000-000000000003',
        state: 'pending',
        suggested_reply: 'Order ORD-100 is shipped.',
        evidence_refs: ['policy-1'],
        tool_result_refs: ['order-1'],
        risk_reason: 'human_review',
        expires_at: '2026-06-22T00:00:00.000Z',
        approver_action: null,
        approver_id: null,
        edited_reply: null,
        edit_distance: null,
        action_at: null,
        created_at: '2026-06-21T00:00:00.000Z',
      }],
      total: 1,
      limit: 100,
      offset: 0,
    });
  }
  if (url.includes(`/approvals/${APPROVAL_ID}/actions`) && init?.method === 'POST') {
    return json({ state: 'approved' });
  }
  if (url.endsWith('/policy-versions') && init?.method === 'POST') {
    return json({
      id: '00000000-0000-4000-8000-000000000005',
      tenant_id: TENANT_ID,
      version: 1,
      name: 'Returns policy',
      status: 'draft',
      content_hash: 'a'.repeat(64),
      document_count: 1,
      chunk_count: 3,
      published_at: null,
      created_at: '2026-06-23T00:00:00.000Z',
    });
  }
  if (url.endsWith('/policy-versions')) {
    return json([
      {
        id: '00000000-0000-4000-8000-000000000005',
        tenant_id: TENANT_ID,
        version: 1,
        name: 'Returns policy',
        status: 'draft',
        content_hash: 'a'.repeat(64),
        document_count: 1,
        chunk_count: 3,
        published_at: null,
        created_at: '2026-06-23T00:00:00.000Z',
      },
    ]);
  }
  if (url.includes('/policy-retrieval-smoke-test') && init?.method === 'POST') {
    return json([
      {
        chunk_id: '00000000-0000-4000-8000-000000000007',
        document_id: '00000000-0000-4000-8000-000000000006',
        chunk_index: 0,
        content: 'Returns are accepted within 30 days.',
        content_hash: 'c'.repeat(64),
        score: 0.85,
      },
    ]);
  }
  if (url.endsWith('/tool-manifest')) {
    return json([
      {
        name: 'get_order_status',
        version_id: 'tools-v1',
        description: 'Read a customer-owned order status.',
        risk_level: 'low',
        timeout_ms: 1500,
        max_retries: 1,
        required_permissions: ['order:read'],
        idempotent: true,
        dry_run: false,
      },
      {
        name: 'check_refund_eligibility',
        version_id: 'tools-v1',
        description: 'Evaluate refund eligibility without creating a refund.',
        risk_level: 'medium',
        timeout_ms: 2000,
        max_retries: 1,
        required_permissions: ['refund:read'],
        idempotent: true,
        dry_run: true,
      },
    ]);
  }
  if (url.endsWith('/risk-rules')) {
    return json([
      {
        gate: 'input',
        reason_code: 'prompt_injection',
        severity: 'P0',
        recommendation: 'block',
        blocking: true,
        description: 'Customer text matched a prompt-injection pattern.',
      },
    ]);
  }
  if (url.includes('/tool-dry-run') && init?.method === 'POST') {
    return json({
      tool_name: 'escalate_to_human',
      status: 'succeeded',
      code: 'ok',
      retryable: false,
      dry_run: true,
      data: { handoff_required: true, reason: 'refund' },
    });
  }
  throw new Error(`Unhandled request: ${url}`);
}

function authSession() {
  return json({
    principal: {
      subject: 'provider-user-1',
      display_name: 'Provider User',
      email: 'operator@example.test',
      roles: ['operator'],
      tenant_ids: [TENANT_ID],
      admin: false,
    },
    csrf_token: 'test-csrf',
    expires_at: 1_800_000_000,
  });
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}
