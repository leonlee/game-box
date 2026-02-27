import { Action, EventType, ReasonTag, Role, RunStatus } from "./types";

type QuestStatus = "active" | "completed";
type TacticStyle = "aggressive" | "balanced" | "cautious" | "custom";
type Outcome = "success" | "partial" | "failed";

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: "进行中",
  completed: "完成",
  retreated: "撤退",
  failed: "失败"
};

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: "进行中",
  completed: "已完成"
};

const ROLE_LABELS: Record<Role, string> = {
  tank: "前卫",
  dps: "输出",
  support: "辅助"
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  run_start: "出征开始",
  run_end: "出征结算",
  floor_enter: "进入楼层",
  floor_leave: "离开楼层",
  node_enter: "进入节点",
  node_exit: "离开节点",
  combat_start: "战斗开始",
  combat_action: "战斗行动",
  combat_end: "战斗结束",
  overcome_check: "机关判定",
  loot_drop: "掉落获取",
  retreat_triggered: "触发撤退",
  gate_blocked: "机关阻断",
  quest_progress: "任务进度"
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  success: "成功",
  partial: "部分成功",
  failed: "失败"
};

const REASON_LABELS: Partial<Record<ReasonTag, string>> = {
  missing_key_item: "关键道具不足",
  missing_required_aspect: "环境应对不足",
  retreat_hp_threshold: "生存阈值触发撤退",
  retreat_resource_threshold: "资源阈值触发撤退",
  time_window_missed: "时段条件不匹配",
  enemy_overwhelm: "战斗压力过高",
  path_blocked: "路径阻断",
  tactic_no_valid_action: "战术动作无效"
};

const ACTION_LABELS: Record<Action, string> = {
  attack_skill: "技能攻击",
  defend_stance: "防御架势",
  create_advantage: "制造优势",
  overcome_obstacle: "克服障碍",
  use_consumable: "使用消耗品",
  save_resource_mode: "资源回收",
  retreat_combat: "战斗撤退",
  retreat_explore: "探索撤退",
  use_key_item_slot: "使用关键道具",
  basic_attack: "普通攻击",
  wait: "待机",
  swap_target: "切换目标",
  mark_priority_target: "标记重点目标",
  cleanse_ally: "净化队友"
};

const TACTIC_STYLE_LABELS: Record<TacticStyle, string> = {
  aggressive: "好斗",
  balanced: "均衡",
  cautious: "谨慎",
  custom: "自定义"
};

export function labelRunStatus(status: RunStatus): string {
  return RUN_STATUS_LABELS[status];
}

export function labelRunStatusUnknown(status: unknown): string {
  if (typeof status === "string" && status in RUN_STATUS_LABELS) {
    return RUN_STATUS_LABELS[status as RunStatus];
  }
  if (typeof status === "string" && status.length > 0) {
    return status;
  }
  return "未知";
}

export function labelQuestStatus(status: QuestStatus): string {
  return QUEST_STATUS_LABELS[status];
}

export function labelRole(role: Role): string {
  return ROLE_LABELS[role];
}

export function labelEventType(eventType: EventType): string {
  return EVENT_TYPE_LABELS[eventType];
}

export function labelOutcome(outcome: Outcome): string {
  return OUTCOME_LABELS[outcome];
}

export function labelReason(reason: ReasonTag): string {
  return REASON_LABELS[reason] ?? reason;
}

export function labelReasonUnknown(reason: unknown): string {
  if (typeof reason === "string") {
    return labelReason(reason as ReasonTag);
  }
  return "未知原因";
}

export function labelAction(action: unknown): string {
  if (typeof action === "string" && action in ACTION_LABELS) {
    return ACTION_LABELS[action as Action];
  }
  if (typeof action === "string" && action.length > 0) {
    return action;
  }
  return "动作";
}

export function labelTacticStyle(style: TacticStyle): string {
  return TACTIC_STYLE_LABELS[style];
}
