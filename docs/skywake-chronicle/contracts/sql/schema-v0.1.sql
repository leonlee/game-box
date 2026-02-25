-- Skywake Chronicle
-- Dynamic save schema v0.1 (SQLite)
-- Static content (skills/items/enemies/dungeons/quests) is sourced from JSON packs.

PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version TEXT NOT NULL,
  app_major_version INTEGER NOT NULL CHECK (app_major_version >= 1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO schema_meta (id, schema_version, app_major_version)
VALUES (1, '0.1.0', 1)
ON CONFLICT(id) DO UPDATE SET
  schema_version = excluded.schema_version,
  app_major_version = excluded.app_major_version;

CREATE TABLE IF NOT EXISTS applied_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS saves (
  save_id TEXT PRIMARY KEY,
  slot_index INTEGER NOT NULL UNIQUE CHECK (slot_index BETWEEN 1 AND 3),
  save_version INTEGER NOT NULL DEFAULT 1,
  app_major_version INTEGER NOT NULL CHECK (app_major_version >= 1),
  player_name TEXT NOT NULL,
  current_town_id TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  fate_points INTEGER NOT NULL DEFAULT 0 CHECK (fate_points >= 0),
  active_party_tactic_profile_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saves_updated_at ON saves(updated_at);

CREATE TABLE IF NOT EXISTS character_instances (
  character_uid TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  race_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1),
  xp INTEGER NOT NULL CHECK (xp >= 0),
  stress_physical INTEGER NOT NULL DEFAULT 0 CHECK (stress_physical >= 0),
  stress_mental INTEGER NOT NULL DEFAULT 0 CHECK (stress_mental >= 0),
  consequence_light TEXT,
  consequence_mid TEXT,
  consequence_heavy TEXT,
  aspect_high_concept TEXT NOT NULL,
  aspect_trouble TEXT NOT NULL,
  aspect_background TEXT,
  is_in_active_party INTEGER NOT NULL DEFAULT 0 CHECK (is_in_active_party IN (0, 1)),
  party_slot INTEGER CHECK (party_slot BETWEEN 1 AND 3),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    (is_in_active_party = 0 AND party_slot IS NULL)
    OR
    (is_in_active_party = 1 AND party_slot IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_character_instances_save_id ON character_instances(save_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_character_active_party_slot
  ON character_instances(save_id, party_slot)
  WHERE is_in_active_party = 1;

CREATE TABLE IF NOT EXISTS character_skill_slots (
  character_uid TEXT NOT NULL REFERENCES character_instances(character_uid) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 1 AND 6),
  skill_id TEXT NOT NULL,
  PRIMARY KEY (character_uid, slot_index)
);

CREATE TABLE IF NOT EXISTS character_stunt_slots (
  character_uid TEXT NOT NULL REFERENCES character_instances(character_uid) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 1 AND 5),
  stunt_id TEXT NOT NULL,
  PRIMARY KEY (character_uid, slot_index)
);

CREATE TABLE IF NOT EXISTS character_loadouts (
  character_uid TEXT PRIMARY KEY REFERENCES character_instances(character_uid) ON DELETE CASCADE,
  weapon_item_uid TEXT,
  armor_item_uid TEXT,
  accessory_item_uid TEXT,
  character_tactic_profile_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
  item_uid TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  is_equipped INTEGER NOT NULL DEFAULT 0 CHECK (is_equipped IN (0, 1)),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  acquired_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_save_item ON inventory_items(save_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_equipped ON inventory_items(save_id, is_equipped);

CREATE TABLE IF NOT EXISTS quest_progress (
  save_id TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('locked', 'active', 'completed', 'failed')),
  step_index INTEGER NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  progress_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (save_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_quest_progress_status ON quest_progress(save_id, status);

CREATE TABLE IF NOT EXISTS tactics_profiles (
  tactics_profile_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  profile_scope TEXT NOT NULL CHECK (profile_scope IN ('party', 'character')),
  profile_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tactics_profiles_save_scope
  ON tactics_profiles(save_id, profile_scope);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  party_snapshot_json TEXT NOT NULL,
  dungeon_id TEXT NOT NULL,
  planned_floor INTEGER NOT NULL CHECK (planned_floor >= 1),
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  expected_end_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'retreated', 'aborted')),
  summary_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_save_status ON runs(save_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_dungeon ON runs(save_id, dungeon_id);

CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq >= 1),
  floor INTEGER NOT NULL CHECK (floor >= 1),
  node_id TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'run_start',
      'run_end',
      'floor_enter',
      'floor_leave',
      'node_enter',
      'node_exit',
      'combat_start',
      'combat_action',
      'combat_end',
      'overcome_check',
      'loot_drop',
      'retreat_triggered',
      'gate_blocked',
      'quest_progress'
    )
  ),
  outcome TEXT,
  reason_tags_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL,
  timestamp_offset_sec INTEGER NOT NULL CHECK (timestamp_offset_sec >= 0),
  PRIMARY KEY (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_run_events_type ON run_events(run_id, event_type);
CREATE INDEX IF NOT EXISTS idx_run_events_floor ON run_events(run_id, floor);

CREATE TABLE IF NOT EXISTS run_checkpoints (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  checkpoint_seq INTEGER NOT NULL CHECK (checkpoint_seq >= 1),
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, checkpoint_seq)
);

CREATE TABLE IF NOT EXISTS device_time_audit (
  audit_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  previous_device_unix INTEGER NOT NULL,
  current_device_unix INTEGER NOT NULL,
  drift_sec INTEGER NOT NULL,
  detected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_time_audit_save ON device_time_audit(save_id, detected_at);

COMMIT;
