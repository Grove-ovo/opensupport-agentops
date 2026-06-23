#!/usr/bin/env node
/**
 * Phase 7F pre-deployment aggregate gate. Validates that all Phase 7
 * children (7A-7E) are archived completed, CI/supply-chain/preflight/drill
 * evidence exists, migration floor is met, production docs are present, and
 * residual risks are documented. Produces JSON + Markdown readiness reports.
 *
 * Usage: node scripts/validate-phase7.mjs [--json <path>] [--markdown <path>]
 */
import { resolve } from 'node:path';
import { runAggregateGate, writeAggregateReports } from './aggregate-gate-lib.mjs';

const args = process.argv.slice(2);
const jsonArg = args[args.indexOf('--json') + 1];
const markdownArg = args[args.indexOf('--markdown') + 1];

const report = runAggregateGate({ repoRoot: process.cwd() });
const { jsonPath, markdownPath } = writeAggregateReports(report, {
  jsonPath: jsonArg ? resolve(jsonArg) : undefined,
  markdownPath: markdownArg ? resolve(markdownArg) : undefined,
});

process.stdout.write(
  `${JSON.stringify({
    status: report.status,
    summary: report.summary,
    report_path: jsonPath,
  })}\n`,
);

if (report.status === 'blocked') {
  process.exit(1);
}
