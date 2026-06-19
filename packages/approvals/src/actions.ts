import { createHash } from 'node:crypto';
import type {
  ApprovalAction,
  ApprovalActionCommand,
  ApprovalActionRecord,
  ApprovalActionResult,
  ApprovalRequest,
  ChatwootDeliveryCommand,
  ChatwootDeliveryReceipt,
  TicketExecutionReasonCode,
  TicketExecutionState,
} from '@opensupport/shared';
import { isUuid } from '@opensupport/shared';
import {
  type ChatwootDeliveryConnection,
  ChatwootDeliveryService,
} from '@opensupport/chatwoot';
import {
  TicketExecutionTransitionError,
} from '@opensupport/runtime-control';
import { MemoryApprovalRepository } from './snapshot.js';

export type ApprovalActionErrorCode =
  | 'invalid_command'
  | 'approval_not_found'
  | 'scope_mismatch'
  | 'late_action'
  | 'terminal_approval'
  | 'idempotency_conflict'
  | 'delivery_failed'
  | 'ticket_transition_failed';

export class ApprovalActionError extends Error {
  constructor(readonly code: ApprovalActionErrorCode, message: string) {
    super(message);
    this.name = 'ApprovalActionError';
  }
}

interface StoredAction {
  input_hash: string;
  result: ApprovalActionResult;
}

export class ApprovalActionService {
  readonly #actions = new Map<string, StoredAction>();

  constructor(
    readonly approvals: MemoryApprovalRepository,
    readonly delivery: ChatwootDeliveryService,
  ) {}

  async apply(
    command: ApprovalActionCommand,
    connection: ChatwootDeliveryConnection | null,
    now: Date | string = new Date(),
  ): Promise<ApprovalActionResult> {
    const occurredAt = normalizeTimestamp(command.occurred_at ?? now);
    validateCommand(command, occurredAt);
    const inputHash = hashActionInput(command);
    const actionScope = `${command.tenant_id}:${command.approval_id}:${command.idempotency_key}`;
    const existing = this.#actions.get(actionScope);
    if (existing !== undefined) {
      if (existing.input_hash !== inputHash) {
        throw new ApprovalActionError(
          'idempotency_conflict',
          'approval action key was reused with different input',
        );
      }
      return { ...existing.result, status: 'duplicate' };
    }

    const approval = this.approvals.findPending(
      command.tenant_id,
      command.trace_id,
    );
    if (approval === undefined || approval.approval_id !== command.approval_id) {
      throw new ApprovalActionError(
        'approval_not_found',
        'pending approval was not found',
      );
    }
    if (
      approval.tenant_id !== command.tenant_id ||
      approval.trace_id !== command.trace_id
    ) {
      throw new ApprovalActionError(
        'scope_mismatch',
        'approval action is outside the approval scope',
      );
    }
    if (approval.state !== 'pending') {
      throw new ApprovalActionError(
        'terminal_approval',
        'terminal approval cannot transition again',
      );
    }
    if (
      command.action !== 'expire' &&
      Date.parse(occurredAt) >= Date.parse(approval.expires_at)
    ) {
      throw new ApprovalActionError(
        'late_action',
        'approval has expired',
      );
    }

    let deliveryReceipt: ChatwootDeliveryReceipt | null = null;
    if (command.action === 'approve' || command.action === 'edit') {
      if (connection === null) {
        throw new ApprovalActionError(
          'invalid_command',
          'approved actions require a Chatwoot connection',
        );
      }
      deliveryReceipt = await this.delivery.deliver(
        deliveryCommand(command, approval),
        connection,
        occurredAt,
      );
      if (
        deliveryReceipt.status !== 'succeeded' &&
        deliveryReceipt.status !== 'duplicate'
      ) {
        throw new ApprovalActionError(
          'delivery_failed',
          deliveryReceipt.code,
        );
      }
    }

    const target = actionTarget(command.action);
    try {
      this.approvals.stateMachine.transition(
        {
          tenant_id: command.tenant_id,
          trace_id: command.trace_id,
          expected_state: 'waiting_approval',
          next_state: target.state,
          reason_code: target.reason,
          actor_type: command.actor_type,
          actor_id: command.actor_id,
          idempotency_key: `approval-action:${command.idempotency_key}`,
          occurred_at: occurredAt,
        },
        occurredAt,
      );
    } catch (error) {
      throw new ApprovalActionError(
        'ticket_transition_failed',
        error instanceof TicketExecutionTransitionError
          ? error.code
          : 'ticket transition failed',
      );
    }

    const editedReply =
      command.action === 'edit' ? command.edited_reply : null;
    const actionRecord: ApprovalActionRecord = Object.freeze({
      action_id: command.action_id,
      approval_id: command.approval_id,
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      action: command.action,
      resulting_state: target.approvalState,
      actor_type: command.actor_type,
      actor_id: command.actor_id,
      edited_reply: editedReply,
      edit_distance:
        editedReply === null
          ? null
          : normalizedEditDistance(
              approval.snapshot.suggested_reply,
              editedReply,
            ),
      delivery_receipt_id: deliveryReceipt?.receipt_id ?? null,
      provider_message_id: deliveryReceipt?.provider_message_id ?? null,
      idempotency_key: command.idempotency_key,
      input_hash: inputHash,
      created_at: occurredAt,
    });
    const updatedApproval: ApprovalRequest = Object.freeze({
      ...approval,
      state: target.approvalState,
      action: actionRecord,
    });
    this.approvals.replace(updatedApproval);
    const result: ApprovalActionResult = {
      status: 'applied',
      approval: updatedApproval,
      action: actionRecord,
      delivery_receipt: deliveryReceipt,
    };
    this.#actions.set(actionScope, { input_hash: inputHash, result });
    return result;
  }
}

