import {
  DUNGEONS,
  INVENTORY_CATALOG,
  createPresetProfile,
  getItemContentById,
  getQuestContentById,
  reconcileQuestsWithContent
} from "./content";
import {
  labelAction,
  labelEventType,
  labelOutcome,
  labelQuestStatus,
  labelReason,
  labelRole,
  labelRunStatus,
  labelRunStatusUnknown,
  labelTacticStyle
} from "./i18n";
import { estimateRunMinutes, simulateRun, toNarrative } from "./simulator";
import { exportSaveString, importSaveString, loadSave, persistSave, wipeSave } from "./storage";
import { getActiveProfile, validateTacticsConfig } from "./tactics";
import {
  ActiveRunSpeedMultiplier,
  ActiveRunPlan,
  ConditionExpr,
  ConditionLeaf,
  EventType,
  ExpeditionTimeScale,
  Fact,
  LogView,
  Operator,
  ReasonTag,
  RunEvent,
  SaveData,
  TacticsConfig,
  TacticsRule,
  UiState
} from "./types";

const appEl = document.getElementById("app");
if (!(appEl instanceof HTMLElement)) {
  throw new Error("#app element is required");
}
const app: HTMLElement = appEl;

let save: SaveData = loadSave();

const REFORGE_RECIPE = {
  inputItem: "aether_shard",
  inputCount: 8,
  goldCost: 90,
  materialCost: 28,
  outputItem: "phase_calibrator",
  outputCount: 1
} as const;
const FACILITY_MAX_LEVEL = 3;
const DUNGEON_CHAPTER_REQUIREMENTS: Record<string, number> = {
  abyssal_archive: 1,
  storm_spindle: 2,
  aether_skybridge: 3
};
const FACILITY_UPGRADE_COSTS = {
  infirmary: [
    { gold: 220, materials: 90 },
    { gold: 420, materials: 180 }
  ],
  workshop: [
    { gold: 180, materials: 110 },
    { gold: 360, materials: 220 }
  ]
} as const;
const CHAPTER_UNLOCK_PLANS = [
  {
    chapter: 2,
    gold: 260,
    materials: 140,
    requireInfirmary: 2,
    requireWorkshop: 2,
    requireQuestId: "quest_archive_probe"
  },
  {
    chapter: 3,
    gold: 420,
    materials: 240,
    requireInfirmary: 3,
    requireWorkshop: 3,
    requireQuestId: "quest_spindle_core"
  }
] as const;
const TIME_SCALE_OPTIONS: readonly ExpeditionTimeScale[] = [1, 4, 10] as const;
const ACTIVE_RUN_SPEED_OPTIONS: readonly ActiveRunSpeedMultiplier[] = [1, 2, 4, 8] as const;
const HAS_MONOTONIC_CLOCK = typeof performance !== "undefined" && typeof performance.now === "function";
const MONOTONIC_ORIGIN_MS = HAS_MONOTONIC_CLOCK ? Date.now() - performance.now() : Date.now();
const LOG_VIRTUAL_OVERSCAN = 8;
const LOG_VIRTUAL_ROW_ESTIMATE_NARRATIVE = 138;
const LOG_VIRTUAL_ROW_ESTIMATE_DEBUG = 228;
const REPLAY_SWIPE_THRESHOLD_PX = 56;
const REPLAY_SWIPE_DIRECTION_RATIO = 1.2;
const LOG_LONG_PRESS_DELAY_MS = 380;
const LOG_LONG_PRESS_CANCEL_DISTANCE_PX = 14;
const LOG_ENTRY_SWIPE_THRESHOLD_PX = 52;
const LOG_ENTRY_SWIPE_DIRECTION_RATIO = 1.15;
const LOG_AUTO_FOLLOW_BOTTOM_GAP = 84;
const PROGRAMMATIC_LOG_SCROLL_MS = 280;
const LOG_TIMELINE_MARKER_MAX = 42;
const RULE_EDITOR_FACT_OPTIONS: readonly Fact[] = [
  "self_stress_pct",
  "self_has_consequence",
  "self_resource_pct",
  "ally_min_stress_pct",
  "party_consumable_count",
  "party_has_item",
  "enemy_has_aspect",
  "enemy_count_alive",
  "enemy_is_elite",
  "scene_has_aspect",
  "node_type",
  "time_window",
  "fate_point_count",
  "turn_index",
  "rule_triggered_recently",
  "combat_is_boss"
] as const;
const RULE_EDITOR_NUMERIC_FACTS = new Set<Fact>([
  "self_stress_pct",
  "self_resource_pct",
  "ally_min_stress_pct",
  "party_consumable_count",
  "enemy_count_alive",
  "fate_point_count",
  "turn_index"
]);
const RULE_EDITOR_BOOLEAN_FACTS = new Set<Fact>([
  "self_has_consequence",
  "enemy_is_elite",
  "rule_triggered_recently",
  "combat_is_boss"
]);

type TacticStyle = "aggressive" | "balanced" | "cautious";
type FacilityId = "infirmary" | "workshop";

interface FailureAssist {
  questId: string;
  questTitle: string;
  streak: number;
  style: TacticStyle;
  reason: string;
}

interface DiagnosisAction {
  key: string;
  action: "apply-diagnosis-preset" | "buy-item" | "craft-calibrator";
  label: string;
  value?: string;
}

interface RunDiagnosis {
  primaryReason: ReasonTag;
  reasons: ReasonTag[];
  notes: string[];
  actions: DiagnosisAction[];
}

interface RunAnalytics {
  scopeLabel: string;
  sampleSize: number;
  completed: number;
  retreated: number;
  failed: number;
  completionRate: number;
  retreatRate: number;
  failRate: number;
  avgProgressRate: number;
  avgRetainedGold: number;
  avgRetainedMaterials: number;
  topReasons: Array<{ tag: ReasonTag; count: number }>;
  primaryReason: ReasonTag | null;
  recommendStyle: TacticStyle | null;
}

interface LifetimeRunStats {
  totalRuns: number;
  archivedRuns: number;
  completed: number;
  retreated: number;
  failed: number;
  completionRate: number;
  retreatRate: number;
  failRate: number;
  avgProgressRate: number;
  avgRetainedGold: number;
  avgRetainedMaterials: number;
  topReasons: Array<{ tag: string; count: number }>;
}

interface ReplayMoment {
  seq: number;
  floor: number;
  eventType: EventType;
  outcome: "success" | "partial" | "failed";
  reasonTags: ReasonTag[];
  summary: string;
  ruleId: string | null;
}

interface LogTimelineMarker {
  seq: number;
  floor: number;
  eventType: EventType;
  outcome: RunEvent["outcome"];
  timeOffsetSec: number;
}

interface ActiveRunSnapshot {
  run: SaveData["runs"][number];
  progressRate: number;
  elapsedMs: number;
  remainingMs: number;
  durationMs: number;
  startedAt: number;
  finishAt: number;
  expectedFinishAt: number;
  runtimeSpeedMultiplier: ActiveRunSpeedMultiplier;
  paused: boolean;
  nextEvent: {
    event: RunEvent;
    etaMs: number;
  } | null;
}

interface RecoverySummary {
  stressRecovered: number;
  mentalRecovered: number;
  resourceRecovered: number;
  consequencesCleared: number;
}

interface WorkshopRecipeView {
  inputCount: number;
  goldCost: number;
  materialCost: number;
  outputCount: number;
  bonusText: string;
}

interface ReplaySwipeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface LogLongPressState {
  seq: number;
  eventType: EventType;
  reasonTag: ReasonTag | "all";
  startX: number;
  startY: number;
  timerId: number | null;
  fired: boolean;
}

