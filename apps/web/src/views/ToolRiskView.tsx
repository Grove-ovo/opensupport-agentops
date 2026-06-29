import { FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import type { ToolDryRunResult, ToolManifestEntry } from '../types.js';

interface ToolRiskViewProps {
  tenantId: string;
}

const TOOL_ARGUMENT_SAMPLES: Readonly<Record<string, Record<string, unknown>>> = {
  check_refund_eligibility: { order_id: 'DRYRUN-100' },
  create_refund_request_dry_run: {
    order_id: 'DRYRUN-100',
    reason: 'Customer requested refund after delivery delay',
  },
  escalate_to_human: { reason: 'Customer requested supervisor review' },
};

const TOOL_REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  check_refund_eligibility: ['order_id'],
  create_refund_request_dry_run: ['order_id', 'reason'],
  escalate_to_human: ['reason'],
};

export function ToolRiskView({ tenantId }: ToolRiskViewProps) {
  const manifest = useResource(`tool-manifest:${tenantId}`, () => api.toolManifest(tenantId));
  const riskRules = useResource(`risk-rules:${tenantId}`, () => api.riskRules(tenantId));

  const [toolName, setToolName] = useState('');
  const [argsText, setArgsText] = useState(formatArgs(TOOL_ARGUMENT_SAMPLES.check_refund_eligibility));
  const [result, setResult] = useState<ToolDryRunResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dryRunTools = manifest.data?.filter((tool) => tool.dry_run) ?? [];
  const selectedTool = dryRunTools.find((tool) => tool.name === toolName) ?? null;
  const selectedSample = toolName ? TOOL_ARGUMENT_SAMPLES[toolName] : null;

  const selectTool = (name: string) => {
    setToolName(name);
    setResult(null);
    setMessage(null);
    const sample = TOOL_ARGUMENT_SAMPLES[name];
    if (sample) setArgsText(formatArgs(sample));
  };

  useEffect(() => {
    if (!toolName && dryRunTools[0]) {
      selectTool(dryRunTools[0].name);
    }
  }, [dryRunTools, toolName]);

  const runDryRun = async () => {
    setBusy(true); setMessage(null); setResult(null);
    try {
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(argsText);
      } catch {
        throw new Error('Arguments must be valid JSON');
      }
      if (!isObjectRecord(parsedArgs)) {
        throw new Error('Arguments must be a JSON object');
      }
      const missing = (TOOL_REQUIRED_FIELDS[toolName] ?? []).filter(
        (field) => typeof parsedArgs[field] !== 'string' || String(parsedArgs[field]).trim().length === 0,
      );
      if (missing.length > 0) {
        throw new Error(`Missing required field: ${missing.join(', ')}`);
      }
      const output = await api.runToolDryRun(tenantId, { tool_name: toolName, arguments: parsedArgs });
      setResult(output);
      setMessage(`Dry-run ${output.status} (${output.code})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'tool_dry_run_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view-stack">
      <section className="panel table-panel">
        <header className="panel-header"><div><span className="eyebrow">Tool manifest</span><h2>Tools</h2></div></header>
        {manifest.loading && !manifest.data ? <StatePanel kind="loading" title="Loading tool manifest" /> : null}
        {manifest.error ? <StatePanel kind="error" title="Tool manifest unavailable" detail={manifest.error} onRetry={manifest.reload} /> : null}
        {manifest.data && manifest.data.length === 0 ? <StatePanel kind="empty" title="No tools configured" /> : null}
        {manifest.data && manifest.data.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Tool</th><th>Risk</th><th>Dry-run</th><th>Permissions</th><th>Timeout</th><th>Description</th></tr></thead>
              <tbody>{manifest.data.map((tool) => (
                <tr key={tool.name}>
                  <td><strong>{tool.name}</strong><small>{tool.version_id}</small></td>
                  <td><StatusBadge value={tool.risk_level} /></td>
                  <td>{tool.dry_run ? 'Yes' : 'No'}</td>
                  <td><code>{tool.required_permissions.join(', ')}</code></td>
                  <td>{tool.timeout_ms} ms</td>
                  <td>{tool.description}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel table-panel">
        <header className="panel-header"><div><span className="eyebrow">Risk rules</span><h2>Guardrails</h2></div></header>
        {riskRules.loading && !riskRules.data ? <StatePanel kind="loading" title="Loading risk rules" /> : null}
        {riskRules.error ? <StatePanel kind="error" title="Risk rules unavailable" detail={riskRules.error} onRetry={riskRules.reload} /> : null}
        {riskRules.data && riskRules.data.length === 0 ? <StatePanel kind="empty" title="No risk rules configured" /> : null}
        {riskRules.data && riskRules.data.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Gate</th><th>Reason</th><th>Severity</th><th>Recommendation</th><th>Blocking</th><th>Description</th></tr></thead>
              <tbody>{riskRules.data.map((rule, index) => (
                <tr key={`${rule.gate}-${rule.reason_code}-${index}`}>
                  <td><code>{rule.gate}</code></td>
                  <td><strong>{rule.reason_code}</strong></td>
                  <td><StatusBadge value={rule.severity} /></td>
                  <td>{rule.recommendation}</td>
                  <td>{rule.blocking ? 'Yes' : 'No'}</td>
                  <td>{rule.description}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel kb-smoke">
        <header className="panel-header"><div><span className="eyebrow">Dry-run</span><h2>Tool test</h2></div></header>
        <div className="tool-test-form">
          <div className="tool-test-controls">
            <select aria-label="Tool" value={toolName} onChange={(e) => selectTool(e.target.value)}>
              <option value="">Select a dry-run tool</option>
              {dryRunTools.map((tool: ToolManifestEntry) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
            </select>
            <button
              className="button button-secondary"
              type="button"
              disabled={!selectedSample}
              onClick={() => selectedSample && setArgsText(formatArgs(selectedSample))}
            >
              Use sample
            </button>
          </div>
          {selectedTool ? (
            <p className="tool-test-hint">
              {selectedTool.description} Required: {(TOOL_REQUIRED_FIELDS[selectedTool.name] ?? []).join(', ') || 'none'}.
            </p>
          ) : null}
          <textarea
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            rows={5}
            placeholder='{"order_id":"DRYRUN-100"}'
          />
          <button className="button button-primary" type="button" disabled={busy || !toolName} onClick={runDryRun}><FlaskConical size={16} /> Run</button>
        </div>
        {message ? <div className="save-message" role="status">{message}</div> : null}
        {result ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Field</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>status</td><td><StatusBadge value={result.status} /></td></tr>
                <tr><td>code</td><td><code>{result.code}</code></td></tr>
                <tr><td>dry_run</td><td>{result.dry_run ? 'Yes' : 'No'}</td></tr>
                <tr><td>data</td><td><pre className="kb-result-data">{JSON.stringify(result.data, null, 2)}</pre></td></tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatArgs(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
