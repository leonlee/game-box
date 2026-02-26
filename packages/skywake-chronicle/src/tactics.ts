import {
  Action,
  ConditionExpr,
  ConditionLeaf,
  ConflictPolicy,
  Fact,
  FallbackByRole,
  Operator,
  Role,
  RuleScope,
  TacticsConfig,
  TacticsProfile,
  TacticsRule,
  Trigger
} from "./types";

export const RULE_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
export const CONFLICT_POLICIES: readonly ConflictPolicy[] = ["mixed_party_preempt_character_merge"];
export const DEFAULT_CONFLICT_POLICY: ConflictPolicy = "mixed_party_preempt_character_merge";

export const ACTIONS: Action[] = [
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
];

export const ACTIONS_BY_SCOPE: Record<RuleScope, readonly Action[]> = {
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

export const FACTS: Fact[] = [
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
];

export const LIMITS = {
  maxRulesPerConfig: 64,
  maxConditionsPerRule: 12,
  maxConditionDepth: 5,
  maxConditionGroupSize: 8,
  maxPriority: 1000,
  maxCooldownTurns: 99
} as const;

type ValueKind = "number" | "boolean" | "string" | "string[]";

export interface ConditionEvalTraceLeaf {
  kind: "leaf";
  fact: Fact;
  op: Operator;
  expected: number | boolean | string | readonly string[];
  actual: unknown;
  result: boolean;
}

export interface ConditionEvalTraceGroup {
  kind: "all" | "any" | "not";
  children: ConditionEvalTrace[];
  result: boolean;
}

export type ConditionEvalTrace = ConditionEvalTraceLeaf | ConditionEvalTraceGroup;

export interface RuleDecisionTrace {
  rule_id: string;
  priority: number;
  matched: boolean;
  skip_reason?: "cooldown" | "condition_false";
  condition_eval_trace: ConditionEvalTrace;
}

export interface RuleSelectionResult {
  rule: TacticsRule | null;
  traces: RuleDecisionTrace[];
}

const NUMERIC_OPERATORS: Operator[] = ["==", "!=", "<", "<=", ">", ">="];
const BOOLEAN_OPERATORS: Operator[] = ["==", "!="];
const STRING_OPERATORS: Operator[] = ["==", "!=", "contains", "in"];

const FACT_VALUE_RULES: Record<Fact, { kinds: ValueKind[]; operators: Operator[] }> = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConditionLeaf(value: ConditionExpr): value is ConditionLeaf {
  return isRecord(value) && "fact" in value && "op" in value && "value" in value;
}

function compare(actual: unknown, op: Operator, expected: unknown): boolean {
  if (op === "contains") {
    if (typeof actual === "string" && typeof expected === "string") {
      return actual.includes(expected);
    }
    if (Array.isArray(actual) && typeof expected === "string") {
      return actual.includes(expected);
    }
    return false;
  }

  if (op === "in") {
    if (Array.isArray(expected) && typeof actual === "string") {
      return expected.includes(actual);
    }
    return false;
  }

  if (typeof actual === "number" && typeof expected === "number") {
    if (op === "==") return actual === expected;
    if (op === "!=") return actual !== expected;
    if (op === "<") return actual < expected;
    if (op === "<=") return actual <= expected;
    if (op === ">") return actual > expected;
    if (op === ">=") return actual >= expected;
    return false;
  }

  if (typeof actual === "boolean" && typeof expected === "boolean") {
    if (op === "==") return actual === expected;
    if (op === "!=") return actual !== expected;
    return false;
  }

  if (typeof actual === "string" && typeof expected === "string") {
    if (op === "==") return actual === expected;
    if (op === "!=") return actual !== expected;
    return false;
  }

  return false;
}

export function evaluateCondition(
  expr: ConditionExpr,
  facts: Partial<Record<Fact, unknown>>
): boolean {
  if (isConditionLeaf(expr)) {
    const actual = facts[expr.fact];
    return compare(actual, expr.op, expr.value);
  }

  if ("all" in expr) {
    return expr.all.every((child) => evaluateCondition(child, facts));
  }

  if ("any" in expr) {
    return expr.any.some((child) => evaluateCondition(child, facts));
  }

  return !evaluateCondition(expr.not, facts);
}

function evaluateConditionWithTrace(
  expr: ConditionExpr,
  facts: Partial<Record<Fact, unknown>>
): ConditionEvalTrace {
  if (isConditionLeaf(expr)) {
    const actual = facts[expr.fact];
    const result = compare(actual, expr.op, expr.value);
    return {
      kind: "leaf",
      fact: expr.fact,
      op: expr.op,
      expected: expr.value,
      actual,
      result
    };
  }

  if ("all" in expr) {
    const children = expr.all.map((child) => evaluateConditionWithTrace(child, facts));
    return {
      kind: "all",
      children,
      result: children.every((child) => child.result)
    };
  }

  if ("any" in expr) {
    const children = expr.any.map((child) => evaluateConditionWithTrace(child, facts));
    return {
      kind: "any",
      children,
      result: children.some((child) => child.result)
    };
  }

  const child = evaluateConditionWithTrace(expr.not, facts);
  return {
    kind: "not",
    children: [child],
    result: !child.result
  };
}

function sortRules(rules: readonly TacticsRule[]): TacticsRule[] {
  return [...rules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function selectRuleWithTrace(
  candidates: readonly TacticsRule[],
  facts: Partial<Record<Fact, unknown>>,
  cooldowns: Record<string, number>
): RuleSelectionResult {
  const traces: RuleDecisionTrace[] = [];

  for (const rule of candidates) {
    const conditionTrace = evaluateConditionWithTrace(rule.when, facts);
    const cd = cooldowns[rule.id] ?? 0;
    const inCooldown = cd > 0;
    const matched = !inCooldown && conditionTrace.result;

    traces.push({
      rule_id: rule.id,
      priority: rule.priority,
      matched,
      skip_reason: matched ? undefined : inCooldown ? "cooldown" : "condition_false",
      condition_eval_trace: conditionTrace
    });

    if (matched) {
      return {
        rule,
        traces
      };
    }
  }

  return {
    rule: null,
    traces
  };
}

export function selectPartyRuleWithTrace(
  profile: TacticsProfile,
  trigger: Trigger,
  facts: Partial<Record<Fact, unknown>>,
  cooldowns: Record<string, number>
): RuleSelectionResult {
  const candidates = sortRules(
    profile.config.rules.filter((rule) => rule.scope === "party" && rule.trigger === trigger && rule.enabled)
  );

  return selectRuleWithTrace(candidates, facts, cooldowns);
}

export function selectCharacterRuleWithTrace(
  profile: TacticsProfile,
  trigger: Trigger,
  facts: Partial<Record<Fact, unknown>>,
  cooldowns: Record<string, number>
): RuleSelectionResult {
  const candidates = sortRules(
    profile.config.rules.filter((rule) => rule.scope === "character" && rule.trigger === trigger && rule.enabled)
  );

  return selectRuleWithTrace(candidates, facts, cooldowns);
}

export function selectPartyRule(
  profile: TacticsProfile,
  trigger: Trigger,
  facts: Partial<Record<Fact, unknown>>,
  cooldowns: Record<string, number>
): TacticsRule | null {
  return selectPartyRuleWithTrace(profile, trigger, facts, cooldowns).rule;
}

export function selectCharacterRule(
  profile: TacticsProfile,
  trigger: Trigger,
  facts: Partial<Record<Fact, unknown>>,
  cooldowns: Record<string, number>
): TacticsRule | null {
  return selectCharacterRuleWithTrace(profile, trigger, facts, cooldowns).rule;
}

export function fallbackActionForRole(profile: TacticsProfile, role: Role): Action {
  return profile.config.fallback_by_role[role];
}

function valueMatchesKind(value: unknown, kind: ValueKind): boolean {
  if (kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "string") return typeof value === "string";
  if (kind === "string[]") return Array.isArray(value) && value.every((it) => typeof it === "string");
  return false;
}

function countLeaf(expr: ConditionExpr): number {
  if (isConditionLeaf(expr)) return 1;
  if ("all" in expr) return expr.all.reduce((sum, child) => sum + countLeaf(child), 0);
  if ("any" in expr) return expr.any.reduce((sum, child) => sum + countLeaf(child), 0);
  return countLeaf(expr.not);
}

function validateConditionDepth(expr: ConditionExpr, depth: number): boolean {
  if (depth > LIMITS.maxConditionDepth) return false;
  if (isConditionLeaf(expr)) return true;

  if ("all" in expr) {
    if (expr.all.length < 1 || expr.all.length > LIMITS.maxConditionGroupSize) return false;
    return expr.all.every((child) => validateConditionDepth(child, depth + 1));
  }

  if ("any" in expr) {
    if (expr.any.length < 1 || expr.any.length > LIMITS.maxConditionGroupSize) return false;
    return expr.any.every((child) => validateConditionDepth(child, depth + 1));
  }

  return validateConditionDepth(expr.not, depth + 1);
}

function validateLeaf(leaf: ConditionLeaf): string | null {
  if (!FACTS.includes(leaf.fact)) {
    return `未知 fact: ${leaf.fact}`;
  }

  const rule = FACT_VALUE_RULES[leaf.fact];
  if (!rule.operators.includes(leaf.op)) {
    return `fact ${leaf.fact} 不支持运算符 ${leaf.op}`;
  }

  const typeOk = rule.kinds.some((kind) => valueMatchesKind(leaf.value, kind));
  if (!typeOk) {
    return `fact ${leaf.fact} 的 value 类型不合法，期望 ${rule.kinds.join("/")}`;
  }

  if (leaf.op === "in") {
    if (!Array.isArray(leaf.value) || leaf.value.length === 0) {
      return `运算符 in 需要非空字符串数组`;
    }
  }

  return null;
}

function walkLeaves(expr: ConditionExpr, visitor: (leaf: ConditionLeaf) => void): void {
  if (isConditionLeaf(expr)) {
    visitor(expr);
    return;
  }

  if ("all" in expr) {
    expr.all.forEach((child) => walkLeaves(child, visitor));
    return;
  }

  if ("any" in expr) {
    expr.any.forEach((child) => walkLeaves(child, visitor));
    return;
  }

  walkLeaves(expr.not, visitor);
}

function isFallbackByRole(value: unknown): value is FallbackByRole {
  if (!isRecord(value)) return false;
  return (
    typeof value.tank === "string" &&
    typeof value.dps === "string" &&
    typeof value.support === "string"
  );
}

function validateFallbackByRole(value: unknown): string[] {
  const errors: string[] = [];
  if (!isFallbackByRole(value)) {
    return ["fallback_by_role 缺失或格式错误"];
  }

  (Object.keys(FALLBACK_ACTIONS_BY_ROLE) as Role[]).forEach((role) => {
    const action = value[role];
    if (!ACTIONS.includes(action)) {
      errors.push(`fallback_by_role.${role} 动作非法: ${action}`);
      return;
    }
    if (!FALLBACK_ACTIONS_BY_ROLE[role].includes(action)) {
      errors.push(`fallback_by_role.${role} 与角色不匹配: ${action}`);
    }
  });

  return errors;
}

function validateRulesCore(rules: unknown, basePath = "rules"): string[] {
  const errors: string[] = [];
  if (!Array.isArray(rules)) {
    return [`${basePath} 必须是数组`];
  }

  if (rules.length > LIMITS.maxRulesPerConfig) {
    errors.push(`规则条数超过上限 ${LIMITS.maxRulesPerConfig}`);
  }

  const idSet = new Set<string>();

  rules.forEach((item, index) => {
    const path = `${basePath}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 不是对象`);
      return;
    }

    const rule = item as Partial<TacticsRule>;

    if (typeof rule.id !== "string" || !RULE_ID_PATTERN.test(rule.id)) {
      errors.push(`${path}.id 不符合命名规则`);
    } else if (idSet.has(rule.id)) {
      errors.push(`${path}.id 重复: ${rule.id}`);
    } else {
      idSet.add(rule.id);
    }

    if (rule.scope !== "party" && rule.scope !== "character") {
      errors.push(`${path}.scope 非法`);
      return;
    }

    if (
      rule.trigger !== "on_node_enter" &&
      rule.trigger !== "on_turn_start" &&
      rule.trigger !== "on_turn_end" &&
      rule.trigger !== "on_combat_end"
    ) {
      errors.push(`${path}.trigger 非法`);
    }

    if (typeof rule.priority !== "number" || rule.priority < 0 || rule.priority > LIMITS.maxPriority) {
      errors.push(`${path}.priority 超出范围`);
    }

    if (
      typeof rule.cooldown_turns !== "number" ||
      rule.cooldown_turns < 0 ||
      rule.cooldown_turns > LIMITS.maxCooldownTurns
    ) {
      errors.push(`${path}.cooldown_turns 超出范围`);
    }

    if (typeof rule.enabled !== "boolean") {
      errors.push(`${path}.enabled 必须是布尔值`);
    }

    if (!rule.when || !isRecord(rule.when)) {
      errors.push(`${path}.when 缺失或格式错误`);
    } else {
      const condition = rule.when as ConditionExpr;
      const leafCount = countLeaf(condition);
      if (leafCount > LIMITS.maxConditionsPerRule) {
        errors.push(`${path}.when 条件叶子数量超过上限 ${LIMITS.maxConditionsPerRule}`);
      }

      if (!validateConditionDepth(condition, 1)) {
        errors.push(`${path}.when 条件树深度或分组超限`);
      }

      walkLeaves(condition, (leaf) => {
        const leafError = validateLeaf(leaf);
        if (leafError) errors.push(`${path}.when: ${leafError}`);
      });
    }

    if (!rule.then || !isRecord(rule.then) || typeof rule.then.action !== "string") {
      errors.push(`${path}.then 缺失或格式错误`);
      return;
    }

    const action = rule.then.action as Action;
    if (!ACTIONS.includes(action)) {
      errors.push(`${path}.then.action 非法: ${action}`);
      return;
    }

    const allowedActions = ACTIONS_BY_SCOPE[rule.scope];
    if (!allowedActions.includes(action)) {
      errors.push(`${path}.then.action 与 scope 不匹配`);
    }

    if ("params" in rule.then && rule.then.params !== undefined && !isRecord(rule.then.params)) {
      errors.push(`${path}.then.params 必须是对象`);
    }
  });

  return errors;
}

export function createTacticsConfig(
  rules: TacticsRule[],
  fallbackByRole: FallbackByRole,
  policy: ConflictPolicy = DEFAULT_CONFLICT_POLICY
): TacticsConfig {
  return {
    version: 1,
    conflict_policy: policy,
    fallback_by_role: fallbackByRole,
    rules
  };
}

export function validateRules(rules: unknown): string[] {
  return validateRulesCore(rules, "rules");
}

export function validateTacticsConfig(config: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(config)) {
    return ["战术配置必须是对象"];
  }

  if (config.version !== 1) {
    errors.push("version 必须为 1");
  }

  if (typeof config.conflict_policy !== "string" || !CONFLICT_POLICIES.includes(config.conflict_policy as ConflictPolicy)) {
    errors.push("conflict_policy 非法，当前仅支持 mixed_party_preempt_character_merge");
  }

  errors.push(...validateFallbackByRole(config.fallback_by_role));

  if (!("rules" in config)) {
    errors.push("rules 缺失");
  } else {
    errors.push(...validateRulesCore(config.rules, "rules"));
  }

  return errors;
}

export function tickRuleCooldowns(cooldowns: Record<string, number>): void {
  Object.keys(cooldowns).forEach((key) => {
    if (cooldowns[key] > 0) {
      cooldowns[key] -= 1;
    }
  });
}

export function activateRuleCooldown(cooldowns: Record<string, number>, rule: TacticsRule): void {
  if (rule.cooldown_turns > 0) {
    cooldowns[rule.id] = rule.cooldown_turns;
  }
}

export function getActiveProfile(saveProfiles: TacticsProfile[], profileId: string): TacticsProfile {
  const hit = saveProfiles.find((profile) => profile.id === profileId);
  if (hit) return hit;
  return saveProfiles[0];
}