interface LogSwipeState {
  seq: number;
  eventType: EventType;
  reasonTag: ReasonTag | "all";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface SkybridgeStormStep {
  seq: number;
  floor: number;
  outcome: RunEvent["outcome"];
  turn: number;
  stormCharge: number;
  burstCount: number;
  passChance: number | null;
  roll: number | null;
  hasAnchor: boolean | null;
  consumedAnchor: boolean;
  reasonTags: ReasonTag[];
}

interface SkybridgeStormTimeline {
  steps: SkybridgeStormStep[];
  maxCharge: number;
  burstSteps: number;
  highRiskSteps: number;
  anchorConsumed: number;
  anchorMissing: number;
}

function runtimeNow(): number {
  if (!HAS_MONOTONIC_CLOCK) return Date.now();
  return Math.floor(MONOTONIC_ORIGIN_MS + performance.now());
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deepCloneSave(source: SaveData): SaveData {
  return JSON.parse(JSON.stringify(source)) as SaveData;
}

function planDurationMs(plan: ActiveRunPlan): number {
  return Math.max(1000, plan.finishAt - plan.startedAt);
}

function planPauseCarryMs(plan: ActiveRunPlan, now = runtimeNow()): number {
  const currentPause = plan.pausedAt == null ? 0 : Math.max(0, now - plan.pausedAt);
  return Math.max(0, plan.pausedAccumMs) + currentPause;
}

function planElapsedMs(plan: ActiveRunPlan, now = runtimeNow()): number {
  const durationMs = planDurationMs(plan);
  const anchorNow = plan.pausedAt ?? now;
  const elapsed = anchorNow - plan.startedAt - Math.max(0, plan.pausedAccumMs);
  return clamp(elapsed, 0, durationMs);
}

function elapsedVisibleEventCount(plan: ActiveRunPlan, elapsedMs: number): number {
  const elapsedSec = Math.floor(Math.max(0, elapsedMs) / 1000);
  const nextIndex = plan.run.events.findIndex((event) => event.time_offset_sec > elapsedSec);
  return nextIndex < 0 ? plan.run.events.length : nextIndex;
}

function resolvedUnlockedEventCount(plan: ActiveRunPlan, elapsedMs: number): number {
  const elapsedCount = elapsedVisibleEventCount(plan, elapsedMs);
  const rawStoredCount = Number.isFinite(plan.unlockedEventCount) ? plan.unlockedEventCount : 0;
  const storedCount = clamp(Math.floor(rawStoredCount), 0, plan.run.events.length);
  return Math.max(storedCount, elapsedCount);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeRunForArchive(run: SaveData["runs"][number]): SaveData["runs"][number] {
  return cloneJson(run);
}

function archiveRunSummaryInPlace(summary: SaveData["archivedRunSummary"], run: SaveData["runs"][number]): void {
  const progressRate = Math.min(1, run.reachedFloor / Math.max(1, run.plannedFloor));
  summary.archivedRuns += 1;
  summary.progressRateSum += progressRate;
  summary.retainedGoldSum += run.retainedGold;
  summary.retainedMaterialsSum += run.retainedMaterials;

  if (run.status === "completed") summary.completed += 1;
  else if (run.status === "retreated") summary.retreated += 1;
  else if (run.status === "failed") summary.failed += 1;

  run.reasonTags.forEach((tag) => {
    summary.reasonTagCounts[tag] = (summary.reasonTagCounts[tag] ?? 0) + 1;
  });
}

function hasValidPostRunDelta(delta: unknown): delta is ActiveRunPlan["postRunDelta"] {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return false;
  const value = delta as Record<string, unknown>;

  if (
    typeof value.runCounter !== "number" ||
    !Number.isFinite(value.runCounter) ||
    value.runCounter < 0 ||
    typeof value.gold !== "number" ||
    !Number.isFinite(value.gold) ||
    value.gold < 0 ||
    typeof value.materials !== "number" ||
    !Number.isFinite(value.materials) ||
    value.materials < 0 ||
    typeof value.fatePoints !== "number" ||
    !Number.isFinite(value.fatePoints) ||
    value.fatePoints < 0
  ) {
    return false;
  }

  if (!value.meta || typeof value.meta !== "object" || Array.isArray(value.meta)) return false;
  const meta = value.meta as Record<string, unknown>;
  if (
    typeof meta.infirmaryLevel !== "number" ||
    !Number.isFinite(meta.infirmaryLevel) ||
    meta.infirmaryLevel < 1 ||
    typeof meta.workshopLevel !== "number" ||
    !Number.isFinite(meta.workshopLevel) ||
    meta.workshopLevel < 1 ||
    typeof meta.chapterUnlocked !== "number" ||
    !Number.isFinite(meta.chapterUnlocked) ||
    meta.chapterUnlocked < 1
  ) {
    return false;
  }

  if (typeof value.inventory !== "object" || value.inventory == null || Array.isArray(value.inventory)) return false;
  if (!Object.values(value.inventory as Record<string, unknown>).every((count) => typeof count === "number" && Number.isFinite(count) && count >= 0)) {
    return false;
  }

  if (!Array.isArray(value.characters)) return false;
  const charsOk = value.characters.every((character) => {
    if (!character || typeof character !== "object" || Array.isArray(character)) return false;
    const item = character as Record<string, unknown>;
    return (
      typeof item.uid === "string" &&
      typeof item.name === "string" &&
      (item.role === "tank" || item.role === "dps" || item.role === "support") &&
      typeof item.level === "number" &&
      typeof item.maxStress === "number" &&
      typeof item.maxResource === "number"
    );
  });
  if (!charsOk) return false;

  if (!Array.isArray(value.quests)) return false;
  const questsOk = value.quests.every((quest) => {
    if (!quest || typeof quest !== "object" || Array.isArray(quest)) return false;
    const item = quest as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      typeof item.dungeonId === "string" &&
      (item.status === "active" || item.status === "completed" || item.status === "locked") &&
      typeof item.targetFloor === "number"
    );
  });
  if (!questsOk) return false;

  return true;
}

function retimeRunForDuration(run: SaveData["runs"][number], startedAt: number, finishAt: number): SaveData["runs"][number] {
  const durationMs = Math.max(1000, finishAt - startedAt);
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const events = run.events.map((event, index, list) => {
    const offset = list.length <= 1 ? 0 : Math.round((index / (list.length - 1)) * totalSeconds);
    return {
      ...event,
      time_offset_sec: clamp(offset, 0, totalSeconds)
    };
  });

  return {
    ...run,
    startedAt,
    finishedAt: finishAt,
    events
  };
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}小时${minutes}分${seconds}秒`;
  }
  return `${minutes}分${seconds}秒`;
}

function timeScaleLabel(scale: ExpeditionTimeScale): string {
  return `${scale}x`;
}

function nextActiveRunSpeedMultiplier(multiplier: ActiveRunSpeedMultiplier): ActiveRunSpeedMultiplier | null {
  return ACTIVE_RUN_SPEED_OPTIONS.find((option) => option > multiplier) ?? null;
}

function computePlannedDurationMs(
  minMinutes: number,
  maxMinutes: number,
  seed: number,
  timeScale: ExpeditionTimeScale
): number {
  const min = Math.max(1, Math.floor(Math.min(minMinutes, maxMinutes)));
  const max = Math.max(min, Math.floor(Math.max(minMinutes, maxMinutes)));
  const span = max - min;
  const ratio = (Math.abs(seed) % 997) / 996;
  const minutes = min + Math.round(span * ratio);
  const baseDurationMs = Math.max(60_000, minutes * 60_000);
  return Math.max(10_000, Math.round(baseDurationMs / Math.max(1, timeScale)));
}

function getActiveRunSnapshot(now = runtimeNow()): ActiveRunSnapshot | null {
  const plan = save.activeRunPlan;
  if (!plan) return null;

  const durationMs = planDurationMs(plan);
  const elapsedMs = planElapsedMs(plan, now);
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  const expectedFinishAt = plan.finishAt + planPauseCarryMs(plan, now);
  const progressRate = clamp(elapsedMs / durationMs, 0, 1);
  const unlockedEventCount = resolvedUnlockedEventCount(plan, elapsedMs);
  const visibleEvents = plan.run.events.slice(0, unlockedEventCount);
  const nextEvent = plan.run.events[unlockedEventCount] ?? null;
  const fallbackEvents = visibleEvents.length > 0 ? visibleEvents : plan.run.events.slice(0, 1);
  const reachedFloor = fallbackEvents.reduce((max, event) => Math.max(max, event.floor), 1);
  const reasonTags = Array.from(new Set(fallbackEvents.flatMap((event) => event.reason_tags)));
  const running = progressRate < 1;
  const runStatus = running ? "running" : plan.run.status;

  return {
    run: {
      ...plan.run,
      status: runStatus,
      reachedFloor: running ? reachedFloor : plan.run.reachedFloor,
      retainedGold: running ? 0 : plan.run.retainedGold,
      retainedMaterials: running ? 0 : plan.run.retainedMaterials,
      reasonTags,
      events: fallbackEvents
    },
    progressRate,
    elapsedMs,
    remainingMs,
    durationMs,
    startedAt: plan.startedAt,
    finishAt: plan.finishAt,
    expectedFinishAt,
    runtimeSpeedMultiplier: plan.runtimeSpeedMultiplier,
    paused: plan.pausedAt != null,
    nextEvent:
      nextEvent == null
        ? null
        : {
            event: nextEvent,
            etaMs: Math.max(0, nextEvent.time_offset_sec * 1000 - elapsedMs)
          }
  };
}

function pickDefaultRunId(): string {
  const activeRun = getActiveRunSnapshot()?.run;
  return activeRun?.runId ?? save.runs[0]?.runId ?? "";
}

function initialEditorText(): string {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  return JSON.stringify(profile.config, null, 2);
}

let ui: UiState = {
  tab: "expedition",
  selectedDungeonId: DUNGEONS[0].id,
  plannedFloor: 4,
  selectedRunId: pickDefaultRunId(),
  replayIndex: 0,
  expandedLogSeq: 0,
  logView: save.settings.defaultLogView,
  logTypeFilter: "all",
  logReasonFilter: "all",
  logScrollTop: 0,
  logViewportHeight: 440,
  logVirtualRow: 0,
  logAutoFollow: true,
  logSmoothScroll: true,
  logQuickSeq: 0,
  logQuickType: "all",
  logQuickReason: "all",
  collapsedExpeditionPanels: [],
  tacticRuleEditorRuleId: "",
  tacticRuleEditorLeafIndex: 0,
  tacticRuleEditorFact: "self_stress_pct",
  tacticRuleEditorOp: "<=",
  tacticRuleEditorValue: "35",
  tacticRuleEditorError: "",
  editorText: initialEditorText(),
  editorErrors: [],
  importText: "",
  importErrors: [],
  banner: ""
};

let replaySwipeState: ReplaySwipeState | null = null;
let logLongPressState: LogLongPressState | null = null;
let logSwipeState: LogSwipeState | null = null;
let suppressLogToggleSeq = 0;
let programmaticLogScrollUntil = 0;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function asRecoverySummary(raw: unknown): RecoverySummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const stressRecovered = typeof record.stressRecovered === "number" ? Math.max(0, Math.floor(record.stressRecovered)) : 0;
  const mentalRecovered = typeof record.mentalRecovered === "number" ? Math.max(0, Math.floor(record.mentalRecovered)) : 0;
  const resourceRecovered = typeof record.resourceRecovered === "number" ? Math.max(0, Math.floor(record.resourceRecovered)) : 0;
  const consequencesCleared =
    typeof record.consequencesCleared === "number" ? Math.max(0, Math.floor(record.consequencesCleared)) : 0;

  if (stressRecovered <= 0 && mentalRecovered <= 0 && resourceRecovered <= 0 && consequencesCleared <= 0) return null;
  return { stressRecovered, mentalRecovered, resourceRecovered, consequencesCleared };
}

function logRowEstimateByView(logView: LogView): number {
  return logView === "debug" ? LOG_VIRTUAL_ROW_ESTIMATE_DEBUG : LOG_VIRTUAL_ROW_ESTIMATE_NARRATIVE;
}

function logVirtualRowByTop(scrollTop: number, logView: LogView): number {
  const rowEstimate = logRowEstimateByView(logView);
  return Math.max(0, Math.floor(Math.max(0, scrollTop) / rowEstimate));
}

function approximateLogScrollTopForSeq(run: SaveData["runs"][number] | null, seq: number, logView: LogView): number {
  if (!run || run.events.length === 0) return 0;
  const rowEstimate = logRowEstimateByView(logView);
  const index = run.events.findIndex((event) => event.seq === seq);
  if (index < 0) return 0;
  return Math.max(0, index * rowEstimate - rowEstimate * 2);
}

function isLogNearBottom(scrollTop: number, viewportHeight: number, scrollHeight: number): boolean {
  return scrollTop + viewportHeight >= scrollHeight - LOG_AUTO_FOLLOW_BOTTOM_GAP;
}

function clearLogLongPressTimer(): void {
  if (!logLongPressState || logLongPressState.timerId == null) return;
  window.clearTimeout(logLongPressState.timerId);
  logLongPressState.timerId = null;
}

function openLogQuickSheet(seq: number, eventType: EventType, reasonTag: ReasonTag | "all"): void {
  ui = {
    ...ui,
    tab: "expedition",
    logQuickSeq: seq,
    logQuickType: eventType,
    logQuickReason: reasonTag
  };
  render();
}

function closeLogQuickSheet(): void {
  if (ui.logQuickSeq === 0) return;
  ui = {
    ...ui,
    logQuickSeq: 0,
    logQuickType: "all",
    logQuickReason: "all"
  };
}

function parseLogEntryDataset(node: HTMLElement): { seq: number; eventType: EventType; reasonTag: ReasonTag | "all" } | null {
  const seq = Number(node.dataset.logSeq ?? "");
  if (!Number.isFinite(seq)) return null;
  const eventType = node.dataset.logType as EventType | undefined;
  if (!eventType) return null;
  const reasonTag = (node.dataset.logReason as ReasonTag | "all" | undefined) ?? "all";
  return {
    seq,
    eventType,
    reasonTag
  };
}

function findClosestReplayMomentIndex(replayMoments: ReplayMoment[], seq: number): number {
  if (replayMoments.length === 0) return -1;
  let bestIndex = 0;
  let bestDistance = Math.abs(replayMoments[0].seq - seq);
  for (let index = 1; index < replayMoments.length; index += 1) {
    const distance = Math.abs(replayMoments[index].seq - seq);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function renderLogQuickSheet(run: SaveData["runs"][number] | null, replayMoments: ReplayMoment[]): string {
  if (ui.logQuickSeq <= 0 || !run) return "";
  const event = run.events.find((item) => item.seq === ui.logQuickSeq);
  if (!event) return "";

  const primaryReason = event.reason_tags.length > 0 ? event.reason_tags[0] : null;
  const replayIndex = findClosestReplayMomentIndex(replayMoments, event.seq);
  const replayTarget = replayIndex >= 0 ? replayMoments[replayIndex] : null;

  return `
    <div class="quick-sheet-backdrop" data-action="close-log-quick-sheet" aria-hidden="true"></div>
    <section class="quick-sheet" role="dialog" aria-label="日志快捷操作">
      <div class="toolbar">
        <h3>日志快捷操作</h3>
        <span class="chip">#${event.seq}</span>
      </div>
      <p class="hint">${escapeHtml(summaryLine(event))}</p>
      <div class="touch-list compact">
        <div class="touch-item"><span>事件类型</span><strong>${eventTypeLabel(event.event_type)}</strong></div>
        <div class="touch-item"><span>原因标签</span><strong>${event.reason_tags.length > 0 ? escapeHtml(event.reason_tags.map(reasonText).join(" / ")) : "无"}</strong></div>
        <div class="touch-item"><span>回放定位</span><strong>${replayTarget ? `#${replayTarget.seq}` : "不可用"}</strong></div>
      </div>
      <div class="inline-buttons wrap">
        <button data-action="log-quick-expand">展开/收起详情</button>
        <button data-action="log-quick-filter-type" data-value="${event.event_type}">按类型筛选</button>
        <button data-action="log-quick-filter-reason" data-value="${primaryReason ?? ""}" ${primaryReason ? "" : "disabled"}>按原因筛选</button>
        <button data-action="log-quick-jump-replay" data-value="${event.seq}" ${replayTarget ? "" : "disabled"}>回放定位</button>
      </div>
      <button data-action="close-log-quick-sheet">关闭</button>
    </section>
  `;
}

function parseSkybridgeStormStep(event: RunEvent): SkybridgeStormStep | null {
  if (event.event_type !== "overcome_check") return null;
  if (!isRecord(event.payload)) return null;
  if (event.payload.check_type !== "skybridge_phase_storm") return null;

  const turn = Math.max(0, Math.floor(asFiniteNumber(event.payload.turn) ?? 0));
  const stormCharge = Math.max(0, Math.floor(asFiniteNumber(event.payload.storm_charge) ?? 0));
  const burstCount = Math.max(0, Math.floor(asFiniteNumber(event.payload.storm_burst_count) ?? 0));
  const passChance = asFiniteNumber(event.payload.pass_chance);
  const roll = asFiniteNumber(event.payload.roll);
  const hasAnchor = asBoolean(event.payload.has_anchor);
  const consumedAnchor = asBoolean(event.payload.consumed_anchor) ?? false;

  return {
    seq: event.seq,
    floor: event.floor,
    outcome: event.outcome,
    turn,
    stormCharge,
    burstCount,
    passChance,
    roll,
    hasAnchor,
    consumedAnchor,
    reasonTags: event.reason_tags
  };
}

function buildSkybridgeStormTimeline(run: SaveData["runs"][number] | null): SkybridgeStormTimeline | null {
  if (!run || run.dungeonId !== "aether_skybridge") return null;

  const steps = run.events
    .map((event) => parseSkybridgeStormStep(event))
    .filter((step): step is SkybridgeStormStep => step !== null);

  if (steps.length === 0) {
    return {
      steps: [],
      maxCharge: 0,
      burstSteps: 0,
      highRiskSteps: 0,
      anchorConsumed: 0,
      anchorMissing: 0
    };
  }

  const maxCharge = steps.reduce((max, step) => Math.max(max, step.stormCharge), 0);
  const burstSteps = steps.filter((step) => step.outcome !== "success").length;
  const highRiskSteps = steps.filter((step) => step.stormCharge >= 6 || step.outcome !== "success").length;
  const anchorConsumed = steps.filter((step) => step.consumedAnchor).length;
  const anchorMissing = steps.filter((step) => step.hasAnchor === false).length;

  return {
    steps,
    maxCharge,
    burstSteps,
    highRiskSteps,
    anchorConsumed,
    anchorMissing
  };
}

function currentWindowLabel(): "白昼" | "夜幕" {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "白昼" : "夜幕";
}

function runStatusLabel(status: SaveData["runs"][number]["status"]): string {
  return labelRunStatus(status);
}

function runStatusLabelFromUnknown(status: unknown): string {
  return labelRunStatusUnknown(status);
}

function questStatusLabel(status: SaveData["quests"][number]["status"]): string {
  return labelQuestStatus(status);
}

function roleLabel(role: SaveData["characters"][number]["role"]): string {
  return labelRole(role);
}

function eventTypeLabel(eventType: EventType): string {
  return labelEventType(eventType);
}

function outcomeLabel(outcome: RunEvent["outcome"]): string {
  return labelOutcome(outcome);
}

function combatActionLabel(action: unknown): string {
  return labelAction(action);
}

function requiredChapterForDungeon(dungeonId: string): number {
  return DUNGEON_CHAPTER_REQUIREMENTS[dungeonId] ?? 1;
}

function isDungeonUnlocked(dungeonId: string): boolean {
  return save.meta.chapterUnlocked >= requiredChapterForDungeon(dungeonId);
}

function firstUnlockedDungeonId(): string {
  const first = DUNGEONS.find((dungeon) => isDungeonUnlocked(dungeon.id));
  return first?.id ?? DUNGEONS[0].id;
}

function facilityLabel(id: FacilityId): string {
  return id === "infirmary" ? "疗养所" : "工坊";
}

function getFacilityLevel(id: FacilityId): number {
  if (id === "infirmary") return Math.max(1, Math.min(FACILITY_MAX_LEVEL, Math.floor(save.meta.infirmaryLevel)));
  return Math.max(1, Math.min(FACILITY_MAX_LEVEL, Math.floor(save.meta.workshopLevel)));
}

function getNextFacilityUpgradeCost(id: FacilityId): { gold: number; materials: number } | null {
  const level = getFacilityLevel(id);
  if (level >= FACILITY_MAX_LEVEL) return null;
  const costs = FACILITY_UPGRADE_COSTS[id];
  return costs[level - 1] ?? null;
}

function getWorkshopRecipeView(): WorkshopRecipeView {
  const level = getFacilityLevel("workshop");
  const tier = Math.max(1, Math.min(FACILITY_MAX_LEVEL, level));
  const inputCount = Math.max(4, REFORGE_RECIPE.inputCount - (tier - 1));
  const goldCost = Math.max(30, REFORGE_RECIPE.goldCost - (tier - 1) * 15);
  const materialCost = Math.max(10, REFORGE_RECIPE.materialCost - (tier - 1) * 6);
  const outputCount = REFORGE_RECIPE.outputCount + (tier >= 3 ? 1 : 0);

  return {
    inputCount,
    goldCost,
    materialCost,
    outputCount,
    bonusText:
      tier >= 3 ? "成本降低并额外产出 +1" : tier === 2 ? "成本降低（碎晶/金币/材料）" : "基础配方（无加成）"
  };
}

function getNextChapterUnlockPlan() {
  return CHAPTER_UNLOCK_PLANS.find((plan) => plan.chapter === save.meta.chapterUnlocked + 1) ?? null;
}

function chapterRequirementQuestTitle(questId: string): string {
  return (
    getQuestContentById(questId)?.title ??
    save.quests.find((quest) => quest.id === questId)?.title ??
    questId
  );
}

function getChapterUnlockIssues(
  plan: NonNullable<ReturnType<typeof getNextChapterUnlockPlan>>
): string[] {
  const issues: string[] = [];

  if (getFacilityLevel("infirmary") < plan.requireInfirmary) {
    issues.push(`疗养所需达到 Lv.${plan.requireInfirmary}`);
  }
  if (getFacilityLevel("workshop") < plan.requireWorkshop) {
    issues.push(`工坊需达到 Lv.${plan.requireWorkshop}`);
  }
  const quest = save.quests.find((item) => item.id === plan.requireQuestId);
  if (!quest || quest.status !== "completed") {
    issues.push(`需完成委托「${chapterRequirementQuestTitle(plan.requireQuestId)}」`);
  }

  if (save.gold < plan.gold) {
    issues.push(`金币不足（需要 ${plan.gold}）`);
  }
  if (save.materials < plan.materials) {
    issues.push(`材料不足（需要 ${plan.materials}）`);
  }

  return issues;
}

function setBanner(text: string): void {
  ui = { ...ui, banner: text };
}

function getDungeon() {
  return DUNGEONS.find((dungeon) => dungeon.id === ui.selectedDungeonId) ?? DUNGEONS[0];
}

function clampPlannedFloor(value: number): number {
  const dungeon = getDungeon();
  return clamp(value, 1, dungeon.maxFloor);
}

function getSelectedRun() {
  const activeRun = getActiveRunSnapshot()?.run ?? null;
  if (!ui.selectedRunId) return activeRun ?? save.runs[0] ?? null;
  if (activeRun && ui.selectedRunId === activeRun.runId) return activeRun;
  return save.runs.find((run) => run.runId === ui.selectedRunId) ?? activeRun ?? save.runs[0] ?? null;
}

function summarizeReasonCounts(tags: ReasonTag[]): string {
  if (tags.length === 0) return "无";
  const counts = new Map<ReasonTag, number>();
  tags.forEach((tag) => {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([tag, count]) => `${reasonText(tag)} x${count}`)
    .join(" / ");
}

function percentText(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function toDebugPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (save.settings.advancedDebugView) return payload;
  if (!("rule_id" in payload)) return payload;

  const sanitized = { ...payload };
  delete sanitized.rule_id;
  return sanitized;
}

function chapterLabelForEvent(event: RunEvent): string {
  if (event.event_type === "run_start") return "启程";
  if (event.event_type === "retreat_triggered") return "撤退判定";
  if (event.event_type === "run_end") return "结算";
  if (event.event_type === "gate_blocked") return "机关阻断";
  if (event.event_type === "combat_start" || event.event_type === "combat_end") return "战斗段";
  return `第 ${event.floor} 层`;
}

interface EventDetailFact {
  label: string;
  value: string;
}

function formatEventOffset(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remain = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function formatPayloadPercent(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function buildEventDetailFacts(event: RunEvent): EventDetailFact[] {
  const payload = event.payload;
  const facts: EventDetailFact[] = [
    { label: "时间", value: `T+${formatEventOffset(event.time_offset_sec)}` },
    { label: "节点", value: event.node_id },
    { label: "结果", value: outcomeLabel(event.outcome) }
  ];

  if (event.reason_tags.length > 0) {
    facts.push({ label: "标签", value: event.reason_tags.map(reasonText).join(" / ") });
  }
  if (typeof payload.scene_aspect === "string" && payload.scene_aspect.length > 0) {
    facts.push({ label: "场景", value: payload.scene_aspect });
  }
  if (typeof payload.check_type === "string" && payload.check_type.length > 0) {
    facts.push({ label: "判定", value: payload.check_type });
  }
  if (typeof payload.rule_id === "string" && payload.rule_id.length > 0 && payload.rule_id !== "none") {
    facts.push({ label: "命中规则", value: payload.rule_id });
  }
  if (typeof payload.actor_name === "string" && payload.actor_name.length > 0) {
    facts.push({ label: "行动者", value: payload.actor_name });
  }
  if (typeof payload.action === "string" && payload.action.length > 0) {
    facts.push({ label: "动作", value: combatActionLabel(payload.action) });
  }
  if (typeof payload.target_name === "string" && payload.target_name.length > 0) {
    facts.push({ label: "目标", value: payload.target_name });
  }
  if (typeof payload.enemy_hp === "number" && Number.isFinite(payload.enemy_hp)) {
    facts.push({ label: "敌方HP", value: `${Math.max(0, Math.floor(payload.enemy_hp))}` });
  }
  if (typeof payload.enemy_hp_before === "number" && Number.isFinite(payload.enemy_hp_before)) {
    facts.push({ label: "敌前HP", value: `${Math.max(0, Math.floor(payload.enemy_hp_before))}` });
  }
  if (typeof payload.value === "number" && Number.isFinite(payload.value) && event.event_type === "combat_action") {
    facts.push({ label: "效果值", value: `${Math.floor(payload.value)}` });
  }
  if (typeof payload.pass_chance === "number" && Number.isFinite(payload.pass_chance)) {
    facts.push({ label: "通过率", value: formatPayloadPercent(payload.pass_chance) });
  }
  if (typeof payload.roll === "number" && Number.isFinite(payload.roll)) {
    facts.push({ label: "掷值", value: formatPayloadPercent(payload.roll) });
  }
  if (typeof payload.reward_gold === "number" || typeof payload.reward_materials === "number") {
    const gold = typeof payload.reward_gold === "number" && Number.isFinite(payload.reward_gold) ? Math.floor(payload.reward_gold) : 0;
    const materials =
      typeof payload.reward_materials === "number" && Number.isFinite(payload.reward_materials) ? Math.floor(payload.reward_materials) : 0;
    facts.push({ label: "层奖励", value: `+${gold}G / +${materials}M` });
  }
  if (typeof payload.item_id === "string" && payload.item_id.length > 0) {
    const item = getItemContentById(payload.item_id);
    const quantity =
      typeof payload.quantity === "number" && Number.isFinite(payload.quantity) ? Math.max(1, Math.floor(payload.quantity)) : 1;
    facts.push({ label: "掉落", value: `${item?.name ?? payload.item_id} x${quantity}` });
  }
  if (typeof payload.retained_gold === "number" || typeof payload.retained_materials === "number") {
    const gold =
      typeof payload.retained_gold === "number" && Number.isFinite(payload.retained_gold) ? Math.floor(payload.retained_gold) : 0;
    const materials =
      typeof payload.retained_materials === "number" && Number.isFinite(payload.retained_materials) ? Math.floor(payload.retained_materials) : 0;
    facts.push({ label: "返航收益", value: `+${gold}G / +${materials}M` });
  }
  if (typeof payload.expected === "string" || typeof payload.current === "string") {
    const expected = typeof payload.expected === "string" ? payload.expected : "--";
    const current = typeof payload.current === "string" ? payload.current : "--";
    facts.push({ label: "时段", value: `${current} / 目标 ${expected}` });
  }
  if (typeof payload.bonus_materials === "number" && Number.isFinite(payload.bonus_materials)) {
    facts.push({ label: "加成材料", value: `+${Math.floor(payload.bonus_materials)}M` });
  }
  if (typeof payload.penalty_gold === "number" && Number.isFinite(payload.penalty_gold)) {
    facts.push({ label: "损失金币", value: `-${Math.floor(payload.penalty_gold)}G` });
  }
  if (typeof payload.stress_loss === "number" && Number.isFinite(payload.stress_loss)) {
    facts.push({ label: "体力损失", value: `${Math.floor(payload.stress_loss)}` });
  }
  if (Array.isArray(payload.impacted) && payload.impacted.length > 0) {
    facts.push({ label: "波及队员", value: `${payload.impacted.length} 人` });
  }

  if (event.event_type === "quest_progress") {
    const updates = Array.isArray(payload.quest_updates) ? payload.quest_updates.filter((item) => item && typeof item === "object") : [];
    if (updates.length > 0) {
      const completed = updates.filter((item) => (item as Record<string, unknown>).status === "completed").length;
      facts.push({ label: "任务进度", value: `${completed}/${updates.length} 已完成` });
    }
    const completedQuestIds = Array.isArray(payload.completed_quests)
      ? payload.completed_quests.filter((item): item is string => typeof item === "string")
      : [];
    if (completedQuestIds.length > 0) {
      facts.push({ label: "新完成任务", value: `${completedQuestIds.length} 个` });
    }
    const rewards = Array.isArray(payload.granted_rewards) ? payload.granted_rewards.filter((item) => item && typeof item === "object") : [];
    if (rewards.length > 0) {
      const rewardGold = rewards.reduce((sum, reward) => {
        const gold = (reward as Record<string, unknown>).gold;
        return sum + (typeof gold === "number" && Number.isFinite(gold) ? Math.floor(gold) : 0);
      }, 0);
      const rewardMaterials = rewards.reduce((sum, reward) => {
        const materials = (reward as Record<string, unknown>).materials;
        return sum + (typeof materials === "number" && Number.isFinite(materials) ? Math.floor(materials) : 0);
      }, 0);
      facts.push({ label: "任务奖励", value: `+${rewardGold}G / +${rewardMaterials}M` });
    }
  }

  return facts.slice(0, 9);
}

function renderEventDetailContent(event: RunEvent, logView: LogView): string {
  const detailFacts = buildEventDetailFacts(event)
    .map((fact) => `<div class="log-detail-item"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></div>`)
    .join("");
  if (logView === "narrative") {
    return `<p>${escapeHtml(toNarrative(event))}</p>${detailFacts.length > 0 ? `<div class="log-detail-grid">${detailFacts}</div>` : ""}`;
  }
  return `${detailFacts.length > 0 ? `<div class="log-detail-grid">${detailFacts}</div>` : ""}<pre>${escapeHtml(
    JSON.stringify(
      {
        seq: event.seq,
        type: event.event_type,
        floor: event.floor,
        outcome: event.outcome,
        reason_tags: event.reason_tags,
        payload: toDebugPayload(event.payload)
      },
      null,
      2
    )
  )}</pre>`;
}

function filterRunEvents(
  run: SaveData["runs"][number] | null,
  eventTypeFilter: EventType | "all",
  reasonFilter: ReasonTag | "all"
): RunEvent[] {
  if (!run) return [];
  return run.events.filter((event) => {
    const eventTypePass = eventTypeFilter === "all" || event.event_type === eventTypeFilter;
    const reasonPass = reasonFilter === "all" || event.reason_tags.includes(reasonFilter);
    return eventTypePass && reasonPass;
  });
}

function buildLogTimelineMarkers(events: RunEvent[]): LogTimelineMarker[] {
  if (events.length === 0) return [];

  const markers = events.filter((event) => {
    if (event.outcome !== "success") return true;
    if (event.event_type === "run_start" || event.event_type === "run_end") return true;
    if (event.event_type === "combat_start" || event.event_type === "combat_end") return true;
    if (event.event_type === "overcome_check") return true;
    if (event.event_type === "retreat_triggered" || event.event_type === "gate_blocked") return true;
    if (event.event_type === "quest_progress") return true;
    return false;
  });
  if (markers.length === 0) return [];

  const sampled =
    markers.length <= LOG_TIMELINE_MARKER_MAX
      ? markers
      : (() => {
          const stride = Math.ceil(markers.length / LOG_TIMELINE_MARKER_MAX);
          const coarse = markers.filter((_, index) => index % stride === 0);
          const tail = markers[markers.length - 1];
          if (coarse.length === 0 || coarse[coarse.length - 1].seq !== tail.seq) {
            coarse.push(tail);
          }
          if (coarse.length <= LOG_TIMELINE_MARKER_MAX) return coarse;
          return [...coarse.slice(0, LOG_TIMELINE_MARKER_MAX - 1), tail];
        })();

  return sampled.map((event) => ({
    seq: event.seq,
    floor: event.floor,
    eventType: event.event_type,
    outcome: event.outcome,
    timeOffsetSec: event.time_offset_sec
  }));
}

function findNextSeqByEventType(events: RunEvent[], eventType: EventType, currentSeq: number): number | null {
  if (events.length === 0) return null;
  const currentIndex = currentSeq > 0 ? events.findIndex((event) => event.seq === currentSeq) : -1;
  if (currentIndex < 0) {
    const first = events.find((event) => event.event_type === eventType);
    return first?.seq ?? null;
  }
  for (let index = currentIndex + 1; index < events.length; index += 1) {
    if (events[index].event_type === eventType) return events[index].seq;
  }
  for (let index = 0; index <= currentIndex; index += 1) {
    if (events[index].event_type === eventType) return events[index].seq;
  }
  return null;
}

function summaryLine(event: RunEvent): string {
  if (event.event_type === "combat_action") {
    return `${String(event.payload.actor_name ?? "队员")} · ${combatActionLabel(event.payload.action)} · ${outcomeLabel(event.outcome)}`;
  }
  if (event.event_type === "overcome_check") {
    const checkType = String(event.payload.check_type ?? "");
    if (checkType === "skybridge_convoy") {
      return `空桥护航校核 · ${outcomeLabel(event.outcome)}`;
    }
    if (checkType === "skybridge_fall_risk") {
      return `空桥坠落风险判定 · ${outcomeLabel(event.outcome)}`;
    }
    if (checkType === "skybridge_phase_storm") {
      return `相位风暴压制判定 · ${outcomeLabel(event.outcome)}`;
    }
    return `机关处理 · ${outcomeLabel(event.outcome)}`;
  }
  if (event.event_type === "run_end") {
    const recovery = asRecoverySummary(event.payload.recovery);
    const recoveryText = recovery
      ? ` · 恢复 体力+${recovery.stressRecovered} 心智+${recovery.mentalRecovered} 资源+${recovery.resourceRecovered}`
      : "";
    return `出征${runStatusLabelFromUnknown(event.payload.status)} · +${String(event.payload.retained_gold ?? 0)}G +${String(event.payload.retained_materials ?? 0)}M${recoveryText}`;
  }
  return toNarrative(event);
}

function getRunRecovery(run: SaveData["runs"][number] | null): RecoverySummary | null {
  if (!run) return null;
  const endEvent = [...run.events].reverse().find((event) => event.event_type === "run_end");
  if (!endEvent) return null;
  return asRecoverySummary(endEvent.payload.recovery);
}

function styleLabel(style: TacticStyle): string {
  return labelTacticStyle(style);
}

function profileStyleLabel(style: SaveData["tacticsProfiles"][number]["style"]): string {
  return labelTacticStyle(style);
}

function resolvePrimaryReason(runTags: readonly ReasonTag[]): ReasonTag {
  if (runTags.length === 0) return "retreat_resource_threshold";
  const counts = new Map<ReasonTag, number>();
  runTags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function reasonText(reason: ReasonTag): string {
  return labelReason(reason);
}

function recommendStyleByReason(reason: ReasonTag): TacticStyle {
  if (reason === "enemy_overwhelm" || reason === "retreat_hp_threshold") {
    return "cautious";
  }

  if (reason === "ext.skybridge_fall_risk") {
    return "cautious";
  }

  if (reason === "ext.skybridge_phase_storm") {
    return "cautious";
  }

  if (reason === "ext.skybridge_convoy_delay") {
    return "balanced";
  }

  if (reason === "ext.skybridge_anchor_failure") {
    return "balanced";
  }

  if (reason === "retreat_resource_threshold" || reason === "tactic_no_valid_action") {
    return "balanced";
  }

  return "balanced";
}

function getFailureAssistForDungeon(dungeonId: string): FailureAssist | null {
  const quest = save.quests.find((item) => item.dungeonId === dungeonId && item.status === "active");
  if (!quest) return null;

  const claimedCount = save.hintClaims[quest.id] ?? 0;
  if (claimedCount > 0) return null;

  let streak = 0;
  let latestFailedRun: SaveData["runs"][number] | null = null;

  for (const run of save.runs) {
    if (run.dungeonId !== quest.dungeonId) continue;

    const questSolved = run.status === "completed" && run.reachedFloor >= quest.targetFloor;
    if (questSolved) break;

    const questFailed = run.status === "failed" || run.status === "retreated" || run.reachedFloor < quest.targetFloor;
    if (!questFailed) break;

    streak += 1;
    if (!latestFailedRun) {
      latestFailedRun = run;
    }
  }

  if (streak < 3 || !latestFailedRun) return null;

  const primaryReason = resolvePrimaryReason(latestFailedRun.reasonTags);
  const style = recommendStyleByReason(primaryReason);

  return {
    questId: quest.id,
    questTitle: quest.title,
    streak,
    style,
    reason: reasonText(primaryReason)
  };
}

function pushDiagnosisAction(actions: DiagnosisAction[], action: DiagnosisAction): void {
  if (actions.some((item) => item.key === action.key)) return;
  actions.push(action);
}

function getRunDiagnosis(run: SaveData["runs"][number] | null, dungeonId: string): RunDiagnosis | null {
  if (!run) return null;
  if (run.status === "completed") return null;
  if (run.reasonTags.length === 0) return null;

  const dungeon = DUNGEONS.find((item) => item.id === dungeonId) ?? DUNGEONS[0];
  const primaryReason = resolvePrimaryReason(run.reasonTags);
  const reasons: ReasonTag[] = [primaryReason];
  const seenReasons = new Set<ReasonTag>([primaryReason]);
  run.reasonTags.forEach((tag) => {
    if (seenReasons.has(tag)) return;
    seenReasons.add(tag);
    reasons.push(tag);
  });
  const notes: string[] = [];
  const actions: DiagnosisAction[] = [];

  reasons.forEach((reason) => {
    if (reason === "missing_key_item") {
      const calibratorCount = save.inventory[REFORGE_RECIPE.outputItem] ?? 0;
      const outputName = INVENTORY_CATALOG[REFORGE_RECIPE.outputItem]?.name ?? REFORGE_RECIPE.outputItem;
      notes.push(`关键道具不足。当前 ${outputName} 库存：x${calibratorCount}。`);
      pushDiagnosisAction(actions, {
        key: "buy-phase-calibrator",
        action: "buy-item",
        value: REFORGE_RECIPE.outputItem,
        label: `购买 ${outputName}`
      });
      pushDiagnosisAction(actions, {
        key: "craft-phase-calibrator",
        action: "craft-calibrator",
        label: "工坊重铸校准器"
      });
    }

    if (reason === "enemy_overwhelm" || reason === "retreat_hp_threshold") {
      notes.push("战斗压力偏高，先降低冒进频率，优先保证生存。");
      pushDiagnosisAction(actions, {
        key: "preset-cautious",
        action: "apply-diagnosis-preset",
        value: "cautious",
        label: "套用谨慎模板"
      });
      pushDiagnosisAction(actions, {
        key: "buy-potion-small",
        action: "buy-item",
        value: "potion_small",
        label: "补充应急药剂"
      });
    }

    if (reason === "retreat_resource_threshold" || reason === "tactic_no_valid_action") {
      notes.push("资源阈值或规则冲突触发撤退，先回到均衡模板稳定循环。");
      pushDiagnosisAction(actions, {
        key: "preset-balanced",
        action: "apply-diagnosis-preset",
        value: "balanced",
        label: "套用均衡模板"
      });
      pushDiagnosisAction(actions, {
        key: "buy-remedy-kit",
        action: "buy-item",
        value: "remedy_kit",
        label: "补充净化包"
      });
    }

    if (reason === "time_window_missed") {
      const favoredWindow = dungeon.favoredTimeWindow === "day" ? "白昼" : "夜幕";
      notes.push(`时段条件不匹配。该迷宫偏好 ${favoredWindow}，建议对应时段再出征。`);
    }

    if (reason === "missing_required_aspect" || reason === "path_blocked") {
      notes.push("环境处理不足，建议降低目标层并确保 Overcome/Use Item 规则可触发。");
      pushDiagnosisAction(actions, {
        key: "preset-balanced-env",
        action: "apply-diagnosis-preset",
        value: "balanced",
        label: "切换到均衡模板（机关优先）"
      });
    }

    if (reason === "ext.skybridge_convoy_delay") {
      notes.push("护航队列在乱流中失稳，建议优先携带 Create Advantage/Overcome 动作并降低目标层。");
      pushDiagnosisAction(actions, {
        key: "preset-balanced-skybridge",
        action: "apply-diagnosis-preset",
        value: "balanced",
        label: "套用均衡模板（护航）"
      });
    }

    if (reason === "ext.skybridge_fall_risk") {
      notes.push("空桥高层坠落风险偏高，建议切换谨慎模板并补充恢复道具再尝试。");
      pushDiagnosisAction(actions, {
        key: "preset-cautious-skybridge",
        action: "apply-diagnosis-preset",
        value: "cautious",
        label: "套用谨慎模板（防坠）"
      });
      pushDiagnosisAction(actions, {
        key: "buy-remedy-kit-skybridge",
        action: "buy-item",
        value: "remedy_kit",
        label: "补充净化包"
      });
    }

    if (reason === "ext.skybridge_phase_storm") {
      notes.push("首领阶段会触发相位风暴，建议提高防御/优势动作占比，避免在高压回合硬拼输出。");
      pushDiagnosisAction(actions, {
        key: "preset-cautious-phase-storm",
        action: "apply-diagnosis-preset",
        value: "cautious",
        label: "套用谨慎模板（风暴）"
      });
    }

    if (reason === "ext.skybridge_anchor_failure") {
      notes.push("风暴锚片不足会放大首领阶段风险。先补充锚片库存，再挑战天穹桥域高层。");
      pushDiagnosisAction(actions, {
        key: "preset-balanced-anchor",
        action: "apply-diagnosis-preset",
        value: "balanced",
        label: "套用均衡模板（锚片）"
      });
    }
  });

  return {
    primaryReason,
    reasons,
    notes: Array.from(new Set(notes)),
    actions
  };
}

function buildRunAnalytics(dungeonId: string, limit = 20): RunAnalytics | null {
  const dungeonRuns = save.runs.filter((run) => run.dungeonId === dungeonId).slice(0, limit);
  const runs = dungeonRuns.length > 0 ? dungeonRuns : save.runs.slice(0, limit);
  if (runs.length === 0) return null;

  let completed = 0;
  let retreated = 0;
  let failed = 0;
  let progressSum = 0;
  let retainedGoldSum = 0;
  let retainedMaterialsSum = 0;
  const reasonCounts = new Map<ReasonTag, number>();
  const primaryCounts = new Map<ReasonTag, number>();

  runs.forEach((run) => {
    if (run.status === "completed") completed += 1;
    else if (run.status === "retreated") retreated += 1;
    else if (run.status === "failed") failed += 1;

    progressSum += Math.min(1, run.reachedFloor / Math.max(1, run.plannedFloor));
    retainedGoldSum += run.retainedGold;
    retainedMaterialsSum += run.retainedMaterials;

    run.reasonTags.forEach((tag) => {
      reasonCounts.set(tag, (reasonCounts.get(tag) ?? 0) + 1);
    });

    if (run.reasonTags.length > 0) {
      const primary = resolvePrimaryReason(run.reasonTags);
      primaryCounts.set(primary, (primaryCounts.get(primary) ?? 0) + 1);
    }
  });

  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count }));

  const primaryReason = [...primaryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const recommendStyle = primaryReason ? recommendStyleByReason(primaryReason) : null;

  return {
    scopeLabel: dungeonRuns.length > 0 ? `当前迷宫近 ${runs.length} 次` : `全局近 ${runs.length} 次`,
    sampleSize: runs.length,
    completed,
    retreated,
    failed,
    completionRate: completed / runs.length,
    retreatRate: retreated / runs.length,
    failRate: failed / runs.length,
    avgProgressRate: progressSum / runs.length,
    avgRetainedGold: retainedGoldSum / runs.length,
    avgRetainedMaterials: retainedMaterialsSum / runs.length,
    topReasons,
    primaryReason,
    recommendStyle
  };
}

function buildLifetimeRunStats(): LifetimeRunStats | null {
  const liveRuns = save.runs;
  const archived = save.archivedRunSummary;
  const totalRuns = liveRuns.length + archived.archivedRuns;
  if (totalRuns <= 0) return null;

  let liveCompleted = 0;
  let liveRetreated = 0;
  let liveFailed = 0;
  let liveProgressRateSum = 0;
  let liveRetainedGoldSum = 0;
  let liveRetainedMaterialsSum = 0;
  const reasonCounts = new Map<string, number>();

  liveRuns.forEach((run) => {
    if (run.status === "completed") liveCompleted += 1;
    else if (run.status === "retreated") liveRetreated += 1;
    else if (run.status === "failed") liveFailed += 1;

    liveProgressRateSum += Math.min(1, run.reachedFloor / Math.max(1, run.plannedFloor));
    liveRetainedGoldSum += run.retainedGold;
    liveRetainedMaterialsSum += run.retainedMaterials;
    run.reasonTags.forEach((tag) => reasonCounts.set(tag, (reasonCounts.get(tag) ?? 0) + 1));
  });

  Object.entries(archived.reasonTagCounts).forEach(([tag, count]) => {
    if (!Number.isFinite(count) || count <= 0) return;
    reasonCounts.set(tag, (reasonCounts.get(tag) ?? 0) + count);
  });

  const completed = liveCompleted + archived.completed;
  const retreated = liveRetreated + archived.retreated;
  const failed = liveFailed + archived.failed;
  const progressRateSum = liveProgressRateSum + archived.progressRateSum;
  const retainedGoldSum = liveRetainedGoldSum + archived.retainedGoldSum;
  const retainedMaterialsSum = liveRetainedMaterialsSum + archived.retainedMaterialsSum;

  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalRuns,
    archivedRuns: archived.archivedRuns,
    completed,
    retreated,
    failed,
    completionRate: completed / totalRuns,
    retreatRate: retreated / totalRuns,
    failRate: failed / totalRuns,
    avgProgressRate: progressRateSum / totalRuns,
    avgRetainedGold: retainedGoldSum / totalRuns,
    avgRetainedMaterials: retainedMaterialsSum / totalRuns,
    topReasons
  };
}

function buildReplayMoments(run: SaveData["runs"][number] | null): ReplayMoment[] {
  if (!run) return [];
  if (run.events.length === 0) return [];

  const markers = new Set<EventType>([
    "run_start",
    "combat_start",
    "combat_end",
    "gate_blocked",
    "retreat_triggered",
    "quest_progress",
    "run_end"
  ]);

  const moments: ReplayMoment[] = [];
  run.events.forEach((event) => {
    const isSkybridgeStormStep = parseSkybridgeStormStep(event) !== null;
    const shouldInclude =
      markers.has(event.event_type) ||
      isSkybridgeStormStep ||
      event.outcome === "failed" ||
      (event.outcome === "partial" && event.event_type !== "combat_action");
    if (!shouldInclude) return;

    moments.push({
      seq: event.seq,
      floor: event.floor,
      eventType: event.event_type,
      outcome: event.outcome,
      reasonTags: event.reason_tags,
      summary: toNarrative(event),
      ruleId: typeof event.payload.rule_id === "string" ? event.payload.rule_id : null
    });
  });

  if (moments.length === 0) return [];

  const deduped = moments.filter((item, index, arr) => {
    if (index === 0) return true;
    return item.seq !== arr[index - 1].seq;
  });

  if (deduped.length <= 12) return deduped;
  return [...deduped.slice(0, 11), deduped[deduped.length - 1]];
}

function clampReplayIndex(index: number, size: number): number {
  if (size <= 0) return 0;
  return Math.max(0, Math.min(size - 1, index));
}

function isOnboardingComplete(): boolean {
  return (
    save.onboarding.openedPartyTab &&
    save.onboarding.appliedPreset &&
    save.onboarding.startedRun &&
    save.onboarding.viewedDebugLog
  );
}

function markOnboardingStep(step: keyof SaveData["onboarding"]): void {
  if (save.onboarding[step]) return;

  save.onboarding = {
    ...save.onboarding,
    [step]: true
  };

  if (isOnboardingComplete() && save.settings.showOnboardingCard) {
    save.settings = {
      ...save.settings,
      showOnboardingCard: false
    };
    setBanner("新手引导已完成，后续可在设置中重新开启。");
  }

  persistSave(save);
}

function renderOnboardingCard(): string {
  if (!save.settings.showOnboardingCard) return "";

  const steps: Array<{
    key: keyof SaveData["onboarding"];
    title: string;
    action: string;
    buttonLabel: string;
  }> = [
    { key: "openedPartyTab", title: "打开队伍页查看当前编组", action: "guide-open-party", buttonLabel: "前往队伍" },
    { key: "appliedPreset", title: "应用一次战术模板（自动调参）", action: "guide-apply-balanced", buttonLabel: "套用均衡模板" },
    { key: "startedRun", title: "发起一次出征并完成结算", action: "guide-start-run", buttonLabel: "立即派遣" },
    { key: "viewedDebugLog", title: "切换到日志调试视图进行复盘", action: "guide-open-debug-log", buttonLabel: "打开调试视图" }
  ];

  const doneCount = steps.filter((step) => save.onboarding[step.key]).length;
  const allDone = doneCount === steps.length;

  return `<article class="panel">
      <div class="toolbar">
        <h3>新手引导</h3>
        <span class="chip">${doneCount}/${steps.length}</span>
      </div>
      <ul class="touch-list compact">
        ${steps
          .map((step) => {
            const done = save.onboarding[step.key];
            return `<li class="touch-item">
                <div class="row">
                  <strong>${done ? "已完成" : "待完成"}</strong>
                  <span>${escapeHtml(step.title)}</span>
                </div>
                <button data-action="${step.action}" ${done ? "disabled" : ""}>${done ? "已完成" : escapeHtml(step.buttonLabel)}</button>
              </li>`;
          })
          .join("")}
      </ul>
      <div class="inline-buttons">
        <button data-action="dismiss-onboarding">${allDone ? "关闭引导卡" : "暂时隐藏"}</button>
      </div>
    </article>`;
}

function getNotificationPermissionLabel(): string {
  if (typeof Notification === "undefined") return "当前浏览器不支持";
  if (Notification.permission === "granted") return "已授权";
  if (Notification.permission === "denied") return "已拒绝";
  return "未请求";
}

async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") {
    setBanner("当前浏览器不支持系统通知。");
    render();
    return;
  }

  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      setBanner("通知授权成功，后续可在出征完成后收到提醒。");
    } else if (result === "denied") {
      setBanner("通知权限已拒绝，可在浏览器设置中重新开启。");
    } else {
      setBanner("通知权限暂未授予。");
    }
  } catch {
    setBanner("通知权限请求失败，请检查浏览器策略。");
  }
  render();
}

function notifyRunComplete(run: SaveData["runs"][number]): void {
  if (!save.settings.notifyOnRunComplete) return;
  if (save.settings.notifyFailOnly && run.status === "completed") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const title = run.status === "completed" ? "Skywake 出征完成" : "Skywake 出征告警";
  const body = `状态 ${runStatusLabel(run.status)} · 层数 ${run.reachedFloor}/${run.plannedFloor} · +${run.retainedGold}G +${run.retainedMaterials}M`;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore browsers that throw in unsupported contexts (for example, background restrictions).
  }
}

function finalizeActiveRunIfDue(force = false): boolean {
  const plan = save.activeRunPlan;
  if (!plan) return false;
  if (!force) {
    if (plan.pausedAt != null) return false;
    const durationMs = planDurationMs(plan);
    const elapsedMs = planElapsedMs(plan);
    if (elapsedMs < durationMs) return false;
  }

  if (!hasValidPostRunDelta(plan.postRunDelta)) {
    save.activeRunPlan = null;
    persistSave(save);
    setBanner("进行中的出征数据损坏，已清理任务。");
    return true;
  }
  const postRunDelta = plan.postRunDelta;

  const preservedSettings = save.settings;
  const preservedOnboarding = save.onboarding;
  const preservedProfiles = save.tacticsProfiles;
  const preservedProfileId = save.activePartyTacticProfileId;
  const preservedHintClaims = save.hintClaims;
  const nextArchived = {
    ...save.archivedRunSummary,
    reasonTagCounts: { ...save.archivedRunSummary.reasonTagCounts }
  };
  const nextRuns = [normalizeRunForArchive(plan.run), ...save.runs.filter((run) => run.runId !== plan.run.runId)];
  if (nextRuns.length > 30) {
    const archivedRuns = nextRuns.splice(30);
    archivedRuns.forEach((run) => archiveRunSummaryInPlace(nextArchived, run));
  }

  save = {
    ...save,
    runCounter: Math.floor(postRunDelta.runCounter),
    gold: Math.floor(postRunDelta.gold),
    materials: Math.floor(postRunDelta.materials),
    fatePoints: Math.floor(postRunDelta.fatePoints),
    meta: cloneJson(postRunDelta.meta),
    inventory: cloneJson(postRunDelta.inventory),
    characters: cloneJson(postRunDelta.characters),
    quests: cloneJson(postRunDelta.quests),
    runs: nextRuns,
    archivedRunSummary: nextArchived,
    settings: preservedSettings,
    onboarding: preservedOnboarding,
    tacticsProfiles: preservedProfiles,
    activePartyTacticProfileId: preservedProfileId,
    hintClaims: preservedHintClaims,
    activeRunPlan: null
  };
  persistSave(save);

  const finishedRun = save.runs.find((run) => run.runId === plan.run.runId) ?? save.runs[0] ?? null;
  if (finishedRun) {
    ui = {
      ...ui,
      selectedRunId: finishedRun.runId,
      replayIndex: 0,
      expandedLogSeq: 0,
      logTypeFilter: "all",
      logReasonFilter: "all",
      logScrollTop: 0,
      logVirtualRow: 0
    };
    setBanner(
      `出征完成：${runStatusLabel(finishedRun.status)} · +${finishedRun.retainedGold} 金币 / +${finishedRun.retainedMaterials} 材料`
    );
    notifyRunComplete(finishedRun);
  } else {
    setBanner("出征已完成并结算。");
  }

  return true;
}

function renderCharacterCards(): string {
  return save.characters
    .map((character) => {
      const stressPct = Math.floor((character.stressPhysical / character.maxStress) * 100);
      const resourcePct = Math.floor((character.resource / character.maxResource) * 100);
      return `
      <article class="touch-card">
        <header>
          <h4>${escapeHtml(character.name)}</h4>
          <span class="chip">${roleLabel(character.role)}</span>
        </header>
        <div class="meter-row">
          <label>Stress</label>
          <div class="meter"><i style="width:${stressPct}%;"></i></div>
          <span>${character.stressPhysical}/${character.maxStress}</span>
        </div>
        <div class="meter-row">
          <label>Resource</label>
          <div class="meter resource"><i style="width:${resourcePct}%;"></i></div>
          <span>${character.resource}/${character.maxResource}</span>
        </div>
        <p class="meta">Lv.${character.level} / XP ${character.xp}</p>
        <p class="meta">${character.consequenceLight ? escapeHtml(character.consequenceLight) : "状态稳定"}</p>
      </article>`;
    })
    .join("");
}

function isExpeditionPanelCollapsed(panelId: string): boolean {
  return ui.collapsedExpeditionPanels.includes(panelId);
}

function renderExpeditionPanel(panelId: string, title: string, bodyHtml: string, summary = ""): string {
  const collapsed = isExpeditionPanelCollapsed(panelId);
  return `<article class="panel expedition-panel ${collapsed ? "collapsed" : ""}" data-expedition-panel="${panelId}">
      <div class="toolbar">
        <h3>${escapeHtml(title)}</h3>
        <div class="inline-buttons">
          ${summary.length > 0 ? `<span class="chip">${escapeHtml(summary)}</span>` : ""}
          <button data-action="toggle-expedition-panel" data-value="${panelId}">${collapsed ? "展开" : "折叠"}</button>
        </div>
      </div>
      ${collapsed ? `<p class="hint">已折叠，点“展开”查看详情。</p>` : bodyHtml}
    </article>`;
}

function renderExpeditionTab(): string {
  const dungeon = getDungeon();
  const requiredChapter = requiredChapterForDungeon(dungeon.id);
  const dungeonLocked = !isDungeonUnlocked(dungeon.id);
  const estimate = estimateRunMinutes(save, { dungeonId: dungeon.id, plannedFloor: ui.plannedFloor });
  const scaledMinMinutes = Math.max(0.2, Number((estimate.minMinutes / save.settings.expeditionTimeScale).toFixed(1)));
  const scaledMaxMinutes = Math.max(scaledMinMinutes, Number((estimate.maxMinutes / save.settings.expeditionTimeScale).toFixed(1)));
  const activeRunSnapshot = getActiveRunSnapshot();
  const runInProgress = activeRunSnapshot !== null;
  const run = getSelectedRun();
  const runRecovery = getRunRecovery(run);
  const assist = getFailureAssistForDungeon(dungeon.id);
  const diagnosis = getRunDiagnosis(run, run?.dungeonId ?? dungeon.id);
  const replayMoments = buildReplayMoments(run);
  const replayIndex = clampReplayIndex(ui.replayIndex, replayMoments.length);
  const activeReplay = replayMoments[replayIndex] ?? null;
  const analytics = buildRunAnalytics(dungeon.id);
  const allReasons = run ? Array.from(new Set(run.events.flatMap((event) => event.reason_tags))).sort() : [];
  const stormTimeline = buildSkybridgeStormTimeline(run);
  const quickTypeOptions: Array<{ value: EventType | "all"; label: string }> = [
    { value: "all", label: "全部" },
    { value: "overcome_check", label: "判定" },
    { value: "combat_start", label: "开战" },
    { value: "combat_end", label: "战斗结算" },
    { value: "retreat_triggered", label: "撤退" },
    { value: "run_end", label: "返航" }
  ];
  const reasonUsage = new Map<ReasonTag, number>();
  if (run) {
    run.events.forEach((event) => {
      event.reason_tags.forEach((tag) => {
        reasonUsage.set(tag, (reasonUsage.get(tag) ?? 0) + 1);
      });
    });
  }
  const quickReasonOptions = [...reasonUsage.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }));

  const filteredEvents = filterRunEvents(run, ui.logTypeFilter, ui.logReasonFilter);
  const logRowEstimate = logRowEstimateByView(ui.logView);
  const logViewportHeight = Math.max(220, ui.logViewportHeight);
  let virtualScrollTop = Math.max(0, ui.logScrollTop);
  const activeRunSelected = Boolean(activeRunSnapshot && run && activeRunSnapshot.run.runId === run.runId);
  const autoFollowLiveLog = ui.logAutoFollow && activeRunSelected && ui.logTypeFilter === "all" && ui.logReasonFilter === "all";

  if (autoFollowLiveLog && filteredEvents.length > 0) {
    const latestTop = Math.max(0, (filteredEvents.length - 1) * logRowEstimate - logRowEstimate * 2);
    if (Math.abs(latestTop - virtualScrollTop) > 1) {
      virtualScrollTop = latestTop;
      ui.logScrollTop = latestTop;
      ui.logVirtualRow = logVirtualRowByTop(latestTop, ui.logView);
    }
  }

  if (ui.expandedLogSeq > 0 && filteredEvents.length > 0) {
    const focusedIndex = filteredEvents.findIndex((event) => event.seq === ui.expandedLogSeq);
    if (focusedIndex >= 0) {
      const focusedTop = focusedIndex * logRowEstimate;
      const focusedBottom = focusedTop + logRowEstimate;
      if (focusedTop < virtualScrollTop || focusedBottom > virtualScrollTop + logViewportHeight) {
        virtualScrollTop = Math.max(0, focusedTop - logRowEstimate * 1.2);
        ui.logScrollTop = virtualScrollTop;
        ui.logVirtualRow = logVirtualRowByTop(virtualScrollTop, ui.logView);
      }
    }
  }

  const visibleRows = Math.max(6, Math.ceil(logViewportHeight / logRowEstimate));
  const virtualStart =
    filteredEvents.length === 0
      ? 0
      : clamp(Math.floor(virtualScrollTop / logRowEstimate) - LOG_VIRTUAL_OVERSCAN, 0, Math.max(0, filteredEvents.length - 1));
  const virtualEnd =
    filteredEvents.length === 0
      ? 0
      : clamp(virtualStart + visibleRows + LOG_VIRTUAL_OVERSCAN * 2, virtualStart, filteredEvents.length);
  const windowEvents = filteredEvents.slice(virtualStart, virtualEnd);
  const spacerTopHeight = Math.max(0, virtualStart * logRowEstimate);
  const spacerBottomHeight = Math.max(0, (filteredEvents.length - virtualEnd) * logRowEstimate);

  const chapterBreakSeqs = new Set<number>();
  if (ui.logView === "narrative") {
    windowEvents.forEach((event, index) => {
      const absoluteIndex = virtualStart + index;
      const prev = absoluteIndex > 0 ? filteredEvents[absoluteIndex - 1] : null;
      const isBoundary =
        !prev ||
        prev.floor !== event.floor ||
        event.event_type === "run_start" ||
        event.event_type === "run_end" ||
        event.event_type === "retreat_triggered" ||
        event.event_type === "gate_blocked";
      if (isBoundary) {
        chapterBreakSeqs.add(event.seq);
      }
    });
  }

  const logCards = windowEvents
    .map((event) => {
      const expanded = ui.expandedLogSeq === event.seq;
      const tagLine = event.reason_tags.length > 0 ? `<p class="tags">${event.reason_tags.map(reasonText).join("，")}</p>` : "";
      const chapterHeader =
        ui.logView === "narrative" && chapterBreakSeqs.has(event.seq)
          ? `<p class="chapter-label">${escapeHtml(chapterLabelForEvent(event))}</p>`
          : "";
      const detailBlock = "";
      const quickReason = event.reason_tags[0] ?? "all";
      const contextActive = ui.logQuickSeq === event.seq;

      return `
      <article class="touch-item log-entry ${event.outcome} ${expanded ? "expanded" : ""} ${contextActive ? "context" : ""}" data-action="toggle-log-expand" data-value="${event.seq}" data-log-seq="${event.seq}" data-log-type="${event.event_type}" data-log-reason="${quickReason}">
        ${chapterHeader}
        <div class="event-head">
          <strong class="event-seq">#${event.seq}</strong>
          <span class="event-type">${eventTypeLabel(event.event_type)} · ${outcomeLabel(event.outcome)}</span>
          <span class="event-floor">F${event.floor}</span>
          <span class="event-time">T+${formatEventOffset(event.time_offset_sec)}</span>
        </div>
        <p class="summary-line">${escapeHtml(summaryLine(event))}</p>
        <div class="row">
          <span class="hint">${event.reason_tags.length > 0 ? `${event.reason_tags.length} 个标签` : "无标签"}</span>
          <span class="hint">${expanded ? "详情已同步右侧" : "点按查看详情"}</span>
        </div>
        ${detailBlock}
        ${tagLine}
      </article>`;
    })
    .join("");
  const detailEvent = filteredEvents.find((event) => event.seq === ui.expandedLogSeq) ?? filteredEvents[filteredEvents.length - 1] ?? null;
  const detailIndex = detailEvent ? filteredEvents.findIndex((event) => event.seq === detailEvent.seq) : -1;
  const detailPrev = detailIndex > 0 ? filteredEvents[detailIndex - 1] : null;
  const detailNext = detailIndex >= 0 && detailIndex < filteredEvents.length - 1 ? filteredEvents[detailIndex + 1] : null;
  const detailSeq = detailEvent?.seq ?? 0;
  const detailTypeShortcuts = (
    [
      "overcome_check",
      "combat_start",
      "combat_end",
      "retreat_triggered",
      "gate_blocked",
      "quest_progress",
      "run_end"
    ] as EventType[]
  )
    .map((eventType) => {
      const count = filteredEvents.filter((event) => event.event_type === eventType).length;
      if (count <= 0) return null;
      const targetSeq = findNextSeqByEventType(filteredEvents, eventType, detailSeq);
      return {
        eventType,
        count,
        targetSeq
      };
    })
    .filter((item): item is { eventType: EventType; count: number; targetSeq: number | null } => item !== null)
    .slice(0, 5);
  const timelineMarkers = buildLogTimelineMarkers(filteredEvents);
  const timelineStrip =
    timelineMarkers.length > 0
      ? `<div class="log-timeline-box">
          <div class="row">
            <strong>关键时间线</strong>
            <span class="hint">点按事件可快速定位</span>
          </div>
          <div id="log-key-timeline" class="log-key-timeline">
            ${timelineMarkers
              .map((marker) => {
                const active = marker.seq === detailSeq;
                return `<button class="timeline-marker ${marker.outcome} ${active ? "active" : ""}" data-action="log-focus-event" data-value="${marker.seq}" title="#${marker.seq} · ${eventTypeLabel(marker.eventType)} · F${marker.floor}">
                  <span class="seq">#${marker.seq}</span>
                  <span class="type">${escapeHtml(eventTypeLabel(marker.eventType))}</span>
                  <span class="time">T+${formatEventOffset(marker.timeOffsetSec)}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>`
      : `<div class="log-timeline-box"><p class="hint">当前筛选条件下暂无关键时间线。</p></div>`;
  const detailShortcutStrip =
    detailTypeShortcuts.length > 0
      ? `<div class="log-detail-shortcuts">
          ${detailTypeShortcuts
            .map((item) => {
              const activeType = detailEvent?.event_type === item.eventType;
              return `<button data-action="log-focus-type" data-value="${item.eventType}" ${item.targetSeq == null ? "disabled" : ""} class="${activeType ? "on" : ""}">
                ${escapeHtml(eventTypeLabel(item.eventType))} · ${item.count}
              </button>`;
            })
            .join("")}
        </div>`
      : "";
  const detailPanelBody = detailEvent
    ? `<div class="log-detail-hero">
          <div class="row">
            <strong>#${detailEvent.seq} · ${eventTypeLabel(detailEvent.event_type)}</strong>
            <span class="chip">F${detailEvent.floor} · ${outcomeLabel(detailEvent.outcome)}</span>
          </div>
          <p class="hint">时间 T+${formatEventOffset(detailEvent.time_offset_sec)} · 节点 ${escapeHtml(detailEvent.node_id)}</p>
        </div>
        ${detailShortcutStrip}
        <div class="log-detail-content">${renderEventDetailContent(detailEvent, ui.logView)}</div>`
    : `<p class="hint">当前筛选下没有日志事件，调整筛选后可查看详情。</p>`;
  const detailPanel = `
    <aside class="log-detail-panel">
      <div class="toolbar">
        <h4>事件详情</h4>
        <span class="chip">${detailEvent ? `${detailIndex + 1}/${filteredEvents.length}` : "0/0"}</span>
      </div>
      ${detailPanelBody}
      <div class="inline-buttons wrap">
        <button data-action="log-focus-event" data-value="${detailPrev?.seq ?? ""}" ${detailPrev ? "" : "disabled"}>上一条</button>
        <button data-action="log-focus-event" data-value="${detailNext?.seq ?? ""}" ${detailNext ? "" : "disabled"}>下一条</button>
      </div>
    </aside>
  `;
  const logItems =
    filteredEvents.length > 0
      ? `${spacerTopHeight > 0 ? `<div class="log-spacer" style="height:${Math.round(spacerTopHeight)}px" aria-hidden="true"></div>` : ""}${logCards}${
          spacerBottomHeight > 0 ? `<div class="log-spacer" style="height:${Math.round(spacerBottomHeight)}px" aria-hidden="true"></div>` : ""
        }`
      : `<div class="touch-item"><p class="hint">当前筛选下没有日志事件。</p></div>`;

  const formatStormPercent = (value: number | null): string => {
    if (value == null) return "--";
    const normalized = value <= 1 ? value * 100 : value;
    return `${Math.round(normalized)}%`;
  };

  const quickTypeButtons = quickTypeOptions
    .map((item) => {
      const active = ui.logTypeFilter === item.value;
      return `<button data-action="quick-log-type" data-value="${item.value}" class="${active ? "on" : ""}">${item.label}</button>`;
    })
    .join("");
  const quickReasonButtons = quickReasonOptions
    .map((item) => {
      const active = ui.logReasonFilter === item.tag;
      return `<button data-action="quick-log-reason" data-value="${item.tag}" class="${active ? "on" : ""}">${escapeHtml(reasonText(item.tag))} · ${item.count}</button>`;
    })
    .join("");

  const hasActiveFilters = !(ui.logTypeFilter === "all" && ui.logReasonFilter === "all");
  const stickyPrimaryAction = runInProgress ? (activeRunSnapshot?.paused ? "resume-run" : "pause-run") : "start-run";
  const stickyPrimaryLabel = runInProgress
    ? activeRunSnapshot?.paused
      ? "恢复探险"
      : "暂停探险"
    : dungeonLocked
      ? "章节未解锁"
      : "派遣小队";
  const stickyPrimaryDisabled = !runInProgress && dungeonLocked ? "disabled" : "";
  const nextRunSpeed = activeRunSnapshot ? nextActiveRunSpeedMultiplier(activeRunSnapshot.runtimeSpeedMultiplier) : null;
  const stickySecondaryAction = runInProgress
    ? nextRunSpeed
      ? `<button data-action="set-run-speed" data-value="${nextRunSpeed}" class="danger">加速到 ${nextRunSpeed}x</button>`
      : `<button disabled>已最高倍率</button>`
    : `<button data-action="set-log-view" data-value="${ui.logView === "narrative" ? "debug" : "narrative"}">${ui.logView === "narrative" ? "切到调试" : "切到叙事"}</button>`;
  const stickyActionBar = `
    <section class="expedition-sticky-actions">
      <button data-action="${stickyPrimaryAction}" class="primary" ${stickyPrimaryDisabled}>${stickyPrimaryLabel}</button>
      ${stickySecondaryAction}
      <button data-action="jump-latest-log" ${run ? "" : "disabled"}>最新日志</button>
      <button data-action="clear-log-filters" ${hasActiveFilters ? "" : "disabled"}>清空筛选</button>
    </section>
  `;

  const stormPanel =
    stormTimeline == null
      ? ""
      : (() => {
          if (stormTimeline.steps.length === 0) {
            const emptyHint =
              run?.status === "running"
                ? "当前记录尚未进入顶层风暴阶段。推进至天穹桥域顶层后会出现蓄能判定。"
                : "本次记录未触发相位风暴阶段判定。";
            return renderExpeditionPanel("storm-watch", "Boss 风暴阶段监控", `<p class="hint">${emptyHint}</p>`, "未触发");
          }

          const lastStep = stormTimeline.steps[stormTimeline.steps.length - 1] ?? null;
          const maxChargeRate = Math.min(100, Math.max(0, stormTimeline.maxCharge * 12.5));
          const dangerHint =
            run?.status === "running"
              ? lastStep && lastStep.stormCharge >= 6
                ? "已进入高压蓄能区，优先防御/优势动作并准备锚片介入。"
                : "当前未达高压阈值，建议在蓄能升至 6 前完成防线准备。"
              : "可重点复盘高压回合（蓄能>=6 或爆发回合）并调整战术。";
          const stepsHtml = stormTimeline.steps
            .map((step) => {
              const chargeRate = Math.min(100, Math.max(6, step.stormCharge * 12.5));
              const stateLabel =
                step.outcome === "success" ? "压制成功" : step.outcome === "partial" ? "风暴爆发" : "风暴失控";
              const anchorLabel = step.consumedAnchor ? "锚片已介入" : step.hasAnchor === false ? "无锚片加固" : "锚片待命";
              return `
                <div class="touch-item storm-step ${step.outcome} ${step.stormCharge >= 6 ? "storm-high" : ""}">
                  <div class="row">
                    <strong>T${Math.max(1, step.turn)}</strong>
                    <span>F${step.floor}</span>
                    <span>${stateLabel}</span>
                  </div>
                  <div class="meter storm-meter"><i style="width:${chargeRate}%;"></i></div>
                  <p class="hint">蓄能 ${step.stormCharge} · 判定 ${formatStormPercent(step.passChance)} / 掷值 ${formatStormPercent(step.roll)}</p>
                  <p class="hint">${anchorLabel}${step.burstCount > 0 ? ` · 爆发累计 ${step.burstCount}` : ""}</p>
                </div>`;
            })
            .join("");

          return renderExpeditionPanel(
            "storm-watch",
            "Boss 风暴阶段监控",
            `<div class="touch-list compact">
              <div class="touch-item"><span>阶段回合</span><strong>${stormTimeline.steps.length}</strong></div>
              <div class="touch-item"><span>最高蓄能</span><strong>${stormTimeline.maxCharge}</strong></div>
              <div class="touch-item"><span>爆发回合</span><strong>${stormTimeline.burstSteps}</strong></div>
              <div class="touch-item"><span>高压回合</span><strong>${stormTimeline.highRiskSteps}</strong></div>
              <div class="touch-item"><span>锚片介入</span><strong>${stormTimeline.anchorConsumed} 次</strong></div>
              <div class="touch-item"><span>缺锚片判定</span><strong>${stormTimeline.anchorMissing} 次</strong></div>
            </div>
            <div class="meter storm-meter"><i style="width:${maxChargeRate}%;"></i></div>
            <p class="hint">${dangerHint}</p>
            <div class="storm-track">${stepsHtml}</div>`,
            `高压 ${stormTimeline.highRiskSteps} / 爆发 ${stormTimeline.burstSteps}`
          );
        })();

  const liveRunPanel = activeRunSnapshot
    ? (() => {
        const speedButtons = ACTIVE_RUN_SPEED_OPTIONS.map((multiplier) => {
          const active = multiplier === activeRunSnapshot.runtimeSpeedMultiplier;
          const disabled = multiplier === activeRunSnapshot.runtimeSpeedMultiplier;
          return `<button data-action="set-run-speed" data-value="${multiplier}" class="${active ? "on" : ""}" ${disabled ? "disabled" : ""}>${multiplier}x</button>`;
        }).join("");

        return renderExpeditionPanel(
          "live-run",
          "实时探险进度",
          `<div class="touch-list compact">
              <div class="touch-item"><span>出征编号</span><strong>${activeRunSnapshot.run.runId}</strong></div>
              <div class="touch-item"><span>状态</span><strong>${activeRunSnapshot.paused ? "已暂停" : "进行中"}</strong></div>
              <div class="touch-item"><span>推进层数</span><strong>${activeRunSnapshot.run.reachedFloor} / ${activeRunSnapshot.run.plannedFloor}</strong></div>
              <div class="touch-item"><span>进度</span><strong>${percentText(activeRunSnapshot.progressRate)}</strong></div>
              <div class="touch-item"><span>剩余时间</span><strong>${formatCountdown(activeRunSnapshot.remainingMs)}</strong></div>
              <div class="touch-item"><span>预计返航</span><strong>${new Date(activeRunSnapshot.expectedFinishAt).toLocaleTimeString()}</strong></div>
              <div class="touch-item"><span>当前倍率</span><strong>${activeRunSnapshot.runtimeSpeedMultiplier}x</strong></div>
              <div class="touch-item"><span>下一关键事件</span><strong>${
                activeRunSnapshot.nextEvent
                  ? `F${activeRunSnapshot.nextEvent.event.floor} · ${eventTypeLabel(activeRunSnapshot.nextEvent.event.event_type)}（${formatCountdown(activeRunSnapshot.nextEvent.etaMs)}）`
                  : "无"
              }</strong></div>
            </div>
            <div class="meter progress-meter"><i style="width:${Math.round(activeRunSnapshot.progressRate * 100)}%;"></i></div>
            <div class="inline-buttons">
              <button data-action="${activeRunSnapshot.paused ? "resume-run" : "pause-run"}">${activeRunSnapshot.paused ? "恢复计时" : "暂停计时"}</button>
            </div>
            <div class="inline-buttons wrap">
              ${speedButtons}
            </div>
            <p class="hint">日志会随时间推进逐步解锁；已解锁事件不会因倍率调整而回退。</p>`,
          `${percentText(activeRunSnapshot.progressRate)} · ${formatCountdown(activeRunSnapshot.remainingMs)}`
        );
      })()
    : "";

  const runStatusText =
    run && activeRunSnapshot && run.runId === activeRunSnapshot.run.runId && activeRunSnapshot.paused
      ? "已暂停"
      : run
        ? runStatusLabel(run.status)
        : "暂无记录";
  const runSummaryPanel = renderExpeditionPanel(
    "run-summary",
    runInProgress ? "当前出征" : "最近一次出征",
    run
      ? `<div class="touch-list compact">
          <div class="touch-item"><span>出征编号</span><strong>${run.runId}</strong></div>
          <div class="touch-item"><span>状态</span><strong>${runStatusText}</strong></div>
          <div class="touch-item"><span>层数</span><strong>${run.reachedFloor} / ${run.plannedFloor}</strong></div>
          <div class="touch-item"><span>结算</span><strong>+${run.retainedGold} 金币 / +${run.retainedMaterials} 材料</strong></div>
          ${
            runRecovery
              ? `<div class="touch-item"><span>返航恢复</span><strong>体力 +${runRecovery.stressRecovered} / 心智 +${runRecovery.mentalRecovered} / 资源 +${runRecovery.resourceRecovered}${runRecovery.consequencesCleared > 0 ? ` / 清除后果 ${runRecovery.consequencesCleared}` : ""}</strong></div>`
              : ""
          }
          <div class="touch-item"><span>失败原因</span><strong>${escapeHtml(summarizeReasonCounts(run.reasonTags))}</strong></div>
        </div>`
      : `<p class="hint">暂无出征记录，先派遣一次小队。</p>`,
    run ? `${runStatusText} · F${run.reachedFloor}/${run.plannedFloor}` : "暂无记录"
  );

  const assistPanel =
    assist == null
      ? ""
      : renderExpeditionPanel(
          "failure-assist",
          "连续失败保护",
          `<div class="touch-list compact">
              <div class="touch-item"><span>任务</span><strong>${escapeHtml(assist.questTitle)}</strong></div>
              <div class="touch-item"><span>连续失败</span><strong>${assist.streak} 次</strong></div>
              <div class="touch-item"><span>主要问题</span><strong>${escapeHtml(assist.reason)}</strong></div>
              <div class="touch-item"><span>推荐模板</span><strong>${styleLabel(assist.style)}</strong></div>
            </div>
            <button data-action="apply-failure-assist" data-value="${assist.style}" data-quest-id="${assist.questId}" class="primary">一键应用建议</button>`,
          `${assist.streak} 连败`
        );

  const diagnosisPanel =
    diagnosis == null
      ? ""
      : renderExpeditionPanel(
          "diagnosis",
          "复盘建议",
          `<div class="touch-list compact">
              <div class="touch-item"><span>主因</span><strong>${escapeHtml(reasonText(diagnosis.primaryReason))}</strong></div>
              <div class="touch-item"><span>标签</span><strong>${escapeHtml(diagnosis.reasons.map(reasonText).join(" / "))}</strong></div>
            </div>
            <ul class="touch-list compact">
              ${diagnosis.notes.map((note) => `<li class="touch-item"><p>${escapeHtml(note)}</p></li>`).join("")}
            </ul>
            ${
              diagnosis.actions.length > 0
                ? `<div class="inline-buttons wrap">
                    ${diagnosis.actions
                      .map((action) =>
                        action.action === "craft-calibrator"
                          ? `<button data-action="${action.action}">${escapeHtml(action.label)}</button>`
                          : `<button data-action="${action.action}" data-value="${action.value ?? ""}">${escapeHtml(action.label)}</button>`
                      )
                      .join("")}
                  </div>`
                : ""
            }`,
          reasonText(diagnosis.primaryReason)
        );

  const replayPanel =
    replayMoments.length <= 0
      ? ""
      : renderExpeditionPanel(
          "replay",
          "关键回合回放",
          `<div data-gesture="replay">
              <p class="hint replay-swipe-hint">在此面板左右滑动可切换回放步骤。</p>
              <div class="inline-buttons">
                <button data-action="replay-prev" ${replayIndex <= 0 ? "disabled" : ""}>上一步</button>
                <button data-action="replay-next" ${replayIndex >= replayMoments.length - 1 ? "disabled" : ""}>下一步</button>
                <button data-action="replay-focus-active" ${activeReplay ? "" : "disabled"}>定位日志</button>
              </div>
              <ul class="touch-list compact">
                ${replayMoments
                  .map(
                    (item, index) => `<li class="touch-item ${index === replayIndex ? "active" : ""}">
                        <div class="row">
                          <strong>#${item.seq}</strong>
                          <span>${eventTypeLabel(item.eventType)}</span>
                          <span>F${item.floor}</span>
                        </div>
                        <p>${escapeHtml(item.summary)}</p>
                        <div class="row">
                          <span>${item.reasonTags.length > 0 ? escapeHtml(item.reasonTags.map(reasonText).join(" / ")) : "无原因标签"}</span>
                          <button data-action="replay-select" data-value="${index}">跳转</button>
                        </div>
                      </li>`
                  )
                  .join("")}
              </ul>
              ${
                save.settings.advancedDebugView && activeReplay?.ruleId
                  ? `<p class="hint">当前步骤 rule_id：${escapeHtml(activeReplay.ruleId)}</p>`
                  : ""
              }
            </div>`,
          `${replayIndex + 1}/${replayMoments.length}`
        );

  const analyticsPanel =
    analytics == null
      ? ""
      : renderExpeditionPanel(
          "analytics",
          "近期统计看板",
          `<p class="hint">${escapeHtml(analytics.scopeLabel)}</p>
            <div class="touch-list compact">
              <div class="touch-item"><span>完成 / 撤退 / 失败</span><strong>${percentText(analytics.completionRate)} / ${percentText(analytics.retreatRate)} / ${percentText(analytics.failRate)}</strong></div>
              <div class="touch-item"><span>平均推进</span><strong>${percentText(analytics.avgProgressRate)}</strong></div>
              <div class="touch-item"><span>平均结算</span><strong>+${Math.round(analytics.avgRetainedGold)}G / +${Math.round(analytics.avgRetainedMaterials)}M</strong></div>
              <div class="touch-item"><span>样本</span><strong>${analytics.sampleSize} 次出征</strong></div>
            </div>
            <div class="touch-list compact">
              ${
                analytics.topReasons.length > 0
                  ? analytics.topReasons
                      .map(
                        (item) =>
                          `<div class="touch-item"><span>${escapeHtml(reasonText(item.tag))}</span><strong>${item.count} 次</strong><button data-action="filter-log-reason" data-value="${item.tag}">筛日志</button></div>`
                      )
                      .join("")
                  : `<div class="touch-item"><p class="hint">当前样本未记录核心失败标签。</p></div>`
              }
            </div>
            ${
              analytics.recommendStyle && analytics.primaryReason
                ? `<div class="inline-buttons wrap">
                    <button data-action="apply-analytics-preset" data-value="${analytics.recommendStyle}" class="primary">按统计建议套用${styleLabel(analytics.recommendStyle)}</button>
                  </div>
                  <p class="hint">统计主因：${escapeHtml(reasonText(analytics.primaryReason))}</p>`
                : ""
            }`,
          `${analytics.sampleSize} 样本`
        );

  return `
    ${stickyActionBar}
    <section class="panel-grid">
      ${renderOnboardingCard()}

	      <article class="panel">
        <h3>出征配置</h3>
        <label class="field">迷宫
          <select id="dungeon-select">
            ${DUNGEONS.map((item) => {
              const locked = !isDungeonUnlocked(item.id);
              const chapter = requiredChapterForDungeon(item.id);
              return `<option value="${item.id}" ${item.id === dungeon.id ? "selected" : ""} ${locked ? "disabled" : ""}>${escapeHtml(item.name)} · 推荐Lv.${item.recommendedLevel}${locked ? `（第${chapter}章解锁）` : ""}</option>`;
            }).join("")}
          </select>
        </label>
        <p class="hint">${escapeHtml(dungeon.flavor)}</p>
        ${
          dungeonLocked
            ? `<p class="hint">当前迷宫未解锁：需要推进至第 ${requiredChapter} 章（当前第 ${save.meta.chapterUnlocked} 章）。</p>`
            : ""
        }

        <label class="field">目标层数
          <input id="planned-floor" type="range" min="1" max="${dungeon.maxFloor}" step="1" value="${ui.plannedFloor}">
          <div class="range-meta">${ui.plannedFloor} / ${dungeon.maxFloor}</div>
        </label>

        <div class="touch-list compact">
          <div class="touch-item">
            <span>预计耗时</span>
            <strong>${estimate.minMinutes} ~ ${estimate.maxMinutes} 分钟</strong>
          </div>
          <div class="touch-item">
            <span>时间倍率</span>
            <strong>${timeScaleLabel(save.settings.expeditionTimeScale)}（折算 ${scaledMinMinutes} ~ ${scaledMaxMinutes} 分钟）</strong>
          </div>
          <div class="touch-item">
            <span>当前时段</span>
            <strong>${currentWindowLabel()}（${dungeon.favoredTimeWindow === "day" ? "该迷宫偏好白昼" : "该迷宫偏好夜幕"}）</strong>
          </div>
          <div class="touch-item">
            <span>重惩罚规则</span>
            <strong>完成 100% / 撤退 45%-60% / 失败 20%-30%</strong>
          </div>
          <div class="touch-item">
            <span>章节门槛</span>
            <strong>第 ${requiredChapter} 章（当前第 ${save.meta.chapterUnlocked} 章）</strong>
          </div>
        </div>

        <button class="primary" data-action="start-run" ${runInProgress || dungeonLocked ? "disabled" : ""}>
          ${runInProgress ? "探险进行中" : dungeonLocked ? "章节未解锁" : "派遣小队"}
        </button>
        <div class="command-strip">
          <button data-action="set-log-view" data-value="narrative" class="${ui.logView === "narrative" ? "on" : ""}">叙事日志</button>
          <button data-action="set-log-view" data-value="debug" class="${ui.logView === "debug" ? "on" : ""}">调试日志</button>
          <button data-action="jump-latest-log" ${run ? "" : "disabled"}>最新事件</button>
          <button data-action="clear-log-filters" ${(ui.logTypeFilter === "all" && ui.logReasonFilter === "all") ? "disabled" : ""}>清空筛选</button>
        </div>
      </article>

      ${liveRunPanel}
      ${runSummaryPanel}
      ${stormPanel}
      ${assistPanel}
      ${diagnosisPanel}
      ${replayPanel}
      ${analyticsPanel}

    </section>

    <section class="panel">
      <div class="toolbar">
        <h3>日志复盘</h3>
        <div class="inline-buttons">
          <button data-action="set-log-view" data-value="narrative" class="${ui.logView === "narrative" ? "on" : ""}">叙事视图</button>
          <button data-action="set-log-view" data-value="debug" class="${ui.logView === "debug" ? "on" : ""}">调试视图</button>
          <button data-action="toggle-log-auto-follow" class="${ui.logAutoFollow ? "on" : ""}" ${activeRunSelected ? "" : "disabled"}>${ui.logAutoFollow ? "自动跟随开" : "自动跟随关"}</button>
          <button data-action="toggle-log-smooth" class="${ui.logSmoothScroll ? "on" : ""}">${ui.logSmoothScroll ? "平滑滚动开" : "平滑滚动关"}</button>
        </div>
      </div>
      <div class="filter-row">
        <label>类型
          <select id="log-type-filter">
            <option value="all" ${ui.logTypeFilter === "all" ? "selected" : ""}>全部</option>
            ${[
              "run_start",
              "floor_enter",
              "overcome_check",
              "combat_start",
              "combat_action",
              "combat_end",
              "retreat_triggered",
              "gate_blocked",
              "quest_progress",
              "run_end"
            ]
              .map(
                (type) =>
                  `<option value="${type}" ${ui.logTypeFilter === type ? "selected" : ""}>${eventTypeLabel(type as EventType)}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>原因
          <select id="log-reason-filter">
            <option value="all" ${ui.logReasonFilter === "all" ? "selected" : ""}>全部</option>
            ${allReasons
              .map(
                (tag) =>
                  `<option value="${tag}" ${ui.logReasonFilter === tag ? "selected" : ""}>${reasonText(tag)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="quick-filter-box">
        <p class="hint">快速筛选</p>
        <div class="chip-row">
          ${quickTypeButtons}
        </div>
        ${
          quickReasonButtons.length > 0
            ? `<div class="chip-row">
                ${quickReasonButtons}
                <button data-action="quick-log-reason" data-value="all" class="${ui.logReasonFilter === "all" ? "on" : ""}">原因：全部</button>
              </div>`
            : ""
        }
      </div>

      ${timelineStrip}

      <div class="log-review-layout">
        <div class="log-column">
          <div id="log-list" class="touch-list logs" data-log-row-estimate="${logRowEstimate}" data-auto-follow="${autoFollowLiveLog ? "1" : "0"}" data-smooth-scroll="${ui.logSmoothScroll ? "1" : "0"}">
            ${logItems}
          </div>
          <p class="hint">提示：长按（或桌面端右键）打开快捷操作；左滑按类型筛选，右滑定位回放。自动跟随在滚动离底部后会自动关闭，回到底部会自动恢复。</p>
        </div>
        ${detailPanel}
      </div>
    </section>

    ${renderLogQuickSheet(run, replayMoments)}
  `;
}

function renderPartyTab(): string {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  const styleButtons = [
    { id: "profile_aggressive", label: "好斗", style: "aggressive" },
    { id: "profile_balanced", label: "均衡", style: "balanced" },
    { id: "profile_cautious", label: "谨慎", style: "cautious" }
  ];
  const sortedRules = [...profile.config.rules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const activeRuleForEditor =
    ui.tacticRuleEditorRuleId.length > 0 ? sortedRules.find((rule) => rule.id === ui.tacticRuleEditorRuleId) ?? null : null;
  const activeRuleRoot = activeRuleForEditor ? getEditableRootLeaves(activeRuleForEditor.when) : null;
  const activeLeafCount = activeRuleRoot?.leaves.length ?? 0;
  const activeLeafIndex = clamp(ui.tacticRuleEditorLeafIndex, 0, Math.max(0, activeLeafCount - 1));
  const editorOperators = ruleEditorOperatorsForFact(ui.tacticRuleEditorFact);
  const leafSelector =
    activeRuleRoot && activeRuleRoot.leaves.length > 0
      ? `<div class="chip-row">
          ${activeRuleRoot.leaves
            .map(
              (leaf, index) =>
                `<button data-action="rule-editor-select-leaf" data-value="${index}" class="${index === activeLeafIndex ? "on" : ""}">${index + 1}. ${leaf.fact} ${leaf.op}</button>`
            )
            .join("")}
        </div>`
      : "";
  const joinerModeText =
    activeRuleRoot == null
      ? ""
      : activeRuleRoot.mode === "all"
        ? "all（全部满足）"
        : activeRuleRoot.mode === "any"
          ? "any（任一满足）"
          : "single（单叶子）";
  const ruleConditionEditor =
    activeRuleForEditor == null
      ? `<p class="hint">点“编辑条件”可修改某条规则的首个条件叶子（fact/op/value）。复杂条件会保持结构，仅替换首叶子。</p>`
      : `<div class="rule-editor-card">
          <div class="row">
            <strong>条件编辑：${escapeHtml(activeRuleForEditor.id)}</strong>
            <span class="chip">${activeRuleForEditor.scope === "party" ? "队伍规则" : "角色规则"}</span>
          </div>
          <p class="hint">根条件模式：${joinerModeText}</p>
          ${leafSelector}
          <div class="inline-buttons wrap">
            <button data-action="rule-editor-add-leaf" ${activeRuleRoot?.editable === false ? "disabled" : ""}>新增叶子</button>
            <button data-action="rule-editor-remove-leaf" ${activeRuleRoot && activeRuleRoot.leaves.length > 1 && activeRuleRoot.editable ? "" : "disabled"}>删除当前叶子</button>
            <button data-action="rule-editor-set-joiner" data-value="all" class="${activeRuleRoot?.mode === "all" ? "on" : ""}" ${activeRuleRoot?.editable ? "" : "disabled"}>设为 all</button>
            <button data-action="rule-editor-set-joiner" data-value="any" class="${activeRuleRoot?.mode === "any" ? "on" : ""}" ${activeRuleRoot?.editable ? "" : "disabled"}>设为 any</button>
          </div>
          <div class="rule-editor-grid">
            <label class="field">Fact
              <select id="rule-editor-fact">
                ${RULE_EDITOR_FACT_OPTIONS.map((fact) => `<option value="${fact}" ${ui.tacticRuleEditorFact === fact ? "selected" : ""}>${fact}</option>`).join("")}
              </select>
            </label>
            <label class="field">Operator
              <select id="rule-editor-op">
                ${editorOperators.map((op) => `<option value="${op}" ${ui.tacticRuleEditorOp === op ? "selected" : ""}>${op}</option>`).join("")}
              </select>
            </label>
            <label class="field">Value
              <input id="rule-editor-value" type="text" value="${escapeHtml(ui.tacticRuleEditorValue)}" placeholder="例如 30 / true / key_a|key_b">
            </label>
          </div>
          <div class="inline-buttons wrap">
            <button data-action="rule-apply-condition-editor" class="primary">应用条件</button>
            <button data-action="rule-close-condition-editor">关闭编辑</button>
          </div>
          ${
            ui.tacticRuleEditorError.length > 0
              ? `<ul class="errors"><li>${escapeHtml(ui.tacticRuleEditorError)}</li></ul>`
              : `<p class="hint">当前条件：${escapeHtml(summarizeConditionExpr(activeRuleForEditor.when))}</p>`
          }
        </div>`;
  const ruleCards = sortedRules
    .map((rule) => {
      const scopeText = rule.scope === "party" ? "队伍" : "角色";
      const triggerText =
        rule.trigger === "on_turn_start"
          ? "回合开始"
          : rule.trigger === "on_turn_end"
            ? "回合结束"
            : rule.trigger === "on_combat_end"
              ? "战斗结束"
              : "进入节点";
      return `<li class="touch-item tactic-rule-card ${rule.enabled ? "enabled" : "disabled"}">
          <div class="row">
            <strong>${escapeHtml(rule.id)}</strong>
            <span class="chip">${scopeText} · ${triggerText}</span>
          </div>
          <p>动作：${combatActionLabel(rule.then.action)} · 优先级 ${rule.priority} · 冷却 ${rule.cooldown_turns}</p>
          <p class="hint">条件：${escapeHtml(summarizeConditionExpr(rule.when))}</p>
          <div class="inline-buttons wrap">
            <button data-action="rule-toggle-enabled" data-value="${rule.id}" class="${rule.enabled ? "on" : ""}">${rule.enabled ? "已启用" : "已停用"}</button>
            <button data-action="rule-open-condition-editor" data-value="${rule.id}" class="${ui.tacticRuleEditorRuleId === rule.id ? "on" : ""}">编辑条件</button>
            <button data-action="rule-priority-up" data-value="${rule.id}">优先 +10</button>
            <button data-action="rule-priority-down" data-value="${rule.id}">优先 -10</button>
            <button data-action="rule-delete" data-value="${rule.id}" class="danger">删除</button>
          </div>
        </li>`;
    })
    .join("");

  return `
    <section class="panel-grid">
      <article class="panel">
        <h3>队伍状态</h3>
        <div class="card-grid">
          ${renderCharacterCards()}
        </div>
      </article>

      <article class="panel">
        <h3>战术模板（自动调参）</h3>
        <div class="inline-buttons wrap">
          ${styleButtons
            .map((button) => {
              const active = save.activePartyTacticProfileId === button.id;
              return `<button data-action="apply-preset" data-value="${button.style}" class="${active ? "on" : ""}">${button.label}</button>`;
            })
            .join("")}
        </div>
        <p class="hint">当前配置：${escapeHtml(profile.name)}（${profileStyleLabel(profile.style)}）</p>

        <div class="touch-list compact">
          <div class="touch-item"><span>默认动作</span><strong>前卫=${combatActionLabel(profile.config.fallback_by_role.tank)}, 输出=${combatActionLabel(profile.config.fallback_by_role.dps)}, 辅助=${combatActionLabel(profile.config.fallback_by_role.support)}</strong></div>
          <div class="touch-item"><span>规则数量</span><strong>${profile.config.rules.length}</strong></div>
          <div class="touch-item"><span>更新时间</span><strong>${new Date(profile.updatedAt).toLocaleString()}</strong></div>
        </div>
      </article>
    </section>

    <section class="panel">
      <h3>触控规则编辑器（中重度）</h3>
      <p class="hint">可快速增删和调优规则卡片；修改后会自动同步到下方 JSON 编辑器。</p>
      <div class="inline-buttons wrap">
        <button data-action="rule-add-template" data-value="retreat_safe">新增：Boss 低血撤退</button>
        <button data-action="rule-add-template" data-value="elite_focus">新增：精英优先集火</button>
        <button data-action="rule-add-template" data-value="resource_guard">新增：资源保守模式</button>
        <button data-action="rules-sort-priority">按优先级整理</button>
      </div>
      <ul class="touch-list compact tactic-rule-list">
        ${ruleCards.length > 0 ? ruleCards : `<li class="touch-item"><p class="hint">暂无规则，先添加模板或切回自动模板。</p></li>`}
      </ul>
      ${ruleConditionEditor}
    </section>

    <section class="panel">
      <h3>硬核模式：手动规则编辑</h3>
      <p class="hint">支持编辑完整 TacticsConfig（version/conflict_policy/fallback_by_role/rules）。也兼容仅提交 rules 数组，应用前会做 DSL 校验。</p>
      <textarea id="rules-editor" rows="16">${escapeHtml(ui.editorText)}</textarea>
      <div class="inline-buttons">
        <button data-action="apply-rules" class="primary">应用规则</button>
        <button data-action="reset-rules">重置到当前模板</button>
      </div>
      ${
        ui.editorErrors.length > 0
          ? `<ul class="errors">${ui.editorErrors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<p class="hint">规则校验通过。</p>`
      }
    </section>
  `;
}

function renderTownTab(): string {
  const quests = save.quests
    .map((quest) => {
      const questContent = getQuestContentById(quest.id);
      const chapterText = `第 ${questContent?.chapter ?? 1} 章`;
      const progressHint =
        quest.status === "locked"
          ? `解锁条件：${chapterText}`
          : `进度：${quest.progressFloor}/${quest.targetFloor}（稳定节点 ${quest.stableFloor}）`;
      return `
      <li class="touch-item">
        <div class="row">
          <strong>${escapeHtml(quest.title)}</strong>
          <span class="chip ${quest.status === "completed" ? "done" : ""}">${questStatusLabel(quest.status)}</span>
        </div>
        <p>${escapeHtml(quest.description)}</p>
        <p class="hint">${progressHint}</p>
      </li>`;
    })
    .join("");

  const shop = Object.entries(INVENTORY_CATALOG)
    .map(([id, item]) => {
      return `
      <li class="touch-item">
        <div class="row">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.price} 金币</span>
        </div>
        <p>${escapeHtml(item.desc)}</p>
        <button data-action="buy-item" data-value="${id}">购买</button>
      </li>`;
    })
    .join("");

  const workshopRecipe = getWorkshopRecipeView();
  const shardCount = save.inventory[REFORGE_RECIPE.inputItem] ?? 0;
  const inputName = getItemContentById(REFORGE_RECIPE.inputItem)?.name ?? REFORGE_RECIPE.inputItem;
  const outputName = INVENTORY_CATALOG[REFORGE_RECIPE.outputItem]?.name ?? REFORGE_RECIPE.outputItem;
  const infirmaryLevel = getFacilityLevel("infirmary");
  const workshopLevel = getFacilityLevel("workshop");
  const infirmaryNextCost = getNextFacilityUpgradeCost("infirmary");
  const workshopNextCost = getNextFacilityUpgradeCost("workshop");
  const chapterPlan = getNextChapterUnlockPlan();
  const chapterIssues = chapterPlan ? getChapterUnlockIssues(chapterPlan) : [];
  const chapterReady = chapterPlan != null && chapterIssues.length === 0;
  const chapterRequiredQuestTitle = chapterPlan ? chapterRequirementQuestTitle(chapterPlan.requireQuestId) : "";
  const canCraft =
    shardCount >= workshopRecipe.inputCount &&
    save.gold >= workshopRecipe.goldCost &&
    save.materials >= workshopRecipe.materialCost;

  return `
    <section class="panel-grid">
      <article class="panel">
        <h3>设施与航线</h3>
        <div class="touch-list compact">
          <div class="touch-item"><span>疗养所</span><strong>Lv.${infirmaryLevel} / ${FACILITY_MAX_LEVEL}</strong></div>
          <div class="touch-item"><span>工坊</span><strong>Lv.${workshopLevel} / ${FACILITY_MAX_LEVEL}</strong></div>
          <div class="touch-item"><span>章节进度</span><strong>第 ${save.meta.chapterUnlocked} 章</strong></div>
        </div>
        <div class="inline-buttons wrap">
          <button data-action="upgrade-infirmary" ${infirmaryNextCost ? "" : "disabled"}>
            ${infirmaryNextCost ? `升级疗养所（${infirmaryNextCost.gold}G/${infirmaryNextCost.materials}M）` : "疗养所已满级"}
          </button>
          <button data-action="upgrade-workshop" ${workshopNextCost ? "" : "disabled"}>
            ${workshopNextCost ? `升级工坊（${workshopNextCost.gold}G/${workshopNextCost.materials}M）` : "工坊已满级"}
          </button>
        </div>
        ${
          chapterPlan
            ? `<div class="touch-list compact">
                <div class="touch-item"><span>下一章节</span><strong>第 ${chapterPlan.chapter} 章</strong></div>
                <div class="touch-item"><span>推进消耗</span><strong>${chapterPlan.gold}G / ${chapterPlan.materials}M</strong></div>
                <div class="touch-item"><span>条件</span><strong>疗养所 Lv.${chapterPlan.requireInfirmary} + 工坊 Lv.${chapterPlan.requireWorkshop}</strong></div>
                <div class="touch-item"><span>前置委托</span><strong>${escapeHtml(chapterRequiredQuestTitle)}</strong></div>
              </div>
              <button data-action="unlock-next-chapter" class="${chapterReady ? "primary" : ""}" ${chapterReady ? "" : "disabled"}>推进到第 ${chapterPlan.chapter} 章</button>
              ${
                chapterIssues.length > 0
                  ? `<p class="hint">未满足：${escapeHtml(chapterIssues.join("；"))}</p>`
                  : `<p class="hint">条件已满足，推进后可解锁新的航线与委托。</p>`
              }`
            : `<p class="hint">当前版本章节已全部解锁。</p>`
        }
      </article>

      <article class="panel">
        <h3>委托板</h3>
        <ul class="touch-list">${quests}</ul>
      </article>

      <article class="panel">
        <h3>商店</h3>
        <p class="hint">当前时段：${currentWindowLabel()}。可用金币：${save.gold}。</p>
        <ul class="touch-list">${shop}</ul>
      </article>

      <article class="panel">
        <h3>工坊重铸</h3>
        <p class="hint">将掉落材料转为关键机关道具，补齐探索循环。当前加成：${workshopRecipe.bonusText}。</p>
        <div class="touch-list compact">
          <div class="touch-item"><span>需求材料</span><strong>${inputName} x${workshopRecipe.inputCount}（当前 ${shardCount}）</strong></div>
          <div class="touch-item"><span>需求货币</span><strong>${workshopRecipe.goldCost} 金币 + ${workshopRecipe.materialCost} 材料</strong></div>
          <div class="touch-item"><span>产出</span><strong>${outputName} x${workshopRecipe.outputCount}</strong></div>
        </div>
        <button data-action="craft-calibrator" ${canCraft ? "" : "disabled"}>执行重铸</button>
      </article>
    </section>
  `;
}

function renderStorageTab(): string {
  const lifetime = buildLifetimeRunStats();
  const activeRunSnapshot = getActiveRunSnapshot();
  const inventory = Object.entries(INVENTORY_CATALOG)
    .map(([id, item]) => {
      const count = save.inventory[id] ?? 0;
      return `<li class="touch-item"><span>${escapeHtml(item.name)}</span><strong>x${count}</strong></li>`;
    })
    .join("");

  const runArchive = activeRunSnapshot ? [activeRunSnapshot.run, ...save.runs] : save.runs;
  const runHistory = runArchive
    .map((run) => {
      const active = run.runId === ui.selectedRunId;
      const inProgress = run.status === "running";
      const paused = inProgress && activeRunSnapshot?.run.runId === run.runId && activeRunSnapshot.paused;
      return `
      <li class="touch-item ${active ? "active" : ""}">
        <div class="row">
          <strong>${run.runId}</strong>
          <span>${paused ? "已暂停" : inProgress ? "进行中" : runStatusLabel(run.status)}</span>
        </div>
        <p>迷宫 ${run.dungeonId} · 层数 ${run.reachedFloor}/${run.plannedFloor} · +${run.retainedGold}G +${run.retainedMaterials}M</p>
        ${inProgress && activeRunSnapshot ? `<p class="hint">${paused ? "探险已暂停" : `预计剩余 ${formatCountdown(activeRunSnapshot.remainingMs)}`}</p>` : ""}
        <button data-action="view-run" data-value="${run.runId}">查看日志</button>
      </li>`;
    })
    .join("");

  return `
    <section class="panel-grid">
      <article class="panel">
        <h3>仓库</h3>
        <ul class="touch-list compact">${inventory}</ul>
      </article>

      ${
        lifetime
          ? `<article class="panel">
              <h3>历史累计</h3>
              <div class="touch-list compact">
                <div class="touch-item"><span>总出征</span><strong>${lifetime.totalRuns}（归档 ${lifetime.archivedRuns}）</strong></div>
                <div class="touch-item"><span>完成 / 撤退 / 失败</span><strong>${percentText(lifetime.completionRate)} / ${percentText(lifetime.retreatRate)} / ${percentText(lifetime.failRate)}</strong></div>
                <div class="touch-item"><span>平均推进</span><strong>${percentText(lifetime.avgProgressRate)}</strong></div>
                <div class="touch-item"><span>平均结算</span><strong>+${Math.round(lifetime.avgRetainedGold)}G / +${Math.round(lifetime.avgRetainedMaterials)}M</strong></div>
              </div>
              <div class="touch-list compact">
                ${
                  lifetime.topReasons.length > 0
                    ? lifetime.topReasons
                        .map(
                          (item) =>
                            `<div class="touch-item"><span>${escapeHtml(reasonText(item.tag as ReasonTag))}</span><strong>${item.count} 次</strong></div>`
                        )
                        .join("")
                    : `<div class="touch-item"><p class="hint">暂无历史原因统计。</p></div>`
                }
              </div>
            </article>`
          : ""
      }

      <article class="panel">
        <h3>出征档案（最近 30 次）</h3>
        <ul class="touch-list">${runHistory || `<li class="touch-item"><p class="hint">暂无出征档案。</p></li>`}</ul>
      </article>
    </section>
  `;
}

function renderSettingsTab(): string {
  const permissionLabel = getNotificationPermissionLabel();
  const onboardingDone = isOnboardingComplete();
  const canRequestNotification =
    typeof Notification !== "undefined" && Notification.permission !== "granted" && Notification.permission !== "denied";

  return `
    <section class="panel-grid">
      <article class="panel">
        <h3>运行设置</h3>
        <div class="touch-list compact">
          <div class="touch-item">
            <span>默认日志视图</span>
            <strong>${save.settings.defaultLogView === "debug" ? "调试" : "叙事"}</strong>
          </div>
          <div class="touch-item">
            <span>新手引导卡</span>
            <strong>${save.settings.showOnboardingCard ? "显示" : "隐藏"}</strong>
          </div>
          <div class="touch-item">
            <span>出征完成通知</span>
            <strong>${save.settings.notifyOnRunComplete ? "开启" : "关闭"}</strong>
          </div>
          <div class="touch-item">
            <span>仅失败通知</span>
            <strong>${save.settings.notifyFailOnly ? "开启" : "关闭"}</strong>
          </div>
          <div class="touch-item">
            <span>高级调试</span>
            <strong>${save.settings.advancedDebugView ? "开启（显示 rule_id）" : "关闭（隐藏 rule_id）"}</strong>
          </div>
          <div class="touch-item">
            <span>探险时间倍率</span>
            <strong>${timeScaleLabel(save.settings.expeditionTimeScale)}</strong>
          </div>
          <div class="touch-item">
            <span>通知权限</span>
            <strong>${permissionLabel}</strong>
          </div>
        </div>
        <div class="inline-buttons wrap">
          <button data-action="set-default-log-view" data-value="narrative" class="${save.settings.defaultLogView === "narrative" ? "on" : ""}">默认叙事</button>
          <button data-action="set-default-log-view" data-value="debug" class="${save.settings.defaultLogView === "debug" ? "on" : ""}">默认调试</button>
          <button data-action="toggle-onboarding-card">${save.settings.showOnboardingCard ? "隐藏引导卡" : "显示引导卡"}</button>
          <button data-action="toggle-notify-on-run">${save.settings.notifyOnRunComplete ? "关闭完成通知" : "开启完成通知"}</button>
          <button data-action="toggle-notify-fail-only" ${save.settings.notifyOnRunComplete ? "" : "disabled"}>${save.settings.notifyFailOnly ? "改为全部通知" : "仅失败通知"}</button>
          <button data-action="toggle-advanced-debug">${save.settings.advancedDebugView ? "关闭高级调试" : "开启高级调试"}</button>
          ${TIME_SCALE_OPTIONS.map(
            (scale) =>
              `<button data-action="set-time-scale" data-value="${scale}" class="${save.settings.expeditionTimeScale === scale ? "on" : ""}">探险 ${timeScaleLabel(scale)}</button>`
          ).join("")}
          <button data-action="request-notification-permission" ${canRequestNotification ? "" : "disabled"}>请求通知权限</button>
        </div>
      </article>

      <article class="panel">
        <h3>引导进度</h3>
        <div class="touch-list compact">
          <div class="touch-item"><span>打开队伍页</span><strong>${save.onboarding.openedPartyTab ? "已完成" : "未完成"}</strong></div>
          <div class="touch-item"><span>应用战术模板</span><strong>${save.onboarding.appliedPreset ? "已完成" : "未完成"}</strong></div>
          <div class="touch-item"><span>发起一次出征</span><strong>${save.onboarding.startedRun ? "已完成" : "未完成"}</strong></div>
          <div class="touch-item"><span>切换调试日志</span><strong>${save.onboarding.viewedDebugLog ? "已完成" : "未完成"}</strong></div>
          <div class="touch-item"><span>总进度</span><strong>${onboardingDone ? "完成" : "进行中"}</strong></div>
        </div>
      </article>
    </section>

    <section class="panel">
      <h3>存档备份 / 恢复</h3>
      <p class="hint">导出当前存档到 JSON；导入会覆盖当前存档（会做版本校验与迁移）。</p>
      <div class="inline-buttons">
        <button data-action="export-save" class="primary">导出存档</button>
        <button data-action="import-save" class="primary">导入并覆盖</button>
        <button data-action="clear-import">清空导入内容</button>
      </div>
      <textarea id="import-editor" rows="8" placeholder="粘贴备份 JSON 到这里">${escapeHtml(ui.importText)}</textarea>
      ${
        ui.importErrors.length > 0
          ? `<ul class="errors">${ui.importErrors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<p class="hint">导入框为空时不会执行覆盖。</p>`
      }
    </section>
  `;
}

function renderTabContent(): string {
  if (ui.tab === "party") return renderPartyTab();
  if (ui.tab === "town") return renderTownTab();
  if (ui.tab === "storage") return renderStorageTab();
  if (ui.tab === "settings") return renderSettingsTab();
  return renderExpeditionTab();
}

function render(): void {
  const tabs: Array<{ id: UiState["tab"]; label: string; dock: string }> = [
    { id: "expedition", label: "出征", dock: "E 出征" },
    { id: "party", label: "队伍", dock: "P 队伍" },
    { id: "town", label: "城镇", dock: "T 城镇" },
    { id: "storage", label: "仓库", dock: "S 仓库" },
    { id: "settings", label: "设置", dock: "C 设置" }
  ];

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div>
          <h1>苍穹航痕 · Skywake Chronicle</h1>
          <p>自动探索 + 日志复盘 + 战术调参</p>
        </div>
        <div class="resource-pill">
          <span>金币 ${save.gold}</span>
          <span>材料 ${save.materials}</span>
          <span>命运点 ${save.fatePoints}</span>
        </div>
      </header>

      ${ui.banner ? `<div class="banner">${escapeHtml(ui.banner)}</div>` : ""}

      <nav class="tabs">
        ${tabs
          .map(
            (tab) =>
              `<button data-action="switch-tab" data-value="${tab.id}" class="${ui.tab === tab.id ? "on" : ""}">${tab.label}</button>`
          )
          .join("")}
      </nav>

	      <main>
	        ${renderTabContent()}
	      </main>

        <nav class="nav-dock">
          ${tabs
            .map(
              (tab) =>
                `<button data-action="switch-tab" data-value="${tab.id}" class="${ui.tab === tab.id ? "on" : ""}">${tab.dock}</button>`
            )
            .join("")}
        </nav>

	      <footer class="foot">
	        <button data-action="wipe-save" class="danger">重置存档</button>
	      </footer>
    </div>
  `;

  const logList = app.querySelector<HTMLElement>("#log-list");
  if (logList) {
    const maxScrollTop = Math.max(0, logList.scrollHeight - logList.clientHeight);
    const nextTop = clamp(Math.floor(ui.logScrollTop), 0, maxScrollTop);
    if (Math.abs(logList.scrollTop - nextTop) > 1) {
      const smooth = ui.logSmoothScroll && typeof logList.scrollTo === "function";
      programmaticLogScrollUntil = Date.now() + PROGRAMMATIC_LOG_SCROLL_MS;
      if (smooth) {
        logList.scrollTo({
          top: nextTop,
          behavior: "smooth"
        });
      } else {
        logList.scrollTop = nextTop;
      }
    }
    if (ui.logViewportHeight !== logList.clientHeight) {
      ui.logViewportHeight = Math.max(120, logList.clientHeight);
    }
  }

  const logTimeline = app.querySelector<HTMLElement>("#log-key-timeline");
  const activeMarker = logTimeline?.querySelector<HTMLElement>(".timeline-marker.active");
  if (logTimeline && activeMarker && typeof activeMarker.scrollIntoView === "function") {
    const containerRect = logTimeline.getBoundingClientRect();
    const markerRect = activeMarker.getBoundingClientRect();
    const outsideViewport = markerRect.left < containerRect.left + 12 || markerRect.right > containerRect.right - 12;
    if (outsideViewport) {
      activeMarker.scrollIntoView({
        behavior: ui.logSmoothScroll ? "smooth" : "auto",
        block: "nearest",
        inline: "center"
      });
    }
  }
}

function setEditorFromActiveProfile(): void {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  ui = { ...ui, editorText: JSON.stringify(profile.config, null, 2), editorErrors: [], tacticRuleEditorError: "" };
}

function markProfileAsCustom(profile: SaveData["tacticsProfiles"][number]): void {
  profile.style = "custom";
  profile.name = "自定义";
  profile.updatedAt = Date.now();
}

function updateActiveProfileConfig(updater: (config: TacticsConfig) => TacticsConfig, successBanner: string): void {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  const nextConfig = updater(cloneJson(profile.config));
  const errors = validateTacticsConfig(nextConfig);
  if (errors.length > 0) {
    ui = { ...ui, editorErrors: errors };
    setBanner("触控规则编辑失败：配置未通过校验。");
    return;
  }

  profile.config = nextConfig;
  markProfileAsCustom(profile);
  save.activePartyTacticProfileId = profile.id;
  persistSave(save);
  setEditorFromActiveProfile();
  setBanner(successBanner);
}

function createRuleId(base: string, existingIds: Set<string>): string {
  let candidate = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (candidate.length < 3) candidate = "rule";
  if (!/^[a-z]/.test(candidate)) candidate = `r_${candidate}`;
  if (!existingIds.has(candidate)) return candidate;
  let index = 2;
  while (existingIds.has(`${candidate}_${index}`)) {
    index += 1;
  }
  return `${candidate}_${index}`;
}

type RuleTemplateKey = "retreat_safe" | "elite_focus" | "resource_guard";

function createRuleTemplate(template: RuleTemplateKey, existingIds: Set<string>): TacticsRule {
  if (template === "retreat_safe") {
    return {
      id: createRuleId("retreat_hp_guard", existingIds),
      scope: "party",
      trigger: "on_turn_start",
      priority: 860,
      when: {
        all: [
          { fact: "ally_min_stress_pct", op: "<=", value: 30 },
          { fact: "combat_is_boss", op: "==", value: true }
        ]
      },
      then: { action: "retreat_combat" },
      cooldown_turns: 2,
      enabled: true
    };
  }

  if (template === "elite_focus") {
    return {
      id: createRuleId("focus_elite_target", existingIds),
      scope: "character",
      trigger: "on_turn_start",
      priority: 720,
      when: {
        all: [
          { fact: "enemy_is_elite", op: "==", value: true },
          { fact: "enemy_count_alive", op: ">=", value: 1 }
        ]
      },
      then: { action: "mark_priority_target" },
      cooldown_turns: 1,
      enabled: true
    };
  }

  return {
    id: createRuleId("resource_guard_mode", existingIds),
    scope: "character",
    trigger: "on_turn_start",
    priority: 640,
    when: {
      all: [
        { fact: "self_resource_pct", op: "<=", value: 25 },
        { fact: "turn_index", op: ">=", value: 2 }
      ]
    },
    then: { action: "save_resource_mode" },
    cooldown_turns: 1,
    enabled: true
  };
}

function summarizeConditionExpr(expr: ConditionExpr): string {
  if ("fact" in expr) {
    const valueText = Array.isArray(expr.value) ? expr.value.join("|") : String(expr.value);
    return `${expr.fact} ${expr.op} ${valueText}`;
  }
  if ("all" in expr) {
    const parts = expr.all.slice(0, 2).map((item) => summarizeConditionExpr(item));
    const suffix = expr.all.length > 2 ? ` 等${expr.all.length}项` : "";
    return parts.join(" 且 ") + suffix;
  }
  if ("any" in expr) {
    const parts = expr.any.slice(0, 2).map((item) => summarizeConditionExpr(item));
    const suffix = expr.any.length > 2 ? ` 等${expr.any.length}项` : "";
    return parts.join(" 或 ") + suffix;
  }
  return `非(${summarizeConditionExpr(expr.not)})`;
}

function ruleEditorOperatorsForFact(fact: Fact): Operator[] {
  if (RULE_EDITOR_NUMERIC_FACTS.has(fact)) return ["==", "!=", "<", "<=", ">", ">="];
  if (RULE_EDITOR_BOOLEAN_FACTS.has(fact)) return ["==", "!="];
  return ["==", "!=", "contains", "in"];
}

function ruleEditorDefaultValueForFact(fact: Fact, op: Operator): string {
  if (RULE_EDITOR_BOOLEAN_FACTS.has(fact)) return "true";
  if (RULE_EDITOR_NUMERIC_FACTS.has(fact)) return "30";
  if (fact === "time_window") return op === "in" ? "day|night" : "night";
  if (op === "in") return "target_a|target_b";
  return "target";
}

function stringifyConditionValue(value: number | boolean | string | readonly string[]): string {
  if (Array.isArray(value)) return value.join("|");
  return String(value);
}

function normalizeConditionValueInput(raw: string): string {
  return raw.trim();
}

function parseRuleEditorValue(
  fact: Fact,
  op: Operator,
  raw: string
): { ok: true; value: number | boolean | string | readonly string[] } | { ok: false; error: string } {
  const normalized = normalizeConditionValueInput(raw);
  if (normalized.length <= 0) {
    return { ok: false, error: "条件值不能为空。" };
  }

  if (RULE_EDITOR_NUMERIC_FACTS.has(fact)) {
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: "该条件需要数字值。" };
    }
    return { ok: true, value: parsed };
  }

  if (RULE_EDITOR_BOOLEAN_FACTS.has(fact)) {
    const lower = normalized.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return { ok: true, value: true };
    if (lower === "false" || lower === "0" || lower === "no") return { ok: true, value: false };
    return { ok: false, error: "布尔值仅支持 true/false（或 1/0）。" };
  }

  if (op === "in") {
    const entries = normalized
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (entries.length <= 0) {
      return { ok: false, error: "in 操作符至少需要一个候选值，可用 | 分隔多个值。" };
    }
    return { ok: true, value: entries };
  }

  return { ok: true, value: normalized };
}

type RuleRootMode = "single" | "all" | "any";

interface RootLeafEdit {
  mode: RuleRootMode;
  leaves: ConditionLeaf[];
  editable: boolean;
}

function cloneConditionLeaf(leaf: ConditionLeaf): ConditionLeaf {
  const value = Array.isArray(leaf.value) ? [...leaf.value] : leaf.value;
  return {
    fact: leaf.fact,
    op: leaf.op,
    value
  };
}

function getFirstConditionLeaf(expr: ConditionExpr): { fact: Fact; op: Operator; value: number | boolean | string | readonly string[] } | null {
  if ("fact" in expr) return expr;
  if ("all" in expr) {
    for (const child of expr.all) {
      const found = getFirstConditionLeaf(child);
      if (found) return found;
    }
    return null;
  }
  if ("any" in expr) {
    for (const child of expr.any) {
      const found = getFirstConditionLeaf(child);
      if (found) return found;
    }
    return null;
  }
  return getFirstConditionLeaf(expr.not);
}

function replaceFirstConditionLeaf(expr: ConditionExpr, replacement: ConditionExpr): { expr: ConditionExpr; replaced: boolean } {
  if ("fact" in expr) {
    return { expr: replacement, replaced: true };
  }
  if ("all" in expr) {
    const nextChildren: ConditionExpr[] = [];
    let replaced = false;
    expr.all.forEach((child) => {
      if (replaced) {
        nextChildren.push(child);
        return;
      }
      const result = replaceFirstConditionLeaf(child, replacement);
      nextChildren.push(result.expr);
      replaced = result.replaced;
    });
    return { expr: { all: nextChildren }, replaced };
  }
  if ("any" in expr) {
    const nextChildren: ConditionExpr[] = [];
    let replaced = false;
    expr.any.forEach((child) => {
      if (replaced) {
        nextChildren.push(child);
        return;
      }
      const result = replaceFirstConditionLeaf(child, replacement);
      nextChildren.push(result.expr);
      replaced = result.replaced;
    });
    return { expr: { any: nextChildren }, replaced };
  }
  const nested = replaceFirstConditionLeaf(expr.not, replacement);
  return { expr: { not: nested.expr }, replaced: nested.replaced };
}

function getEditableRootLeaves(expr: ConditionExpr): RootLeafEdit {
  if ("fact" in expr) {
    return { mode: "single", leaves: [cloneConditionLeaf(expr)], editable: true };
  }
  if ("all" in expr) {
    const leaves = expr.all.filter((item): item is ConditionLeaf => "fact" in item).map((item) => cloneConditionLeaf(item));
    return { mode: "all", leaves, editable: leaves.length === expr.all.length && leaves.length > 0 };
  }
  if ("any" in expr) {
    const leaves = expr.any.filter((item): item is ConditionLeaf => "fact" in item).map((item) => cloneConditionLeaf(item));
    return { mode: "any", leaves, editable: leaves.length === expr.any.length && leaves.length > 0 };
  }
  const first = getFirstConditionLeaf(expr);
  return first ? { mode: "single", leaves: [cloneConditionLeaf(first)], editable: false } : { mode: "single", leaves: [], editable: false };
}

function buildRootCondition(mode: RuleRootMode, leaves: ConditionLeaf[]): ConditionExpr {
  const safeLeaves: ConditionLeaf[] =
    leaves.length > 0
      ? leaves.map((leaf) => cloneConditionLeaf(leaf))
      : [
          {
            fact: "self_stress_pct",
            op: "<=",
            value: 30
          }
        ];
  if (mode === "single") return safeLeaves[0];
  if (mode === "all") return { all: safeLeaves };
  return { any: safeLeaves };
}

function openRuleConditionEditor(ruleId: string, preferredLeafIndex = 0): void {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  const rule = profile.config.rules.find((item) => item.id === ruleId);
  if (!rule) {
    ui = { ...ui, tacticRuleEditorError: "未找到目标规则。" };
    return;
  }
  const root = getEditableRootLeaves(rule.when);
  const leafIndex = clamp(preferredLeafIndex, 0, Math.max(0, root.leaves.length - 1));
  const leaf = root.leaves[leafIndex] ?? getFirstConditionLeaf(rule.when);
  const fact: Fact = leaf?.fact ?? "self_stress_pct";
  const operators = ruleEditorOperatorsForFact(fact);
  const op: Operator = leaf && operators.includes(leaf.op) ? leaf.op : operators[0];
  const value = leaf ? stringifyConditionValue(leaf.value) : ruleEditorDefaultValueForFact(fact, op);

  ui = {
    ...ui,
    tacticRuleEditorRuleId: rule.id,
    tacticRuleEditorLeafIndex: leafIndex,
    tacticRuleEditorFact: fact,
    tacticRuleEditorOp: op,
    tacticRuleEditorValue: value,
    tacticRuleEditorError: root.editable ? "" : "该规则条件结构较复杂，当前只支持替换首个条件叶子。"
  };
}

function closeRuleConditionEditor(): void {
  ui = {
    ...ui,
    tacticRuleEditorRuleId: "",
    tacticRuleEditorLeafIndex: 0,
    tacticRuleEditorError: ""
  };
}

function applyPreset(style: "aggressive" | "balanced" | "cautious"): void {
  const profileId = `profile_${style}`;
  const index = save.tacticsProfiles.findIndex((item) => item.id === profileId);
  const profile = createPresetProfile(style, profileId);

  if (index >= 0) {
    save.tacticsProfiles[index] = profile;
  } else {
    save.tacticsProfiles.push(profile);
  }

  save.activePartyTacticProfileId = profile.id;
  persistSave(save);
  markOnboardingStep("appliedPreset");
  setEditorFromActiveProfile();
  setBanner(`已应用 ${profile.name} 模板，并同步自动调参。`);
}

function upgradeFacility(facilityId: FacilityId): void {
  const level = getFacilityLevel(facilityId);
  const nextCost = getNextFacilityUpgradeCost(facilityId);
  if (!nextCost) {
    setBanner(`${facilityLabel(facilityId)}已达到最高等级。`);
    return;
  }

  if (save.gold < nextCost.gold || save.materials < nextCost.materials) {
    setBanner(`${facilityLabel(facilityId)}升级资源不足。`);
    return;
  }

  const nextLevel = level + 1;
  save = {
    ...save,
    gold: save.gold - nextCost.gold,
    materials: save.materials - nextCost.materials,
    meta: {
      ...save.meta,
      infirmaryLevel: facilityId === "infirmary" ? nextLevel : save.meta.infirmaryLevel,
      workshopLevel: facilityId === "workshop" ? nextLevel : save.meta.workshopLevel
    }
  };
  persistSave(save);

  if (facilityId === "infirmary") {
    setBanner(`疗养所升级完成：Lv.${nextLevel}（返航恢复提升）。`);
  } else {
    setBanner(`工坊升级完成：Lv.${nextLevel}（重铸成本下降${nextLevel >= 3 ? "并提升产出" : ""}）。`);
  }
}

function unlockNextChapter(): void {
  const plan = getNextChapterUnlockPlan();
  if (!plan) {
    setBanner("当前章节已全部解锁。");
    return;
  }

  const issues = getChapterUnlockIssues(plan);
  if (issues.length > 0) {
    setBanner(`章节推进条件未满足：${issues[0]}。`);
    return;
  }

  const previousStatusByQuest = new Map(save.quests.map((quest) => [quest.id, quest.status]));
  const reconciled = reconcileQuestsWithContent(save.quests, plan.chapter);
  save = {
    ...save,
    gold: save.gold - plan.gold,
    materials: save.materials - plan.materials,
    meta: {
      ...save.meta,
      chapterUnlocked: plan.chapter
    },
    quests: reconciled.quests
  };
  persistSave(save);

  const unlocked = DUNGEONS.filter((dungeon) => requiredChapterForDungeon(dungeon.id) === plan.chapter)
    .map((dungeon) => dungeon.name)
    .join("、");
  const unlockedQuests = reconciled.quests
    .filter((quest) => {
      const previous = previousStatusByQuest.get(quest.id);
      const chapter = getQuestContentById(quest.id)?.chapter ?? 1;
      return previous === "locked" && quest.status === "active" && chapter === plan.chapter;
    })
    .map((quest) => quest.title)
    .join("、");
  const unlockedText = unlocked.length > 0 ? `，新增航线：${unlocked}` : "";
  const unlockedQuestText = unlockedQuests.length > 0 ? `，新增委托：${unlockedQuests}` : "";
  setBanner(`章节推进完成：已解锁第 ${plan.chapter} 章${unlockedText}${unlockedQuestText}。`);
}

function buyItem(itemId: string): void {
  const item = INVENTORY_CATALOG[itemId];
  if (!item) return;
  if (save.gold < item.price) {
    setBanner("金币不足，无法购买。");
    return;
  }

  save.gold -= item.price;
  save.inventory[itemId] = (save.inventory[itemId] ?? 0) + 1;
  persistSave(save);
  setBanner(`购买成功：${item.name} x1`);
}

function craftPhaseCalibrator(): void {
  const recipe = getWorkshopRecipeView();
  const shardCount = save.inventory[REFORGE_RECIPE.inputItem] ?? 0;
  if (shardCount < recipe.inputCount) {
    setBanner("碎晶不足，无法重铸。");
    return;
  }

  if (save.gold < recipe.goldCost || save.materials < recipe.materialCost) {
    setBanner("金币或材料不足，无法重铸。");
    return;
  }

  save.inventory[REFORGE_RECIPE.inputItem] = shardCount - recipe.inputCount;
  save.gold -= recipe.goldCost;
  save.materials -= recipe.materialCost;
  save.inventory[REFORGE_RECIPE.outputItem] = (save.inventory[REFORGE_RECIPE.outputItem] ?? 0) + recipe.outputCount;
  persistSave(save);

  const outputName = INVENTORY_CATALOG[REFORGE_RECIPE.outputItem]?.name ?? REFORGE_RECIPE.outputItem;
  setBanner(`重铸成功：${outputName} x${recipe.outputCount}`);
}

function applyFailureAssist(style: TacticStyle, questId: string): void {
  applyPreset(style);
  save.hintClaims[questId] = (save.hintClaims[questId] ?? 0) + 1;
  persistSave(save);
  setBanner(`连续失败保护已生效：已应用${styleLabel(style)}模板。`);
}

function setDefaultLogView(view: LogView): void {
  save.settings = {
    ...save.settings,
    defaultLogView: view
  };
  ui = { ...ui, logView: view };
  persistSave(save);
  setBanner(`默认日志视图已切换为${view === "debug" ? "调试" : "叙事"}。`);
}

function toggleOnboardingCard(): void {
  save.settings = {
    ...save.settings,
    showOnboardingCard: !save.settings.showOnboardingCard
  };
  persistSave(save);
  setBanner(save.settings.showOnboardingCard ? "已显示新手引导卡。" : "已隐藏新手引导卡。");
}

function toggleRunNotification(): void {
  const nextEnabled = !save.settings.notifyOnRunComplete;
  save.settings = {
    ...save.settings,
    notifyOnRunComplete: nextEnabled,
    notifyFailOnly: nextEnabled ? save.settings.notifyFailOnly : false
  };
  persistSave(save);
  setBanner(nextEnabled ? "出征完成通知已开启。" : "出征完成通知已关闭。");
}

function toggleNotifyFailOnly(): void {
  if (!save.settings.notifyOnRunComplete) {
    setBanner("请先开启出征完成通知。");
    return;
  }

  save.settings = {
    ...save.settings,
    notifyFailOnly: !save.settings.notifyFailOnly
  };
  persistSave(save);
  setBanner(save.settings.notifyFailOnly ? "已切换为仅失败通知。" : "已切换为全部结果通知。");
}

function toggleAdvancedDebug(): void {
  save.settings = {
    ...save.settings,
    advancedDebugView: !save.settings.advancedDebugView
  };
  persistSave(save);
  setBanner(save.settings.advancedDebugView ? "高级调试已开启：调试视图将显示 rule_id。" : "高级调试已关闭：调试视图将隐藏 rule_id。");
}

function setExpeditionTimeScale(scale: ExpeditionTimeScale): void {
  if (save.activeRunPlan) {
    setBanner("当前已有探险在进行中，返航后再调整时间倍率。");
    return;
  }

  if (!TIME_SCALE_OPTIONS.includes(scale)) return;
  if (save.settings.expeditionTimeScale === scale) {
    setBanner(`探险时间倍率已是 ${timeScaleLabel(scale)}。`);
    return;
  }

  save.settings = {
    ...save.settings,
    expeditionTimeScale: scale
  };
  persistSave(save);
  setBanner(`探险时间倍率已切换为 ${timeScaleLabel(scale)}。`);
}

function pauseActiveRun(): void {
  const plan = save.activeRunPlan;
  if (!plan) {
    setBanner("当前没有进行中的探险。");
    return;
  }
  if (plan.pausedAt != null) {
    setBanner("探险已经处于暂停状态。");
    return;
  }

  save.activeRunPlan = {
    ...plan,
    pausedAt: runtimeNow()
  };
  persistSave(save);
  setBanner("探险已暂停，进度与日志已冻结。");
}

function resumeActiveRun(): void {
  const plan = save.activeRunPlan;
  if (!plan) {
    setBanner("当前没有进行中的探险。");
    return;
  }
  if (plan.pausedAt == null) {
    setBanner("探险当前不是暂停状态。");
    return;
  }

  const pauseDelta = Math.max(0, runtimeNow() - plan.pausedAt);
  save.activeRunPlan = {
    ...plan,
    pausedAt: null,
    pausedAccumMs: Math.max(0, plan.pausedAccumMs) + pauseDelta
  };
  persistSave(save);
  setBanner("探险已恢复，计时继续推进。");
}

function setActiveRunSpeedMultiplier(multiplier: ActiveRunSpeedMultiplier): void {
  const plan = save.activeRunPlan;
  if (!plan) {
    setBanner("当前没有进行中的探险。");
    return;
  }
  if (!ACTIVE_RUN_SPEED_OPTIONS.includes(multiplier)) return;
  if (multiplier === plan.runtimeSpeedMultiplier) {
    setBanner(`当前倍率已是 ${multiplier}x。`);
    return;
  }

  const now = runtimeNow();
  const elapsedMs = planElapsedMs(plan, now);
  const unlockedEventCount = resolvedUnlockedEventCount(plan, elapsedMs);
  const durationMs = planDurationMs(plan);
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  if (remainingMs <= 0) {
    finalizeActiveRunIfDue();
    return;
  }

  const previousMultiplier = plan.runtimeSpeedMultiplier;
  const baselineRemainingMs = remainingMs * plan.runtimeSpeedMultiplier;
  const acceleratedRemainingMs = Math.max(1, Math.round(baselineRemainingMs / multiplier));
  const nextDurationMs = Math.max(1000, Math.round(elapsedMs + acceleratedRemainingMs));
  const nextFinishAt = plan.startedAt + nextDurationMs;
  const retimedRun = retimeRunForDuration(plan.run, plan.startedAt, nextFinishAt);

  save.activeRunPlan = {
    ...plan,
    run: retimedRun,
    finishAt: nextFinishAt,
    runtimeSpeedMultiplier: multiplier,
    unlockedEventCount
  };
  persistSave(save);

  const snapshot = getActiveRunSnapshot();
  const remainText = snapshot ? formatCountdown(snapshot.remainingMs) : formatCountdown(acceleratedRemainingMs);
  const verb = multiplier > previousMultiplier ? "加速至" : "调整为";
  setBanner(`探险倍率已${verb} ${multiplier}x，预计剩余 ${remainText}。`);
}

function exportSaveBackup(): void {
  const blob = new Blob([exportSaveString(save)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `skywake-save-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setBanner("存档备份已导出。");
}

function importSaveBackup(): void {
  const result = importSaveString(ui.importText);
  if (!result.ok) {
    ui = { ...ui, importErrors: [result.error] };
    setBanner("导入失败，请检查备份内容。");
    return;
  }

  save = result.save;
  ui = {
    ...ui,
    selectedRunId: pickDefaultRunId(),
    replayIndex: 0,
    expandedLogSeq: 0,
    logView: save.settings.defaultLogView,
    logTypeFilter: "all",
    logReasonFilter: "all",
    logScrollTop: 0,
    logVirtualRow: 0,
    logQuickSeq: 0,
    logQuickType: "all",
    logQuickReason: "all",
    editorText: initialEditorText(),
    editorErrors: [],
    importErrors: []
  };
  setBanner("导入成功，当前存档已覆盖并完成迁移。");
}

function parseConfigInput(raw: string, baseline: TacticsConfig): TacticsConfig {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return {
      ...baseline,
      rules: parsed as TacticsRule[]
    };
  }

  if (parsed && typeof parsed === "object") {
    const maybeConfig = parsed as Record<string, unknown>;
    if ("rules" in maybeConfig && Array.isArray(maybeConfig.rules)) {
      const hasRootConfigShape =
        "version" in maybeConfig && "conflict_policy" in maybeConfig && "fallback_by_role" in maybeConfig;
      if (!hasRootConfigShape) {
        return {
          ...baseline,
          rules: maybeConfig.rules as TacticsRule[]
        };
      }
      return maybeConfig as unknown as TacticsConfig;
    }
  }

  throw new Error("规则输入必须是 TacticsConfig 对象，或 rules 数组");
}

function applyRulesEditor(): void {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);

  try {
    const config = parseConfigInput(ui.editorText, profile.config);
    const errors = validateTacticsConfig(config);
    if (errors.length > 0) {
      ui = { ...ui, editorErrors: errors };
      setBanner("规则校验失败，请修复后再应用。");
      return;
    }

    profile.config = config;
    profile.style = "custom";
    profile.name = "自定义";
    profile.updatedAt = Date.now();
    save.activePartyTacticProfileId = profile.id;
    persistSave(save);

    ui = { ...ui, editorErrors: [] };
    setBanner("规则已应用，下一次出征会立即生效。请在日志调试视图验证命中差异。");
  } catch (error) {
    const message = error instanceof Error ? error.message : "规则 JSON 解析失败";
    ui = { ...ui, editorErrors: [message] };
    setBanner("规则解析失败。请检查 JSON 格式。");
  }
}

function startRun(): void {
  finalizeActiveRunIfDue();
  if (save.activeRunPlan) {
    const snapshot = getActiveRunSnapshot();
    const remainText = snapshot ? formatCountdown(snapshot.remainingMs) : "稍后";
    setBanner(`已有出征任务进行中，预计 ${remainText} 后返航。`);
    return;
  }

  const dungeon = getDungeon();
  if (!isDungeonUnlocked(dungeon.id)) {
    const chapterNeed = requiredChapterForDungeon(dungeon.id);
    setBanner(`该迷宫尚未开放，需要第 ${chapterNeed} 章（当前第 ${save.meta.chapterUnlocked} 章）。`);
    ui = { ...ui, tab: "town" };
    return;
  }

  const plannedFloor = clampPlannedFloor(ui.plannedFloor);
  const request = {
    dungeonId: dungeon.id,
    plannedFloor
  };
  const estimate = estimateRunMinutes(save, request);
  const simulationSave = deepCloneSave(save);
  const simulation = simulateRun(simulationSave, request);
  const durationMs = computePlannedDurationMs(
    estimate.minMinutes,
    estimate.maxMinutes,
    simulation.run.seed,
    save.settings.expeditionTimeScale
  );
  const startedAt = runtimeNow();
  const finishAt = startedAt + durationMs;
  const timedRun = retimeRunForDuration(simulation.run, startedAt, finishAt);
  const postRunDelta: ActiveRunPlan["postRunDelta"] = {
    runCounter: simulation.save.runCounter,
    gold: simulation.save.gold,
    materials: simulation.save.materials,
    fatePoints: simulation.save.fatePoints,
    meta: cloneJson(simulation.save.meta),
    inventory: cloneJson(simulation.save.inventory),
    characters: cloneJson(simulation.save.characters),
    quests: cloneJson(simulation.save.quests)
  };

  save = {
    ...save,
    runCounter: simulation.save.runCounter,
    activeRunPlan: {
      run: timedRun,
      startedAt,
      finishAt,
      runtimeSpeedMultiplier: 1,
      unlockedEventCount: 0,
      pausedAt: null,
      pausedAccumMs: 0,
      postRunDelta
    }
  };
  markOnboardingStep("startedRun");
  persistSave(save);

  ui = {
    ...ui,
    selectedRunId: timedRun.runId,
    replayIndex: 0,
    expandedLogSeq: 0,
    tab: "expedition",
    logTypeFilter: "all",
    logReasonFilter: "all",
    logScrollTop: 0,
    logVirtualRow: 0,
    logQuickSeq: 0,
    logQuickType: "all",
    logQuickReason: "all"
  };

  setBanner(`出征已开始（${timeScaleLabel(save.settings.expeditionTimeScale)}）：预计 ${formatCountdown(durationMs)} 后返航。`);
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const actionNode = target.closest("[data-action]");
  if (!(actionNode instanceof HTMLElement)) return;
  if (actionNode instanceof HTMLButtonElement && actionNode.disabled) return;

  const action = actionNode.dataset.action;
  const value = actionNode.dataset.value ?? "";
  const questId = actionNode.dataset.questId ?? "";
  finalizeActiveRunIfDue();
  const blockedWhileRunning = new Set([
    "start-run",
    "apply-preset",
    "apply-rules",
    "rule-add-template",
    "rule-toggle-enabled",
    "rule-priority-up",
    "rule-priority-down",
    "rule-delete",
    "rules-sort-priority",
    "rule-apply-condition-editor",
    "rule-editor-select-leaf",
    "rule-editor-add-leaf",
    "rule-editor-remove-leaf",
    "rule-editor-set-joiner",
    "buy-item",
    "craft-calibrator",
    "upgrade-infirmary",
    "upgrade-workshop",
    "unlock-next-chapter",
    "apply-diagnosis-preset",
    "apply-analytics-preset",
    "apply-failure-assist",
    "guide-apply-balanced",
    "guide-start-run",
    "import-save",
    "wipe-save"
  ]);
  if (action && save.activeRunPlan && blockedWhileRunning.has(action)) {
    const snapshot = getActiveRunSnapshot();
    const remainText = snapshot ? formatCountdown(snapshot.remainingMs) : "稍后";
    setBanner(`队伍仍在探险中（剩余 ${remainText}），请等待返航后再操作。`);
    render();
    return;
  }

  const selectedRun = getSelectedRun();
  const replayMoments = buildReplayMoments(selectedRun);
  const replayIndex = clampReplayIndex(ui.replayIndex, replayMoments.length);

  if (action === "switch-tab") {
    const nextTab = value as UiState["tab"];
    ui =
      nextTab === "expedition"
        ? { ...ui, tab: nextTab }
        : {
            ...ui,
            tab: nextTab,
            logQuickSeq: 0,
            logQuickType: "all",
            logQuickReason: "all"
          };
    if (nextTab === "party") {
      markOnboardingStep("openedPartyTab");
    }
  } else if (action === "toggle-expedition-panel") {
    const panelId = value.trim();
    if (panelId.length > 0) {
      const collapsed = ui.collapsedExpeditionPanels.includes(panelId);
      const nextCollapsed = collapsed
        ? ui.collapsedExpeditionPanels.filter((item) => item !== panelId)
        : [...ui.collapsedExpeditionPanels, panelId];
      ui = {
        ...ui,
        tab: "expedition",
        collapsedExpeditionPanels: nextCollapsed,
        logQuickSeq: 0,
        logQuickType: "all",
        logQuickReason: "all"
      };
    }
  } else if (action === "set-log-view") {
    const nextLogView: LogView = value === "debug" ? "debug" : "narrative";
    ui = {
      ...ui,
      logView: nextLogView,
      expandedLogSeq: 0,
      logVirtualRow: logVirtualRowByTop(ui.logScrollTop, nextLogView),
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
    if (value === "debug") {
      markOnboardingStep("viewedDebugLog");
    }
  } else if (action === "toggle-log-auto-follow") {
    const nextAutoFollow = !ui.logAutoFollow;
    const selectedRunForFollow = getSelectedRun();
    if (nextAutoFollow && selectedRunForFollow && selectedRunForFollow.events.length > 0) {
      const latest = selectedRunForFollow.events[selectedRunForFollow.events.length - 1];
      const latestTop = approximateLogScrollTopForSeq(selectedRunForFollow, latest.seq, ui.logView);
      ui = {
        ...ui,
        tab: "expedition",
        logAutoFollow: true,
        expandedLogSeq: latest.seq,
        logScrollTop: latestTop,
        logVirtualRow: logVirtualRowByTop(latestTop, ui.logView)
      };
    } else {
      ui = {
        ...ui,
        logAutoFollow: nextAutoFollow
      };
    }
  } else if (action === "toggle-log-smooth") {
    ui = {
      ...ui,
      logSmoothScroll: !ui.logSmoothScroll
    };
  } else if (action === "quick-log-type") {
    const nextType = value as EventType | "all";
    ui = {
      ...ui,
      tab: "expedition",
      logTypeFilter: nextType || "all",
      expandedLogSeq: 0,
      logScrollTop: 0,
      logVirtualRow: 0,
      logAutoFollow: false,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
  } else if (action === "quick-log-reason") {
    const nextReason = value === "all" ? "all" : (value as ReasonTag);
    ui = {
      ...ui,
      tab: "expedition",
      logReasonFilter: nextReason,
      expandedLogSeq: 0,
      logScrollTop: 0,
      logVirtualRow: 0,
      logAutoFollow: false,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
  } else if (action === "clear-log-filters") {
    ui = {
      ...ui,
      tab: "expedition",
      logTypeFilter: "all",
      logReasonFilter: "all",
      expandedLogSeq: 0,
      logScrollTop: 0,
      logVirtualRow: 0,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
    setBanner("日志筛选已清空。");
  } else if (action === "jump-latest-log") {
    if (selectedRun && selectedRun.events.length > 0) {
      const latest = selectedRun.events[selectedRun.events.length - 1];
      const latestTop = approximateLogScrollTopForSeq(selectedRun, latest.seq, ui.logView);
      ui = {
        ...ui,
        tab: "expedition",
        expandedLogSeq: latest.seq,
        selectedRunId: selectedRun.runId,
        logAutoFollow: true,
        logScrollTop: latestTop,
        logVirtualRow: logVirtualRowByTop(latestTop, ui.logView),
        logQuickSeq: 0,
        logQuickType: "all",
        logQuickReason: "all"
      };
      setBanner(`已定位到最新事件 #${latest.seq}。`);
    }
  } else if (action === "start-run") {
    startRun();
  } else if (action === "apply-preset") {
    if (value === "aggressive" || value === "balanced" || value === "cautious") {
      applyPreset(value);
    }
  } else if (action === "apply-rules") {
    applyRulesEditor();
  } else if (action === "reset-rules") {
    setEditorFromActiveProfile();
    setBanner("已重置为当前模板规则。");
  } else if (action === "rule-open-condition-editor") {
    const ruleId = value.trim();
    if (ruleId.length > 0) {
      openRuleConditionEditor(ruleId);
      setBanner(`已打开规则 ${ruleId} 条件编辑。`);
    }
  } else if (action === "rule-editor-select-leaf") {
    const ruleId = ui.tacticRuleEditorRuleId.trim();
    const leafIndex = Number(value);
    if (ruleId.length > 0 && Number.isFinite(leafIndex)) {
      openRuleConditionEditor(ruleId, Math.max(0, Math.floor(leafIndex)));
    }
  } else if (action === "rule-editor-add-leaf") {
    const ruleId = ui.tacticRuleEditorRuleId.trim();
    if (ruleId.length > 0) {
      const newLeaf: ConditionLeaf = { fact: "self_stress_pct", op: "<=", value: 30 };
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: config.rules.map((rule) => {
            if (rule.id !== ruleId) return rule;
            const root = getEditableRootLeaves(rule.when);
            if (!root.editable) return rule;
            const nextLeaves = [...root.leaves, newLeaf];
            const nextMode: RuleRootMode = root.mode === "single" ? "all" : root.mode;
            return {
              ...rule,
              when: buildRootCondition(nextMode, nextLeaves)
            };
          })
        }),
        `规则 ${ruleId} 已新增条件叶子。`
      );
      openRuleConditionEditor(ruleId, ui.tacticRuleEditorLeafIndex + 1);
    }
  } else if (action === "rule-editor-remove-leaf") {
    const ruleId = ui.tacticRuleEditorRuleId.trim();
    if (ruleId.length > 0) {
      const targetIndex = Math.max(0, Math.floor(ui.tacticRuleEditorLeafIndex));
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: config.rules.map((rule) => {
            if (rule.id !== ruleId) return rule;
            const root = getEditableRootLeaves(rule.when);
            if (!root.editable || root.leaves.length <= 1) return rule;
            const nextLeaves = root.leaves.filter((_, index) => index !== targetIndex);
            const nextMode: RuleRootMode = nextLeaves.length <= 1 ? "single" : root.mode;
            return {
              ...rule,
              when: buildRootCondition(nextMode, nextLeaves)
            };
          })
        }),
        `规则 ${ruleId} 已删除条件叶子。`
      );
      openRuleConditionEditor(ruleId, Math.max(0, targetIndex - 1));
    }
  } else if (action === "rule-editor-set-joiner") {
    const ruleId = ui.tacticRuleEditorRuleId.trim();
    if (ruleId.length > 0 && (value === "all" || value === "any")) {
      const targetMode = value as RuleRootMode;
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: config.rules.map((rule) => {
            if (rule.id !== ruleId) return rule;
            const root = getEditableRootLeaves(rule.when);
            if (!root.editable) return rule;
            return {
              ...rule,
              when: buildRootCondition(targetMode, root.leaves)
            };
          })
        }),
        `规则 ${ruleId} 根条件已切换为 ${targetMode}。`
      );
      openRuleConditionEditor(ruleId, ui.tacticRuleEditorLeafIndex);
    }
  } else if (action === "rule-close-condition-editor") {
    closeRuleConditionEditor();
  } else if (action === "rule-apply-condition-editor") {
    const ruleId = ui.tacticRuleEditorRuleId.trim();
    if (ruleId.length <= 0) {
      ui = { ...ui, tacticRuleEditorError: "请先选择要编辑的规则。" };
    } else {
      const operators = ruleEditorOperatorsForFact(ui.tacticRuleEditorFact);
      if (!operators.includes(ui.tacticRuleEditorOp)) {
        ui = { ...ui, tacticRuleEditorError: "当前操作符与 Fact 不匹配。" };
      } else {
        const parsed = parseRuleEditorValue(ui.tacticRuleEditorFact, ui.tacticRuleEditorOp, ui.tacticRuleEditorValue);
        if (!parsed.ok) {
          ui = { ...ui, tacticRuleEditorError: parsed.error };
        } else {
          const replacement: ConditionLeaf = {
            fact: ui.tacticRuleEditorFact,
            op: ui.tacticRuleEditorOp,
            value: parsed.value
          };
          updateActiveProfileConfig(
            (config) => ({
              ...config,
              rules: config.rules.map((rule) => {
                if (rule.id !== ruleId) return rule;
                const root = getEditableRootLeaves(rule.when);
                if (root.editable && root.leaves.length > 0) {
                  const targetIndex = clamp(ui.tacticRuleEditorLeafIndex, 0, root.leaves.length - 1);
                  const nextLeaves = root.leaves.map((leaf, index) => (index === targetIndex ? replacement : leaf));
                  return {
                    ...rule,
                    when: buildRootCondition(root.mode, nextLeaves)
                  };
                }
                const nextWhen = replaceFirstConditionLeaf(rule.when, replacement);
                return {
                  ...rule,
                  when: nextWhen.replaced ? nextWhen.expr : replacement
                };
              })
            }),
            `规则 ${ruleId} 条件已更新。`
          );
          openRuleConditionEditor(ruleId);
        }
      }
    }
  } else if (action === "rule-add-template") {
    if (value === "retreat_safe" || value === "elite_focus" || value === "resource_guard") {
      const templateKey = value as RuleTemplateKey;
      const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
      const existingIds = new Set(profile.config.rules.map((rule) => rule.id));
      const nextRule = createRuleTemplate(templateKey, existingIds);
      const templateLabel =
        templateKey === "retreat_safe" ? "Boss 低血撤退" : templateKey === "elite_focus" ? "精英优先集火" : "资源保守模式";
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: [...config.rules, nextRule]
        }),
        `已新增规则模板：${templateLabel}。`
      );
    }
  } else if (action === "rule-toggle-enabled") {
    const ruleId = value.trim();
    if (ruleId.length > 0) {
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: config.rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule))
        }),
        `规则 ${ruleId} 已切换启用状态。`
      );
    }
  } else if (action === "rule-priority-up" || action === "rule-priority-down") {
    const ruleId = value.trim();
    if (ruleId.length > 0) {
      const delta = action === "rule-priority-up" ? 10 : -10;
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: config.rules.map((rule) =>
            rule.id === ruleId ? { ...rule, priority: clamp(rule.priority + delta, 0, 1000) } : rule
          )
        }),
        `规则 ${ruleId} 优先级已调整。`
      );
    }
  } else if (action === "rule-delete") {
    const ruleId = value.trim();
    if (ruleId.length > 0) {
      updateActiveProfileConfig(
        (config) => ({
          ...config,
          rules: config.rules.filter((rule) => rule.id !== ruleId)
        }),
        `规则 ${ruleId} 已删除。`
      );
      if (ui.tacticRuleEditorRuleId === ruleId) {
        closeRuleConditionEditor();
      }
    }
  } else if (action === "rules-sort-priority") {
    updateActiveProfileConfig(
      (config) => ({
        ...config,
        rules: [...config.rules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      }),
      "规则已按优先级整理。"
    );
  } else if (action === "buy-item") {
    buyItem(value);
  } else if (action === "craft-calibrator") {
    craftPhaseCalibrator();
  } else if (action === "upgrade-infirmary") {
    upgradeFacility("infirmary");
  } else if (action === "upgrade-workshop") {
    upgradeFacility("workshop");
  } else if (action === "unlock-next-chapter") {
    unlockNextChapter();
  } else if (action === "apply-diagnosis-preset") {
    if (value === "aggressive" || value === "balanced" || value === "cautious") {
      applyPreset(value);
      setBanner(`复盘建议已应用：当前模板为${styleLabel(value)}。`);
    }
  } else if (action === "apply-analytics-preset") {
    if (value === "aggressive" || value === "balanced" || value === "cautious") {
      applyPreset(value);
      setBanner(`统计建议已应用：当前模板为${styleLabel(value)}。`);
    }
  } else if (action === "filter-log-reason") {
    const reason = value as ReasonTag;
    const activeRun = getActiveRunSnapshot()?.run ?? null;
    const runWithReason = [activeRun, ...save.runs].find((item) => item?.reasonTags.includes(reason));
    ui = {
      ...ui,
      tab: "expedition",
      selectedRunId: runWithReason?.runId ?? ui.selectedRunId,
      replayIndex: 0,
      expandedLogSeq: 0,
      logReasonFilter: reason,
      logAutoFollow: false,
      logScrollTop: 0,
      logVirtualRow: 0,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
    setBanner(`已筛选日志原因：${reasonText(reason)}。`);
  } else if (action === "apply-failure-assist") {
    if ((value === "aggressive" || value === "balanced" || value === "cautious") && questId.length > 0) {
      applyFailureAssist(value, questId);
    }
  } else if (action === "view-run") {
    ui = {
      ...ui,
      selectedRunId: value,
      replayIndex: 0,
      expandedLogSeq: 0,
      tab: "expedition",
      logAutoFollow: false,
      logScrollTop: 0,
      logVirtualRow: 0,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
  } else if (action === "guide-open-party") {
    ui = { ...ui, tab: "party" };
    markOnboardingStep("openedPartyTab");
  } else if (action === "guide-apply-balanced") {
    applyPreset("balanced");
  } else if (action === "guide-start-run") {
    startRun();
  } else if (action === "guide-open-debug-log") {
    ui = {
      ...ui,
      tab: "expedition",
      logView: "debug",
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
    markOnboardingStep("viewedDebugLog");
  } else if (action === "dismiss-onboarding") {
    save.settings = { ...save.settings, showOnboardingCard: false };
    persistSave(save);
    setBanner("新手引导卡已隐藏。");
  } else if (action === "set-default-log-view") {
    if (value === "narrative" || value === "debug") {
      setDefaultLogView(value);
    }
  } else if (action === "toggle-onboarding-card") {
    toggleOnboardingCard();
  } else if (action === "toggle-notify-on-run") {
    toggleRunNotification();
  } else if (action === "toggle-notify-fail-only") {
    toggleNotifyFailOnly();
  } else if (action === "toggle-advanced-debug") {
    toggleAdvancedDebug();
  } else if (action === "pause-run") {
    pauseActiveRun();
  } else if (action === "resume-run") {
    resumeActiveRun();
  } else if (action === "set-run-speed") {
    const multiplier = Number(value);
    if (multiplier === 1 || multiplier === 2 || multiplier === 4 || multiplier === 8) {
      setActiveRunSpeedMultiplier(multiplier);
    }
  } else if (action === "set-time-scale") {
    const scale = Number(value);
    if (scale === 1 || scale === 4 || scale === 10) {
      setExpeditionTimeScale(scale);
    }
  } else if (action === "request-notification-permission") {
    void requestNotificationPermission();
  } else if (action === "replay-prev") {
    ui = { ...ui, replayIndex: clampReplayIndex(replayIndex - 1, replayMoments.length) };
  } else if (action === "replay-next") {
    ui = { ...ui, replayIndex: clampReplayIndex(replayIndex + 1, replayMoments.length) };
  } else if (action === "replay-select") {
    const targetIndex = Number(value);
    if (Number.isFinite(targetIndex)) {
      const nextIndex = clampReplayIndex(targetIndex, replayMoments.length);
      const step = replayMoments[nextIndex];
      if (step) {
        const stepTop = approximateLogScrollTopForSeq(selectedRun, step.seq, ui.logView);
        ui = {
          ...ui,
          replayIndex: nextIndex,
          tab: "expedition",
          expandedLogSeq: step.seq,
          logTypeFilter: step.eventType,
          logReasonFilter: step.reasonTags[0] ?? "all",
          logScrollTop: stepTop,
          logVirtualRow: logVirtualRowByTop(stepTop, ui.logView),
          logQuickSeq: 0,
          logQuickType: "all",
          logQuickReason: "all"
        };
        setBanner(`回放已定位到 #${step.seq}。`);
      }
    }
  } else if (action === "replay-focus-active") {
    const step = replayMoments[replayIndex];
    if (step) {
      const stepTop = approximateLogScrollTopForSeq(selectedRun, step.seq, ui.logView);
      ui = {
        ...ui,
        tab: "expedition",
        expandedLogSeq: step.seq,
        logTypeFilter: step.eventType,
        logReasonFilter: step.reasonTags[0] ?? "all",
        logScrollTop: stepTop,
        logVirtualRow: logVirtualRowByTop(stepTop, ui.logView),
        logQuickSeq: 0,
        logQuickType: "all",
        logQuickReason: "all"
      };
      setBanner(`已按回放步骤过滤日志：#${step.seq} ${step.eventType}。`);
    }
  } else if (action === "log-quick-expand") {
    const seq = ui.logQuickSeq;
    if (seq > 0) {
      const seqTop = approximateLogScrollTopForSeq(selectedRun, seq, ui.logView);
      ui = {
        ...ui,
        tab: "expedition",
        expandedLogSeq: ui.expandedLogSeq === seq ? 0 : seq,
        logScrollTop: seqTop,
        logVirtualRow: logVirtualRowByTop(seqTop, ui.logView)
      };
      closeLogQuickSheet();
      setBanner(`已定位日志 #${seq}。`);
    }
  } else if (action === "log-quick-filter-type") {
    if (value.length > 0) {
      const eventType = value as EventType;
      ui = {
        ...ui,
        tab: "expedition",
        logTypeFilter: eventType,
        logReasonFilter: "all",
        expandedLogSeq: ui.logQuickSeq,
        logScrollTop: approximateLogScrollTopForSeq(selectedRun, ui.logQuickSeq, ui.logView),
        logVirtualRow: logVirtualRowByTop(
          approximateLogScrollTopForSeq(selectedRun, ui.logQuickSeq, ui.logView),
          ui.logView
        )
      };
      closeLogQuickSheet();
      setBanner(`已按类型筛选：${eventTypeLabel(eventType)}。`);
    }
  } else if (action === "log-quick-filter-reason") {
    if (value.length > 0) {
      const reason = value as ReasonTag;
      const seqTop = approximateLogScrollTopForSeq(selectedRun, ui.logQuickSeq, ui.logView);
      ui = {
        ...ui,
        tab: "expedition",
        logReasonFilter: reason,
        expandedLogSeq: ui.logQuickSeq,
        logScrollTop: seqTop,
        logVirtualRow: logVirtualRowByTop(seqTop, ui.logView)
      };
      closeLogQuickSheet();
      setBanner(`已按原因筛选：${reasonText(reason)}。`);
    }
  } else if (action === "log-quick-jump-replay") {
    const seq = Number(value);
    if (Number.isFinite(seq) && replayMoments.length > 0) {
      const nextIndex = findClosestReplayMomentIndex(replayMoments, seq);
      const step = replayMoments[nextIndex];
      if (step) {
        const stepTop = approximateLogScrollTopForSeq(selectedRun, step.seq, ui.logView);
        ui = {
          ...ui,
          tab: "expedition",
          replayIndex: nextIndex,
          expandedLogSeq: step.seq,
          logTypeFilter: step.eventType,
          logReasonFilter: step.reasonTags[0] ?? "all",
          logScrollTop: stepTop,
          logVirtualRow: logVirtualRowByTop(stepTop, ui.logView)
        };
        closeLogQuickSheet();
        setBanner(`已跳转至最接近的回放步骤 #${step.seq}。`);
      }
    }
  } else if (action === "close-log-quick-sheet") {
    closeLogQuickSheet();
  } else if (action === "log-focus-event") {
    const seq = Number(value);
    if (selectedRun && Number.isFinite(seq)) {
      const targetTop = approximateLogScrollTopForSeq(selectedRun, seq, ui.logView);
      ui = {
        ...ui,
        tab: "expedition",
        expandedLogSeq: seq,
        logAutoFollow: false,
        logScrollTop: targetTop,
        logVirtualRow: logVirtualRowByTop(targetTop, ui.logView),
        logQuickSeq: 0,
        logQuickType: "all",
        logQuickReason: "all"
      };
    }
  } else if (action === "log-focus-type") {
    if (selectedRun && value.length > 0) {
      const targetType = value as EventType;
      const visibleEvents = filterRunEvents(selectedRun, ui.logTypeFilter, ui.logReasonFilter);
      const targetSeq = findNextSeqByEventType(visibleEvents, targetType, ui.expandedLogSeq);
      if (targetSeq != null) {
        const targetTop = approximateLogScrollTopForSeq(selectedRun, targetSeq, ui.logView);
        ui = {
          ...ui,
          tab: "expedition",
          expandedLogSeq: targetSeq,
          logAutoFollow: false,
          logScrollTop: targetTop,
          logVirtualRow: logVirtualRowByTop(targetTop, ui.logView),
          logQuickSeq: 0,
          logQuickType: "all",
          logQuickReason: "all"
        };
        setBanner(`已定位到 ${eventTypeLabel(targetType)}：#${targetSeq}。`);
      }
    }
  } else if (action === "toggle-log-expand") {
    const seq = Number(value);
    if (Number.isFinite(seq)) {
      if (suppressLogToggleSeq === seq) {
        suppressLogToggleSeq = 0;
        return;
      }
      ui = { ...ui, expandedLogSeq: seq, logAutoFollow: false };
    }
  } else if (action === "export-save") {
    exportSaveBackup();
  } else if (action === "import-save") {
    importSaveBackup();
  } else if (action === "clear-import") {
    ui = { ...ui, importText: "", importErrors: [] };
    setBanner("已清空导入内容。");
  } else if (action === "wipe-save") {
    if (window.confirm("确认重置存档？此操作不可撤销。")) {
      save = wipeSave();
      ui = {
        ...ui,
        selectedRunId: "",
        replayIndex: 0,
        expandedLogSeq: 0,
        logView: save.settings.defaultLogView,
        logScrollTop: 0,
        logVirtualRow: 0,
        logQuickSeq: 0,
        logQuickType: "all",
        logQuickReason: "all",
        editorText: initialEditorText(),
        editorErrors: [],
        importText: "",
        importErrors: [],
        banner: "存档已重置。"
      };
    }
  }

  render();
}

function handleChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.id === "dungeon-select" && target instanceof HTMLSelectElement) {
    const nextDungeon = DUNGEONS.find((dungeon) => dungeon.id === target.value) ?? DUNGEONS[0];
    if (!isDungeonUnlocked(nextDungeon.id)) {
      ui = {
        ...ui,
        selectedDungeonId: firstUnlockedDungeonId()
      };
      setBanner(`该航线尚未解锁，需要第 ${requiredChapterForDungeon(nextDungeon.id)} 章。`);
    } else {
      ui = {
        ...ui,
        selectedDungeonId: target.value,
        plannedFloor: Math.min(ui.plannedFloor, nextDungeon.maxFloor)
      };
    }
  }

  if (target.id === "planned-floor" && target instanceof HTMLInputElement) {
    ui = { ...ui, plannedFloor: clampPlannedFloor(Number(target.value) || 1) };
  }

  if (target.id === "rule-editor-fact" && target instanceof HTMLSelectElement) {
    const nextFact = target.value as Fact;
    const operators = ruleEditorOperatorsForFact(nextFact);
    const nextOp = operators.includes(ui.tacticRuleEditorOp) ? ui.tacticRuleEditorOp : operators[0];
    ui = {
      ...ui,
      tacticRuleEditorFact: nextFact,
      tacticRuleEditorOp: nextOp,
      tacticRuleEditorError: "",
      tacticRuleEditorValue:
        ui.tacticRuleEditorValue.trim().length > 0 ? ui.tacticRuleEditorValue : ruleEditorDefaultValueForFact(nextFact, nextOp)
    };
  }

  if (target.id === "rule-editor-op" && target instanceof HTMLSelectElement) {
    const nextOp = target.value as Operator;
    ui = {
      ...ui,
      tacticRuleEditorOp: nextOp,
      tacticRuleEditorError: "",
      tacticRuleEditorValue:
        ui.tacticRuleEditorValue.trim().length > 0 ? ui.tacticRuleEditorValue : ruleEditorDefaultValueForFact(ui.tacticRuleEditorFact, nextOp)
    };
  }

  if (target.id === "log-type-filter" && target instanceof HTMLSelectElement) {
    ui = {
      ...ui,
      logTypeFilter: (target.value as EventType | "all") || "all",
      expandedLogSeq: 0,
      logAutoFollow: false,
      logScrollTop: 0,
      logVirtualRow: 0,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
  }

  if (target.id === "log-reason-filter" && target instanceof HTMLSelectElement) {
    ui = {
      ...ui,
      logReasonFilter: (target.value as ReasonTag | "all") || "all",
      expandedLogSeq: 0,
      logAutoFollow: false,
      logScrollTop: 0,
      logVirtualRow: 0,
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
  }

  render();
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === "rule-editor-value" && target instanceof HTMLInputElement) {
    ui = {
      ...ui,
      tacticRuleEditorValue: target.value,
      tacticRuleEditorError: ""
    };
    return;
  }
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.id === "rules-editor") {
    ui = {
      ...ui,
      editorText: target.value
    };
    return;
  }
  if (target.id === "import-editor") {
    ui = {
      ...ui,
      importText: target.value,
      importErrors: []
    };
  }
}

function nudgeReplayBySwipe(delta: -1 | 1): void {
  const selectedRun = getSelectedRun();
  const replayMoments = buildReplayMoments(selectedRun);
  if (replayMoments.length <= 1) return;

  const currentIndex = clampReplayIndex(ui.replayIndex, replayMoments.length);
  const nextIndex = clampReplayIndex(currentIndex + delta, replayMoments.length);
  if (nextIndex === currentIndex) return;

  const step = replayMoments[nextIndex];
  ui = {
    ...ui,
    replayIndex: nextIndex,
    expandedLogSeq: step?.seq ?? ui.expandedLogSeq,
    logQuickSeq: 0,
    logQuickType: "all",
    logQuickReason: "all"
  };
  if (step) {
    const stepTop = approximateLogScrollTopForSeq(selectedRun, step.seq, ui.logView);
    ui.logScrollTop = stepTop;
    ui.logVirtualRow = logVirtualRowByTop(stepTop, ui.logView);
    setBanner(`滑动回放：#${step.seq}。`);
  }
  render();
}

function finishLogEntrySwipe(): void {
  if (!logSwipeState) return;
  const swipe = logSwipeState;
  logSwipeState = null;

  const deltaX = swipe.currentX - swipe.startX;
  const deltaY = swipe.currentY - swipe.startY;
  if (Math.abs(deltaX) < LOG_ENTRY_SWIPE_THRESHOLD_PX) return;
  if (Math.abs(deltaX) <= Math.abs(deltaY) * LOG_ENTRY_SWIPE_DIRECTION_RATIO) return;

  suppressLogToggleSeq = swipe.seq;
  const selectedRun = getSelectedRun();
  const targetTop = approximateLogScrollTopForSeq(selectedRun, swipe.seq, ui.logView);

  if (deltaX < 0) {
    ui = {
      ...ui,
      tab: "expedition",
      logTypeFilter: swipe.eventType,
      logReasonFilter: "all",
      expandedLogSeq: swipe.seq,
      logScrollTop: targetTop,
      logVirtualRow: logVirtualRowByTop(targetTop, ui.logView),
      logQuickSeq: 0,
      logQuickType: "all",
      logQuickReason: "all"
    };
    setBanner(`左滑筛选：${eventTypeLabel(swipe.eventType)}。`);
    render();
    return;
  }

  const replayMoments = buildReplayMoments(selectedRun);
  if (replayMoments.length <= 0) return;
  const nextIndex = findClosestReplayMomentIndex(replayMoments, swipe.seq);
  const step = replayMoments[nextIndex];
  if (!step) return;

  const stepTop = approximateLogScrollTopForSeq(selectedRun, step.seq, ui.logView);
  ui = {
    ...ui,
    tab: "expedition",
    replayIndex: nextIndex,
    expandedLogSeq: step.seq,
    logTypeFilter: step.eventType,
    logReasonFilter: step.reasonTags[0] ?? "all",
    logScrollTop: stepTop,
    logVirtualRow: logVirtualRowByTop(stepTop, ui.logView),
    logQuickSeq: 0,
    logQuickType: "all",
    logQuickReason: "all"
  };
  setBanner(`右滑回放定位：#${step.seq}。`);
  render();
}

function handleTouchStart(event: TouchEvent): void {
  if (event.touches.length !== 1) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const touch = event.touches[0];
  const replayZone = target.closest("[data-gesture='replay']");
  if (replayZone instanceof HTMLElement) {
    replaySwipeState = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY
    };
  } else {
    replaySwipeState = null;
  }

  const logEntry = target.closest("[data-log-seq]");
  if (logEntry instanceof HTMLElement) {
    const parsed = parseLogEntryDataset(logEntry);
    if (!parsed) {
      logLongPressState = null;
      logSwipeState = null;
      return;
    }
    logSwipeState = {
      ...parsed,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY
    };
    clearLogLongPressTimer();
    logLongPressState = {
      ...parsed,
      startX: touch.clientX,
      startY: touch.clientY,
      timerId: null,
      fired: false
    };
    logLongPressState.timerId = window.setTimeout(() => {
      if (!logLongPressState || logLongPressState.fired) return;
      logLongPressState.fired = true;
      suppressLogToggleSeq = logLongPressState.seq;
      clearLogLongPressTimer();
      logSwipeState = null;
      openLogQuickSheet(logLongPressState.seq, logLongPressState.eventType, logLongPressState.reasonTag);
    }, LOG_LONG_PRESS_DELAY_MS);
    return;
  }

  clearLogLongPressTimer();
  logLongPressState = null;
  logSwipeState = null;
}

