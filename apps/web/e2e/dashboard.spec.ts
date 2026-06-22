import { expect, test } from '@playwright/test';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/api/v1/auth/session')) {
      return route.fulfill({
        json: {
          principal: {
            subject: 'provider-user-1',
            display_name: 'Provider User',
            email: 'operator@example.test',
            roles: ['operator'],
            tenant_ids: [TENANT_ID],
            admin: false,
          },
          csrf_token: 'playwright-csrf',
          expires_at: 1_800_000_000,
        },
      });
    }
    if (url.endsWith('/api/v1/tenants?limit=100&offset=0')) {
      return route.fulfill({
        json: {
          items: [
            {
              id: TENANT_ID,
              slug: 'northstar',
              display_name: 'Northstar Commerce',
              status: 'active',
              metadata: {},
              created_at: '2026-06-21T00:00:00.000Z',
              updated_at: '2026-06-21T00:00:00.000Z',
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (url.endsWith('/overview')) {
      return route.fulfill({
        json: {
          active_conversations: 184,
          auto_rate: 67.4,
          approval_backlog: 7,
          p95_latency_ms: 930,
          daily_cost: 3.82,
          failure_count: 2,
          workload: Array.from({ length: 18 }, (_, index) => ({
            bucket: `2026-06-21T${String(index).padStart(2, '0')}:00:00.000Z`,
            traces: 3 + ((index * 7) % 17),
            p95_latency_ms: 700 + index * 12,
            estimated_cost: 0.05 * index,
          })),
        },
      });
    }
    if (url.includes('/approvals?')) {
      return route.fulfill({
        json: {
          items: [
            {
              approval_id: '00000000-0000-4000-8000-000000000002',
              tenant_id: TENANT_ID,
              trace_id: '00000000-0000-4000-8000-000000000003',
              state: 'pending',
              suggested_reply:
                'Order ORD-100 is shipped and is expected to arrive tomorrow.',
              evidence_refs: ['shipping-policy-v3'],
              tool_result_refs: ['order-lookup-44'],
              risk_reason: 'human_review',
              expires_at: '2026-06-22T00:00:00.000Z',
              approver_action: null,
              approver_id: null,
              edited_reply: null,
              edit_distance: null,
              action_at: null,
              created_at: '2026-06-21T00:00:00.000Z',
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (url.includes('/actions')) {
      return route.fulfill({ json: { state: 'approved' } });
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'not_found', message: 'not found' } },
    });
  });
  await page.route('**/health/ready', (route) =>
    route.fulfill({ json: { status: 'ready', checks: {} } }),
  );
});

test('overview and approval confirmation remain usable', async (
  { page },
  testInfo,
) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('184')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('overview.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Approvals' }).first().click();
  await expect(
    page.getByText(
      'Order ORD-100 is shipped and is expected to arrive tomorrow.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('public reply');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(dialog).toBeHidden();
});

test('mobile navigation does not overflow viewport', async (
  { page },
  testInfo,
) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('mobile-overview.png'),
    fullPage: true,
  });
});

test('signed-out operators are sent to the identity provider', async ({ page }) => {
  await page.unroute('**/api/**');
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: {
          code: 'authentication_required',
          message: 'Authentication required',
        },
      },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Operator sign-in required' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in with identity provider' }),
  ).toHaveAttribute('href', '/api/v1/auth/login');
});

test('operators without role or tenant scope see a forbidden state', async ({
  page,
}) => {
  await page.unroute('**/api/**');
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: {
          code: 'forbidden',
          message: 'Operator is not authorized',
        },
      },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Access not authorized' }),
  ).toBeVisible();
});
