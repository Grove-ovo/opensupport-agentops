import { Check, MessageSquareText, Pencil, ShieldAlert, SquareCheck, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { api } from '../api.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import type { Approval } from '../types.js';

interface ApprovalsViewProps {
  tenantId: string;
}

type ApprovalAction = 'approve' | 'edit' | 'reject' | 'escalate';

export function ApprovalsView({ tenantId }: ApprovalsViewProps) {
  const [state, setState] = useState<Approval['state'] | ''>('pending');
  const [selection, setSelection] = useState<{ approval: Approval; action: ApprovalAction } | null>(null);
  const [editedReply, setEditedReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const approvals = useResource(`approvals:${tenantId}:${state}`, () => api.approvals(tenantId, state || undefined), { refreshInterval: 15_000 });

  const pendingApprovals = useMemo(
    () => (approvals.data?.items ?? []).filter((a) => a.state === 'pending'),
    [approvals.data],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === pendingApprovals.length) return new Set();
      return new Set(pendingApprovals.map((a) => a.approval_id));
    });
  }, [pendingApprovals]);

  const openAction = (approval: Approval, action: ApprovalAction) => {
    setMutationError(null);
    setEditedReply(approval.suggested_reply);
    setSelection({ approval, action });
  };

  const apply = async () => {
    if (!selection) return;
    setBusy(true);
    setMutationError(null);
    try {
      await api.approvalAction(tenantId, selection.approval.approval_id, {
        action: selection.action,
        edited_reply: selection.action === 'edit' ? editedReply : undefined,
        idempotency_key: crypto.randomUUID(),
        confirm: true,
      });
      setSelection(null);
      approvals.reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'approval_action_failed');
    } finally {
      setBusy(false);
    }
  };

  const batchApprove = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setMutationError(null);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        await api.approvalAction(tenantId, id, {
          action: 'approve',
          idempotency_key: crypto.randomUUID(),
          confirm: true,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }
    setSelectedIds(new Set());
    approvals.reload();
    setBusy(false);
    if (failCount > 0) {
      setMutationError(`Approved ${successCount}, failed ${failCount}`);
    }
  };

  return (
    <div className="view-stack">
      <section className="filter-bar">
        <select aria-label="Approval state" value={state} onChange={(event) => setState(event.target.value as Approval['state'] | '')}>
          <option value="">All states</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="edited">Edited</option><option value="rejected">Rejected</option><option value="escalated">Escalated</option><option value="expired">Expired</option>
        </select>
        {selectedIds.size > 0 ? (
          <div className="batch-actions">
            <span className="muted">{selectedIds.size} selected</span>
            <button className="button button-primary button-sm" type="button" disabled={busy} onClick={batchApprove}>
              <SquareCheck size={14} />Batch Approve
            </button>
          </div>
        ) : null}
      </section>
      {approvals.loading && !approvals.data ? <StatePanel kind="loading" title="Loading approval queue" /> : null}
      {approvals.error && !approvals.data ? <StatePanel kind="error" title="Approval queue unavailable" detail={approvals.error} onRetry={approvals.reload} /> : null}
      {approvals.data?.items.length === 0 ? <StatePanel kind="empty" title="Approval queue is clear" /> : null}
      {mutationError ? <p className="form-error" role="alert" style={{ padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 4 }}>{mutationError}</p> : null}
      <section className="approval-list">
        {approvals.data?.items.map((approval) => (
          <article className={`approval-item ${selectedIds.has(approval.approval_id) ? 'selected' : ''}`} key={approval.approval_id}>
            <header>
              <div>
                {approval.state === 'pending' ? (
                  <label className="approval-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(approval.approval_id)}
                      onChange={() => toggleSelect(approval.approval_id)}
                    />
                  </label>
                ) : null}
                <StatusBadge value={approval.state} /><span className="muted">Trace {approval.trace_id.slice(0, 8)}</span>
              </div>
              <time>{new Date(approval.created_at).toLocaleString()}</time>
            </header>
            <blockquote>{approval.suggested_reply}</blockquote>
            <dl className="approval-meta">
              <div><dt>Risk</dt><dd>{approval.risk_reason}</dd></div>
              <div><dt>Evidence</dt><dd>{approval.evidence_refs.length} references</dd></div>
              <div><dt>Expires</dt><dd>{new Date(approval.expires_at).toLocaleString()}</dd></div>
            </dl>
            {approval.state === 'pending' ? (
              <footer>
                <button className="button button-primary" type="button" onClick={() => openAction(approval, 'approve')}><Check size={16} />Approve</button>
                <button className="button button-secondary" type="button" onClick={() => openAction(approval, 'edit')}><Pencil size={16} />Edit</button>
                <button className="button button-secondary" type="button" onClick={() => openAction(approval, 'escalate')}><ShieldAlert size={16} />Escalate</button>
                <button className="icon-button danger" type="button" title="Reject" onClick={() => openAction(approval, 'reject')}><X size={17} /></button>
              </footer>
            ) : null}
          </article>
        ))}
      </section>
      {pendingApprovals.length > 0 ? (
        <footer className="batch-select-all">
          <label>
            <input
              type="checkbox"
              checked={selectedIds.size === pendingApprovals.length && pendingApprovals.length > 0}
              onChange={toggleAll}
            />
            <span>Select all pending ({pendingApprovals.length})</span>
          </label>
        </footer>
      ) : null}
      <ConfirmDialog
        open={selection !== null}
        title={`${capitalize(selection?.action ?? '')} approval`}
        detail={selection?.action === 'approve' || selection?.action === 'edit' ? 'This sends a public reply to the customer using the immutable approval snapshot.' : 'This changes the approval state and records the operator action in the audit log.'}
        confirmLabel={capitalize(selection?.action ?? '')}
        danger={selection?.action === 'reject'}
        busy={busy}
        onCancel={() => setSelection(null)}
        onConfirm={apply}
      >
        {selection?.action === 'edit' ? (
          <label className="field">
            <span>Reply</span>
            <textarea rows={7} value={editedReply} onChange={(event) => setEditedReply(event.target.value)} />
            <span className="muted" style={{ fontSize: 10 }}>{editedReply.length} characters</span>
          </label>
        ) : null}
        {selection?.action === 'approve' ? <div className="reply-preview"><MessageSquareText size={17} /><p>{selection.approval.suggested_reply}</p></div> : null}
        {mutationError ? <p className="form-error" role="alert">{mutationError}</p> : null}
      </ConfirmDialog>
    </div>
  );
}

function capitalize(value: string) {
  return value ? value[0]!.toUpperCase() + value.slice(1) : '';
}
