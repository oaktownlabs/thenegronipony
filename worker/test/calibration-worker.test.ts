import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, it } from 'vitest';
import type {
  BatchAckV1,
  BenchSessionCreatedV1,
  CalibrationBootstrapV1,
  DeviceFrameV1,
  TrialCreatedV1,
} from '../../shared/calibration';
import { canonicalizeSerialFrame } from '../../shared/calibration';
import { sha256 } from '../crypto';
import { withCalibrationPageHeaders } from '../http';
import worker from '../index';
import {
  FIXTURE_BOOT_ID,
  FIXTURE_DEVICE_ID,
  firmwareSensorFaultFrames,
  firmwareTrialFrames,
} from './fixtures/firmware-trial-frames';

const ORIGIN = 'http://calibration.test';
const OPERATOR_HEADERS = {
  'content-type': 'application/json',
  'x-calibration-local-token': 'worker-test-token-not-for-production',
  'x-calibration-local-actor': 'vitest',
};

const call = (path: string, init?: RequestInit): Promise<Response> =>
  exports.default.fetch(new Request(`${ORIGIN}${path}`, init));

const post = (path: string, body: unknown, extraHeaders?: HeadersInit): Promise<Response> =>
  call(path, {
    method: 'POST',
    headers: { ...OPERATOR_HEADERS, ...Object.fromEntries(new Headers(extraHeaders)) },
    body: JSON.stringify(body),
  });

