import {
  ACTIONS,
  ACTIONS_BY_SCOPE,
  CONFLICT_POLICIES,
  FACTS,
  FACT_VALUE_RULES,
  FALLBACK_ACTIONS_BY_ROLE,
  LIMITS,
  OPERATORS,
  ROLES,
  RULE_ID_PATTERN,
  SCOPES,
  TRIGGERS,
  type Action,
  type Fact,
  type Operator,
  type RuleScope,
  type ValueKind
} from "./tactics-dsl";

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const ACTION_SET = new Set<string>(ACTIONS);
const FACT_SET = new Set<string>(FACTS);
const OPERATOR_SET = new Set<string>(OPERATORS);
const SCOPE_SET = new Set<string>(SCOPES);
const TRIGGER_SET = new Set<string>(TRIGGERS);
const CONFLICT_POLICY_SET = new Set<string>(CONFLICT_POLICIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function pushError(errors: ValidationError[], path: string, code: string, message: string): void {
  errors.push({ path, code, message });
}

function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTION_SET.has(value);
}

function valueMatchesKind(value: unknown, kind: ValueKind): boolean {
  if (kind === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (kind === "boolean") {
    return typeof value === "boolean";
  }
  if (kind === "string") {
    return typeof value === "string";
  }
  if (kind === "string[]") {
    return Array.isArray(value) && value.every((it) => typeof it === "string");
  }
  return false;
}

function validateFactValue(
  fact: Fact,
  op: Operator,
  value: unknown,
  path: string,
  errors: ValidationError[]
): void {
  const spec = FACT_VALUE_RULES[fact];

  if (!spec.operators.includes(op)) {
    pushError(
      errors,
      `${path}.op`,
      "INVALID_OPERATOR",
      `Fact '${fact}' does not support operator '${op}'.`
    );
    return;
  }

  const matchesAnyKind = spec.kinds.some((kind) => valueMatchesKind(value, kind));
  if (!matchesAnyKind) {
    pushError(
      errors,
      `${path}.value`,
      "INVALID_VALUE_TYPE",
      `Fact '${fact}' expects value kind in [${spec.kinds.join(", ")}].`
    );
    return;
  }

  if (op === "in") {
    if (!Array.isArray(value) || value.length === 0 || !value.every((it) => typeof it === "string")) {
      pushError(
        errors,
        `${path}.value`,
        "INVALID_IN_VALUE",
        "Operator 'in' requires a non-empty string array."
      );
    }
  }
}

function validateConditionExpr(
  expr: unknown,
  path: string,
  depth: number,
  leafCounter: { count: number },
  errors: ValidationError[]
): void {
  if (depth > LIMITS.maxConditionDepth) {
    pushError(errors, path, "MAX_DEPTH_EXCEEDED", `Condition depth exceeds ${LIMITS.maxConditionDepth}.`);
    return;
  }

  if (!isRecord(expr)) {
    pushError(errors, path, "INVALID_CONDITION", "Condition expression must be an object.");
    return;
  }

  const hasLeafShape = "fact" in expr || "op" in expr || "value" in expr;
  if (hasLeafShape) {
    const keys = Object.keys(expr);
    if (keys.length !== 3 || !("fact" in expr) || !("op" in expr) || !("value" in expr)) {
      pushError(errors, path, "INVALID_LEAF_SHAPE", "Leaf condition must contain only fact/op/value.");
      return;
    }

    const rawFact = expr.fact;
    const rawOp = expr.op;

    if (typeof rawFact !== "string" || !FACT_SET.has(rawFact)) {
      pushError(errors, `${path}.fact`, "INVALID_FACT", "Unknown fact.");
      return;
    }
    if (typeof rawOp !== "string" || !OPERATOR_SET.has(rawOp)) {
      pushError(errors, `${path}.op`, "INVALID_OPERATOR", "Unknown operator.");
      return;
    }

    leafCounter.count += 1;
    validateFactValue(rawFact as Fact, rawOp as Operator, expr.value, path, errors);
    return;
  }

  const groupKeys = ["all", "any", "not"].filter((k) => k in expr);
  if (groupKeys.length !== 1) {
    pushError(
      errors,
      path,
      "INVALID_GROUP_SHAPE",
      "Condition group must contain exactly one of: all / any / not."
    );
    return;
  }

  const group = groupKeys[0];
  if (group === "all" || group === "any") {
    const node = expr[group];
    if (!Array.isArray(node)) {
      pushError(errors, `${path}.${group}`, "INVALID_GROUP", `Field '${group}' must be an array.`);
      return;
    }

    if (node.length < 1 || node.length > LIMITS.maxConditionGroupSize) {
      pushError(
        errors,
        `${path}.${group}`,
        "INVALID_GROUP_SIZE",
        `Field '${group}' size must be between 1 and ${LIMITS.maxConditionGroupSize}.`
      );
      return;
    }

    node.forEach((child, index) => {
      validateConditionExpr(child, `${path}.${group}[${index}]`, depth + 1, leafCounter, errors);
    });
    return;
  }

  validateConditionExpr(expr.not, `${path}.not`, depth + 1, leafCounter, errors);
}

function validateRuleAction(
  actionNode: unknown,
  scope: RuleScope,
  path: string,
  errors: ValidationError[]
): void {
  if (!isRecord(actionNode)) {
    pushError(errors, path, "INVALID_ACTION", "Rule action must be an object.");
    return;
  }

  if (!isAction(actionNode.action)) {
    pushError(errors, `${path}.action`, "INVALID_ACTION", "Unknown action.");
    return;
  }

  const allowedActions = ACTIONS_BY_SCOPE[scope];
  if (!allowedActions.includes(actionNode.action)) {
    pushError(
      errors,
      `${path}.action`,
      "ACTION_SCOPE_MISMATCH",
      `Action '${actionNode.action}' is not allowed for scope '${scope}'.`
    );
  }

  if ("params" in actionNode && !isRecord(actionNode.params)) {
    pushError(errors, `${path}.params`, "INVALID_PARAMS", "Action params must be an object.");
  }
}

function validateFallbackByRole(value: unknown, errors: ValidationError[]): void {
  if (!isRecord(value)) {
    pushError(errors, "fallback_by_role", "INVALID_FALLBACK", "fallback_by_role must be an object.");
    return;
  }

  ROLES.forEach((role) => {
    const action = value[role];
    if (!isAction(action)) {
      pushError(errors, `fallback_by_role.${role}`, "INVALID_FALLBACK_ACTION", "Unknown fallback action.");
      return;
    }

    const allowed = FALLBACK_ACTIONS_BY_ROLE[role];
    if (!allowed.includes(action)) {
      pushError(
        errors,
        `fallback_by_role.${role}`,
        "FALLBACK_ACTION_ROLE_MISMATCH",
        `Fallback action '${action}' is not allowed for role '${role}'.`
      );
    }
  });
}

function validateRule(
  rule: unknown,
  index: number,
  seenRuleIds: Set<string>,
  errors: ValidationError[]
): void {
  const path = `rules[${index}]`;
  if (!isRecord(rule)) {
    pushError(errors, path, "INVALID_RULE", "Rule must be an object.");
    return;
  }

  if (typeof rule.id !== "string" || !RULE_ID_PATTERN.test(rule.id)) {
    pushError(errors, `${path}.id`, "INVALID_RULE_ID", "Rule id does not match required pattern.");
  } else if (seenRuleIds.has(rule.id)) {
    pushError(errors, `${path}.id`, "DUPLICATE_RULE_ID", `Duplicate rule id '${rule.id}'.`);
  } else {
    seenRuleIds.add(rule.id);
  }

  if (typeof rule.scope !== "string" || !SCOPE_SET.has(rule.scope)) {
    pushError(errors, `${path}.scope`, "INVALID_SCOPE", "Unknown rule scope.");
    return;
  }

  const scope = rule.scope as RuleScope;

  if (typeof rule.trigger !== "string" || !TRIGGER_SET.has(rule.trigger)) {
    pushError(errors, `${path}.trigger`, "INVALID_TRIGGER", "Unknown trigger.");
  }

  if (!isInteger(rule.priority) || rule.priority < 0 || rule.priority > LIMITS.maxPriority) {
    pushError(errors, `${path}.priority`, "INVALID_PRIORITY", `Priority must be 0..${LIMITS.maxPriority}.`);
  }

  if (!isInteger(rule.cooldown_turns) || rule.cooldown_turns < 0 || rule.cooldown_turns > LIMITS.maxCooldownTurns) {
    pushError(
      errors,
      `${path}.cooldown_turns`,
      "INVALID_COOLDOWN",
      `Cooldown turns must be 0..${LIMITS.maxCooldownTurns}.`
    );
  }

  if (typeof rule.enabled !== "boolean") {
    pushError(errors, `${path}.enabled`, "INVALID_ENABLED", "Enabled must be boolean.");
  }

  const leafCounter = { count: 0 };
  validateConditionExpr(rule.when, `${path}.when`, 1, leafCounter, errors);
  if (leafCounter.count > LIMITS.maxConditionsPerRule) {
    pushError(
      errors,
      `${path}.when`,
      "TOO_MANY_CONDITIONS",
      `Rule has ${leafCounter.count} conditions; max is ${LIMITS.maxConditionsPerRule}.`
    );
  }

  validateRuleAction(rule.then, scope, `${path}.then`, errors);
}

export function validateTacticsConfig(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ path: "", code: "INVALID_ROOT", message: "Tactics config must be an object." }]
    };
  }

  if (input.version !== 1) {
    pushError(errors, "version", "INVALID_VERSION", "Version must be 1.");
  }

  if (typeof input.conflict_policy !== "string" || !CONFLICT_POLICY_SET.has(input.conflict_policy)) {
    pushError(
      errors,
      "conflict_policy",
      "INVALID_CONFLICT_POLICY",
      "Conflict policy must be 'mixed_party_preempt_character_merge'."
    );
  }

  validateFallbackByRole(input.fallback_by_role, errors);

  if (!Array.isArray(input.rules)) {
    pushError(errors, "rules", "INVALID_RULES", "Rules must be an array.");
  } else {
    if (input.rules.length > LIMITS.maxRulesPerConfig) {
      pushError(
        errors,
        "rules",
        "TOO_MANY_RULES",
        `Rules length exceeds ${LIMITS.maxRulesPerConfig}.`
      );
    }

    const seenRuleIds = new Set<string>();
    input.rules.forEach((rule, index) => validateRule(rule, index, seenRuleIds, errors));
  }

  return { ok: errors.length === 0, errors };
}
