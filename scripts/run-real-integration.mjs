#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  buildRealIntegrationPlan,
  buildRealIntegrationTeardownStep,
  runCommandPlan,
} from './real-integration-lib.mjs';

let result;
let shouldDown = false;
let shouldDropVolumes = false;

try {
  const cli = parseArgs(process.argv.slice(2));
  shouldDown = cli.down || process.env.REAL_INTEGRATION_DOWN === '1' || false;
  shouldDropVolumes =
    cli.downVolumes ||
    process.env.REAL_INTEGRATION_DOWN_VOLUMES === '1' ||
    false;
  result = runCommandPlan(
    buildRealIntegrationPlan({
      env: process.env,
      skipComposeUp: cli.skipComposeUp,
    }),
    { runner: spawnSync },
  );
} catch (error) {
  process.stderr.write(`real_integration_failed:${stableErrorCode(error)}\n`);
  process.exitCode = 1;
}

if (shouldDown) {
  const teardown = runCommandPlan(
    [buildRealIntegrationTeardownStep({ volumes: shouldDropVolumes })],
    { runner: spawnSync },
  );
  if (teardown.status === 'passed' && result?.status === 'passed') {
    result = {
      ...result,
      stepsRun: [...result.stepsRun, ...teardown.stepsRun],
      stepResults: [...result.stepResults, ...teardown.stepResults],
    };
  }
  if (teardown.status !== 'passed' && (!result || result.status === 'passed')) {
    result = teardown;
  }
}

if (result) {
  if (result.status === 'passed') {
    process.stdout.write(
      `${JSON.stringify({
        status: 'passed',
        steps: result.stepsRun,
        step_results: result.stepResults,
        services_left_running: !shouldDown,
      })}\n`,
    );
  } else {
    process.stderr.write(`real_integration_failed:${result.failedStep}\n`);
    process.exitCode = result.exitCode || 1;
  }
}

function parseArgs(args) {
  const parsed = {
    down: false,
    downVolumes: false,
    skipComposeUp: false,
  };
  for (const arg of args) {
    switch (arg) {
      case '--down':
        parsed.down = true;
        break;
      case '--down-volumes':
        parsed.down = true;
        parsed.downVolumes = true;
        break;
      case '--skip-compose-up':
        parsed.skipComposeUp = true;
        break;
      default:
        throw new Error(`unknown_argument:${arg}`);
    }
  }
  return parsed;
}

function stableErrorCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.startsWith('unknown_argument:')) return 'unknown_cli_argument';
  if (message.startsWith('invalid_')) return message;
  return 'unexpected_error';
}
