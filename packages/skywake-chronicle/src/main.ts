import { DUNGEONS, INVENTORY_CATALOG, createPresetProfile, getItemContentById } from "./content";
import { estimateRunMinutes, simulateRun, toNarrative } from "./simulator";
import { exportSaveString, importSaveString, loadSave, persistSave, wipeSave } from "./storage";
import { getActiveProfile, validateTacticsConfig } from "./tactics";
import {
  EventType,
  ExpeditionTimeScale,
  LogView,
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
const TIME_SCALE_OPTIONS: readonly ExpeditionTimeScale[] = [1, 4, 10] as const;

type TacticStyle = "aggressive" | "balanced" | "cautious";

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

interface ActiveRunSnapshot {
  run: SaveData["runs"][number];
  progressRate: number;
  elapsedMs: number;
  remainingMs: number;
  durationMs: number;
  startedAt: number;
  finishAt: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deepCloneSave(source: SaveData): SaveData {
  return JSON.parse(JSON.stringify(source)) as SaveData;
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

function getActiveRunSnapshot(now = Date.now()): ActiveRunSnapshot | null {
  const plan = save.activeRunPlan;
  if (!plan) return null;

  const durationMs = Math.max(1000, plan.finishAt - plan.startedAt);
  const elapsedMs = clamp(now - plan.startedAt, 0, durationMs);
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  const progressRate = clamp(elapsedMs / durationMs, 0, 1);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const visibleEvents = plan.run.events.filter((event) => event.time_offset_sec <= elapsedSec);
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
    finishAt: plan.finishAt
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
  editorText: initialEditorText(),
  editorErrors: [],
  importText: "",
  importErrors: [],
  banner: ""
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function currentWindowLabel(): "白昼" | "夜幕" {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "白昼" : "夜幕";
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
    .map(([tag, count]) => `${tag} x${count}`)
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

function summaryLine(event: RunEvent): string {
  if (event.event_type === "combat_action") {
    return `${String(event.payload.actor_name ?? "队员")} · ${String(event.payload.action ?? "动作")} · ${event.outcome}`;
  }
  if (event.event_type === "overcome_check") {
    return `机关处理 · ${event.outcome}`;
  }
  if (event.event_type === "run_end") {
    return `出征${String(event.payload.status ?? "unknown")} · +${String(event.payload.retained_gold ?? 0)}G +${String(event.payload.retained_materials ?? 0)}M`;
  }
  return toNarrative(event);
}

function styleLabel(style: TacticStyle): string {
  if (style === "aggressive") return "好斗";
  if (style === "cautious") return "谨慎";
  return "均衡";
}

function resolvePrimaryReason(runTags: readonly ReasonTag[]): ReasonTag {
  if (runTags.length === 0) return "retreat_resource_threshold";
  const counts = new Map<ReasonTag, number>();
  runTags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function reasonText(reason: ReasonTag): string {
  if (reason === "missing_key_item") return "关键道具不足";
  if (reason === "missing_required_aspect") return "环境应对不足";
  if (reason === "time_window_missed") return "时段条件不匹配";
  if (reason === "enemy_overwhelm") return "战斗压力过高";
  if (reason === "retreat_hp_threshold") return "生存阈值触发撤退";
  if (reason === "retreat_resource_threshold") return "资源阈值触发撤退";
  if (reason === "path_blocked") return "路径阻断";
  if (reason === "tactic_no_valid_action") return "战术动作无效";
  return reason;
}

function recommendStyleByReason(reason: ReasonTag): TacticStyle {
  if (reason === "enemy_overwhelm" || reason === "retreat_hp_threshold") {
    return "cautious";
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
    const shouldInclude =
      markers.has(event.event_type) ||
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
  const body = `状态 ${run.status} · 层数 ${run.reachedFloor}/${run.plannedFloor} · +${run.retainedGold}G +${run.retainedMaterials}M`;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore browsers that throw in unsupported contexts (for example, background restrictions).
  }
}

function finalizeActiveRunIfDue(force = false): boolean {
  const plan = save.activeRunPlan;
  if (!plan) return false;
  if (!force && Date.now() < plan.finishAt) return false;

  let postRunSave: SaveData | null = null;
  try {
    postRunSave = JSON.parse(plan.postRunSaveJson) as SaveData;
  } catch {
    postRunSave = null;
  }

  if (!postRunSave || !Array.isArray(postRunSave.runs)) {
    save.activeRunPlan = null;
    persistSave(save);
    setBanner("进行中的出征数据损坏，已清理任务。");
    return true;
  }

  const preservedSettings = save.settings;
  const preservedOnboarding = save.onboarding;
  const preservedProfiles = save.tacticsProfiles;
  const preservedProfileId = save.activePartyTacticProfileId;
  const preservedHintClaims = save.hintClaims;

  save = {
    ...postRunSave,
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
      logReasonFilter: "all"
    };
    setBanner(
      `出征完成：${finishedRun.status} · +${finishedRun.retainedGold} 金币 / +${finishedRun.retainedMaterials} 材料`
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
          <span class="chip">${character.role}</span>
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

function renderExpeditionTab(): string {
  const dungeon = getDungeon();
  const estimate = estimateRunMinutes(save, { dungeonId: dungeon.id, plannedFloor: ui.plannedFloor });
  const scaledMinMinutes = Math.max(0.2, Number((estimate.minMinutes / save.settings.expeditionTimeScale).toFixed(1)));
  const scaledMaxMinutes = Math.max(scaledMinMinutes, Number((estimate.maxMinutes / save.settings.expeditionTimeScale).toFixed(1)));
  const activeRunSnapshot = getActiveRunSnapshot();
  const runInProgress = activeRunSnapshot !== null;
  const run = getSelectedRun();
  const assist = getFailureAssistForDungeon(dungeon.id);
  const diagnosis = getRunDiagnosis(run, run?.dungeonId ?? dungeon.id);
  const replayMoments = buildReplayMoments(run);
  const replayIndex = clampReplayIndex(ui.replayIndex, replayMoments.length);
  const activeReplay = replayMoments[replayIndex] ?? null;
  const analytics = buildRunAnalytics(dungeon.id);
  const allReasons = run ? Array.from(new Set(run.events.flatMap((event) => event.reason_tags))).sort() : [];

  const filteredEvents = run
    ? run.events.filter((event) => {
        const eventTypePass = ui.logTypeFilter === "all" || event.event_type === ui.logTypeFilter;
        const reasonPass = ui.logReasonFilter === "all" || event.reason_tags.includes(ui.logReasonFilter);
        return eventTypePass && reasonPass;
      })
    : [];

  const chapterBreakSeqs = new Set<number>();
  if (ui.logView === "narrative") {
    filteredEvents.forEach((event, index) => {
      const prev = index > 0 ? filteredEvents[index - 1] : null;
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

  const logItems = filteredEvents
    .map((event) => {
      const expanded = ui.expandedLogSeq === event.seq;
      const tagLine = event.reason_tags.length > 0 ? `<p class="tags">${event.reason_tags.join(", ")}</p>` : "";
      const chapterHeader =
        ui.logView === "narrative" && chapterBreakSeqs.has(event.seq)
          ? `<p class="chapter-label">${escapeHtml(chapterLabelForEvent(event))}</p>`
          : "";
      const details =
        ui.logView === "narrative"
          ? `<p>${escapeHtml(toNarrative(event))}</p>`
          : `<pre>${escapeHtml(
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
      const detailBlock = expanded ? `<div class="detail-block">${details}</div>` : "";

      return `
      <li class="touch-item ${event.outcome} ${expanded ? "expanded" : ""}">
        ${chapterHeader}
        <div class="row">
          <strong>#${event.seq}</strong>
          <span>${event.event_type}</span>
          <span>F${event.floor}</span>
        </div>
        <p class="summary-line">${escapeHtml(summaryLine(event))}</p>
        <div class="row">
          <span class="hint">${event.reason_tags.length > 0 ? `${event.reason_tags.length} tags` : "无标签"}</span>
          <button data-action="toggle-log-expand" data-value="${event.seq}">${expanded ? "收起" : "展开"}</button>
        </div>
        ${detailBlock}
        ${tagLine}
      </li>`;
    })
    .join("");

  return `
    <section class="panel-grid">
      ${renderOnboardingCard()}

      <article class="panel">
        <h3>出征配置</h3>
        <label class="field">迷宫
          <select id="dungeon-select">
            ${DUNGEONS.map(
              (item) =>
                `<option value="${item.id}" ${item.id === dungeon.id ? "selected" : ""}>${escapeHtml(item.name)} · 推荐Lv.${item.recommendedLevel}</option>`
            ).join("")}
          </select>
        </label>
        <p class="hint">${escapeHtml(dungeon.flavor)}</p>

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
            <strong>completed 100% / retreated 45%-60% / failed 20%-30%</strong>
          </div>
        </div>

        <button class="primary" data-action="start-run" ${runInProgress ? "disabled" : ""}>
          ${runInProgress ? "探险进行中" : "派遣小队"}
        </button>
      </article>

      ${
        activeRunSnapshot
          ? `<article class="panel">
              <h3>实时探险进度</h3>
              <div class="touch-list compact">
                <div class="touch-item"><span>Run ID</span><strong>${activeRunSnapshot.run.runId}</strong></div>
                <div class="touch-item"><span>推进层数</span><strong>${activeRunSnapshot.run.reachedFloor} / ${activeRunSnapshot.run.plannedFloor}</strong></div>
                <div class="touch-item"><span>进度</span><strong>${percentText(activeRunSnapshot.progressRate)}</strong></div>
                <div class="touch-item"><span>剩余时间</span><strong>${formatCountdown(activeRunSnapshot.remainingMs)}</strong></div>
                <div class="touch-item"><span>预计返航</span><strong>${new Date(activeRunSnapshot.finishAt).toLocaleTimeString()}</strong></div>
              </div>
              <div class="meter progress-meter"><i style="width:${Math.round(activeRunSnapshot.progressRate * 100)}%;"></i></div>
              <div class="inline-buttons">
                <button data-action="fast-forward-run">加速返航并结算</button>
              </div>
              <p class="hint">日志会随时间推进逐步解锁，不再瞬间结算。</p>
            </article>`
          : ""
      }

      <article class="panel">
        <h3>${runInProgress ? "当前出征" : "最近一次出征"}</h3>
        ${
          run
            ? `<div class="touch-list compact">
                <div class="touch-item"><span>Run ID</span><strong>${run.runId}</strong></div>
                <div class="touch-item"><span>状态</span><strong>${run.status}</strong></div>
                <div class="touch-item"><span>层数</span><strong>${run.reachedFloor} / ${run.plannedFloor}</strong></div>
                <div class="touch-item"><span>结算</span><strong>+${run.retainedGold} 金币 / +${run.retainedMaterials} 材料</strong></div>
                <div class="touch-item"><span>失败原因</span><strong>${escapeHtml(summarizeReasonCounts(run.reasonTags))}</strong></div>
              </div>`
            : `<p class="hint">暂无出征记录，先派遣一次小队。</p>`
        }
      </article>

      ${
        assist
          ? `<article class="panel">
              <h3>连续失败保护</h3>
              <div class="touch-list compact">
                <div class="touch-item"><span>任务</span><strong>${escapeHtml(assist.questTitle)}</strong></div>
                <div class="touch-item"><span>连续失败</span><strong>${assist.streak} 次</strong></div>
                <div class="touch-item"><span>主要问题</span><strong>${escapeHtml(assist.reason)}</strong></div>
                <div class="touch-item"><span>推荐模板</span><strong>${styleLabel(assist.style)}</strong></div>
              </div>
              <button data-action="apply-failure-assist" data-value="${assist.style}" data-quest-id="${assist.questId}" class="primary">一键应用建议</button>
            </article>`
          : ""
      }

      ${
        diagnosis
          ? `<article class="panel">
              <h3>复盘建议</h3>
              <div class="touch-list compact">
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
              }
            </article>`
          : ""
      }

      ${
        replayMoments.length > 0
          ? `<article class="panel">
              <div class="toolbar">
                <h3>关键回合回放</h3>
                <span class="chip">${replayIndex + 1}/${replayMoments.length}</span>
              </div>
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
                          <span>${item.eventType}</span>
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
            </article>`
          : ""
      }

      ${
        analytics
          ? `<article class="panel">
              <h3>近期统计看板</h3>
              <p class="hint">${escapeHtml(analytics.scopeLabel)}</p>
              <div class="touch-list compact">
                <div class="touch-item"><span>完成 / 撤退 / 失败</span><strong>${percentText(analytics.completionRate)} / ${percentText(analytics.retreatRate)} / ${percentText(analytics.failRate)}</strong></div>
                <div class="touch-item"><span>平均推进</span><strong>${percentText(analytics.avgProgressRate)}</strong></div>
                <div class="touch-item"><span>平均结算</span><strong>+${Math.round(analytics.avgRetainedGold)}G / +${Math.round(analytics.avgRetainedMaterials)}M</strong></div>
                <div class="touch-item"><span>样本</span><strong>${analytics.sampleSize} runs</strong></div>
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
              }
            </article>`
          : ""
      }
    </section>

    <section class="panel">
      <div class="toolbar">
        <h3>日志复盘</h3>
        <div class="inline-buttons">
          <button data-action="set-log-view" data-value="narrative" class="${ui.logView === "narrative" ? "on" : ""}">叙事视图</button>
          <button data-action="set-log-view" data-value="debug" class="${ui.logView === "debug" ? "on" : ""}">调试视图</button>
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
                  `<option value="${type}" ${ui.logTypeFilter === type ? "selected" : ""}>${type}</option>`
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
                  `<option value="${tag}" ${ui.logReasonFilter === tag ? "selected" : ""}>${tag}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>

      <ul class="touch-list logs">
        ${logItems || `<li class="touch-item"><p class="hint">当前筛选下没有日志事件。</p></li>`}
      </ul>
    </section>
  `;
}

function renderPartyTab(): string {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  const styleButtons = [
    { id: "profile_aggressive", label: "好斗", style: "aggressive" },
    { id: "profile_balanced", label: "均衡", style: "balanced" },
    { id: "profile_cautious", label: "谨慎", style: "cautious" }
  ];

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
        <p class="hint">当前配置：${escapeHtml(profile.name)}（${profile.style}）</p>

        <div class="touch-list compact">
          <div class="touch-item"><span>fallback</span><strong>tank=${profile.config.fallback_by_role.tank}, dps=${profile.config.fallback_by_role.dps}, support=${profile.config.fallback_by_role.support}</strong></div>
          <div class="touch-item"><span>规则数量</span><strong>${profile.config.rules.length}</strong></div>
          <div class="touch-item"><span>更新时间</span><strong>${new Date(profile.updatedAt).toLocaleString()}</strong></div>
        </div>
      </article>
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
      return `
      <li class="touch-item">
        <div class="row">
          <strong>${escapeHtml(quest.title)}</strong>
          <span class="chip ${quest.status === "completed" ? "done" : ""}">${quest.status}</span>
        </div>
        <p>${escapeHtml(quest.description)}</p>
        <p class="hint">进度：${quest.progressFloor}/${quest.targetFloor}（稳定节点 ${quest.stableFloor}）</p>
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

  const shardCount = save.inventory[REFORGE_RECIPE.inputItem] ?? 0;
  const inputName = getItemContentById(REFORGE_RECIPE.inputItem)?.name ?? REFORGE_RECIPE.inputItem;
  const outputName = INVENTORY_CATALOG[REFORGE_RECIPE.outputItem]?.name ?? REFORGE_RECIPE.outputItem;
  const canCraft =
    shardCount >= REFORGE_RECIPE.inputCount &&
    save.gold >= REFORGE_RECIPE.goldCost &&
    save.materials >= REFORGE_RECIPE.materialCost;

  return `
    <section class="panel-grid">
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
        <p class="hint">将掉落材料转为关键机关道具，补齐探索循环。</p>
        <div class="touch-list compact">
          <div class="touch-item"><span>需求材料</span><strong>${inputName} x${REFORGE_RECIPE.inputCount}（当前 ${shardCount}）</strong></div>
          <div class="touch-item"><span>需求货币</span><strong>${REFORGE_RECIPE.goldCost} 金币 + ${REFORGE_RECIPE.materialCost} 材料</strong></div>
          <div class="touch-item"><span>产出</span><strong>${outputName} x${REFORGE_RECIPE.outputCount}</strong></div>
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
      return `
      <li class="touch-item ${active ? "active" : ""}">
        <div class="row">
          <strong>${run.runId}</strong>
          <span>${inProgress ? "running（进行中）" : run.status}</span>
        </div>
        <p>迷宫 ${run.dungeonId} · 层数 ${run.reachedFloor}/${run.plannedFloor} · +${run.retainedGold}G +${run.retainedMaterials}M</p>
        ${inProgress && activeRunSnapshot ? `<p class="hint">预计剩余 ${formatCountdown(activeRunSnapshot.remainingMs)}</p>` : ""}
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
  const tabs: Array<{ id: UiState["tab"]; label: string }> = [
    { id: "expedition", label: "出征" },
    { id: "party", label: "队伍" },
    { id: "town", label: "城镇" },
    { id: "storage", label: "仓库" },
    { id: "settings", label: "设置" }
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

      <footer class="foot">
        <button data-action="wipe-save" class="danger">重置存档</button>
      </footer>
    </div>
  `;
}

function setEditorFromActiveProfile(): void {
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);
  ui = { ...ui, editorText: JSON.stringify(profile.config, null, 2), editorErrors: [] };
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
  const shardCount = save.inventory[REFORGE_RECIPE.inputItem] ?? 0;
  if (shardCount < REFORGE_RECIPE.inputCount) {
    setBanner("碎晶不足，无法重铸。");
    return;
  }

  if (save.gold < REFORGE_RECIPE.goldCost || save.materials < REFORGE_RECIPE.materialCost) {
    setBanner("金币或材料不足，无法重铸。");
    return;
  }

  save.inventory[REFORGE_RECIPE.inputItem] = shardCount - REFORGE_RECIPE.inputCount;
  save.gold -= REFORGE_RECIPE.goldCost;
  save.materials -= REFORGE_RECIPE.materialCost;
  save.inventory[REFORGE_RECIPE.outputItem] = (save.inventory[REFORGE_RECIPE.outputItem] ?? 0) + REFORGE_RECIPE.outputCount;
  persistSave(save);

  const outputName = INVENTORY_CATALOG[REFORGE_RECIPE.outputItem]?.name ?? REFORGE_RECIPE.outputItem;
  setBanner(`重铸成功：${outputName} x${REFORGE_RECIPE.outputCount}`);
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

function fastForwardActiveRun(): void {
  if (!save.activeRunPlan) {
    setBanner("当前没有进行中的探险。");
    return;
  }

  const finished = finalizeActiveRunIfDue(true);
  if (!finished) {
    setBanner("加速返航失败，请重试。");
  }
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
  const startedAt = Date.now();
  const finishAt = startedAt + durationMs;
  const timedRun = retimeRunForDuration(simulation.run, startedAt, finishAt);
  const postRunSave: SaveData = {
    ...simulation.save,
    activeRunPlan: null
  };

  save = {
    ...save,
    runCounter: simulation.save.runCounter,
    activeRunPlan: {
      run: timedRun,
      startedAt,
      finishAt,
      postRunSaveJson: JSON.stringify(postRunSave)
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
    logReasonFilter: "all"
  };

  setBanner(`出征已开始（${timeScaleLabel(save.settings.expeditionTimeScale)}）：预计 ${formatCountdown(durationMs)} 后返航。`);
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-action]");
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.dataset.action;
  const value = button.dataset.value ?? "";
  const questId = button.dataset.questId ?? "";
  finalizeActiveRunIfDue();
  const blockedWhileRunning = new Set([
    "start-run",
    "apply-preset",
    "apply-rules",
    "buy-item",
    "craft-calibrator",
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
    ui = { ...ui, tab: value as UiState["tab"] };
    if (value === "party") {
      markOnboardingStep("openedPartyTab");
    }
  } else if (action === "set-log-view") {
    ui = { ...ui, logView: value === "debug" ? "debug" : "narrative", expandedLogSeq: 0 };
    if (value === "debug") {
      markOnboardingStep("viewedDebugLog");
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
  } else if (action === "buy-item") {
    buyItem(value);
  } else if (action === "craft-calibrator") {
    craftPhaseCalibrator();
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
      logReasonFilter: reason
    };
    setBanner(`已筛选日志原因：${reasonText(reason)}。`);
  } else if (action === "apply-failure-assist") {
    if ((value === "aggressive" || value === "balanced" || value === "cautious") && questId.length > 0) {
      applyFailureAssist(value, questId);
    }
  } else if (action === "view-run") {
    ui = { ...ui, selectedRunId: value, replayIndex: 0, expandedLogSeq: 0, tab: "expedition" };
  } else if (action === "guide-open-party") {
    ui = { ...ui, tab: "party" };
    markOnboardingStep("openedPartyTab");
  } else if (action === "guide-apply-balanced") {
    applyPreset("balanced");
  } else if (action === "guide-start-run") {
    startRun();
  } else if (action === "guide-open-debug-log") {
    ui = { ...ui, tab: "expedition", logView: "debug" };
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
  } else if (action === "fast-forward-run") {
    fastForwardActiveRun();
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
        ui = {
          ...ui,
          replayIndex: nextIndex,
          tab: "expedition",
          expandedLogSeq: step.seq,
          logTypeFilter: step.eventType,
          logReasonFilter: step.reasonTags[0] ?? "all"
        };
        setBanner(`回放已定位到 #${step.seq}。`);
      }
    }
  } else if (action === "replay-focus-active") {
    const step = replayMoments[replayIndex];
    if (step) {
      ui = {
        ...ui,
        tab: "expedition",
        expandedLogSeq: step.seq,
        logTypeFilter: step.eventType,
        logReasonFilter: step.reasonTags[0] ?? "all"
      };
      setBanner(`已按回放步骤过滤日志：#${step.seq} ${step.eventType}。`);
    }
  } else if (action === "toggle-log-expand") {
    const seq = Number(value);
    if (Number.isFinite(seq)) {
      ui = { ...ui, expandedLogSeq: ui.expandedLogSeq === seq ? 0 : seq };
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
    ui = {
      ...ui,
      selectedDungeonId: target.value,
      plannedFloor: Math.min(ui.plannedFloor, nextDungeon.maxFloor)
    };
  }

  if (target.id === "planned-floor" && target instanceof HTMLInputElement) {
    ui = { ...ui, plannedFloor: clampPlannedFloor(Number(target.value) || 1) };
  }

  if (target.id === "log-type-filter" && target instanceof HTMLSelectElement) {
    ui = { ...ui, logTypeFilter: (target.value as EventType | "all") || "all", expandedLogSeq: 0 };
  }

  if (target.id === "log-reason-filter" && target instanceof HTMLSelectElement) {
    ui = { ...ui, logReasonFilter: (target.value as ReasonTag | "all") || "all", expandedLogSeq: 0 };
  }

  render();
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
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

app.addEventListener("click", handleClick);
app.addEventListener("change", handleChange);
app.addEventListener("input", handleInput);

finalizeActiveRunIfDue();
window.setInterval(() => {
  if (!save.activeRunPlan) return;
  const finalized = finalizeActiveRunIfDue();
  if (finalized || ui.tab === "expedition" || ui.tab === "storage") {
    render();
  }
}, 1000);

render();
