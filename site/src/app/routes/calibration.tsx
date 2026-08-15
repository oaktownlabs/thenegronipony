import type { CreateTrialV1, DeviceFrameV1, PumpModelId } from '@shared/calibration';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { calibrationAttestationMatches } from '../calibration/calibration-attestation';
import { FlowChart } from '../calibration/FlowChart';
import { formatAge } from '../calibration/health';
import { LiveInstrument } from '../calibration/LiveInstrument';
import { PumpCard } from '../calibration/PumpCard';
import { RecipeCard } from '../calibration/RecipeCard';
import { useCalibrationData } from '../calibration/useCalibrationData';
import { useCloudBridge } from '../calibration/useCloudBridge';
import { useSerialBench } from '../calibration/useSerialBench';
import { waterDensityMgPerL } from '../calibration/water';
import type { Route } from './+types/calibration';
import './calibration.css';

export const meta: Route.MetaFunction = () => [
  { title: 'Pump Calibration Bureau | The Negroni Pony' },
  {
    name: 'description',
    content: 'Live, measured calibration of The Negroni Pony peristaltic pump specimens.',
  },
];

const BENCH_ID = 'bench-01';

const finiteField = (value: string) => {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null;
};

export default function Calibration() {
  const [searchParams] = useSearchParams();
  const simulationEnabled = searchParams.get('simulate') === '1';
  const { bootstrap, apiState, health, latestSample, recentSamples, acceptLocalSample } =
    useCalibrationData(simulationEnabled);
  const [selectedPump, setSelectedPump] = useState<'k' | 'g'>('k');
  const [dutyPercent, setDutyPercent] = useState(50);
  const [collectionSeconds, setCollectionSeconds] = useState(5);
  const [specimenIds, setSpecimenIds] = useState({ k: '', g: '' });
  const [loadCellCalibrationId, setLoadCellCalibrationId] = useState('');
  const [waterTemperatureC, setWaterTemperatureC] = useState('');
  const [supplyVoltageV, setSupplyVoltageV] = useState('');
  const [tubeId, setTubeId] = useState('');
  const [inletLengthMm, setInletLengthMm] = useState('');
  const [outletLengthMm, setOutletLengthMm] = useState('');
  const [liftMm, setLiftMm] = useState('');
  const [nozzleHeightMm, setNozzleHeightMm] = useState('');
  const [operatorTrialId, setOperatorTrialId] = useState<string | null>(null);
  const [localTokenEntry, setLocalTokenEntry] = useState('');
  const [controlMessage, setControlMessage] = useState('Connect the bench to begin.');
  const [busy, setBusy] = useState(false);
  const [abortRequested, setAbortRequested] = useState(false);
  const bridgeFrameRef = useRef<((frame: DeviceFrameV1) => void) | null>(null);
  const relayFrame = useCallback((frame: DeviceFrameV1) => bridgeFrameRef.current?.(frame), []);
  const canonicalSerialContext = useMemo(
    () => ({
      trialId: operatorTrialId,
      pumpSpecimenIds: {
        ...(specimenIds.k ? { k: specimenIds.k } : {}),
        ...(specimenIds.g ? { g: specimenIds.g } : {}),
      },
    }),
    [operatorTrialId, specimenIds.g, specimenIds.k],
  );

  const serial = useSerialBench({
    canonicalContext: canonicalSerialContext,
    onFrame: relayFrame,
    onSample: acceptLocalSample,
  });
  const cloud = useCloudBridge(serial.identity);
  const recoveryTrialId = cloud.trialSession
    ? null
    : (cloud.recoverableTrialSession?.trial.trial.id ?? bootstrap.activeTrialId);

  useEffect(() => {
    bridgeFrameRef.current = (frame) => void cloud.acceptFrame(frame);
  }, [cloud.acceptFrame]);

  useEffect(() => {
    if (!cloud.trialSession) return;
    setOperatorTrialId(cloud.trialSession.trial.trial.id);
    serial.setTrialContext(cloud.trialSession.trial.trial.id);
    const pumpCode =
      cloud.trialSession.request.pumpModelId === 'kamoer-kphm600-12b3b17' ? 'k' : 'g';
    setSelectedPump(pumpCode);
    setSpecimenIds((current) => ({
      ...current,
      [pumpCode]: cloud.trialSession?.request.pumpSpecimenId ?? current[pumpCode],
    }));
    setLoadCellCalibrationId(cloud.trialSession.request.loadCellCalibrationId);
  }, [cloud.trialSession, serial.setTrialContext]);

  useEffect(() => {
    if (serial.identity?.loadCellCalibrationId) {
      setLoadCellCalibrationId(serial.identity.loadCellCalibrationId);
    }
  }, [serial.identity?.loadCellCalibrationId]);

  useEffect(() => {
    if (!recoveryTrialId) return;
    setControlMessage(
      `Cloud reports active trial ${recoveryTrialId} without a usable local producer session. After its lease expires, an operator can force-abort it without discarding evidence.`,
    );
  }, [recoveryTrialId]);

  useEffect(() => {
    if (!cloud.operatorSetup) return;
    setSpecimenIds((current) => {
      const next = { ...current };
      for (const pumpCode of ['k', 'g'] as const) {
        if (next[pumpCode]) continue;
        const modelId = pumpCode === 'k' ? 'kamoer-kphm600-12b3b17' : 'gikfun-ae1207';
        const matches =
          cloud.operatorSetup?.pumpSpecimens.filter((item) => item.pumpModelId === modelId) ?? [];
        if (matches.length === 1) next[pumpCode] = matches[0].pumpSpecimenId;
      }
      return next;
    });
  }, [cloud.operatorSetup]);

  useEffect(() => {
    document.body.classList.add('calibration-body');
    return () => document.body.classList.remove('calibration-body');
  }, []);

  const chosenPump = useMemo(
    () => bootstrap.pumps[selectedPump === 'k' ? 0 : 1],
    [bootstrap.pumps, selectedPump],
  );
  const specimenRegistered = Boolean(
    specimenIds[selectedPump] &&
      cloud.operatorSetup?.pumpSpecimens.some(
        (item) =>
          item.pumpSpecimenId === specimenIds[selectedPump] &&
          item.pumpModelId === chosenPump.pumpModelId,
      ),
  );
  const calibrationRegistered = calibrationAttestationMatches(
    serial.identity
      ? {
          deviceId: serial.identity.deviceId,
          loadCellCalibrationId: serial.identity.loadCellCalibrationId,
          countsPerGramNumerator: serial.identity.countsPerGramNumerator,
          countsPerGramDenominator: serial.identity.countsPerGramDenominator,
        }
      : null,
    loadCellCalibrationId,
    cloud.operatorSetup?.loadCellCalibrations ?? [],
  );
  const measuredSetup = useMemo(() => {
    const temperatureC = finiteField(waterTemperatureC);
    const supplyV = finiteField(supplyVoltageV);
    const inletMm = finiteField(inletLengthMm);
    const outletMm = finiteField(outletLengthMm);
    const measuredLiftMm = finiteField(liftMm);
    const measuredNozzleHeightMm = finiteField(nozzleHeightMm);
    if (
      temperatureC === null ||
      temperatureC < 0 ||
      temperatureC > 40 ||
      supplyV === null ||
      supplyV <= 0 ||
      supplyV > 30 ||
      inletMm === null ||
      inletMm < 0 ||
      outletMm === null ||
      outletMm < 0 ||
      measuredLiftMm === null ||
      measuredNozzleHeightMm === null ||
      measuredNozzleHeightMm < 0 ||
      !tubeId.trim()
    )
      return null;
    return {
      temperatureC,
      supplyV,
      inletMm,
      outletMm,
      liftMm: measuredLiftMm,
      nozzleHeightMm: measuredNozzleHeightMm,
      tubeId: tubeId.trim(),
    };
  }, [
    inletLengthMm,
    liftMm,
    nozzleHeightMm,
    outletLengthMm,
    supplyVoltageV,
    tubeId,
    waterTemperatureC,
  ]);

  const prepareTrial = useCallback(async () => {
    if (!serial.identity || !cloud.benchSession) return;
    setBusy(true);
    try {
      if (!serial.identity.loadCellCalibrated) {
        throw new Error(
          'The firmware reports no accepted load-cell calibration. Run the known-mass procedure first.',
        );
      }
      if (!serial.identity.deviceIdentityProvisioned) {
        throw new Error(
          'The firmware device identity is still the unprovisioned commissioning value.',
        );
      }
      if (!serial.identity.configuredMassLimitMg) {
        throw new Error(
          'The firmware has no physically qualified vessel mass cutoff. Commission that limit first.',
        );
      }
      if (!measuredSetup) {
        throw new Error(
          'Record the measured water temperature, supply voltage, tube, and rig geometry first.',
        );
      }
      if (serial.identity.loadCellCalibrationId !== loadCellCalibrationId.trim()) {
        throw new Error(
          'The entered calibration ID does not match the calibration compiled into this firmware.',
        );
      }
      if (
        serial.identity.countsPerGramNumerator === null ||
        serial.identity.countsPerGramDenominator === null
      ) {
        throw new Error(
          'The firmware did not report its commissioned counts-to-mass coefficients.',
        );
      }
      const pumpModelId: PumpModelId =
        selectedPump === 'k' ? 'kamoer-kphm600-12b3b17' : 'gikfun-ae1207';
      const pumpSpecimenId = specimenIds[selectedPump].trim();
      if (!pumpSpecimenId || !loadCellCalibrationId.trim()) {
        throw new Error(
          'Select registered specimen and load-cell calibration IDs before starting.',
        );
      }
      const collectionMs = Math.round(collectionSeconds * 1_000);
      const dutyBasisPoints = Math.round(dutyPercent * 100);
      const maximumMassMg = serial.identity.configuredMassLimitMg;
      const request: CreateTrialV1 = {
        schema: 'tnp.calibration.create.v1',
        benchId: BENCH_ID,
        benchSessionId: cloud.benchSession.benchSessionId,
        deviceId: serial.identity.deviceId,
        bootId: serial.identity.bootId,
        pumpSpecimenId,
        pumpModelId,
        transport: 'web_serial',
        firmwareVersion: serial.identity.firmwareVersion,
        protocolVersion: 'tnp.serial.v1',
        loadCellCalibrationId: loadCellCalibrationId.trim(),
        loadCellCountsPerGramNumerator: serial.identity.countsPerGramNumerator,
        loadCellCountsPerGramDenominator: serial.identity.countsPerGramDenominator,
        fluid: {
          name: 'water',
          densityMgPerL: waterDensityMgPerL(measuredSetup.temperatureC),
          densitySource:
            'UNESCO 1981 pure-water density equation from operator-recorded temperature',
          temperatureMilliC: Math.round(measuredSetup.temperatureC * 1_000),
        },
        setup: {
          tubeId: measuredSetup.tubeId,
          inletLengthMm: Math.round(measuredSetup.inletMm),
          outletLengthMm: Math.round(measuredSetup.outletMm),
          liftMm: Math.round(measuredSetup.liftMm),
          nozzleHeightMm: Math.round(measuredSetup.nozzleHeightMm),
          supplyMv: Math.round(measuredSetup.supplyV * 1_000),
          pwmFrequencyHz: 20_000,
        },
        plan: {
          schema: 'tnp.calibration.plan.v1',
          planId: crypto.randomUUID(),
          steps: [
            {
              stepIndex: 0,
              repeatIndex: 0,
              direction: 'forward',
              dutyBasisPoints,
              warmupMs: 1_000,
              collectionMs,
              settleMs: 1_500,
              acquisitionMode: 'steady_10_sps',
              maximumMassMg,
              hardStopMs: collectionMs + 4_000,
            },
          ],
          maximumTrialMs: collectionMs + 15_000,
        },
      };
      const created = await cloud.startTrial(request);
      const trial = created.trial.id;
      setOperatorTrialId(trial);
      serial.setTrialContext(trial);
      await serial.send('tare', {
        trial,
        stable: 1_000,
        wait: 10_000,
      });
      setControlMessage(`Trial ${trial} created. Tare is running; wait for device state ARMED.`);
    } catch (error) {
      setControlMessage(
        error instanceof Error ? error.message : 'The trial could not be prepared.',
      );
    } finally {
      setBusy(false);
    }
  }, [
    cloud,
    collectionSeconds,
    dutyPercent,
    loadCellCalibrationId,
    measuredSetup,
    selectedPump,
    serial,
    specimenIds,
  ]);

  const runCommand = useCallback(async () => {
    const retained = cloud.trialSession;
    if (!serial.identity || !retained) return;
    setBusy(true);
    try {
      const planned = retained.request.plan.steps[0];
      if (!planned) throw new Error('The retained trial has no planned step.');
      if (serial.benchState !== 'armed') {
        throw new Error(
          'The device is not ARMED. Wait for a stable tare before starting the pump.',
        );
      }
      const pump = retained.request.pumpModelId === 'kamoer-kphm600-12b3b17' ? 'k' : 'g';
      const trial = retained.trial.trial.id;
      await serial.send('run', {
        trial,
        step: planned.stepIndex,
        pump,
        dir: 'f',
        duty: planned.dutyBasisPoints,
        warm: planned.warmupMs,
        collect: planned.collectionMs,
        settle: planned.settleMs,
        hard: planned.hardStopMs,
        maxmg: planned.maximumMassMg,
      });
      setControlMessage(
        `Run command sent for trial ${trial}; every frame is spooled before upload.`,
      );
    } catch (error) {
      setControlMessage(
        error instanceof Error ? error.message : 'The run command could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  }, [cloud.trialSession, serial]);

  const stop = useCallback(async () => {
    try {
      await serial.send('stop');
      setControlMessage('STOP sent. Pump output should now be electrically low.');
    } catch (error) {
      setControlMessage(
        error instanceof Error
          ? error.message
          : 'STOP could not be confirmed; use the physical E-stop.',
      );
    }
  }, [serial]);

  const clearDevice = useCallback(async () => {
    try {
      await serial.send('clear');
      setControlMessage(
        'Clear requested. The device will return to IDLE only if the physical E-stop loop is healthy.',
      );
    } catch (error) {
      setControlMessage(
        error instanceof Error ? error.message : 'The device could not be cleared.',
      );
    }
  }, [serial]);

  const recoverExpiredTrial = useCallback(async () => {
    if (!recoveryTrialId) return;
    setBusy(true);
    try {
      await cloud.forceAbortExpiredTrial(
        recoveryTrialId,
        'Operator recovered an expired trial after the Arduino reset or browser bridge was replaced.',
      );
      setControlMessage(
        'Expired trial force-aborted with an audit record. This new device boot may now register.',
      );
    } catch (error) {
      setControlMessage(
        error instanceof Error ? error.message : 'The expired trial could not be recovered yet.',
      );
    } finally {
      setBusy(false);
    }
  }, [cloud, recoveryTrialId]);

  useEffect(() => {
    if (serial.faultCode) {
      setControlMessage(
        `DEVICE FAULT · ${serial.faultCode}. Pump output is forced low; inspect the rig before clearing.`,
      );
    } else if (serial.lastCommandAck && !serial.lastCommandAck.ok) {
      setControlMessage(
        `DEVICE REJECTED ${serial.lastCommandAck.id ?? 'COMMAND'} · ${serial.lastCommandAck.code}`,
      );
    }
  }, [serial.faultCode, serial.lastCommandAck]);

  const sealTrial = useCallback(async () => {
    setBusy(true);
    try {
      if (cloud.lastProjectedDeviceSequence === null) {
        throw new Error(
          'The final trial event has not reached the durable Cloudflare frontier yet.',
        );
      }
      await cloud.completeTrial({
        schema: 'tnp.calibration.trial-transition.v1',
        finalDeviceSeq: cloud.lastProjectedDeviceSequence,
        deviceState: serial.benchState,
        reason: null,
      });
      serial.setTrialContext(null);
      setOperatorTrialId(null);
      setControlMessage(
        'Trial sealed after its durable projection completed. Results remain under review.',
      );
    } catch (error) {
      setControlMessage(
        error instanceof Error ? error.message : 'The trial could not be sealed yet.',
      );
    } finally {
      setBusy(false);
    }
  }, [cloud, serial]);

  const abortRecord = useCallback(async () => {
    setBusy(true);
    try {
      await serial.send('stop');
      setAbortRequested(true);
      setControlMessage(
        'STOP sent. The record will abort after the pump-off state is durably stored.',
      );
    } catch (error) {
      setControlMessage(
        error instanceof Error
          ? error.message
          : 'Abort could not be confirmed; use the physical E-stop.',
      );
    } finally {
      setBusy(false);
    }
  }, [serial]);

  useEffect(() => {
    if (
      !abortRequested ||
      !cloud.trialSession ||
      cloud.spoolDepth > 0 ||
      cloud.pendingFrameWrites > 0 ||
      busy ||
      !['idle', 'complete', 'fault'].includes(serial.benchState)
    )
      return;
    const finishAbort = async () => {
      setBusy(true);
      try {
        await cloud.abortTrial({
          schema: 'tnp.calibration.trial-transition.v1',
          finalDeviceSeq: cloud.lastProjectedDeviceSequence ?? 0,
          deviceState: serial.benchState,
          reason: 'operator_abort',
        });
        serial.setTrialContext(null);
        setOperatorTrialId(null);
        setAbortRequested(false);
        setControlMessage('Trial aborted and retained as an auditable rejected run.');
      } catch (error) {
        setAbortRequested(false);
        setControlMessage(
          error instanceof Error ? error.message : 'The stopped trial could not be marked aborted.',
        );
      } finally {
        setBusy(false);
      }
    };
    void finishAbort();
  }, [abortRequested, busy, cloud, serial]);

  const connectionLabel = simulationEnabled ? 'SIMULATOR CONNECTED · NOT HARDWARE' : health.label;
  const trialState =
    serial.status === 'connected'
      ? serial.benchState
      : (latestSample?.trialState ?? (bootstrap.activeTrialId ? 'active' : 'idle'));

  return (
    <main
      className={`calibration-shell ${simulationEnabled ? 'calibration-shell--simulation' : ''}`}
    >
      {simulationEnabled && (
        <output className="simulation-banner">
          SIMULATION — NOT MEASURED · NOT SAVED · NOT A PUMP
        </output>
      )}

      <header className="calibration-header">
        <div className="calibration-header__brand">
          <p>THE NEGRONI PONY</p>
          <h1>Pump Calibration Bureau</h1>
          <span>Division of Applied Libations · Bench {BENCH_ID.toUpperCase()}</span>
        </div>
        <div className={`connection-plate connection-plate--${health.state}`}>
          <span className="connection-plate__lamp" aria-hidden="true" />
          <div>
            <strong>{connectionLabel}</strong>
            <small>
              {apiState === 'unavailable'
                ? 'Public API unavailable'
                : `TRIAL ${trialState.toUpperCase()}`}
            </small>
          </div>
        </div>
      </header>

      <section className="status-rail" aria-label="Stream health">
        <div>
          <span>DEVICE</span>
          <strong>{formatAge(health.deviceAgeMs)}</strong>
          <small>
            {bootstrap.presence.deviceId ?? serial.identity?.deviceId ?? 'not observed'}
          </small>
        </div>
        <div>
          <span>CLOUD ACK</span>
          <strong>{formatAge(health.durableAgeMs)}</strong>
          <small>
            {bootstrap.presence.durabilityScope?.replace('_', ' ') ?? 'no durable frontier'}
          </small>
        </div>
        <div>
          <span>VIEWER STREAM</span>
          <strong>{formatAge(health.viewerAgeMs)}</strong>
          <small>recomputed continuously</small>
        </div>
        <div>
          <span>PUBLIC RECORD</span>
          <strong>{bootstrap.latestCompletedTrialId ? 'AVAILABLE' : '—'}</strong>
          <small>{bootstrap.latestCompletedTrialId ?? 'no completed trial'}</small>
        </div>
      </section>

      {!simulationEnabled && cloud.operatorState === 'authorized' ? (
        <section className="operator-console instrument-card" aria-label="Operator controls">
          <div className="operator-console__intro">
            <p className="micro-label">OPERATOR DESK · PRIVATE WRITES</p>
            <h2>The pump may now approach the witness.</h2>
            <p>{controlMessage}</p>
          </div>
          <div className="operator-console__connection">
            <span>USB SERIAL · {serial.baudRate.toLocaleString()} BAUD</span>
            <strong>
              {serial.identity
                ? `${serial.identity.deviceId} / boot ${serial.identity.bootId}`
                : serial.status}
            </strong>
            {serial.lastError && <small>{serial.lastError}</small>}
            <small>
              CLOUD {cloud.operatorState} · BRIDGE {cloud.bridgeState} · SPOOL {cloud.spoolDepth}
            </small>
          </div>
          <div className="operator-field">
            <label htmlFor="pump-select">PUMP UNDER TEST</label>
            <select
              disabled={Boolean(cloud.trialSession)}
              id="pump-select"
              onChange={(event) => setSelectedPump(event.target.value as 'k' | 'g')}
              value={selectedPump}
            >
              <option value="k">Kamoer KPHM600</option>
              <option value="g">Gikfun AE1207</option>
            </select>
          </div>
          <div className="operator-field operator-field--number">
            <label htmlFor="duty-input">DUTY · %</label>
            <input
              disabled={Boolean(cloud.trialSession)}
              id="duty-input"
              max="100"
              min="11"
              onChange={(event) => setDutyPercent(Number(event.target.value))}
              type="number"
              value={dutyPercent}
            />
          </div>
          <div className="operator-field operator-field--number">
            <label htmlFor="duration-input">COLLECT · S</label>
            <input
              disabled={Boolean(cloud.trialSession)}
              id="duration-input"
              max="20"
              min="1"
              onChange={(event) => setCollectionSeconds(Number(event.target.value))}
              type="number"
              value={collectionSeconds}
            />
          </div>
          <div className="operator-actions">
            {serial.status !== 'connected' ? (
              <button
                className="control-button"
                disabled={simulationEnabled || serial.status === 'connecting'}
                onClick={() => void serial.connect()}
                type="button"
              >
                {serial.status === 'connecting' ? 'OPENING…' : 'CONNECT USB'}
              </button>
            ) : (
              <button
                className="control-button"
                disabled={Boolean(cloud.trialSession)}
                onClick={() => void serial.disconnect()}
                type="button"
              >
                DISCONNECT
              </button>
            )}
            {cloud.operatorState !== 'authorized' && !simulationEnabled && (
              <button className="control-button" onClick={cloud.authorize} type="button">
                AUTHORIZE WRITES
              </button>
            )}
            <button
              className="control-button"
              disabled={
                !serial.identity?.loadCellCalibrated ||
                !serial.identity.deviceIdentityProvisioned ||
                !serial.identity.configuredMassLimitMg ||
                !measuredSetup ||
                serial.benchState !== 'idle' ||
                !cloud.benchSession ||
                !specimenRegistered ||
                !calibrationRegistered ||
                busy ||
                simulationEnabled ||
                Boolean(cloud.trialSession) ||
                Boolean(recoveryTrialId)
              }
              onClick={() => void prepareTrial()}
              type="button"
            >
              PREPARE &amp; TARE TRIAL
            </button>
            <button
              className="control-button control-button--primary"
              disabled={
                !cloud.trialSession || serial.benchState !== 'armed' || busy || simulationEnabled
              }
              onClick={() => void runCommand()}
              type="button"
            >
              START {chosenPump.manufacturer.toUpperCase()} STEP
            </button>
            <button
              className="control-button"
              disabled={
                !cloud.trialSession ||
                serial.benchState !== 'complete' ||
                cloud.lastProjectedDeviceSequence === null ||
                cloud.spoolDepth > 0 ||
                cloud.pendingFrameWrites > 0 ||
                busy
              }
              onClick={() => void sealTrial()}
              type="button"
            >
              SEAL TRIAL
            </button>
            <button
              className="control-button"
              disabled={!cloud.trialSession || busy || abortRequested}
              onClick={() => void abortRecord()}
              type="button"
            >
              {abortRequested ? 'ABORTING…' : 'ABORT RECORD'}
            </button>
            <button
              className="control-button"
              disabled={
                !['complete', 'fault'].includes(serial.benchState) ||
                Boolean(cloud.trialSession) ||
                busy
              }
              onClick={() => void clearDevice()}
              type="button"
            >
              CLEAR DEVICE
            </button>
            {recoveryTrialId && (
              <button
                className="control-button"
                disabled={busy}
                onClick={() => void recoverExpiredTrial()}
                type="button"
              >
                RECOVER EXPIRED TRIAL
              </button>
            )}
            <button
              className="control-button control-button--stop"
              disabled={serial.status !== 'connected' || simulationEnabled}
              onClick={() => void stop()}
              type="button"
            >
              STOP PUMP
            </button>
          </div>
          <div className="operator-provenance">
            <div className="operator-field">
              <label htmlFor="specimen-input">
                REGISTERED {chosenPump.manufacturer.toUpperCase()} SPECIMEN ID
              </label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="specimen-input"
                list="specimen-options"
                onChange={(event) =>
                  setSpecimenIds((current) => ({ ...current, [selectedPump]: event.target.value }))
                }
                placeholder="register a physical specimen first"
                type="text"
                value={specimenIds[selectedPump]}
              />
              <datalist id="specimen-options">
                {cloud.operatorSetup?.pumpSpecimens
                  .filter((item) => item.pumpModelId === chosenPump.pumpModelId)
                  .map((item) => (
                    <option key={item.pumpSpecimenId} value={item.pumpSpecimenId}>
                      {item.label}
                    </option>
                  ))}
              </datalist>
              <small>
                {specimenRegistered
                  ? 'registered and model-matched'
                  : 'not registered for this pump model'}
              </small>
            </div>
            <div className="operator-field">
              <label htmlFor="calibration-input">ACCEPTED LOAD-CELL CALIBRATION ID</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="calibration-input"
                list="calibration-options"
                onChange={(event) => setLoadCellCalibrationId(event.target.value)}
                placeholder="register the known-mass calibration first"
                type="text"
                value={loadCellCalibrationId}
              />
              <datalist id="calibration-options">
                {cloud.operatorSetup?.loadCellCalibrations.map((item) => (
                  <option key={item.loadCellCalibrationId} value={item.loadCellCalibrationId}>
                    {item.recordedAt}
                  </option>
                ))}
              </datalist>
              <small>
                {calibrationRegistered
                  ? 'registered; device and coefficients match'
                  : 'not registered, or live coefficients differ'}
              </small>
            </div>
            <div className="operator-field">
              <label htmlFor="temperature-input">WATER TEMP · °C</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="temperature-input"
                max="40"
                min="0"
                onChange={(event) => setWaterTemperatureC(event.target.value)}
                placeholder="measured"
                step="0.01"
                type="number"
                value={waterTemperatureC}
              />
            </div>
            <div className="operator-field">
              <label htmlFor="supply-input">SUPPLY · V</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="supply-input"
                max="30"
                min="0.001"
                onChange={(event) => setSupplyVoltageV(event.target.value)}
                placeholder="measured at driver"
                step="0.001"
                type="number"
                value={supplyVoltageV}
              />
            </div>
            <div className="operator-field">
              <label htmlFor="tube-input">TUBE SPECIMEN ID</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="tube-input"
                onChange={(event) => setTubeId(event.target.value)}
                placeholder="physical tube/path ID"
                type="text"
                value={tubeId}
              />
            </div>
            <div className="operator-field">
              <label htmlFor="inlet-input">INLET · MM</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="inlet-input"
                min="0"
                onChange={(event) => setInletLengthMm(event.target.value)}
                placeholder="measured"
                step="1"
                type="number"
                value={inletLengthMm}
              />
            </div>
            <div className="operator-field">
              <label htmlFor="outlet-input">OUTLET · MM</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="outlet-input"
                min="0"
                onChange={(event) => setOutletLengthMm(event.target.value)}
                placeholder="measured"
                step="1"
                type="number"
                value={outletLengthMm}
              />
            </div>
            <div className="operator-field">
              <label htmlFor="lift-input">LIFT · MM</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="lift-input"
                onChange={(event) => setLiftMm(event.target.value)}
                placeholder="signed"
                step="1"
                type="number"
                value={liftMm}
              />
            </div>
            <div className="operator-field">
              <label htmlFor="nozzle-input">NOZZLE HEIGHT · MM</label>
              <input
                disabled={Boolean(cloud.trialSession)}
                id="nozzle-input"
                min="0"
                onChange={(event) => setNozzleHeightMm(event.target.value)}
                placeholder="above platform"
                step="1"
                type="number"
                value={nozzleHeightMm}
              />
            </div>
            <p className="operator-provenance__note">
              Density is derived from the recorded water temperature. No assumed room temperature,
              supply voltage, tube, or head geometry enters a trial.
            </p>
          </div>
          <p className="operator-console__safety">
            The on-screen stop is not the E-stop. Motor power must also have a physical,
            normally-closed interruption.
          </p>
        </section>
      ) : !simulationEnabled ? (
        <section className="operator-gate instrument-card" aria-label="Operator authorization">
          <div>
            <p className="micro-label">OPERATOR DESK · PRIVATE WRITES</p>
            <strong>Public readout active. Bench controls require operator authorization.</strong>
          </div>
          {cloud.localMode ? (
            <form
              className="operator-gate__local"
              onSubmit={(event) => {
                event.preventDefault();
                cloud.setLocalOperatorToken(localTokenEntry);
                setLocalTokenEntry('');
              }}
            >
              <label htmlFor="local-token">LOCAL SESSION TOKEN</label>
              <input
                autoComplete="off"
                id="local-token"
                onChange={(event) => setLocalTokenEntry(event.target.value)}
                type="password"
                value={localTokenEntry}
              />
              <button className="control-button" disabled={!localTokenEntry.trim()} type="submit">
                UNLOCK LOCAL WRITES
              </button>
            </form>
          ) : (
            <button className="control-button" onClick={cloud.authorize} type="button">
              AUTHORIZE WRITES
            </button>
          )}
        </section>
      ) : null}

      <div className="dashboard-grid">
        <div className="primary-grid">
          <LiveInstrument health={health} sample={latestSample} />
          <section className="instrument-card stream-tape" aria-label="Recent sample tape">
            <div className="instrument-card__heading">
              <div>
                <p className="micro-label">RECENT DEVICE FRAMES</p>
                <h2>Evidence, arriving</h2>
              </div>
              <span className="etched-badge">LAST {recentSamples.length}</span>
            </div>
            <div className="stream-tape__table">
              <div className="stream-tape__row stream-tape__row--head">
                <span>SEQ</span>
                <span>TIME</span>
                <span>DUTY</span>
                <span>MASS</span>
              </div>
              {recentSamples.length === 0 ? (
                <p className="stream-tape__empty">
                  No frames received. The paper remains admirably blank.
                </p>
              ) : (
                recentSamples
                  .slice(-8)
                  .reverse()
                  .map((sample) => (
                    <div className="stream-tape__row" key={`${sample.deviceMs}-${sample.sequence}`}>
                      <span>{sample.sequence}</span>
                      <span>{(sample.deviceMs / 1_000).toFixed(2)}s</span>
                      <span>{(sample.dutyBasisPoints / 100).toFixed(1)}%</span>
                      <span>
                        {sample.massMg === null
                          ? 'uncal.'
                          : `${(sample.massMg / 1_000).toFixed(2)}g`}
                      </span>
                    </div>
                  ))
              )}
            </div>
            <footer>
              <span>RAW ADC RETAINED</span>
              <span>NO INTERPOLATED SAMPLES</span>
            </footer>
          </section>
        </div>

        <section className="comparison-section">
          <div className="section-heading">
            <div>
              <p className="micro-label">THE CONTESTANTS</p>
              <h2>Two pumps enter. Both leave documented.</h2>
            </div>
            <p>
              Catalog claims are labels, never measurements. Curves appear only after a trial is
              reviewed and accepted.
            </p>
          </div>
          <div className="pump-grid">
            {bootstrap.pumps.map((pump, index) => (
              <PumpCard index={index} key={pump.pumpModelId} pump={pump} />
            ))}
          </div>
        </section>

        <section className="instrument-card flow-section">
          <div className="instrument-card__heading">
            <div>
              <p className="micro-label">ACCEPTED FLOW CHARACTERIZATION</p>
              <h2>Does command become liquid?</h2>
            </div>
            <span className="etched-badge">MEASURED ONLY</span>
          </div>
          <FlowChart
            currentDutyBasisPoints={latestSample?.dutyBasisPoints}
            pumps={bootstrap.pumps}
          />
        </section>

        <section className="recipes-section">
          <div className="section-heading">
            <div>
              <p className="micro-label">OPERATIONAL CONSEQUENCES</p>
              <h2>How long until the cocktail?</h2>
            </div>
            <p>
              Predictions remain blank until a selected physical specimen has an accepted curve for
              the declared setup.
            </p>
          </div>
          <div className="recipe-grid">
            {bootstrap.recipes.map((recipe, index) => (
              <RecipeCard index={index} key={recipe.recipeId} recipe={recipe} />
            ))}
          </div>
        </section>
      </div>

      <footer className="calibration-footer">
        <span>WATER BENCH · 100 ML VESSEL · MASS-DERIVED FLOW</span>
        <span>NO DATA IS BETTER THAN DECORATIVE DATA</span>
        <span>SCHEMA TNP.CALIBRATION.V1</span>
      </footer>
    </main>
  );
}
