import { APP_MAJOR_VERSION, SAVE_VERSION, STORAGE_KEY, createDefaultSave } from "./content";
import { ACTIONS, createTacticsConfig, validateTacticsConfig } from "./tactics";
import {
  ActiveRunPlan,
  ArchivedRunSummary,
  Action,
  ExpeditionTimeScale,
  FallbackByRole,
  LogView,
  OnboardingProgress,
  SaveData,
  SaveSettings,
  TacticsConfig,
  TacticsProfile,
  TacticsRule
} from "./types";

const DEFAULT_FALLBACK: FallbackByRole = {
  tank: "defend_stance",
  dps: "basic_attack",
  support: "create_advantage"
};

const DEFAULT_SETTINGS: SaveSettings = {
  showOnboardingCard: true,
  defaultLogView: "narrative",
  notifyOnRunComplete: false,
  notifyFailOnly: false,
  advancedDebugView: false,
  expeditionTimeScale: 1
};

const TIME_SCALE_OPTIONS: readonly ExpeditionTimeScale[] = [1, 4, 10] as const;

const DEFAULT_ONBOARDING: OnboardingProgress = {
  openedPartyTab: false,
  appliedPreset: false,
  startedRun: false,
  viewedDebugLog: false
};

const DEFAULT_ARCHIVED_RUN_SUMMARY: ArchivedRunSummary = {
  archivedRuns: 0,
  completed: 0,
  retreated: 0,
  failed: 0,
  reasonTagCounts: {},
  progressRateSum: 0,
  retainedGoldSum: 0,
  retainedMaterialsSum: 0
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLogView(value: unknown): value is LogView {
  return value === "narrative" || value === "debug";
}

function isExpeditionTimeScale(value: unknown): value is ExpeditionTimeScale {
  return typeof value === "number" && TIME_SCALE_OPTIONS.includes(value as ExpeditionTimeScale);
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

function normalizeSettings(raw: unknown): { settings: SaveSettings; changed: boolean } {
  if (!isRecord(raw)) {
    return { settings: DEFAULT_SETTINGS, changed: true };
  }

  let changed = false;
  const showOnboardingCard = typeof raw.showOnboardingCard === "boolean" ? raw.showOnboardingCard : DEFAULT_SETTINGS.showOnboardingCard;
  if (typeof raw.showOnboardingCard !== "boolean") changed = true;

  const defaultLogView = isLogView(raw.defaultLogView) ? raw.defaultLogView : DEFAULT_SETTINGS.defaultLogView;
  if (!isLogView(raw.defaultLogView)) changed = true;

  const notifyOnRunComplete =
    typeof raw.notifyOnRunComplete === "boolean" ? raw.notifyOnRunComplete : DEFAULT_SETTINGS.notifyOnRunComplete;
  if (typeof raw.notifyOnRunComplete !== "boolean") changed = true;

  const notifyFailOnly = typeof raw.notifyFailOnly === "boolean" ? raw.notifyFailOnly : DEFAULT_SETTINGS.notifyFailOnly;
  if (typeof raw.notifyFailOnly !== "boolean") changed = true;

  const advancedDebugView = typeof raw.advancedDebugView === "boolean" ? raw.advancedDebugView : DEFAULT_SETTINGS.advancedDebugView;
  if (typeof raw.advancedDebugView !== "boolean") changed = true;

  const expeditionTimeScale = isExpeditionTimeScale(raw.expeditionTimeScale)
    ? raw.expeditionTimeScale
    : DEFAULT_SETTINGS.expeditionTimeScale;
  if (!isExpeditionTimeScale(raw.expeditionTimeScale)) changed = true;

  if (!notifyOnRunComplete && notifyFailOnly) {
    changed = true;
  }

  return {
    settings: {
      showOnboardingCard,
      defaultLogView,
      notifyOnRunComplete,
      notifyFailOnly: notifyOnRunComplete ? notifyFailOnly : false,
      advancedDebugView,
      expeditionTimeScale
    },
    changed
  };
}

function normalizeOnboarding(raw: unknown): { onboarding: OnboardingProgress; changed: boolean } {
  if (!isRecord(raw)) {
    return { onboarding: DEFAULT_ONBOARDING, changed: true };
  }

  let changed = false;
  const openedPartyTab = typeof raw.openedPartyTab === "boolean" ? raw.openedPartyTab : DEFAULT_ONBOARDING.openedPartyTab;
  if (typeof raw.openedPartyTab !== "boolean") changed = true;

  const appliedPreset = typeof raw.appliedPreset === "boolean" ? raw.appliedPreset : DEFAULT_ONBOARDING.appliedPreset;
  if (typeof raw.appliedPreset !== "boolean") changed = true;

  const startedRun = typeof raw.startedRun === "boolean" ? raw.startedRun : DEFAULT_ONBOARDING.startedRun;
  if (typeof raw.startedRun !== "boolean") changed = true;

  const viewedDebugLog = typeof raw.viewedDebugLog === "boolean" ? raw.viewedDebugLog : DEFAULT_ONBOARDING.viewedDebugLog;
  if (typeof raw.viewedDebugLog !== "boolean") changed = true;

  return {
    onboarding: {
      openedPartyTab,
      appliedPreset,
      startedRun,
      viewedDebugLog
    },
    changed
  };
}

function normalizeArchivedRunSummary(raw: unknown): { archivedRunSummary: ArchivedRunSummary; changed: boolean } {
  if (!isRecord(raw)) {
    return { archivedRunSummary: DEFAULT_ARCHIVED_RUN_SUMMARY, changed: true };
  }

  let changed = false;
  const archivedRuns = typeof raw.archivedRuns === "number" && Number.isFinite(raw.archivedRuns) && raw.archivedRuns >= 0
    ? Math.floor(raw.archivedRuns)
    : DEFAULT_ARCHIVED_RUN_SUMMARY.archivedRuns;
  if (archivedRuns !== raw.archivedRuns) changed = true;

  const completed = typeof raw.completed === "number" && Number.isFinite(raw.completed) && raw.completed >= 0
    ? Math.floor(raw.completed)
    : DEFAULT_ARCHIVED_RUN_SUMMARY.completed;
  if (completed !== raw.completed) changed = true;

  const retreated = typeof raw.retreated === "number" && Number.isFinite(raw.retreated) && raw.retreated >= 0
    ? Math.floor(raw.retreated)
    : DEFAULT_ARCHIVED_RUN_SUMMARY.retreated;
  if (retreated !== raw.retreated) changed = true;

  const failed = typeof raw.failed === "number" && Number.isFinite(raw.failed) && raw.failed >= 0
    ? Math.floor(raw.failed)
    : DEFAULT_ARCHIVED_RUN_SUMMARY.failed;
  if (failed !== raw.failed) changed = true;

  const reasonTagCounts = isRecord(raw.reasonTagCounts)
    ? Object.entries(raw.reasonTagCounts).reduce<Record<string, number>>((acc, [key, value]) => {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          acc[key] = Math.floor(value);
        } else {
          changed = true;
        }
        return acc;
      }, {})
    : {};
  if (!isRecord(raw.reasonTagCounts)) changed = true;

  const progressRateSum = typeof raw.progressRateSum === "number" && Number.isFinite(raw.progressRateSum) && raw.progressRateSum >= 0
    ? raw.progressRateSum
    : DEFAULT_ARCHIVED_RUN_SUMMARY.progressRateSum;
  if (progressRateSum !== raw.progressRateSum) changed = true;

  const retainedGoldSum = typeof raw.retainedGoldSum === "number" && Number.isFinite(raw.retainedGoldSum) && raw.retainedGoldSum >= 0
    ? raw.retainedGoldSum
    : DEFAULT_ARCHIVED_RUN_SUMMARY.retainedGoldSum;
  if (retainedGoldSum !== raw.retainedGoldSum) changed = true;

  const retainedMaterialsSum = typeof raw.retainedMaterialsSum === "number" && Number.isFinite(raw.retainedMaterialsSum) && raw.retainedMaterialsSum >= 0
    ? raw.retainedMaterialsSum
    : DEFAULT_ARCHIVED_RUN_SUMMARY.retainedMaterialsSum;
  if (retainedMaterialsSum !== raw.retainedMaterialsSum) changed = true;

  return {
    archivedRunSummary: {
      archivedRuns,
      completed,
      retreated,
      failed,
      reasonTagCounts,
      progressRateSum,
      retainedGoldSum,
      retainedMaterialsSum
    },
    changed
  };
}

function normalizeActiveRunPlan(raw: unknown): { activeRunPlan: ActiveRunPlan | null; changed: boolean } {
  if (raw == null) {
    return { activeRunPlan: null, changed: false };
  }

  if (!isRecord(raw)) {
    return { activeRunPlan: null, changed: true };
  }

  const run = raw.run;
  const startedAt = raw.startedAt;
  const finishAt = raw.finishAt;
  const postRunSaveJson = raw.postRunSaveJson;

  if (
    !isRecord(run) ||
    typeof run.runId !== "string" ||
    typeof run.dungeonId !== "string" ||
    typeof run.plannedFloor !== "number" ||
    typeof run.reachedFloor !== "number" ||
    typeof run.status !== "string" ||
    typeof run.startedAt !== "number" ||
    typeof run.finishedAt !== "number" ||
    typeof run.seed !== "number" ||
    typeof run.rawGold !== "number" ||
    typeof run.rawMaterials !== "number" ||
    typeof run.retainedGold !== "number" ||
    typeof run.retainedMaterials !== "number" ||
    !Array.isArray(run.reasonTags) ||
    !Array.isArray(run.events) ||
    typeof startedAt !== "number" ||
    typeof finishAt !== "number" ||
    typeof postRunSaveJson !== "string"
  ) {
    return { activeRunPlan: null, changed: true };
  }

  if (finishAt <= startedAt) {
    return { activeRunPlan: null, changed: true };
  }

  return {
    activeRunPlan: {
      run: run as unknown as SaveData["runs"][number],
      startedAt,
      finishAt,
      postRunSaveJson
    },
    changed: false
  };
}

function migrateSave(raw: SaveData): { save: SaveData; changed: boolean } {
  const normalizedHintClaims = isRecord(raw.hintClaims)
    ? Object.entries(raw.hintClaims).reduce<Record<string, number>>((acc, [key, value]) => {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          acc[key] = Math.floor(value);
        }
        return acc;
      }, {})
    : {};

  const { settings: normalizedSettings, changed: settingsChanged } = normalizeSettings(raw.settings);
  const { onboarding: normalizedOnboarding, changed: onboardingChanged } = normalizeOnboarding(raw.onboarding);
  const { archivedRunSummary: normalizedArchivedRunSummary, changed: archivedRunSummaryChanged } =
    normalizeArchivedRunSummary(raw.archivedRunSummary);
  const { activeRunPlan: normalizedActiveRunPlan, changed: activeRunPlanChanged } = normalizeActiveRunPlan(raw.activeRunPlan);

  const migrated: SaveData = {
    ...raw,
    hintClaims: normalizedHintClaims,
    settings: normalizedSettings,
    onboarding: normalizedOnboarding,
    activeRunPlan: normalizedActiveRunPlan,
    archivedRunSummary: normalizedArchivedRunSummary,
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

  const hintClaimsWasMissing = !isRecord(raw.hintClaims);
  return {
    save: migrated,
    changed:
      changed || hintClaimsWasMissing || settingsChanged || onboardingChanged || archivedRunSummaryChanged || activeRunPlanChanged
  };
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

export function exportSaveString(save: SaveData): string {
  return JSON.stringify(save, null, 2);
}

export type ImportSaveResult = { ok: true; save: SaveData } | { ok: false; error: string };

export function importSaveString(rawText: string): ImportSaveResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: "导入内容为空。" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, error: "导入内容不是合法 JSON。" };
  }

  if (!shallowValidate(parsed)) {
    return { ok: false, error: "导入内容缺少核心字段（saveId/characters/tacticsProfiles/runs 等）。" };
  }

  const rawSave = parsed as SaveData;
  if (rawSave.appMajorVersion !== APP_MAJOR_VERSION) {
    return {
      ok: false,
      error: `主版本不兼容：导入=${rawSave.appMajorVersion}，当前=${APP_MAJOR_VERSION}。`
    };
  }

  if (rawSave.saveVersion > SAVE_VERSION) {
    return {
      ok: false,
      error: `存档版本过高：导入=${rawSave.saveVersion}，当前=${SAVE_VERSION}。`
    };
  }

  const { save } = migrateSave(rawSave);
  persistSave(save);
  return { ok: true, save };
}

export function wipeSave(): SaveData {
  const fresh = createDefaultSave();
  persistSave(fresh);
  return fresh;
}