function handleTouchMove(event: TouchEvent): void {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  if (replaySwipeState) {
    replaySwipeState.currentX = touch.clientX;
    replaySwipeState.currentY = touch.clientY;
  }

  if (logSwipeState) {
    logSwipeState.currentX = touch.clientX;
    logSwipeState.currentY = touch.clientY;
  }

  if (!logLongPressState) return;
  const deltaX = touch.clientX - logLongPressState.startX;
  const deltaY = touch.clientY - logLongPressState.startY;
  if (Math.hypot(deltaX, deltaY) > LOG_LONG_PRESS_CANCEL_DISTANCE_PX) {
    clearLogLongPressTimer();
    logLongPressState = null;
  }
}

function finishReplaySwipe(): void {
  if (!replaySwipeState) return;
  const deltaX = replaySwipeState.currentX - replaySwipeState.startX;
  const deltaY = replaySwipeState.currentY - replaySwipeState.startY;
  replaySwipeState = null;

  if (Math.abs(deltaX) < REPLAY_SWIPE_THRESHOLD_PX) return;
  if (Math.abs(deltaX) <= Math.abs(deltaY) * REPLAY_SWIPE_DIRECTION_RATIO) return;
  nudgeReplayBySwipe(deltaX > 0 ? -1 : 1);
}

