import {
  runDeployPreflight,
  writeDeployReadinessReports,
} from './deploy-preflight-lib.mjs';

const options = parseArguments(process.argv.slice(2));
const report = runDeployPreflight(options);
const paths = writeDeployReadinessReports(report, {
  jsonPath: options.jsonPath,
  markdownPath: options.markdownPath,
});

process.stdout.write(
  `${JSON.stringify({
    status: report.status,
    summary: report.summary,
    json_report: paths.jsonPath,
    markdown_report: paths.markdownPath,
  })}\n`,
);
if (report.status !== 'ready') {
  process.exitCode = 1;
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if (value === '--env-file' && next) {
      options.envFile = next;
      index += 1;
    } else if (value === '--compose-file' && next) {
      options.composeFile = next;
      index += 1;
    } else if (value === '--json' && next) {
      options.jsonPath = next;
      index += 1;
    } else if (value === '--markdown' && next) {
      options.markdownPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }
  return options;
}
