ALTER TABLE calibration_curves ADD COLUMN analysis_method_version TEXT;
ALTER TABLE calibration_curves ADD COLUMN evidence_hash TEXT;
ALTER TABLE calibration_curves ADD COLUMN setup_fingerprint TEXT;
ALTER TABLE calibration_curves ADD COLUMN setup_profile_json TEXT;
ALTER TABLE calibration_curves ADD COLUMN quality_json TEXT;
ALTER TABLE calibration_curves ADD COLUMN publication_eligible INTEGER NOT NULL DEFAULT 0
  CHECK (publication_eligible IN (0, 1));
ALTER TABLE calibration_curves ADD COLUMN reviewed_at TEXT;
ALTER TABLE calibration_curves ADD COLUMN reviewed_by TEXT;

ALTER TABLE calibration_points ADD COLUMN evidence_json TEXT;

CREATE UNIQUE INDEX calibration_curves_evidence_method
ON calibration_curves(evidence_hash, analysis_method_version)
WHERE evidence_hash IS NOT NULL AND analysis_method_version IS NOT NULL;

CREATE TABLE calibration_curve_reviews (
  id TEXT PRIMARY KEY,
  curve_id TEXT NOT NULL UNIQUE REFERENCES calibration_curves(id),
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject')),
  reason TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_email TEXT,
  actor_auth_mode TEXT NOT NULL CHECK (actor_auth_mode IN ('access', 'local')),
  analysis_evidence_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE public_curve_selections (
  pump_model_id TEXT PRIMARY KEY REFERENCES pump_models(id),
  pump_specimen_id TEXT NOT NULL REFERENCES pump_specimens(id),
  curve_id TEXT NOT NULL UNIQUE REFERENCES calibration_curves(id),
  setup_fingerprint TEXT NOT NULL,
  selected_by TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  selected_at TEXT NOT NULL
);

CREATE INDEX public_curve_selections_specimen
ON public_curve_selections(pump_specimen_id);

CREATE TABLE calibration_curve_publications (
  id TEXT PRIMARY KEY,
  curve_id TEXT NOT NULL REFERENCES calibration_curves(id),
  pump_model_id TEXT NOT NULL REFERENCES pump_models(id),
  pump_specimen_id TEXT NOT NULL REFERENCES pump_specimens(id),
  analysis_evidence_hash TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_email TEXT,
  actor_auth_mode TEXT NOT NULL CHECK (actor_auth_mode IN ('access', 'local')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX calibration_curve_publications_curve
ON calibration_curve_publications(curve_id, occurred_at);
