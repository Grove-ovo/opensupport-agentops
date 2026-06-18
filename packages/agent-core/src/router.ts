import type {
  AgentCapability,
  AgentIntent,
  AgentPipelineContext,
  AgentRoute,
  RouteDecision,
  RouteReasonCode,
  SensitiveSignal,
} from '@opensupport/shared';

interface IntentRule {
  intent: Exclude<AgentIntent, 'unknown'>;
  route: Exclude<AgentRoute, 'triage'>;
  reason: Exclude<
    RouteReasonCode,
    | 'order_id_extracted'
    | 'required_order_id_missing'
    | 'conflicting_intent_signals'
    | 'no_supported_intent'
  >;
  patterns: readonly RegExp[];
}

const INTENT_RULES: readonly IntentRule[] = [
  {
    intent: 'complaint_escalation',
    route: 'handoff',
    reason: 'matched_complaint_escalation',
    patterns: [
      /\b(?:complain|complaint|escalate)\b/iu,
      /\bhuman\s+(?:agent|support)\b/iu,
      /投诉|人工客服|转人工/iu,
    ],
  },
  {
    intent: 'refund_request',
    route: 'refund',
    reason: 'matched_refund_request',
    patterns: [
      /\b(?:request|apply\s+for|process|initiate|start|issue)\s+(?:a\s+)?refund\b/iu,
      /\brefund\s+(?:my|this|the)\s+order\b/iu,
      /我要退款|申请退款|办理退款|帮我退款|直接退款/iu,
    ],
  },
  {
    intent: 'refund_eligibility',
    route: 'refund',
    reason: 'matched_refund_eligibility',
    patterns: [
      /\b(?:eligible\s+for|eligibility\s+for)\s+(?:a\s+)?refund\b/iu,
      /\bcan\s+i\s+(?:get|receive|request)\s+(?:a\s+)?refund\b/iu,
      /\bis\b[^\n]{0,40}\brefundable\b/iu,
      /退款资格|是否可以退款|能否退款|可以退款吗|可退款吗|符合退款/iu,
    ],
  },
  {
    intent: 'logistics_query',
    route: 'logistics',
    reason: 'matched_logistics_query',
    patterns: [
      /\b(?:track(?:ing)?\s+(?:my\s+)?order|shipment|shipping\s+status|delivery\s+status|tracking\s+number)\b/iu,
      /快递|物流|配送|运单|包裹到哪/iu,
    ],
  },
  {
    intent: 'order_status',
    route: 'order',
    reason: 'matched_order_status',
    patterns: [
      /\b(?:order\s+status|status\s+of\s+(?:my\s+)?order|where\s+is\s+my\s+order)\b/iu,
      /订单状态|订单进度|发货了吗|订单怎么样/iu,
    ],
  },
  {
    intent: 'invoice_request',
    route: 'invoice',
    reason: 'matched_invoice_request',
    patterns: [
      /\b(?:invoice|tax\s+receipt|receipt\s+for\s+(?:my\s+)?order)\b/iu,
      /发票|开票/iu,
    ],
  },
  {
    intent: 'return_policy',
    route: 'policy',
    reason: 'matched_return_policy',
    patterns: [
      /\b(?:return\s+policy|return\s+window|return\s+period|how\s+(?:do|can)\s+i\s+return)\b/iu,
      /退货政策|退货规则|退货期限|几天内退货|如何退货/iu,
    ],
  },
];

