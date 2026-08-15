PRAGMA foreign_keys = ON;

CREATE TABLE pump_models (
  id TEXT PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  advertised_flow_ml_min REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO pump_models (id, manufacturer, model, advertised_flow_ml_min, metadata_json)
VALUES
  (
    'kamoer-kphm600-12b3b17',
    'Kamoer',
    'KPHM600-12B3B17',
    600,
    '{"provenance":"manufacturer_product_name","measured":false}'
  ),
  (
    'gikfun-ae1207',
    'Gikfun',
    'AE1207',
    NULL,
    '{"provenance":"owner_product_name","measured":false}'
  );

CREATE TABLE pump_specimens (
  id TEXT PRIMARY KEY,
  pump_model_id TEXT NOT NULL REFERENCES pump_models(id),
  label TEXT NOT NULL,
  acquired_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE bench_devices (
  id TEXT PRIMARY KEY,
  hardware_revision TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  last_firmware_version TEXT
);

CREATE TABLE load_cell_calibrations (
  id TEXT PRIMARY KEY,
  bench_device_id TEXT NOT NULL REFERENCES bench_devices(id),
  firmware_version TEXT NOT NULL,
  hx711_mode TEXT NOT NULL CHECK (hx711_mode = 'steady_10_sps'),
  channel_count INTEGER NOT NULL CHECK (channel_count = 1),
  counts_per_gram_numerator INTEGER NOT NULL CHECK (counts_per_gram_numerator != 0),
  counts_per_gram_denominator INTEGER NOT NULL CHECK (counts_per_gram_denominator > 0),
  reference_observations_json TEXT NOT NULL,
  independent_check_json TEXT NOT NULL,
  method_version TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE trials (
  id TEXT PRIMARY KEY,
  bench_id TEXT NOT NULL,
  bench_session_id TEXT NOT NULL,
  producer_session_id TEXT NOT NULL,
  producer_lease_expires_at TEXT NOT NULL,
  access_subject TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES bench_devices(id),
  boot_id TEXT NOT NULL,
  pump_specimen_id TEXT NOT NULL REFERENCES pump_specimens(id),
  pump_model_id TEXT NOT NULL REFERENCES pump_models(id),
  load_cell_calibration_id TEXT NOT NULL REFERENCES load_cell_calibrations(id),
  state TEXT NOT NULL CHECK (state IN ('created', 'running', 'completing', 'complete', 'aborted', 'fault')),
  transport TEXT NOT NULL CHECK (transport = 'web_serial'),
  firmware_version TEXT NOT NULL,
  protocol_version TEXT NOT NULL CHECK (protocol_version = 'tnp.serial.v1'),
  fluid_json TEXT NOT NULL,
  setup_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  contiguous_published_stream_seq INTEGER NOT NULL DEFAULT 0,
  contiguous_projected_device_seq INTEGER,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  private_notes TEXT
);

CREATE UNIQUE INDEX one_active_trial_per_bench
ON trials(bench_id)
WHERE state IN ('created', 'running', 'completing');

CREATE INDEX trials_bench_created ON trials(bench_id, created_at DESC);
CREATE INDEX trials_pump_model_created ON trials(pump_model_id, created_at DESC);
CREATE INDEX trials_pump_model_state_started ON trials(pump_model_id, state, started_at);

CREATE TABLE trial_transitions (
  id TEXT PRIMARY KEY,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  transition_kind TEXT NOT NULL CHECK (
    transition_kind IN ('complete', 'abort', 'forced_abort_expired_lease')
  ),
  evidence_status TEXT NOT NULL CHECK (
    evidence_status IN ('terminal_verified', 'forced_missing')
  ),
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL CHECK (to_state IN ('complete', 'aborted')),
  final_device_seq INTEGER,
  reason TEXT,
  actor_subject TEXT NOT NULL,
  actor_email TEXT,
  actor_auth_mode TEXT NOT NULL CHECK (actor_auth_mode IN ('access', 'local')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX trial_transitions_trial_occurred
ON trial_transitions(trial_id, occurred_at);

CREATE TABLE trial_steps (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  step_index INTEGER NOT NULL,
  repeat_index INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('forward', 'reverse')),
  duty_basis_points INTEGER NOT NULL CHECK (duty_basis_points BETWEEN 0 AND 10000),
  plan_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (trial_id, step_index)
);

CREATE TABLE ingest_batches (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  producer_session_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  first_seq INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  ack_json TEXT,
  received_at TEXT NOT NULL,
  projected_at TEXT,
  PRIMARY KEY (trial_id, producer_session_id, batch_id)
);

CREATE TABLE device_events (
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  event_sha256 TEXT NOT NULL,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  stream_seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  device_ms INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (device_id, boot_id, device_seq),
  UNIQUE (trial_id, stream_seq)
);

CREATE INDEX device_events_trial_stream ON device_events(trial_id, stream_seq);

CREATE TABLE samples (
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  stream_seq INTEGER NOT NULL,
  step_index INTEGER,
  device_ms INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  acquisition_mode TEXT NOT NULL,
  expected_sample_interval_ms INTEGER NOT NULL,
  duty_basis_points INTEGER NOT NULL,
  duty_timer_count INTEGER NOT NULL,
  motor_on INTEGER NOT NULL CHECK (motor_on IN (0, 1)),
  raw_adc_json TEXT NOT NULL,
  mass_mg INTEGER,
  tach_count INTEGER,
  supply_mv INTEGER,
  faults_json TEXT NOT NULL,
  PRIMARY KEY (device_id, boot_id, device_seq),
  UNIQUE (trial_id, stream_seq),
  FOREIGN KEY (device_id, boot_id, device_seq)
    REFERENCES device_events(device_id, boot_id, device_seq)
);

CREATE INDEX samples_trial_stream ON samples(trial_id, stream_seq);
CREATE INDEX samples_trial_step_device_ms ON samples(trial_id, step_index, device_ms);

CREATE TABLE trial_events (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  stream_seq INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (trial_id, stream_seq),
  FOREIGN KEY (device_id, boot_id, device_seq)
    REFERENCES device_events(device_id, boot_id, device_seq)
);

CREATE TABLE calibration_curves (
  id TEXT PRIMARY KEY,
  pump_specimen_id TEXT NOT NULL REFERENCES pump_specimens(id),
  pump_model_id TEXT NOT NULL REFERENCES pump_models(id),
  liquid TEXT NOT NULL,
  tube_id TEXT NOT NULL,
  min_duty_basis_points INTEGER NOT NULL,
  max_duty_basis_points INTEGER NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'under_review', 'accepted', 'rejected')),
  estimate_class TEXT NOT NULL CHECK (estimate_class IN ('water_engineering', 'ingredient_specific', 'installed_path_validated')),
  source_trial_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX curves_model_status ON calibration_curves(pump_model_id, review_status, published_at DESC);

CREATE TABLE calibration_points (
  curve_id TEXT NOT NULL REFERENCES calibration_curves(id) ON DELETE CASCADE,
  duty_basis_points INTEGER NOT NULL,
  flow_ul_per_sec INTEGER NOT NULL,
  uncertainty_ul_per_sec INTEGER NOT NULL,
  sample_count INTEGER NOT NULL,
  PRIMARY KEY (curve_id, duty_basis_points)
);
