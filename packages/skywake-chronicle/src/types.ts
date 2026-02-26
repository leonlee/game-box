export type TabId = "expedition" | "party" | "town" | "storage" | "settings";
export type LogView = "narrative" | "debug";
export type ExpeditionTimeScale = 1 | 4 | 10;

export type Role = "tank" | "dps" | "support";
export type CharacterClass = "vanguard" | "ranger" | "mystic";

export type Trigger = "on_node_enter" | "on_turn_start" | "on_turn_end" | "on_combat_end";
export type RuleScope = "party" | "character";
export type Operator = "==" | "!=" | "<" | "<=" | ">" | ">=" | "contains" | "in";
export type ConflictPolicy = "mixed_party_preempt_character_merge";

export type Fact =
  | "self_stress_pct"
  | "self_has_consequence"
  | "self_resource_pct"
  | "ally_min_stress_pct"
  | "party_consumable_count"
  | "party_has_item"
  | "enemy_has_aspect"
  | "enemy_count_alive"
  | "enemy_is_elite"
  | "scene_has_aspect"
  | "node_type"
  | "time_window"
  | "fate_point_count"
  | "turn_index"
  | "rule_triggered_recently"
  | "combat_is_boss";

export type Action =
  | "attack_skill"
  | "defend_stance"
  | "create_advantage"
  | "overcome_obstacle"
  | "use_consumable"
  | "save_resource_mode"
  | "retreat_combat"
  | "retreat_explore"
  | "use_key_item_slot"
  | "basic_attack"
  | "wait"
  | "swap_target"
  | "mark_priority_target"
  | "cleanse_ally";

export type EventType =
  | "run_start"
  | "run_end"
  | "floor_enter"
  | "floor_leave"
  | "node_enter"
  | "node_exit"
  | "combat_start"
  | "combat_action"
  | "combat_end"
  | "overcome_check"
  | "loot_drop"
  | "retreat_triggered"
  | "gate_blocked"
  | "quest_progress";

export type RunStatus = "running" | "completed" | "failed" | "retreated";

export type CoreReasonTag =
  | "missing_key_item"
  | "missing_required_aspect"
  | "retreat_hp_threshold"
  | "retreat_resource_threshold"
  | "time_window_missed"
  | "enemy_overwhelm"
  | "path_blocked"
  | "tactic_no_valid_action";

export type ReasonTag = CoreReasonTag | `ext.${string}`;

export type TimeWindow = "day" | "night";

export interface ConditionLeaf {
  fact: Fact;
  op: Operator;
  value: number | boolean | string | readonly string[];
}

export interface ConditionAll {
  all: readonly ConditionExpr[];
}

export interface ConditionAny {
  any: readonly ConditionExpr[];
}

export interface ConditionNot {
  not: ConditionExpr;
}

export type ConditionExpr = ConditionLeaf | ConditionAll | ConditionAny | ConditionNot;

export interface RuleAction {
  action: Action;
  params?: Record<string, unknown>;
}

export interface TacticsRule {
  id: string;
  scope: RuleScope;
  trigger: Trigger;
  priority: number;
  when: ConditionExpr;
  then: RuleAction;
  cooldown_turns: number;
  enabled: boolean;
}

export interface FallbackByRole {
  tank: Action;
  dps: Action;
  support: Action;
}

export interface TacticsConfig {
  version: 1;
  conflict_policy: ConflictPolicy;
  fallback_by_role: FallbackByRole;
  rules: TacticsRule[];
}

export interface TacticsProfile {
  id: string;
  name: string;
  style: "aggressive" | "balanced" | "cautious" | "custom";
  config: TacticsConfig;
  updatedAt: number;
}

export interface CharacterState {
  uid: string;
  name: string;
  role: Role;
  classId: CharacterClass;
  level: number;
  xp: number;
  stressPhysical: number;
  stressMental: number;
  maxStress: number;
  resource: number;
  maxResource: number;
  consequenceLight: string;
}