describe('calibration Worker vertical slice', () => {
  it('canonicalizes the byte-bounded AVR V1 wire shapes, including idle samples', ({ expect }) => {
    const hello = canonicalizeSerialFrame({
      v: 1,
      t: 'hello',
      dev: 'pony-bench-uno-01',
      boot: '00000001',
      seq: 1,
      ms: 42,
      fw: '0.1.0-avr',
      baud: 250000,
      hz: 10,
      lastn: 0,
      scale: 0,
      cal: null,
      caln: null,
      cald: null,
      idok: 1,
      limitmg: 0,
    });
    expect(hello).toMatchObject({
      type: 'hello',
      serialBaud: 250000,
      loadCellCalibrated: false,
      loadCellCalibrationId: null,
      configuredMassLimitMg: null,
    });

    const idle = canonicalizeSerialFrame({
      v: 1,
      t: 's',
      dev: 'pony-bench-uno-01',
      boot: '00000001',
      seq: 2,
      ms: 140,
      trial: null,
      step: null,
      state: 'idle',
      pump: 'none',
      raw: -123456,
      mg: null,
      duty: 0,
      tc: 0,
      flags: 0,
    });
    expect(idle).toMatchObject({
      type: 'sample',
      trialId: null,
      stepIndex: null,
      pumpSpecimenId: null,
      rawAdc: [-123456],
      massMg: null,
      expectedSampleIntervalMs: 100,
    });

    const heartbeat = canonicalizeSerialFrame({
      v: 1,
      t: 'hb',
      dev: 'pony-bench-uno-01',
      boot: '00000001',
      seq: 3,
      ms: 500,
      state: 'idle',
      lastn: 0,
    });
    expect(heartbeat).toMatchObject({ type: 'heartbeat', expectedEventIntervalMs: 500 });

    const stopped = canonicalizeSerialFrame(
      {
        v: 1,
        t: 'state',
        dev: 'pony-bench-uno-01',
        boot: '00000001',
        seq: 4,
        ms: 600,
        state: 'idle',
        trial: null,
        step: null,
        pump: 'none',
        duty: 0,
        zero: 100000,
      },
      { trialId: 'tr_cloud_still_sealing' },
    );
    expect(stopped).toMatchObject({ type: 'state', trialId: 'tr_cloud_still_sealing' });

    const unboundTareFault = canonicalizeSerialFrame({
      v: 1,
      t: 's',
      dev: 'pony-bench-uno-01',
      boot: '00000001',
      seq: 5,
      ms: 700,
      trial: 'tr_cloud_still_sealing',
      step: null,
      state: 'fault',
      pump: 'none',
      raw: 0x7fffff,
      mg: null,
      duty: 0,
      tc: 0,
      flags: 0,
    });
    expect(unboundTareFault).toMatchObject({
      trialId: 'tr_cloud_still_sealing',
      stepIndex: null,
      pumpSpecimenId: null,
      state: 'fault',
      motorOn: false,
    });
  });

  it('keeps reads public and production-style previews read-only', async ({ expect }) => {
    const bootstrapResponse = await call('/api/v1/calibration/bootstrap?bench=bench-01');
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = (await bootstrapResponse.json()) as CalibrationBootstrapV1;
    expect(bootstrap.recipes).toHaveLength(6);
    expect(bootstrap.pumps.every((pump) => pump.acceptedCurve === null)).toBe(true);
    expect(
      bootstrap.recipes.every((recipe) =>
        recipe.specimenResults.every((result) => result.durationMs === null),
      ),
    ).toBe(true);
    const current = await call('/api/v1/calibration/current?bench=bench-01');
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({
      schema: 'tnp.calibration.current.v1',
      benchId: 'bench-01',
      activeTrialId: null,
    });

    const unauthenticated = await call('/api/v1/operator/session');
    expect(unauthenticated.status).toBe(401);

    const previewEnv = { ...env, APP_ENV: 'preview', MUTATIONS_ENABLED: 'false' } as unknown as Env;
    const previewWrite = await worker.fetch(
      new Request(`${ORIGIN}/api/v1/operator/pump-specimens`, {
        method: 'POST',
        headers: OPERATOR_HEADERS,
        body: '{}',
      }),
      previewEnv,
    );
    expect(previewWrite.status).toBe(403);
    expect((await previewWrite.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'preview_read_only' },
    });
  });

  it('nonces every calibration bootstrap script without changing other responses', async ({
    expect,
  }) => {
    const page = await call('/calibration');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('cache-control')).toBe('no-store');
    const html = await page.text();
    const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
    expect(scriptTags.length).toBeGreaterThan(0);
    const scriptNonces = scriptTags.map((tag) => tag.match(/\snonce="([^"]+)"/i)?.[1]);
    expect(scriptNonces.every(Boolean)).toBe(true);
    const uniqueScriptNonces = [...new Set(scriptNonces)];
    expect(uniqueScriptNonces).toHaveLength(1);

    const csp = page.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    if (!csp) throw new Error('calibration HTML response is missing its CSP');
    const scriptDirective = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src '));
    expect(scriptDirective).toBe(`script-src 'self' 'nonce-${uniqueScriptNonces[0]}'`);
    expect([...csp.matchAll(/'nonce-([^']+)'/g)].map((match) => match[1])).toEqual(
      uniqueScriptNonces,
    );

    const rawShell = await env.ASSETS.fetch(
      new Request(`${ORIGIN}/calibration`, { headers: { Accept: 'text/html' } }),
    );
    const shellEtag = rawShell.headers.get('etag');
    await rawShell.body?.cancel();
    if (!shellEtag) throw new Error('assets binding did not provide an HTML entity validator');
    const rawConditional = await env.ASSETS.fetch(
      new Request(`${ORIGIN}/calibration`, {
        headers: { Accept: 'text/html', 'If-None-Match': shellEtag },
      }),
    );
    expect(rawConditional.status).toBe(304);
    await rawConditional.body?.cancel();

    const conditionalPage = await call('/calibration', {
      headers: { Accept: 'text/html', 'If-None-Match': shellEtag },
    });
    expect(conditionalPage.status).toBe(200);
    const conditionalCsp = conditionalPage.headers.get('content-security-policy');
    const conditionalHtml = await conditionalPage.text();
    const conditionalScriptNonces = [
      ...conditionalHtml.matchAll(/<script\b[^>]*\snonce="([^"]+)"[^>]*>/gi),
    ].map((match) => match[1]);
    expect(conditionalScriptNonces.length).toBe(scriptTags.length);
    expect(new Set(conditionalScriptNonces).size).toBe(1);
    expect(conditionalCsp).toContain(`'nonce-${conditionalScriptNonces[0]}'`);
    expect(conditionalCsp).not.toBe(csp);

    const assetHref = html.match(/<link[^>]+href="(\/assets\/[^"]+)"/i)?.[1];
    expect(assetHref).toBeTruthy();
    if (!assetHref) throw new Error('calibration HTML is missing its static asset links');
    const asset = await call(assetHref);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-security-policy')).toBeNull();
    expect(asset.headers.get('permissions-policy')).toBeNull();

    const errorBody = '<script>error response is not rewritten</script>';
    const error = await withCalibrationPageHeaders(
      new Response(errorBody, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Original': 'preserved' },
      }),
    );
    expect(error.status).toBe(404);
    expect(error.headers.get('x-original')).toBe('preserved');
    expect(await error.text()).toBe(errorBody);
    expect(error.headers.get('content-security-policy')).toContain("script-src 'self';");

    const nonHtml = await withCalibrationPageHeaders(
      new Response('plain response', {
        status: 206,
        headers: { 'Content-Type': 'text/plain', 'X-Original': 'preserved' },
      }),
    );
    expect(nonHtml.status).toBe(206);
    expect(nonHtml.headers.get('content-type')).toBe('text/plain');
    expect(nonHtml.headers.get('x-original')).toBe('preserved');
    expect(await nonHtml.text()).toBe('plain response');
  });

  it('provisions physical evidence, ingests idempotently, and completes only durable data', async ({
    expect,
  }) => {
    const specimen = await post('/api/v1/operator/pump-specimens', {
      schema: 'tnp.calibration.pump-specimen.register.v1',
      pumpSpecimenId: 'owner-kamoer-01',
      pumpModelId: 'kamoer-kphm600-12b3b17',
      label: 'Owner Kamoer #1',
      acquiredAt: null,
      notes: null,
    });
    expect(specimen.status).toBe(201);

    const scaleRegistration = {
      schema: 'tnp.calibration.load-cell-calibration.register.v1',
      loadCellCalibrationId: 'scale-cal-2026-08-15',
      deviceId: 'pony-bench-uno-01',
      firmwareVersion: 'm2-test',
      hx711Mode: 'steady_10_sps',
      channelCount: 1,
      countsPerGramNumerator: 1000,
      countsPerGramDenominator: 1,
      referenceObservations: [
        { referenceMassMg: 0, rawAdc: 100000 },
        { referenceMassMg: 50000, rawAdc: 150000 },
        { referenceMassMg: 100000, rawAdc: 200000 },
        { referenceMassMg: 200000, rawAdc: 300000 },
      ],
      independentCheck: { referenceMassMg: 150000, rawAdc: 250000, residualMg: 0 },
      methodVersion: 'known-mass-linear-v1',
      recordedAt: '2026-08-15T12:00:00.000Z',
      notes: null,
    } as const;
    const badMiddleFit = await post('/api/v1/operator/load-cell-calibrations', {
      ...scaleRegistration,
      loadCellCalibrationId: 'scale-cal-bad-middle-fit',
      referenceObservations: [
        { referenceMassMg: 0, rawAdc: 100000 },
        { referenceMassMg: 50000, rawAdc: 160000 },
        { referenceMassMg: 100000, rawAdc: 200000 },
        { referenceMassMg: 200000, rawAdc: 300000 },
      ],
    });
    expect(badMiddleFit.status).toBe(422);
    expect((await badMiddleFit.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'calibration_coefficient_mismatch' },
    });
    const reusedHoldout = await post('/api/v1/operator/load-cell-calibrations', {
      ...scaleRegistration,
      loadCellCalibrationId: 'scale-cal-reused-holdout',
      independentCheck: { referenceMassMg: 100000, rawAdc: 200000, residualMg: 0 },
    });
    expect(reusedHoldout.status).toBe(422);
    expect((await reusedHoldout.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'independent_check_not_distinct' },
    });
    const scale = await post('/api/v1/operator/load-cell-calibrations', scaleRegistration);
    expect(scale.status).toBe(201);

    const operatorSetupResponse = await call('/api/v1/operator/setup?device=pony-bench-uno-01', {
      headers: OPERATOR_HEADERS,
    });
    expect(operatorSetupResponse.status).toBe(200);
    expect(await operatorSetupResponse.json()).toMatchObject({
      loadCellCalibrations: [
        {
          loadCellCalibrationId: 'scale-cal-2026-08-15',
          deviceId: 'pony-bench-uno-01',
          countsPerGramNumerator: 1000,
          countsPerGramDenominator: 1,
        },
      ],
    });

    const sessionResponse = await post('/api/v1/operator/benches/bench-01/sessions', {
      schema: 'tnp.calibration.bench-session.create.v1',
      deviceId: 'pony-bench-uno-01',
      bootId: '00000001',
      firmwareVersion: 'm2-test',
      protocolVersion: 'tnp.serial.v1',
      transport: 'web_serial',
    });
    expect(sessionResponse.status).toBe(201);
    const session = (await sessionResponse.json()) as BenchSessionCreatedV1;
    expect(session.benchLease.length).toBeGreaterThan(32);

    const heartbeat = await post(
      session.heartbeatUrl,
      {
        schema: 'tnp.calibration.bench-heartbeat.v1',
        frame: {
          v: 1,
          type: 'heartbeat',
          deviceId: 'pony-bench-uno-01',
          bootId: '00000001',
          seq: 1,
          deviceMs: 500,
          trialId: null,
          state: 'idle',
          expectedEventIntervalMs: 500,
          lastAcceptedCommandNumber: 0,
        },
      },
      { 'x-calibration-bench-lease': session.benchLease },
    );
    expect(heartbeat.status).toBe(200);

    const live = await call('/api/v1/benches/bench-01/live', {
      headers: { Upgrade: 'websocket' },
    });
    expect(live.status).toBe(101);
    expect(live.webSocket).not.toBeNull();
    live.webSocket?.accept();
    live.webSocket?.close(1000, 'test complete');

    const authorize = await call('/api/v1/operator/authorize?returnTo=/calibration', {
      headers: OPERATOR_HEADERS,
      redirect: 'manual',
    });
    expect(authorize.status).toBe(302);
    expect(authorize.headers.get('location')).toBe('/calibration');

    const trialRequest = {
      schema: 'tnp.calibration.create.v1',
      benchId: 'bench-01',
      benchSessionId: session.benchSessionId,
      deviceId: 'pony-bench-uno-01',
      bootId: '00000001',
      pumpSpecimenId: 'owner-kamoer-01',
      pumpModelId: 'kamoer-kphm600-12b3b17',
      transport: 'web_serial',
      firmwareVersion: 'm2-test',
      protocolVersion: 'tnp.serial.v1',
      loadCellCalibrationId: 'scale-cal-2026-08-15',
      loadCellCountsPerGramNumerator: 1000,
      loadCellCountsPerGramDenominator: 1,
      fluid: {
        name: 'water',
        densityMgPerL: 1000000,
        densitySource: 'operator measured water test',
        temperatureMilliC: 21000,
      },
      setup: {
        tubeId: 'tube-owner-01',
        inletLengthMm: 250,
        outletLengthMm: 300,
        liftMm: 100,
        nozzleHeightMm: 80,
        supplyMv: 12000,
        pwmFrequencyHz: 20000,
      },
      plan: {
        schema: 'tnp.calibration.plan.v1',
        planId: 'water-plan-v1',
        steps: [
          {
            stepIndex: 0,
            repeatIndex: 0,
            direction: 'forward',
            dutyBasisPoints: 5000,
            warmupMs: 1000,
            collectionMs: 5000,
            settleMs: 1000,
            acquisitionMode: 'steady_10_sps',
            maximumMassMg: 250000,
            hardStopMs: 8000,
          },
        ],
        maximumTrialMs: 120000,
      },
    };
    const invalidCoefficientResponse = await post(
      '/api/v1/operator/trials',
      { ...trialRequest, loadCellCountsPerGramNumerator: 0 },
      { 'x-calibration-bench-lease': session.benchLease },
    );
    expect(invalidCoefficientResponse.status).toBe(422);
    expect((await invalidCoefficientResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'invalid_calibration_coefficient' },
    });

    const missingCalibrationResponse = await post(
      '/api/v1/operator/trials',
      { ...trialRequest, loadCellCalibrationId: 'scale-cal-not-registered' },
      { 'x-calibration-bench-lease': session.benchLease },
    );
    expect(missingCalibrationResponse.status).toBe(422);
    expect((await missingCalibrationResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'load_cell_calibration_not_registered' },
    });

    for (const mismatchedPair of [
      { loadCellCountsPerGramNumerator: 1001, loadCellCountsPerGramDenominator: 1 },
      { loadCellCountsPerGramNumerator: 1000, loadCellCountsPerGramDenominator: 2 },
    ]) {
      const calibrationMismatchResponse = await post(
        '/api/v1/operator/trials',
        { ...trialRequest, ...mismatchedPair },
        { 'x-calibration-bench-lease': session.benchLease },
      );
      expect(calibrationMismatchResponse.status).toBe(409);
      expect(
        (await calibrationMismatchResponse.json()) as { error: { code: string } },
      ).toMatchObject({ error: { code: 'load_cell_calibration_mismatch' } });
    }

    const createdResponse = await post('/api/v1/operator/trials', trialRequest, {
      'x-calibration-bench-lease': session.benchLease,
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as TrialCreatedV1;
    expect(created.trial.id.length).toBeLessThanOrEqual(24);
    expect(created.producer.producerLease.length).toBeGreaterThan(32);

    const canonicalFrames = firmwareTrialFrames(created.trial.id).map((frame) =>
      canonicalizeSerialFrame(frame, {
        trialId: created.trial.id,
        pumpSpecimenIds: { k: 'owner-kamoer-01' },
      }),
    );
    const sampleBatch = {
      schema: 'tnp.calibration.batch.v1',
      batchId: 'batch-0001',
      producerSessionId: created.producer.producerSessionId,
      trialId: created.trial.id,
      deviceId: 'pony-bench-uno-01',
      bootId: '00000001',
      firstSeq: 2,
      lastSeq: 9,
      events: canonicalFrames.slice(0, -1),
    };
    const serializedBatch = JSON.stringify(sampleBatch);
    const batchHeaders = {
      ...OPERATOR_HEADERS,
      'x-calibration-producer-lease': created.producer.producerLease,
    };
    const runningFrame = canonicalFrames.find(
      (frame) => frame.type === 'sample' && frame.state === 'running',
    );
    if (!runningFrame) throw new Error('firmware fixture is missing its running sample');

    const benchCoordinatorForSemantics = env.BENCH_COORDINATOR.getByName('bench-01');
    const directSemanticCheck = async (event: DeviceFrameV1, batchId: string) => {
      const now = new Date().toISOString();
      return benchCoordinatorForSemantics.ingestBatch({
        actor: { subject: 'local:vitest', email: null, authMode: 'local' },
        leaseHash: await sha256(created.producer.producerLease),
        batch: {
          schema: 'tnp.calibration.batch.v1',
          batchId,
          producerSessionId: created.producer.producerSessionId,
          trialId: created.trial.id,
          deviceId: FIXTURE_DEVICE_ID,
          bootId: FIXTURE_BOOT_ID,
          firstSeq: event.seq,
          lastSeq: event.seq,
          events: [event],
        },
        bodyHash: await sha256(JSON.stringify(event)),
        events: [{ event, hash: await sha256(JSON.stringify(event)) }],
        receivedAt: now,
        expiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
      });
    };
    const nullBoundRunning = {
      ...runningFrame,
      stepIndex: null,
      pumpSpecimenId: null,
    };
    expect(await directSemanticCheck(nullBoundRunning, 'batch-null-running')).toMatchObject({
      ok: false,
      code: 'event_plan_mismatch',
    });
    const completeFrame = canonicalFrames.at(-1);
    if (!completeFrame || completeFrame.type !== 'state') {
      throw new Error('firmware fixture is missing its complete state');
    }
    const unboundComplete = {
      ...completeFrame,
      detail: JSON.stringify({
        stepIndex: null,
        pumpSpecimenId: null,
        dutyBasisPoints: 0,
        tareRaw: 100000,
      }),
    };
    expect(await directSemanticCheck(unboundComplete, 'batch-unbound-complete')).toMatchObject({
      ok: false,
      code: 'event_plan_mismatch',
    });

    const wrongDuty = { ...runningFrame, dutyBasisPoints: 5100 };
    const semanticMismatch = await call(created.ingest.url, {
      method: 'POST',
      headers: batchHeaders,
      body: JSON.stringify({
        schema: 'tnp.calibration.batch.v1',
        batchId: 'batch-semantic-mismatch',
        producerSessionId: created.producer.producerSessionId,
        trialId: created.trial.id,
        deviceId: FIXTURE_DEVICE_ID,
        bootId: FIXTURE_BOOT_ID,
        firstSeq: 7,
        lastSeq: 7,
        events: [wrongDuty],
      }),
    });
    expect(semanticMismatch.status).toBe(422);
    expect((await semanticMismatch.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'event_plan_mismatch' },
    });
    const firstBatchResponse = await call(created.ingest.url, {
      method: 'POST',
      headers: batchHeaders,
      body: serializedBatch,
    });
    expect(firstBatchResponse.status).toBe(200);
    const firstAck = (await firstBatchResponse.json()) as BatchAckV1;
    expect(firstAck).toMatchObject({ accepted: 8, duplicates: 0, contiguousProjectedThrough: 9 });

    const retryResponse = await call(created.ingest.url, {
      method: 'POST',
      headers: batchHeaders,
      body: serializedBatch,
    });
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toEqual(firstAck);

    const prematureComplete = await post(
      `/api/v1/operator/trials/${created.trial.id}/complete`,
      {
        schema: 'tnp.calibration.trial-transition.v1',
        finalDeviceSeq: 9,
        deviceState: 'complete',
        reason: null,
      },
      { 'x-calibration-producer-lease': created.producer.producerLease },
    );
    expect(prematureComplete.status).toBe(409);
    expect((await prematureComplete.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'terminal_pump_off_evidence_missing' },
    });

    const prematureAbort = await post(
      `/api/v1/operator/trials/${created.trial.id}/abort`,
      {
        schema: 'tnp.calibration.trial-transition.v1',
        finalDeviceSeq: 9,
        deviceState: 'settling',
        reason: 'operator requested an abort before terminal pump-off evidence arrived',
      },
      { 'x-calibration-producer-lease': created.producer.producerLease },
    );
    expect(prematureAbort.status).toBe(409);
    expect((await prematureAbort.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'terminal_pump_off_evidence_missing' },
    });

    const terminalBatch = {
      schema: 'tnp.calibration.batch.v1',
      batchId: 'batch-0002',
      producerSessionId: created.producer.producerSessionId,
      trialId: created.trial.id,
      deviceId: 'pony-bench-uno-01',
      bootId: '00000001',
      firstSeq: 10,
      lastSeq: 10,
      events: canonicalFrames.slice(-1),
    };
    const terminalResponse = await post(created.ingest.url, terminalBatch, {
      'x-calibration-producer-lease': created.producer.producerLease,
    });
    expect(terminalResponse.status).toBe(200);

    const complete = await post(
      `/api/v1/operator/trials/${created.trial.id}/complete`,
      {
        schema: 'tnp.calibration.trial-transition.v1',
        finalDeviceSeq: 10,
        deviceState: 'complete',
        reason: null,
      },
      { 'x-calibration-producer-lease': created.producer.producerLease },
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ trialId: created.trial.id, state: 'complete' });

    const eventCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM device_events WHERE trial_id = ?',
    )
      .bind(created.trial.id)
      .first<{ count: number }>();
    expect(eventCount?.count).toBe(9);
    const sampleEvidence = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN step_index IS NULL THEN 1 ELSE 0 END) AS unbound
         FROM samples WHERE trial_id = ?`,
    )
      .bind(created.trial.id)
      .first<{ total: number; unbound: number }>();
    expect(sampleEvidence).toEqual({ total: 4, unbound: 2 });

    const finalBootstrap = (await (
      await call('/api/v1/calibration/bootstrap?bench=bench-01')
    ).json()) as CalibrationBootstrapV1;
    expect(finalBootstrap.activeTrialId).toBeNull();
    expect(finalBootstrap.latestCompletedTrialId).toBe(created.trial.id);

    const abandonedTrialResponse = await post('/api/v1/operator/trials', trialRequest, {
      'x-calibration-bench-lease': session.benchLease,
    });
    expect(abandonedTrialResponse.status).toBe(201);
    const abandonedTrial = (await abandonedTrialResponse.json()) as TrialCreatedV1;
    const activeForceAbort = await post(
      `/api/v1/operator/trials/${abandonedTrial.trial.id}/force-abort`,
      {
        schema: 'tnp.calibration.trial-force-abort.v1',
        reason: 'operator cannot reach the expired browser producer',
      },
    );
    expect(activeForceAbort.status).toBe(409);
    expect((await activeForceAbort.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'producer_lease_still_active' },
    });

    const expiredAt = '2000-01-01T00:00:00.000Z';
    const coordinator = env.BENCH_COORDINATOR.getByName('bench-01');
    await runInDurableObject(coordinator, (_instance, state) => {
      state.storage.sql.exec(
        'UPDATE local_trials SET lease_expires_at = ? WHERE trial_id = ?',
        expiredAt,
        abandonedTrial.trial.id,
      );
    });
    await env.DB.prepare('UPDATE trials SET producer_lease_expires_at = ? WHERE id = ?')
      .bind(expiredAt, abandonedTrial.trial.id)
      .run();

    const expiredOrdinaryAbort = await post(
      `/api/v1/operator/trials/${abandonedTrial.trial.id}/abort`,
      {
        schema: 'tnp.calibration.trial-transition.v1',
        finalDeviceSeq: 0,
        deviceState: 'idle',
        reason: 'ordinary producer no longer owns the expired trial',
      },
      { 'x-calibration-producer-lease': abandonedTrial.producer.producerLease },
    );
    expect(expiredOrdinaryAbort.status).toBe(409);
    expect((await expiredOrdinaryAbort.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'producer_lease_expired' },
    });

    const forcedAbort = await post(
      `/api/v1/operator/trials/${abandonedTrial.trial.id}/force-abort`,
      {
        schema: 'tnp.calibration.trial-force-abort.v1',
        reason: 'operator cannot reach the expired browser producer',
      },
    );
    expect(forcedAbort.status).toBe(200);
    expect(await forcedAbort.json()).toMatchObject({
      schema: 'tnp.calibration.trial-force-aborted.v1',
      trialId: abandonedTrial.trial.id,
      state: 'aborted',
      forced: true,
      previousLeaseExpiresAt: expiredAt,
    });
    const retainedTrial = await env.DB.prepare(
      'SELECT state, private_notes FROM trials WHERE id = ?',
    )
      .bind(abandonedTrial.trial.id)
      .first<{ state: string; private_notes: string }>();
    expect(retainedTrial).toEqual({
      state: 'aborted',
      private_notes: 'operator cannot reach the expired browser producer',
    });
    const recoveryAudit = await env.DB.prepare(
      `SELECT transition_kind, evidence_status, from_state, to_state, reason,
              actor_subject, actor_auth_mode
         FROM trial_transitions WHERE trial_id = ?`,
    )
      .bind(abandonedTrial.trial.id)
      .first<Record<string, unknown>>();
    expect(recoveryAudit).toMatchObject({
      transition_kind: 'forced_abort_expired_lease',
      evidence_status: 'forced_missing',
      from_state: 'created',
      to_state: 'aborted',
      reason: 'operator cannot reach the expired browser producer',
      actor_subject: 'local:vitest',
      actor_auth_mode: 'local',
    });

    const reclaimedTrialResponse = await post('/api/v1/operator/trials', trialRequest, {
      'x-calibration-bench-lease': session.benchLease,
    });
    expect(reclaimedTrialResponse.status).toBe(201);
    const reclaimedTrial = (await reclaimedTrialResponse.json()) as TrialCreatedV1;
    const stoppedState = canonicalizeSerialFrame(
      {
        v: 1,
        t: 'state',
        dev: FIXTURE_DEVICE_ID,
        boot: FIXTURE_BOOT_ID,
        seq: 11,
        ms: 7200,
        state: 'idle',
        trial: null,
        step: null,
        pump: 'none',
        duty: 0,
        zero: 100000,
      },
      { trialId: reclaimedTrial.trial.id },
    );
    const stoppedBatch = await post(
      reclaimedTrial.ingest.url,
      {
        schema: 'tnp.calibration.batch.v1',
        batchId: 'batch-stop-reclaimed',
        producerSessionId: reclaimedTrial.producer.producerSessionId,
        trialId: reclaimedTrial.trial.id,
        deviceId: FIXTURE_DEVICE_ID,
        bootId: FIXTURE_BOOT_ID,
        firstSeq: 11,
        lastSeq: 11,
        events: [stoppedState],
      },
      { 'x-calibration-producer-lease': reclaimedTrial.producer.producerLease },
    );
    expect(stoppedBatch.status).toBe(200);
    const ordinaryAbort = await post(
      `/api/v1/operator/trials/${reclaimedTrial.trial.id}/abort`,
      {
        schema: 'tnp.calibration.trial-transition.v1',
        finalDeviceSeq: 11,
        deviceState: 'idle',
        reason: 'operator stopped before collection',
      },
      { 'x-calibration-producer-lease': reclaimedTrial.producer.producerLease },
    );
    expect(ordinaryAbort.status).toBe(200);

    const sensorFaultCases = [
      {
        kind: 'maximum_mass' as const,
        firstSeq: 12,
        firstDeviceMs: 8000,
        bound: true,
        rawAdc: 350000,
        massMg: 250000,
      },
      {
        kind: 'mass_unavailable' as const,
        firstSeq: 16,
        firstDeviceMs: 9000,
        bound: true,
        rawAdc: 150000,
        massMg: null,
      },
      {
        kind: 'hx711_saturation' as const,
        firstSeq: 20,
        firstDeviceMs: 10000,
        bound: false,
        rawAdc: 0x7fffff,
        massMg: null,
      },
    ];
    for (const faultCase of sensorFaultCases) {
      const faultTrialResponse = await post('/api/v1/operator/trials', trialRequest, {
        'x-calibration-bench-lease': session.benchLease,
      });
      expect(faultTrialResponse.status).toBe(201);
      const faultTrial = (await faultTrialResponse.json()) as TrialCreatedV1;
      const faultFrames = firmwareSensorFaultFrames(
        faultTrial.trial.id,
        faultCase.kind,
        faultCase.firstSeq,
        faultCase.firstDeviceMs,
      ).map((frame) =>
        canonicalizeSerialFrame(frame, {
          trialId: faultTrial.trial.id,
          pumpSpecimenIds: { k: 'owner-kamoer-01' },
        }),
      );
      const faultSample = faultFrames[1];
      if (!faultSample || faultSample.type !== 'sample') {
        throw new Error(`${faultCase.kind} fixture is missing its triggering sample`);
      }
      expect(faultSample).toMatchObject({
        type: 'sample',
        state: 'fault',
        stepIndex: faultCase.bound ? 0 : null,
        pumpSpecimenId: faultCase.bound ? 'owner-kamoer-01' : null,
        dutyBasisPoints: faultCase.bound ? 5000 : 0,
        dutyTimerCount: 0,
        motorOn: false,
        rawAdc: [faultCase.rawAdc],
        massMg: faultCase.massMg,
      });

      if (faultCase.bound) {
        for (const [suffix, changedFault] of [
          ['duty', { ...faultSample, dutyBasisPoints: 5100 }],
          ['specimen', { ...faultSample, pumpSpecimenId: 'wrong-owner-specimen' }],
        ] as const) {
          const semanticFault = await post(
            faultTrial.ingest.url,
            {
              schema: 'tnp.calibration.batch.v1',
              batchId: `batch-${faultCase.kind}-wrong-${suffix}`,
              producerSessionId: faultTrial.producer.producerSessionId,
              trialId: faultTrial.trial.id,
              deviceId: FIXTURE_DEVICE_ID,
              bootId: FIXTURE_BOOT_ID,
              firstSeq: changedFault.seq,
              lastSeq: changedFault.seq,
              events: [changedFault],
            },
            { 'x-calibration-producer-lease': faultTrial.producer.producerLease },
          );
          expect(semanticFault.status).toBe(422);
          expect((await semanticFault.json()) as { error: { code: string } }).toMatchObject({
            error: { code: 'event_plan_mismatch' },
          });
        }
      }

      const faultBatch = await post(
        faultTrial.ingest.url,
        {
          schema: 'tnp.calibration.batch.v1',
          batchId: `batch-${faultCase.kind}`,
          producerSessionId: faultTrial.producer.producerSessionId,
          trialId: faultTrial.trial.id,
          deviceId: FIXTURE_DEVICE_ID,
          bootId: FIXTURE_BOOT_ID,
          firstSeq: faultCase.firstSeq,
          lastSeq: faultCase.firstSeq + 3,
          events: faultFrames,
        },
        { 'x-calibration-producer-lease': faultTrial.producer.producerLease },
      );
      expect(faultBatch.status).toBe(200);

      const faultAbort = await post(
        `/api/v1/operator/trials/${faultTrial.trial.id}/abort`,
        {
          schema: 'tnp.calibration.trial-transition.v1',
          finalDeviceSeq: faultCase.firstSeq + 3,
          deviceState: 'fault',
          reason: `firmware fail-off: ${faultCase.kind}`,
        },
        { 'x-calibration-producer-lease': faultTrial.producer.producerLease },
      );
      expect(faultAbort.status).toBe(200);
      expect(await faultAbort.json()).toMatchObject({
        trialId: faultTrial.trial.id,
        state: 'aborted',
        finalDeviceSeq: faultCase.firstSeq + 3,
      });

      const durableFault = await env.DB.prepare(
        `SELECT s.step_index, s.duty_basis_points, s.duty_timer_count, s.motor_on,
                e.event_json,
                tt.evidence_status
           FROM samples s
           JOIN device_events e
             ON e.device_id = s.device_id AND e.boot_id = s.boot_id
            AND e.device_seq = ?
           JOIN trial_transitions tt ON tt.trial_id = s.trial_id
          WHERE s.trial_id = ? AND s.device_seq = ?`,
      )
        .bind(faultCase.firstSeq + 3, faultTrial.trial.id, faultCase.firstSeq + 1)
        .first<{
          step_index: number | null;
          duty_basis_points: number;
          duty_timer_count: number;
          motor_on: number;
          event_json: string;
          evidence_status: string;
        }>();
      expect(durableFault).not.toBeNull();
      expect(durableFault).toMatchObject({
        step_index: faultCase.bound ? 0 : null,
        duty_basis_points: faultCase.bound ? 5000 : 0,
        duty_timer_count: 0,
        motor_on: 0,
        evidence_status: 'terminal_verified',
      });
      expect(JSON.parse(durableFault?.event_json ?? '{}')).toMatchObject({
        type: 'fault',
        code: faultCase.kind,
        trialId: faultTrial.trial.id,
      });
    }
  });
});
