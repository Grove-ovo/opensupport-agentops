import assert from 'node:assert/strict';
import test from 'node:test';
import { maskPII } from './index.js';

test('masks all Phase 1 PII categories with stable placeholders', () => {
  const operation = maskPII(
    [
      'Email jane@example.com',
      'Phone +1 (415) 555-2671',
      'SSN 123-45-6789',
      'Card 4111 1111 1111 1111',
      'Address: 123 Main Street, Seattle WA 98101',
    ].join('; '),
    { replacementMapId: 'test-map-1' },
  );

  assert.deepEqual(operation.result.detected_categories, [
    'email',
    'phone',
    'id_number',
    'bank_card',
    'address',
  ]);
  assert.equal(operation.result.replacement_map_ref, 'pii-map:test-map-1');
  assert.match(operation.result.masked_text, /\[EMAIL_1\]/);
  assert.match(operation.result.masked_text, /\[PHONE_1\]/);
  assert.match(operation.result.masked_text, /\[ID_NUMBER_1\]/);
  assert.match(operation.result.masked_text, /\[BANK_CARD_1\]/);
  assert.match(operation.result.masked_text, /\[ADDRESS_1\]/);
  assert.doesNotMatch(operation.result.masked_text, /jane@example\.com/);
  assert.equal(
    JSON.stringify(operation.result).includes('4111 1111 1111 1111'),
    false,
  );
});

test('masks Chinese phone, citizen ID, and address examples', () => {
  const operation = maskPII(
    '联系电话13800138000，身份证11010519491231002X，地址：北京市朝阳区建国路88号',
    { replacementMapId: 'cn-map' },
  );

  assert.match(operation.result.masked_text, /\[PHONE_1\]/);
  assert.match(operation.result.masked_text, /\[ID_NUMBER_1\]/);
  assert.match(operation.result.masked_text, /\[ADDRESS_1\]/);
});

test('preserves labelled and explicit order IDs even when card-length', () => {
  const labelledOrder = '4111111111111111';
  const explicitOrder = '5555555555554444';
  const operation = maskPII(
    `订单号：${labelledOrder}，备用编号 ${explicitOrder}，银行卡 4012888888881881`,
    {
      preserveValues: [explicitOrder],
      replacementMapId: 'order-map',
    },
  );

  assert.match(operation.result.masked_text, new RegExp(labelledOrder));
  assert.match(operation.result.masked_text, new RegExp(explicitOrder));
  assert.match(operation.result.masked_text, /\[BANK_CARD_1\]/);
});

test('preserves an order ID nested inside a labelled address segment', () => {
  const orderId = '4111111111111111';
  const operation = maskPII(
    `Address: 123 Main Street, order id: ${orderId}, Seattle WA`,
    { replacementMapId: 'nested-order-map' },
  );

  assert.match(operation.result.masked_text, new RegExp(orderId));
  assert.match(operation.result.masked_text, /\[ADDRESS_1\]/);
  assert.doesNotMatch(operation.result.masked_text, /\[BANK_CARD_/);
});

test('reuses placeholders for repeated identical values', () => {
  const operation = maskPII(
    'Use jane@example.com and repeat jane@example.com',
    { replacementMapId: 'repeat-map' },
  );

  assert.equal(
    operation.result.masked_text,
    'Use [EMAIL_1] and repeat [EMAIL_1]',
  );
  assert.equal(operation.replacements.length, 1);
});

test('does not treat invalid cards or invalid citizen IDs as PII', () => {
  const operation = maskPII(
    'Reference 4111111111111112 and ID 110105194912310021',
  );

  assert.equal(operation.result.replacement_map_ref, null);
  assert.deepEqual(operation.result.detected_categories, []);
  assert.deepEqual(operation.replacements, []);
});

test('returns original text and no map reference when nothing is detected', () => {
  const text = 'Where is order ABC-12345?';
  const operation = maskPII(text);

  assert.equal(operation.result.masked_text, text);
  assert.equal(operation.result.replacement_map_ref, null);
  assert.deepEqual(operation.replacements, []);
});

test('rejects unsafe replacement map identifiers', () => {
  assert.throws(
    () => maskPII('jane@example.com', { replacementMapId: '../unsafe' }),
    /safe opaque identifier/,
  );
});