export interface DungeonDefinition {
  id: string;
  name: string;
  flavor: string;
  recommendedLevel: number;
  maxFloor: number;
  threatScale: number;
  floorBaseMin: number;
  nodeEventMin: number;
  favoredTimeWindow: TimeWindow;
  scenePool: string[];
}

export interface QuestState {
  id: string;
  title: string;
  description: string;
  dungeonId: string;
  targetFloor: number;
  status: "active" | "completed";
  progressFloor: number;
  stableFloor: number;
}

export interface RunEvent {
  run_id: string;
  seq: number;
  time_offset_sec: number;
  floor: number;
  node_id: string;
  event_type: EventType;
  outcome: "success" | "partial" | "failed";
  loc_key: string;
  loc_args: Record<string, string | number | boolean>;
  reason_tags: ReasonTag[];
  payload: Record<string, unknown>;
}

export interface RunSummary {
  runId: string;
  dungeonId: string;
  plannedFloor: number;
  reachedFloor: number;
  status: RunStatus;
  startedAt: number;
  finishedAt: number;
  seed: number;
  rawGold: number;
  rawMaterials: number;
  retainedGold: number;
  retainedMaterials: number;
  reasonTags: ReasonTag[];
  events: RunEvent[];
}

export interface PostRunDelta {
  runCounter: number;
  gold: number;
  materials: number;
  fatePoints: number;
  inventory: Record<string, number>;
  characters: CharacterState[];
  quests: QuestState[];
}

export interface ActiveRunPlan {
  run: RunSummary;
  startedAt: number;
  finishAt: number;
  pausedAt: number | null;
  pausedAccumMs: number;
  postRunDelta: PostRunDelta;
}

export interface SaveData {
  saveId: string;
  saveVersion: number;
  appMajorVersion: number;
  createdAt: number;
  updatedAt: number;
  playerName: string;
  currentTownId: string;
  gold: number;
  materials: number;
  fatePoints: number;
  runCounter: number;
  activePartyTacticProfileId: string;
  hintClaims: Record<string, number>;
  settings: SaveSettings;
  onboarding: OnboardingProgress;
  activeRunPlan: ActiveRunPlan | null;
  archivedRunSummary: ArchivedRunSummary;
  inventory: Record<string, number>;
  characters: CharacterState[];
  tacticsProfiles: TacticsProfile[];
  quests: QuestState[];
  runs: RunSummary[];
}

export interface SaveSettings {
  showOnboardingCard: boolean;
  defaultLogView: LogView;
  notifyOnRunComplete: boolean;
  notifyFailOnly: boolean;
  advancedDebugView: boolean;
  expeditionTimeScale: ExpeditionTimeScale;
}

export interface OnboardingProgress {
  openedPartyTab: boolean;
  appliedPreset: boolean;
  startedRun: boolean;
  viewedDebugLog: boolean;
}

export interface ArchivedRunSummary {
  archivedRuns: number;
  completed: number;
  retreated: number;
  failed: number;
  reasonTagCounts: Record<string, number>;
  progressRateSum: number;
  retainedGoldSum: number;
  retainedMaterialsSum: number;
}

export interface ExploreRequest {
  dungeonId: string;
  plannedFloor: number;
}

export interface EstimateResult {
  minMinutes: number;
  maxMinutes: number;
}

export interface SimulationResult {
  save: SaveData;
  run: RunSummary;
}

export interface UiState {
  tab: TabId;
  selectedDungeonId: string;
  plannedFloor: number;
  selectedRunId: string;
  replayIndex: number;
  expandedLogSeq: number;
  logView: LogView;
  logTypeFilter: EventType | "all";
  logReasonFilter: ReasonTag | "all";
  editorText: string;
  editorErrors: string[];
  importText: string;
  importErrors: string[];
  banner: string;
}