export function normalizedEditDistance(original: string, edited: string): number {
  const source = Array.from(original);
  const target = Array.from(edited);
  if (source.length === 0 && target.length === 0) return 0;
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let row = 1; row <= source.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= target.length; column += 1) {
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) +
          (source[row - 1] === target[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return Number(
    ((previous[target.length] ?? 0) / Math.max(source.length, target.length))
      .toFixed(6),
  );
}

function deliveryCommand(
  command: ApprovalActionCommand,
  approval: ApprovalRequest,
): ChatwootDeliveryCommand {
  const content =
    command.action === 'edit'
      ? command.edited_reply ?? ''
      : approval.snapshot.suggested_reply;
  return {
    delivery_id: command.delivery_id ?? '',
    tenant_id: command.tenant_id,
    trace_id: command.trace_id,
    conversation_id: command.conversation_id ?? '',
    message_type: 'public_reply',
    content,
    content_hash: hash(content),
    idempotency_key: `approval:${command.approval_id}:${command.idempotency_key}`,
    deadline_at: command.deadline_at ?? '',
  };
}

function validateCommand(
  command: ApprovalActionCommand,
  occurredAt: string,
): void {
  const deliveryAction =
    command.action === 'approve' || command.action === 'edit';
  if (
    !isUuid(command.action_id) ||
    !isUuid(command.approval_id) ||
    !isUuid(command.tenant_id) ||
    !isUuid(command.trace_id) ||
    command.expected_state !== 'pending' ||
    !['approve', 'edit', 'reject', 'escalate', 'expire'].includes(command.action) ||
    !['operator', 'scheduler'].includes(command.actor_type) ||
    (command.actor_type === 'operator' &&
      (command.actor_id === null ||
        command.actor_id.trim().length === 0 ||
        command.actor_id !== command.actor_id.trim() ||
        command.actor_id.length > 256)) ||
    (command.action === 'expire' && command.actor_type !== 'scheduler') ||
    (command.action !== 'expire' && command.actor_type !== 'operator') ||
    !/^[A-Za-z0-9._:-]{1,256}$/.test(command.idempotency_key) ||
    (command.action === 'edit' &&
      (command.edited_reply === null ||
        command.edited_reply.trim().length === 0 ||
        command.edited_reply.length > 20_000)) ||
    (command.action !== 'edit' && command.edited_reply !== null) ||
    (deliveryAction &&
      (!isUuid(command.delivery_id ?? '') ||
        !/^[1-9]\d*$/.test(command.conversation_id ?? '') ||
        Number.isNaN(Date.parse(command.deadline_at ?? '')) ||
        Date.parse(command.deadline_at ?? '') <= Date.parse(occurredAt))) ||
    (!deliveryAction &&
      (command.delivery_id !== null ||
        command.conversation_id !== null ||
        command.deadline_at !== null))
  ) {
    throw new ApprovalActionError(
      'invalid_command',
      'approval action command is invalid',
    );
  }
}

function actionTarget(action: ApprovalAction): {
  approvalState: ApprovalActionRecord['resulting_state'];
  state: TicketExecutionState;
  reason: TicketExecutionReasonCode;
} {
  switch (action) {
    case 'approve':
      return {
        approvalState: 'approved',
        state: 'replied',
        reason: 'approval_reply_delivered',
      };
    case 'edit':
      return {
        approvalState: 'edited',
        state: 'replied',
        reason: 'approval_reply_delivered',
      };
    case 'reject':
      return {
        approvalState: 'rejected',
        state: 'private_noted',
        reason: 'approval_rejected',
      };
    case 'escalate':
      return {
        approvalState: 'escalated',
        state: 'handed_off',
        reason: 'approval_escalated',
      };
    case 'expire':
      return {
        approvalState: 'expired',
        state: 'handed_off',
        reason: 'approval_expired',
      };
  }
}

function hashActionInput(command: ApprovalActionCommand): string {
  return hash(
    JSON.stringify({
      approval_id: command.approval_id,
      tenant_id: command.tenant_id,
      trace_id: command.trace_id,
      expected_state: command.expected_state,
      action: command.action,
      actor_type: command.actor_type,
      actor_id: command.actor_id,
      edited_reply: command.edited_reply,
      conversation_id: command.conversation_id,
      delivery_id: command.delivery_id,
      idempotency_key: command.idempotency_key,
    }),
  );
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApprovalActionError(
      'invalid_command',
      'approval action timestamp is invalid',
    );
  }
  return date.toISOString();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
