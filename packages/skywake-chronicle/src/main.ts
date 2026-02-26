import { DUNGEONS, INVENTORY_CATALOG, createPresetProfile, getItemContentById } from "./content";
import { estimateRunMinutes, simulateRun, toNarrative } from "./simulator";
import { exportSaveString, importSaveString, loadSave, persistSave, wipeSave } from "./storage";
import { getActiveProfile, validateTacticsConfig } from "./tactics";
import { EventType, LogView, ReasonTag, SaveData, TacticsConfig, TacticsRule, UiState } from "./types";

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

function pickDefaultRunId(): string {
  return save.runs[0]?.runId ?? "";
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
  return Math.max(1, Math.min(dungeon.maxFloor, value));
}

function getSelectedRun() {
  if (!ui.selectedRunId) return save.runs[0] ?? null;
  return save.runs.find((run) => run.runId === ui.selectedRunId) ?? save.runs[0] ?? null;
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
  const run = getSelectedRun();
  const assist = getFailureAssistForDungeon(dungeon.id);
  const diagnosis = getRunDiagnosis(run, run?.dungeonId ?? dungeon.id);
  const allReasons = run ? Array.from(new Set(run.events.flatMap((event) => event.reason_tags))).sort() : [];

  const filteredEvents = run
    ? run.events.filter((event) => {
        const eventTypePass = ui.logTypeFilter === "all" || event.event_type === ui.logTypeFilter;
        const reasonPass = ui.logReasonFilter === "all" || event.reason_tags.includes(ui.logReasonFilter);
        return eventTypePass && reasonPass;
      })
    : [];

  const logItems = filteredEvents
    .map((event) => {
      const tagLine = event.reason_tags.length > 0 ? `<p class="tags">${event.reason_tags.join(", ")}</p>` : "";
      const body =
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
                  payload: event.payload
                },
                null,
                2
              )
            )}</pre>`;

      return `
      <li class="touch-item ${event.outcome}">
        <div class="row">
          <strong>#${event.seq}</strong>
          <span>${event.event_type}</span>
          <span>F${event.floor}</span>
        </div>
        ${body}
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
            <span>当前时段</span>
            <strong>${currentWindowLabel()}（${dungeon.favoredTimeWindow === "day" ? "该迷宫偏好白昼" : "该迷宫偏好夜幕"}）</strong>
          </div>
          <div class="touch-item">
            <span>重惩罚规则</span>
            <strong>completed 100% / retreated 45%-60% / failed 20%-30%</strong>
          </div>
        </div>

        <button class="primary" data-action="start-run">派遣小队</button>
      </article>

      <article class="panel">
        <h3>最近一次出征</h3>
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
  const inventory = Object.entries(INVENTORY_CATALOG)
    .map(([id, item]) => {
      const count = save.inventory[id] ?? 0;
      return `<li class="touch-item"><span>${escapeHtml(item.name)}</span><strong>x${count}</strong></li>`;
    })
    .join("");

  const runHistory = save.runs
    .map((run) => {
      const active = run.runId === ui.selectedRunId;
      return `
      <li class="touch-item ${active ? "active" : ""}">
        <div class="row">
          <strong>${run.runId}</strong>
          <span>${run.status}</span>
        </div>
        <p>迷宫 ${run.dungeonId} · 层数 ${run.reachedFloor}/${run.plannedFloor} · +${run.retainedGold}G +${run.retainedMaterials}M</p>
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
  const dungeon = getDungeon();
  const plannedFloor = clampPlannedFloor(ui.plannedFloor);

  const result = simulateRun(save, {
    dungeonId: dungeon.id,
    plannedFloor
  });

  save = result.save;
  markOnboardingStep("startedRun");
  persistSave(save);

  ui = {
    ...ui,
    selectedRunId: result.run.runId,
    tab: "expedition",
    logTypeFilter: "all",
    logReasonFilter: "all"
  };

  setBanner(`出征完成：${result.run.status} · +${result.run.retainedGold} 金币 / +${result.run.retainedMaterials} 材料`);
  notifyRunComplete(result.run);
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-action]");
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.dataset.action;
  const value = button.dataset.value ?? "";
  const questId = button.dataset.questId ?? "";

  if (action === "switch-tab") {
    ui = { ...ui, tab: value as UiState["tab"] };
    if (value === "party") {
      markOnboardingStep("openedPartyTab");
    }
  } else if (action === "set-log-view") {
    ui = { ...ui, logView: value === "debug" ? "debug" : "narrative" };
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
  } else if (action === "apply-failure-assist") {
    if ((value === "aggressive" || value === "balanced" || value === "cautious") && questId.length > 0) {
      applyFailureAssist(value, questId);
    }
  } else if (action === "view-run") {
    ui = { ...ui, selectedRunId: value, tab: "expedition" };
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
  } else if (action === "request-notification-permission") {
    void requestNotificationPermission();
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
    ui = { ...ui, logTypeFilter: (target.value as EventType | "all") || "all" };
  }

  if (target.id === "log-reason-filter" && target instanceof HTMLSelectElement) {
    ui = { ...ui, logReasonFilter: (target.value as ReasonTag | "all") || "all" };
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

render();
