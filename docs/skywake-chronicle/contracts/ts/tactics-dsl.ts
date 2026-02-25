export const RULE_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

export const CONFLICT_POLICIES = ["mixed_party_preempt_character_merge"] as const;
export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number];

export const SCOPES = ["party", "character"] as const;
export type RuleScope = (typeof SCOPES)[number];

export const TRIGGERS = [
  "on_node_enter",
  "on_turn_start",
  "on_turn_end",
  "on_combat_end"
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const OPERATORS = ["==", "!=", "<", "<=", ">", ">=", "contains", "in"] as const;
export type Operator = (typeof OPERATORS)[number];

export const FACTS = [
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
export type Fact = (typeof FACTS)[number];

export const ACTIONS = [
  "attack_skill",
  "defend_stance",
  "create_advantage",
  "overcome_obstacle",
  "use_consumable",
  "save_resource_mode",
  "retreat_combat",
  "retreat_explore",
  "use_key_item_slot",
  "basic_attack",
  "wait",
  "swap_target",
  "mark_priority_target",
  "cleanse_ally"
] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLES = ["tank", "dps", "support"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS_BY_SCOPE: Readonly<Record<RuleScope, readonly Action[]>> = {
  party: ["retreat_combat", "retreat_explore", "use_key_item_slot"],
  character: [
    "attack_skill",
    "defend_stance",
    "create_advantage",
    "overcome_obstacle",
    "use_consumable",
    "save_resource_mode",
    "basic_attack",
    "wait",
    "swap_target",
    "mark_priority_target",
    "cleanse_ally"
  ]
};

export const FALLBACK_ACTIONS_BY_ROLE: Readonly<Record<Role, readonly Action[]>> = {
  tank: ["defend_stance", "wait"],
  dps: ["basic_attack", "attack_skill", "wait"],
  support: ["create_advantage", "wait", "defend_stance"]
};

export type ValueKind = "number" | "boolean" | "string" | "string[]";

export interface FactRule {
  readonly kinds: readonly ValueKind[];
  readonly operators: readonly Operator[];
}

const NUMERIC_OPERATORS: readonly Operator[] = ["==", "!=", "<", "<=", ">", ">="];
const BOOLEAN_OPERATORS: readonly Operator[] = ["==", "!="];
const STRING_OPERATORS: readonly Operator[] = ["==", "!=", "contains", "in"];

export const FACT_VALUE_RULES: Readonly<Record<Fact, FactRule>> = {
  self_stress_pct: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  self_has_consequence: { kinds: ["boolean"], operators: BOOLEAN_OPERATORS },
  self_resource_pct: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  ally_min_stress_pct: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  party_consumable_count: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  party_has_item: { kinds: ["string", "string[]"], operators: STRING_OPERATORS },
  enemy_has_aspect: { kinds: ["string", "string[]"], operators: STRING_OPERATORS },
  enemy_count_alive: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  enemy_is_elite: { kinds: ["boolean"], operators: BOOLEAN_OPERATORS },
  scene_has_aspect: { kinds: ["string", "string[]"], operators: STRING_OPERATORS },
  node_type: { kinds: ["string", "string[]"], operators: STRING_OPERATORS },
  time_window: { kinds: ["string", "string[]"], operators: STRING_OPERATORS },
  fate_point_count: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  turn_index: { kinds: ["number"], operators: NUMERIC_OPERATORS },
  rule_triggered_recently: { kinds: ["boolean"], operators: BOOLEAN_OPERATORS },
  combat_is_boss: { kinds: ["boolean"], operators: BOOLEAN_OPERATORS }
};

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
  rules: readonly TacticsRule[];
}

export const LIMITS = {
  maxRulesPerConfig: 64,
  maxConditionsPerRule: 12,
  maxConditionDepth: 5,
  maxConditionGroupSize: 8,
  maxPriority: 1000,
  maxCooldownTurns: 99
} as const;
