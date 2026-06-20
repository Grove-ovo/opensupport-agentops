import type {
  RAGBaselineCase,
  RAGBaselineMetrics,
} from '@opensupport/shared';

export function evaluateRAGBaseline(
  cases: readonly RAGBaselineCase[],
): RAGBaselineMetrics {
  let expectedEvidenceCount = 0;
  let recalledEvidenceCount = 0;
  let hitCases = 0;

  for (const item of cases) {
    const topFive = new Set(item.returned_evidence_ids.slice(0, 5));
    const expected = new Set(item.expected_evidence_ids);
    expectedEvidenceCount += expected.size;
    let caseHit = false;
    for (const evidenceId of expected) {
      if (topFive.has(evidenceId)) {
        recalledEvidenceCount += 1;
        caseHit = true;
      }
    }
    if (caseHit) {
      hitCases += 1;
    }
  }

  return {
    case_count: cases.length,
    expected_evidence_count: expectedEvidenceCount,
    recall_at_5:
      expectedEvidenceCount === 0
        ? 0
        : recalledEvidenceCount / expectedEvidenceCount,
    evidence_hit_rate: cases.length === 0 ? 0 : hitCases / cases.length,
  };
}