function handleTouchEnd(): void {
  finishReplaySwipe();
  finishLogEntrySwipe();
  if (logLongPressState) {
    clearLogLongPressTimer();
    logLongPressState = null;
  }
}

function handleTouchCancel(): void {
  replaySwipeState = null;
  logSwipeState = null;
  clearLogLongPressTimer();
  logLongPressState = null;
}

function handleContextMenu(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const logEntry = target.closest("[data-log-seq]");
  if (!(logEntry instanceof HTMLElement)) return;
  const parsed = parseLogEntryDataset(logEntry);
  if (!parsed) return;
  event.preventDefault();
  suppressLogToggleSeq = parsed.seq;
  openLogQuickSheet(parsed.seq, parsed.eventType, parsed.reasonTag);
}

function handleScroll(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id !== "log-list") return;

  const nextTop = Math.max(0, target.scrollTop);
  const nextViewportHeight = Math.max(120, target.clientHeight);
  const nextRow = logVirtualRowByTop(nextTop, ui.logView);
  const now = Date.now();
  const isProgrammatic = now < programmaticLogScrollUntil;
  const nearBottom = isLogNearBottom(nextTop, nextViewportHeight, target.scrollHeight);
  const canAutoFollow = ui.logTypeFilter === "all" && ui.logReasonFilter === "all" && save.activeRunPlan != null;
  const nextAutoFollow = canAutoFollow ? nearBottom : false;
  const viewportChanged = Math.abs(nextViewportHeight - ui.logViewportHeight) >= 2;
  const rowChanged = nextRow !== ui.logVirtualRow;

  if (!rowChanged && !viewportChanged && ui.logAutoFollow === nextAutoFollow) {
    ui.logScrollTop = nextTop;
    return;
  }

  if (isProgrammatic) {
    ui.logScrollTop = nextTop;
    ui.logViewportHeight = nextViewportHeight;
    ui.logVirtualRow = nextRow;
    return;
  }

  ui = {
    ...ui,
    logScrollTop: nextTop,
    logViewportHeight: nextViewportHeight,
    logVirtualRow: nextRow,
    logAutoFollow: nextAutoFollow
  };
  render();
}

app.addEventListener("click", handleClick);
app.addEventListener("change", handleChange);
app.addEventListener("input", handleInput);
app.addEventListener("contextmenu", handleContextMenu);
app.addEventListener("scroll", handleScroll, true);
app.addEventListener("touchstart", handleTouchStart, { passive: true });
app.addEventListener("touchmove", handleTouchMove, { passive: true });
app.addEventListener("touchend", handleTouchEnd, { passive: true });
app.addEventListener("touchcancel", handleTouchCancel, { passive: true });

finalizeActiveRunIfDue();
window.setInterval(() => {
  if (!save.activeRunPlan) return;
  const finalized = finalizeActiveRunIfDue();
  if (finalized || ui.tab === "expedition" || ui.tab === "storage") {
    render();
  }
}, 1000);

render();