const SENSITIVE_RULES: readonly {
  signal: SensitiveSignal;
  patterns: readonly RegExp[];
}[] = [
  {
    signal: 'approval_bypass',
    patterns: [
      /\b(?:bypass|skip|ignore)\s+(?:the\s+)?approval\b/iu,
      /绕过审批|跳过审批|无需审批/iu,
    ],
  },
  {
    signal: 'direct_refund_execution',
    patterns: [
      /\b(?:call|invoke|execute)\s+(?:the\s+)?refund\s+api\b/iu,
      /\bforce\s+(?:a\s+)?refund\b/iu,
      /直接调用退款(?:接口|api)|强制退款/iu,
    ],
  },
  {
    signal: 'credential_disclosure',
    patterns: [
      /\b(?:api\s+key|secret\s+key|access\s+token)\b/iu,
      /api\s*密钥|访问令牌|输出密钥/iu,
    ],
  },
  {
    signal: 'system_prompt_disclosure',
    patterns: [
      /\b(?:system\s+prompt|reveal\s+(?:your\s+)?instructions)\b/iu,
      /系统提示词|系统指令/iu,
    ],
  },
  {
    signal: 'cross_account_access',
    patterns: [
      /\b(?:another\s+user'?s|someone\s+else'?s|other\s+customer'?s)\s+order\b/iu,
      /他人订单|别人的订单|其他用户订单/iu,
    ],
  },
];

const ORDER_ID_PATTERN =
  /(?:\border\s+(?:id|number)\b|\border\s+no\.?(?=\s|[:：#])|订单(?:号|编号))\s*[:：#]?\s*([a-z0-9][a-z0-9_-]{1,63})/giu;

const ORDER_REQUIRED_INTENTS = new Set<AgentIntent>([
  'order_status',
  'logistics_query',
  'refund_eligibility',
  'refund_request',
  'invoice_request',
]);

export function routeAgentMessage(
  context: AgentPipelineContext,
): RouteDecision {
  const text = context.masked_text.normalize('NFKC');
  const matches = INTENT_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  );
  const orderIds = extractOrderIds(text);
  const sensitiveSignals = detectSensitiveSignals(text);

  if (matches.length === 0) {
    return {
      intent: 'unknown',
      candidate_intents: [],
      confidence: 0.25,
      route: 'triage',
      entities: { order_ids: orderIds },
      required_capabilities: ['triage_agent', 'risk_guardrail'],
      sensitive_signals: sensitiveSignals,
      triage_required: true,
      reason_codes: [
        ...(orderIds.length > 0
          ? (['order_id_extracted'] as const)
          : []),
        'no_supported_intent',
      ],
    };
  }

  if (matches.length > 1) {
    return {
      intent: 'unknown',
      candidate_intents: matches.map((match) => match.intent),
      confidence: 0.35,
      route: 'triage',
      entities: { order_ids: orderIds },
      required_capabilities: ['triage_agent', 'risk_guardrail'],
      sensitive_signals: sensitiveSignals,
      triage_required: true,
      reason_codes: [
        ...matches.map((match) => match.reason),
        ...(orderIds.length > 0
          ? (['order_id_extracted'] as const)
          : []),
        'conflicting_intent_signals',
      ],
    };
  }

  const match = matches[0] as IntentRule;
  const missingOrderId =
    ORDER_REQUIRED_INTENTS.has(match.intent) && orderIds.length === 0;

  return {
    intent: match.intent,
    candidate_intents: [match.intent],
    confidence: missingOrderId ? 0.55 : 0.95,
    route: missingOrderId ? 'triage' : match.route,
    entities: { order_ids: orderIds },
    required_capabilities: missingOrderId
      ? ['triage_agent', 'risk_guardrail']
      : capabilitiesFor(match.intent),
    sensitive_signals: sensitiveSignals,
    triage_required: missingOrderId,
    reason_codes: [
      match.reason,
      ...(orderIds.length > 0
        ? (['order_id_extracted'] as const)
        : []),
      ...(missingOrderId
        ? (['required_order_id_missing'] as const)
        : []),
    ],
  };
}

function extractOrderIds(text: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(ORDER_ID_PATTERN)) {
    const orderId = match[1]?.toUpperCase();
    if (orderId !== undefined && !seen.has(orderId)) {
      seen.add(orderId);
      result.push(orderId);
    }
  }

  return result;
}

function detectSensitiveSignals(text: string): SensitiveSignal[] {
  return SENSITIVE_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).map((rule) => rule.signal);
}

function capabilitiesFor(intent: AgentIntent): AgentCapability[] {
  switch (intent) {
    case 'order_status':
      return ['order_tool', 'risk_guardrail', 'response_agent'];
    case 'logistics_query':
      return ['logistics_tool', 'risk_guardrail', 'response_agent'];
    case 'refund_eligibility':
    case 'refund_request':
      return ['rag', 'refund_tool', 'risk_guardrail', 'response_agent'];
    case 'return_policy':
      return ['rag', 'risk_guardrail', 'response_agent'];
    case 'invoice_request':
      return ['order_tool', 'risk_guardrail', 'response_agent'];
    case 'complaint_escalation':
      return ['handoff', 'risk_guardrail'];
    case 'unknown':
      return ['triage_agent', 'risk_guardrail'];
  }
}
