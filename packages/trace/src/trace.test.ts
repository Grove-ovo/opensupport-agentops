import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { PIIMaskResult } from '@opensupport/shared';
import { createAgentTrace, TraceValidationError } from './index.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const traceId = '22222222-2222-4222-8222-222222222222';
const modelConfigVersionId = '33333333-3333-4333-8333-333333333333';

test('creates a reproducible trace seed from a safe PII mask result', () => {
  const trace = createAgentTrace(validInput());

  assert.equal(trace.trace_id, traceId);
  assert.equal(trace.runtime_mode, 'shadow');
  assert.equal(trace.execution_state, 'received');
  assert.equal(trace.model_config_version_id, modelConfigVersionId);
  assert.deepEqual(trace.pii_categories, ['email']);
  assert.equal(trace.pii_replacement_map_ref, 'pii-map:trace-test-map');
  assert.equal(
    trace.masked_input_hash,
    createHash('sha256').update('Email [EMAIL_1]').digest('hex'),
  );
  assert.deepEqual(trace.entities, {});
  assert.deepEqual(trace.retrieved_doc_ids, []);
  assert.equal('masked_text' in trace, false);
  assert.equal('replacements' in trace, false);
});

test('accepts no-PII results without a replacement reference', () => {
  const trace = createAgentTrace(
    validInput({
      piiMaskResult: {
        masked_text: 'Where is order A-12345?',
        detected_categories: [],
        replacement_map_ref: null,
      },
    }),
  );

  assert.deepEqual(trace.pii_categories, []);
  assert.equal(trace.pii_replacement_map_ref, null);
});

test('rejects incomplete identifiers, snapshots, and unsupported enums together', () => {
  assert.throws(
    () => createAgentTrace(
      validInput({
        tenantId: 'tenant-demo',
        ticketId: ' ',
        runtimeMode:
          'manual' as Parameters<typeof createAgentTrace>[0]['runtimeMode'],
        executionState:
          'unknown' as NonNullable<
            Parameters<typeof createAgentTrace>[0]['executionState']
          >,
        versionSnapshot: {
          ...versionSnapshot(),
          prompt_version_id: '',
          model_config_version_id: 'not-a-uuid',
        },
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof TraceValidationError);
      assert.deepEqual(
        new Set(error.issues.map((issue) => issue.field)),
        new Set([
          'tenantId',
          'ticketId',
          'runtimeMode',
          'executionState',
          'prompt_version_id',
          'model_config_version_id',
        ]),
      );
      return true;
    },
  );
});

test('rejects inconsistent or malformed PII mask results', () => {
  const cases: PIIMaskResult[] = [
    {
      masked_text: 'Email [EMAIL_1]',
      detected_categories: ['email'],
      replacement_map_ref: null,
    },
    {
      masked_text: 'No placeholder',
      detected_categories: ['email'],
      replacement_map_ref: 'pii-map:test',
    },
    {
      masked_text: 'No PII',
      detected_categories: [],
      replacement_map_ref: 'pii-map:test',
    },
    {
      masked_text: 'Undeclared [PHONE_1]',
      detected_categories: [],
      replacement_map_ref: null,
    },
    {
      masked_text: '[EMAIL_1]',
      detected_categories: ['email', 'email'],
      replacement_map_ref: 'pii-map:test',
    },
  ];

  for (const piiMaskResult of cases) {
    assert.throws(
      () => createAgentTrace(validInput({ piiMaskResult })),
      TraceValidationError,
    );
  }
});

test('rejects invalid creation timestamps', () => {
  assert.throws(
    () => createAgentTrace(validInput({ createdAt: 'not-a-date' })),
    (error: unknown) =>
      error instanceof TraceValidationError &&
      error.issues.some((issue) => issue.code === 'invalid_timestamp'),
  );
});

function validInput(
  overrides: Partial<Parameters<typeof createAgentTrace>[0]> = {},
): Parameters<typeof createAgentTrace>[0] {
  return {
    traceId,
    tenantId,
    ticketId: 'ticket-42',
    conversationId: 'conversation-42',
    messageId: 'message-42',
    runtimeMode: 'shadow',
    executionState: 'received',
    versionSnapshot: versionSnapshot(),
    piiMaskResult: {
      masked_text: 'Email [EMAIL_1]',
      detected_categories: ['email'],
      replacement_map_ref: 'pii-map:trace-test-map',
    },
    createdAt: '2026-06-18T00:00:00.000Z',
    ...overrides,
  };
}

function versionSnapshot() {
  return {
    agent_version_id: 'agent-v1',
    prompt_version_id: 'prompt-v1',
    policy_version_id: 'policy-v1',
    tool_manifest_version_id: 'tools-v1',
    risk_rule_version_id: 'risk-v1',
    retrieval_config_version_id: 'retrieval-v1',
    model_config_version_id: modelConfigVersionId,
  };
}
