#!/usr/bin/env node

import {
  parseProviderLoadOptions,
  ProviderLoadError,
  runProviderLoad,
} from './provider-load-lib.mjs';

try {
  const options = parseProviderLoadOptions(process.argv.slice(2));
  const { report } = await runProviderLoad(options);
  process.stdout.write(
    `${JSON.stringify({
      status: report.status,
      stop_reason: report.stop_reason,
      total_requests: report.metrics.total_requests,
      success_count: report.metrics.success_count,
      error_count: report.metrics.error_count,
    })}\n`,
  );
  if (report.status !== 'ready') process.exitCode = 1;
} catch (error) {
  const code =
    error instanceof ProviderLoadError ? error.code : 'unexpected_failure';
  process.stderr.write(`provider_load_failed:${code}\n`);
  process.exitCode = 2;
}
