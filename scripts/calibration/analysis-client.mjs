#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args.shift();

function values(name) {
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}` && args[index + 1]) found.push(args[index + 1]);
  }
  return found;
}

function value(name) {
  return values(name).at(-1) ?? null;
}

function required(name) {
  const result = value(name);
  if (!result) throw new Error(`Missing --${name}`);
  return result;
}

function usage() {
  return `Usage:
  node scripts/calibration/analysis-client.mjs draft --trial TRIAL [--trial TRIAL]
  node scripts/calibration/analysis-client.mjs get --curve CURVE
  node scripts/calibration/analysis-client.mjs review --curve CURVE --decision accept|reject --evidence HASH --reason TEXT
  node scripts/calibration/analysis-client.mjs publish --curve CURVE --evidence HASH --reason TEXT

Environment:
  CALIBRATION_API_BASE       Origin, for example https://example.com
  CALIBRATION_LOCAL_TOKEN    Local-only Worker operator token
  CALIBRATION_ACTOR          Optional local audit label
  CF_ACCESS_CLIENT_ID        Cloudflare Access service-token client ID
  CF_ACCESS_CLIENT_SECRET    Cloudflare Access service-token secret`;
}

function operatorHeaders(hasBody) {
  const headers = new Headers();
  if (hasBody) headers.set('content-type', 'application/json');
  const localToken = process.env.CALIBRATION_LOCAL_TOKEN;
  const accessId = process.env.CF_ACCESS_CLIENT_ID;
  const accessSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (localToken) {
    headers.set('x-calibration-local-token', localToken);
    headers.set('x-calibration-local-actor', process.env.CALIBRATION_ACTOR ?? 'analysis-cli');
  } else if (accessId && accessSecret) {
    headers.set('cf-access-client-id', accessId);
    headers.set('cf-access-client-secret', accessSecret);
  } else {
    throw new Error(
      'Set CALIBRATION_LOCAL_TOKEN or both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET',
    );
  }
  return headers;
}

async function main() {
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const base = new URL(process.env.CALIBRATION_API_BASE ?? 'http://127.0.0.1:8787');
  let path;
  let method = 'GET';
  let body;
  if (command === 'draft') {
    const sourceTrialIds = values('trial');
    if (sourceTrialIds.length === 0) throw new Error('Provide at least one --trial');
    path = '/api/v1/operator/calibration-curves/drafts';
    method = 'POST';
    body = {
      schema: 'tnp.calibration.curve-draft.create.v1',
      sourceTrialIds,
    };
  } else if (command === 'get') {
    path = `/api/v1/operator/calibration-curves/${encodeURIComponent(required('curve'))}`;
  } else if (command === 'review') {
    path = `/api/v1/operator/calibration-curves/${encodeURIComponent(required('curve'))}/review`;
    method = 'POST';
    body = {
      schema: 'tnp.calibration.curve-review.v1',
      decision: required('decision'),
      expectedEvidenceHash: required('evidence'),
      reason: required('reason'),
    };
  } else if (command === 'publish') {
    path = `/api/v1/operator/calibration-curves/${encodeURIComponent(required('curve'))}/publish`;
    method = 'POST';
    body = {
      schema: 'tnp.calibration.curve-publish.v1',
      expectedEvidenceHash: required('evidence'),
      reason: required('reason'),
    };
  } else {
    throw new Error(`Unknown command ${command}`);
  }
  const response = await fetch(new URL(path, base), {
    method,
    headers: operatorHeaders(body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { response: text };
  }
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
  process.exitCode = 1;
});
