interface StatusBadgeProps {
  value: string;
}

const ALERT_VALUES = new Set(['failed', 'rejected', 'expired', 'blocked']);
const WARNING_VALUES = new Set([
  'pending',
  'assist',
  'escalated',
  'waiting_approval',
  'evaluating',
]);
const SUCCESS_VALUES = new Set([
  'active',
  'approved',
  'edited',
  'auto',
  'replied',
  'succeeded',
  'pass',
]);

export function StatusBadge({ value }: StatusBadgeProps) {
  const normalized = value.toLowerCase();
  const tone = ALERT_VALUES.has(normalized)
    ? 'danger'
    : WARNING_VALUES.has(normalized)
      ? 'warning'
      : SUCCESS_VALUES.has(normalized)
        ? 'success'
        : 'neutral';
  return <span className={`status-badge status-${tone}`}>{value}</span>;
}
