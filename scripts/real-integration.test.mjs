import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  buildRealIntegrationEnvironment,
  buildRealIntegrationPlan,
  buildRealIntegrationTeardownStep,
  runCommandPlan,
} from './real-integration-lib.mjs';

test('builds password-bearing local integration environment', () => {
  const env = buildRealIntegrationEnvironment({});

  assert.equal(
    env.DATABASE_URL,
    'postgresql://agentops:agentops@127.0.0.1:55432/agentops',
  );
  assert.equal(env.REDIS_URL, 'redis://:agentops@127.0.0.1:56379/0');
  assert.equal(env.AGENTOPS_RUN_INTEGRATION, '1');
  assert.equal(env.AGENTOPS_REDIS_PASSWORD, 'agentops');
});

test('builds custom integration URLs from compose environment keys', () => {
  const env = buildRealIntegrationEnvironment({
    AGENTOPS_POSTGRES_USER: 'agent',
    AGENTOPS_POSTGRES_PASSWORD: 'p@ss word',
    AGENTOPS_POSTGRES_DB: 'ops-db',
    AGENTOPS_POSTGRES_PORT: '55432',
    AGENTOPS_REDIS_PASSWORD: 'redis p@ss',
    AGENTOPS_REDIS_PORT: '56379',
  });

  assert.equal(
    env.DATABASE_URL,
    'postgresql://agent:p%40ss%20word@127.0.0.1:55432/ops-db',
  );
  assert.equal(env.REDIS_URL, 'redis://:redis%20p%40ss@127.0.0.1:56379/0');
});

test('matches compose default semantics for empty environment values', () => {
  const env = buildRealIntegrationEnvironment({
    AGENTOPS_POSTGRES_USER: '',
    AGENTOPS_POSTGRES_PASSWORD: '',
    AGENTOPS_POSTGRES_DB: '',
    AGENTOPS_POSTGRES_PORT: '',
    AGENTOPS_REDIS_PASSWORD: '',
    AGENTOPS_REDIS_PORT: '',
  });

  assert.equal(
    env.DATABASE_URL,
    'postgresql://agentops:agentops@127.0.0.1:55432/agentops',
  );
  assert.equal(env.REDIS_URL, 'redis://:agentops@127.0.0.1:56379/0');
});

test('builds real integration command plan in dependency order', () => {
  const plan = buildRealIntegrationPlan({
    env: {},
    npmCommand: 'npm',
  });

  assert.deepEqual(plan.map((step) => step.id), [
    'compose_config',
    'compose_up',
    'migrate',
    'api_integration',
    'api_e2e',
    'worker_integration',
  ]);
  assert.deepEqual(plan[1].args, [
    'compose',
    '-f',
    'infra/docker/compose.phase1.yml',
    'up',
    '-d',
    '--wait',
  ]);
  assert.equal(plan[3].env.REDIS_URL, 'redis://:agentops@127.0.0.1:56379/0');
  assert.equal(plan[3].assertNoSkippedTests, true);
  assert.equal(plan[4].assertNoSkippedTests, true);
  assert.equal(plan[5].assertNoSkippedTests, true);
});

test('supports skipping compose startup when services are already managed', () => {
  const plan = buildRealIntegrationPlan({
    env: {},
    skipComposeUp: true,
    npmCommand: 'npm',
  });

  assert.deepEqual(plan.map((step) => step.id), [
    'compose_config',
    'migrate',
    'api_integration',
    'api_e2e',
    'worker_integration',
  ]);
});

test('stops command plan on the first failed step', () => {
  const calls = [];
  const result = runCommandPlan(
    [
      { id: 'first', command: 'ok', args: [] },
      { id: 'second', command: 'fail', args: [] },
      { id: 'third', command: 'skip', args: [] },
    ],
    {
      stdio: 'pipe',
      runner(command) {
        calls.push(command);
        return { status: command === 'fail' ? 7 : 0 };
      },
    },
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'second');
  assert.equal(result.exitCode, 7);
  assert.deepEqual(calls, ['ok', 'fail']);
  assert.deepEqual(result.stepsRun, ['first']);
  assert.deepEqual(
    result.stepResults.map((step) => step.status),
    ['passed', 'failed'],
  );
  assert.equal(result.stepResults[1]?.id, 'second');
});

test('fails closed when an integration step reports skipped tests', () => {
  const result = runCommandPlan(
    [
      {
        id: 'api_integration',
        command: 'test',
        args: [],
        assertNoSkippedTests: true,
      },
    ],
    {
      relayOutput: false,
      stdio: 'pipe',
      runner() {
        return {
          status: 0,
          stdout: '# tests 3\n# pass 2\n# skipped 1\n',
          stderr: '',
        };
      },
    },
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'api_integration');
  assert.equal(result.detail, 'skipped_tests:1');
  assert.equal(result.stepResults[0]?.skipped_tests, 1);
});

test('fails closed when an integration step lacks a skipped summary', () => {
  const result = runCommandPlan(
    [
      {
        id: 'worker_integration',
        command: 'test',
        args: [],
        assertNoSkippedTests: true,
      },
    ],
    {
      relayOutput: false,
      stdio: 'pipe',
      runner() {
        return { status: 0, stdout: 'not tap\n', stderr: '' };
      },
    },
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'worker_integration');
  assert.equal(result.detail, 'skipped_summary_missing');
});

test('accepts integration steps with a zero skipped TAP summary', () => {
  const result = runCommandPlan(
    [
      {
        id: 'api_e2e',
        command: 'test',
        args: [],
        assertNoSkippedTests: true,
      },
    ],
    {
      relayOutput: false,
      stdio: 'pipe',
      runner() {
        return {
          status: 0,
          stdout: '# tests 2\n# pass 2\n# skipped 0\n',
          stderr: '',
        };
      },
    },
  );

  assert.equal(result.status, 'passed');
  assert.deepEqual(result.stepsRun, ['api_e2e']);
  assert.deepEqual(result.stepResults.map((step) => step.id), ['api_e2e']);
  assert.equal(result.stepResults[0]?.status, 'passed');
  assert.equal(result.stepResults[0]?.skipped_tests, 0);
  assert.equal(typeof result.stepResults[0]?.duration_ms, 'number');
});

test('builds teardown command without dropping volumes by default', () => {
  assert.deepEqual(buildRealIntegrationTeardownStep().args, [
    'compose',
    '-f',
    'infra/docker/compose.phase1.yml',
    'down',
  ]);
  assert.deepEqual(buildRealIntegrationTeardownStep({ volumes: true }).args, [
    'compose',
    '-f',
    'infra/docker/compose.phase1.yml',
    'down',
    '-v',
  ]);
});

test('prints a stable error code for unknown CLI flags', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./run-real-integration.mjs', import.meta.url)),
      '--unknown-flag',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /real_integration_failed:unknown_cli_argument/u);
});
