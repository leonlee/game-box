import { APP_MAJOR_VERSION, STORAGE_KEY, createDefaultSave } from "./content";
import { ACTIONS, createTacticsConfig, validateTacticsConfig } from "./tactics";
import { Action, FallbackByRole, SaveData, TacticsConfig, TacticsProfile, TacticsRule } from "./types";

const DEFAULT_FALLBACK: FallbackByRole = {
  tank: "defend_stance",
  dps: "basic_attack",
  support: "create_advantage"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shallowValidate(data: unknown): data is SaveData {
  if (!isRecord(data)) return false;
  return (
    typeof data.saveId === "string" &&
    typeof data.appMajorVersion === "number" &&
    Array.isArray(data.characters) &&
    Array.isArray(data.tacticsProfiles) &&
    Array.isArray(data.runs) &&
    isRecord(data.inventory)
  );
}

function isFallbackByRole(value: unknown): value is FallbackByRole {
  if (!isRecord(value)) return false;
  return (
    typeof value.tank === "string" && ACTIONS.includes(value.tank as Action) &&
    typeof value.dps === "string" && ACTIONS.includes(value.dps as Action) &&
    typeof value.support === "string" && ACTIONS.includes(value.support as Action)
  );
}

function normalizeFallbackByRole(value: unknown): FallbackByRole {
  if (!isFallbackByRole(value)) {
    return DEFAULT_FALLBACK;
  }

  return {
    tank: value.tank,
    dps: value.dps,
    support: value.support
  };
}

function normalizeConfig(profile: Record<string, unknown>): TacticsConfig | null {
  if (isRecord(profile.config)) {
    const config = profile.config as unknown as TacticsConfig;
    if (validateTacticsConfig(config).length === 0) {
      return {
        version: 1,
        conflict_policy: config.conflict_policy,
        fallback_by_role: config.fallback_by_role,
        rules: config.rules
      };
    }
  }

  if (Array.isArray(profile.rules)) {
    const fallback = normalizeFallbackByRole(profile.fallbackByRole);
    const config = createTacticsConfig(profile.rules as TacticsRule[], fallback);
    if (validateTacticsConfig(config).length === 0) {
      return config;
    }
  }

  return null;
}

function migrateProfiles(rawProfiles: unknown[]): { profiles: TacticsProfile[]; changed: boolean } {
  const profiles: TacticsProfile[] = [];
  let changed = false;

  rawProfiles.forEach((item) => {
    if (!isRecord(item)) {
      changed = true;
      return;
    }

    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "自定义";
    const style = item.style;

    if (!id || (style !== "aggressive" && style !== "balanced" && style !== "cautious" && style !== "custom")) {
      changed = true;
      return;
    }

    const config = normalizeConfig(item);
    if (!config) {
      changed = true;
      return;
    }

    if (!isRecord(item.config)) {
      changed = true;
    }

    profiles.push({
      id,
      name,
      style,
      config,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
    });
  });

  return { profiles, changed };
}

function migrateSave(raw: SaveData): { save: SaveData; changed: boolean } {
  const migrated: SaveData = {
    ...raw,
    tacticsProfiles: raw.tacticsProfiles,
    runs: Array.isArray(raw.runs) ? raw.runs : []
  };

  const { profiles, changed } = migrateProfiles(raw.tacticsProfiles as unknown[]);
  if (profiles.length === 0) {
    return { save: createDefaultSave(), changed: true };
  }

  migrated.tacticsProfiles = profiles;

  const profileExists = profiles.some((profile) => profile.id === raw.activePartyTacticProfileId);
  if (!profileExists) {
    migrated.activePartyTacticProfileId = profiles[0].id;
    return { save: migrated, changed: true };
  }

  return { save: migrated, changed };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSave();

    const parsed = JSON.parse(raw) as unknown;
    if (!shallowValidate(parsed)) {
      return createDefaultSave();
    }

    const save = parsed as SaveData;
    if (save.appMajorVersion !== APP_MAJOR_VERSION) {
      return createDefaultSave();
    }

    const { save: migrated, changed } = migrateSave(save);
    if (changed) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...migrated,
          updatedAt: Date.now()
        })
      );
    }

    return migrated;
  } catch {
    return createDefaultSave();
  }
}

export function persistSave(save: SaveData): void {
  const output: SaveData = {
    ...save,
    updatedAt: Date.now()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
}

export function wipeSave(): SaveData {
  const fresh = createDefaultSave();
  persistSave(fresh);
  return fresh;
}
