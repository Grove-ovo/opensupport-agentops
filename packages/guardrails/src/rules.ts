import type {
  GateName,
  GateReasonCode,
  GateRecommendation,
  GateSeverity,
} from '@opensupport/shared';

/**
 * Static risk-rule definitions surfaced to operators as a read-only reference
 * (PRD 17.5). These mirror the inline rule maps evaluated in `guardrails.ts`;
 * they are not configuration — editing them does not change runtime behavior.
 */
export interface RiskRuleDefinition {
  readonly gate: GateName;
  readonly reason_code: GateReasonCode;
  readonly severity: GateSeverity;
  readonly recommendation: GateRecommendation;
  readonly blocking: boolean;
  readonly description: string;
}

export const RISK_RULE_DEFINITIONS: readonly RiskRuleDefinition[] = [
  {
    gate: 'input',
    reason_code: 'prompt_injection',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'Customer text matched a prompt-injection pattern.',
  },
  {
    gate: 'input',
    reason_code: 'approval_bypass',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'Signal attempted to bypass the approval gate.',
  },
  {
    gate: 'input',
    reason_code: 'credential_request',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'Customer requested credentials or secrets.',
  },
  {
    gate: 'input',
    reason_code: 'system_prompt_request',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'Customer requested the system prompt.',
  },
  {
    gate: 'input',
    reason_code: 'unauthorized_order_access',
    severity: 'P0',
    recommendation: 'handoff',
    blocking: true,
    description: 'Cross-account order access detected.',
  },
  {
    gate: 'input',
    reason_code: 'unsafe_tool_intent',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'Direct refund execution requested outside the dry-run path.',
  },
  {
    gate: 'retrieval',
    reason_code: 'retrieval_no_evidence',
    severity: 'P1',
    recommendation: 'clarify',
    blocking: true,
    description: 'No evidence retrieved for the intent.',
  },
  {
    gate: 'retrieval',
    reason_code: 'retrieval_stale_version',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'Retrieved evidence references a stale policy version.',
  },
  {
    gate: 'retrieval',
    reason_code: 'retrieval_injected_document',
    severity: 'P0',
    recommendation: 'block',
    blocking: true,
    description: 'An injected document was detected in the evidence set.',
  },
  {
    gate: 'retrieval',
    reason_code: 'retrieval_conflict',
    severity: 'P0',
    recommendation: 'handoff',
    blocking: true,
    description: 'Conflicting evidence detected.',
  },
];
