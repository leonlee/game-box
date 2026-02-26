const ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const CONTENT_VERSION_PATTERN = /^0\.1\.[0-9]+$/;

const ITEM_TYPES = ["weapon", "armor", "accessory", "consumable", "quest"] as const;
const QUEST_TYPES = ["main", "side", "challenge"] as const;
const NODE_TYPES = ["combat", "event", "trap", "gate", "camp", "chest"] as const;
const ENEMY_RANKS = ["normal", "elite", "boss"] as const;
const SEED_SCOPES = ["global", "save_local"] as const;
const SKILL_CATEGORIES = ["combat", "support", "utility"] as const;
const SKILL_ACTIONS = ["overcome", "create_advantage", "attack", "defend"] as const;
const TARGET_TYPES = ["self", "ally", "enemy", "scene"] as const;
const COST_TYPES = ["none", "stress", "resource"] as const;
const STUNT_TRIGGERS = ["passive", "on_action", "on_condition"] as const;
const TIME_WINDOWS = ["day", "night"] as const;

export interface StatBlock {
  str: number;
  dex: number;
  int: number;
  vit: number;
  wis: number;
  luk: number;
}

export interface RaceContent {
  id: string;
  name: string;
  base_stats: StatBlock;
  tags?: string[];
}

export interface ClassContent {
  id: string;
  name: string;
  allowed_weapon_tags: string[];
  starting_skill_ids: string[];
}

export interface SkillContent {
  id: string;
  name: string;
  category: (typeof SKILL_CATEGORIES)[number];
  base_action: (typeof SKILL_ACTIONS)[number];
  target_type: (typeof TARGET_TYPES)[number];
  cost_type: (typeof COST_TYPES)[number];
  cost_value: number;
  power_formula: string;
  tags: string[];
}

export interface StuntContent {
  id: string;
  name: string;
  trigger_type: (typeof STUNT_TRIGGERS)[number];
  effect_script: string;
  cooldown_turns: number;
}

export interface ItemContent {
  id: string;
  name: string;
  item_type: (typeof ITEM_TYPES)[number];
  rarity: number;
  gear_aspect?: string;
  gear_stunt_id?: string;
  use_effect_script?: string;
  stack_limit: number;
  sell_price: number;
  tags?: string[];
}

export interface DropEntry {
  item_id: string;
  weight: number;
  min_count: number;
  max_count: number;
}

export interface EnemyContent {
  id: string;
  name: string;
  rank: (typeof ENEMY_RANKS)[number];
  base_stats: StatBlock;
  skill_ids: string[];
  resistance_tags?: string[];
  drop_table: DropEntry[];
}

export interface GateCondition {
  required_item_id?: string;
  required_aspect?: string;
  time_window?: (typeof TIME_WINDOWS)[number];
}

export interface NodeContent {
  id: string;
  node_type: (typeof NODE_TYPES)[number];
  scene_aspects: string[];
  opposition_level: number;
  gate_condition?: GateCondition;
  rewards: DropEntry[];
}

export interface FloorContent {
  index: number;
  nodes: NodeContent[];
}

export interface DungeonContent {
  id: string;
  name: string;
  recommended_level: number;
  floor_count: number;
  seed_scope: (typeof SEED_SCOPES)[number];
  floors: FloorContent[];
}

export interface QuestContent {
  id: string;
  quest_type: (typeof QUEST_TYPES)[number];
  chapter: number;
  title: string;
  objective: Record<string, unknown>;
  reward: Record<string, unknown>;
  unlock_condition?: Record<string, unknown>;
}

export interface ContentPack {
  content_version: string;
  races: RaceContent[];
  classes: ClassContent[];
  skills: SkillContent[];
  stunts: StuntContent[];
  items: ItemContent[];
  enemies: EnemyContent[];
  dungeons: DungeonContent[];
  quests: QuestContent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function readArray(root: Record<string, unknown>, key: string, errors: string[]): unknown[] {
  const value = root[key];
  if (!Array.isArray(value)) {
    errors.push(`${key} 必须是数组`);
    return [];
  }
  return value;
}

function validateId(id: unknown, path: string, errors: string[]): id is string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    errors.push(`${path} 非法，必须匹配 ${String(ID_PATTERN)}`);
    return false;
  }
  return true;
}

function validateString(value: unknown, path: string, errors: string[], min = 1, max = 128): value is string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    errors.push(`${path} 必须是长度 ${min}-${max} 的字符串`);
    return false;
  }
  return true;
}

function validateStringArray(value: unknown, path: string, errors: string[], minSize = 0, maxSize = 999): value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${path} 必须是字符串数组`);
    return false;
  }
  if (value.length < minSize || value.length > maxSize) {
    errors.push(`${path} 数量必须在 ${minSize}-${maxSize} 之间`);
    return false;
  }
  return true;
}

function validateEnum<T extends string>(
  value: unknown,
  path: string,
  enumValues: readonly T[],
  errors: string[]
): value is T {
  if (typeof value !== "string" || !enumValues.includes(value as T)) {
    errors.push(`${path} 非法枚举值`);
    return false;
  }
  return true;
}

function validateIntRange(value: unknown, path: string, min: number, max: number, errors: string[]): value is number {
  if (!isInteger(value) || value < min || value > max) {
    errors.push(`${path} 必须是 ${min}-${max} 的整数`);
    return false;
  }
  return true;
}

function validateStatBlock(value: unknown, path: string, errors: string[]): value is StatBlock {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`);
    return false;
  }

  const keys: Array<keyof StatBlock> = ["str", "dex", "int", "vit", "wis", "luk"];
  let ok = true;
  keys.forEach((key) => {
    if (!validateIntRange(value[key], `${path}.${key}`, 1, 999, errors)) {
      ok = false;
    }
  });
  return ok;
}

function validateDropEntry(value: unknown, path: string, errors: string[]): value is DropEntry {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`);
    return false;
  }

  let ok = true;
  if (!validateId(value.item_id, `${path}.item_id`, errors)) ok = false;
  if (!validateIntRange(value.weight, `${path}.weight`, 1, 100000, errors)) ok = false;
  if (!validateIntRange(value.min_count, `${path}.min_count`, 1, 999, errors)) ok = false;
  if (!validateIntRange(value.max_count, `${path}.max_count`, 1, 999, errors)) ok = false;

  if (isInteger(value.min_count) && isInteger(value.max_count) && value.max_count < value.min_count) {
    errors.push(`${path}.max_count 不能小于 min_count`);
    ok = false;
  }

  return ok;
}

function validateRaces(value: unknown[], errors: string[]): RaceContent[] {
  const ids = new Set<string>();
  const output: RaceContent[] = [];

  value.forEach((item, index) => {
    const path = `races[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateStatBlock(item.base_stats, `${path}.base_stats`, errors)) ok = false;

    if (item.tags !== undefined && !validateStringArray(item.tags, `${path}.tags`, errors, 0, 32)) {
      ok = false;
    }

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as RaceContent);
    }
  });

  return output;
}

function validateClasses(value: unknown[], skillIds: Set<string>, errors: string[]): ClassContent[] {
  const ids = new Set<string>();
  const output: ClassContent[] = [];

  value.forEach((item, index) => {
    const path = `classes[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateStringArray(item.allowed_weapon_tags, `${path}.allowed_weapon_tags`, errors, 1, 16)) ok = false;

    if (!validateStringArray(item.starting_skill_ids, `${path}.starting_skill_ids`, errors, 1, 6)) {
      ok = false;
    } else {
      (item.starting_skill_ids as string[]).forEach((skillId) => {
        if (!skillIds.has(skillId)) {
          errors.push(`${path}.starting_skill_ids 包含未知 skill_id: ${skillId}`);
          ok = false;
        }
      });
    }

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as ClassContent);
    }
  });

  return output;
}

function validateSkills(value: unknown[], errors: string[]): SkillContent[] {
  const ids = new Set<string>();
  const output: SkillContent[] = [];

  value.forEach((item, index) => {
    const path = `skills[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateEnum(item.category, `${path}.category`, SKILL_CATEGORIES, errors)) ok = false;
    if (!validateEnum(item.base_action, `${path}.base_action`, SKILL_ACTIONS, errors)) ok = false;
    if (!validateEnum(item.target_type, `${path}.target_type`, TARGET_TYPES, errors)) ok = false;
    if (!validateEnum(item.cost_type, `${path}.cost_type`, COST_TYPES, errors)) ok = false;
    if (!validateIntRange(item.cost_value, `${path}.cost_value`, 0, 999, errors)) ok = false;
    if (!validateString(item.power_formula, `${path}.power_formula`, errors, 1, 128)) ok = false;
    if (!validateStringArray(item.tags, `${path}.tags`, errors, 0, 32)) ok = false;

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as SkillContent);
    }
  });

  return output;
}

function validateStunts(value: unknown[], errors: string[]): StuntContent[] {
  const ids = new Set<string>();
  const output: StuntContent[] = [];

  value.forEach((item, index) => {
    const path = `stunts[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateEnum(item.trigger_type, `${path}.trigger_type`, STUNT_TRIGGERS, errors)) ok = false;
    if (!validateString(item.effect_script, `${path}.effect_script`, errors, 1, 128)) ok = false;
    if (!validateIntRange(item.cooldown_turns, `${path}.cooldown_turns`, 0, 99, errors)) ok = false;

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as StuntContent);
    }
  });

  return output;
}

function validateItems(value: unknown[], stuntIds: Set<string>, errors: string[]): ItemContent[] {
  const ids = new Set<string>();
  const output: ItemContent[] = [];

  value.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateEnum(item.item_type, `${path}.item_type`, ITEM_TYPES, errors)) ok = false;
    if (!validateIntRange(item.rarity, `${path}.rarity`, 1, 6, errors)) ok = false;
    if (!validateIntRange(item.stack_limit, `${path}.stack_limit`, 1, 999, errors)) ok = false;
    if (!validateIntRange(item.sell_price, `${path}.sell_price`, 0, 999999, errors)) ok = false;

    if (item.gear_aspect !== undefined && !validateString(item.gear_aspect, `${path}.gear_aspect`, errors, 0, 64)) {
      ok = false;
    }

    if (item.gear_stunt_id !== undefined) {
      if (!validateId(item.gear_stunt_id, `${path}.gear_stunt_id`, errors)) {
        ok = false;
      } else if (!stuntIds.has(item.gear_stunt_id)) {
        errors.push(`${path}.gear_stunt_id 未定义: ${item.gear_stunt_id}`);
        ok = false;
      }
    }

    if (item.use_effect_script !== undefined && !validateString(item.use_effect_script, `${path}.use_effect_script`, errors, 1, 128)) {
      ok = false;
    }

    if (item.tags !== undefined && !validateStringArray(item.tags, `${path}.tags`, errors, 0, 32)) {
      ok = false;
    }

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as ItemContent);
    }
  });

  return output;
}

function validateEnemies(value: unknown[], skillIds: Set<string>, itemIds: Set<string>, errors: string[]): EnemyContent[] {
  const ids = new Set<string>();
  const output: EnemyContent[] = [];

  value.forEach((item, index) => {
    const path = `enemies[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateEnum(item.rank, `${path}.rank`, ENEMY_RANKS, errors)) ok = false;
    if (!validateStatBlock(item.base_stats, `${path}.base_stats`, errors)) ok = false;

    if (!validateStringArray(item.skill_ids, `${path}.skill_ids`, errors, 1, 16)) {
      ok = false;
    } else {
      (item.skill_ids as string[]).forEach((skillId) => {
        if (!skillIds.has(skillId)) {
          errors.push(`${path}.skill_ids 包含未知 skill_id: ${skillId}`);
          ok = false;
        }
      });
    }

    if (item.resistance_tags !== undefined && !validateStringArray(item.resistance_tags, `${path}.resistance_tags`, errors, 0, 16)) {
      ok = false;
    }

    if (!Array.isArray(item.drop_table) || item.drop_table.length === 0) {
      errors.push(`${path}.drop_table 至少包含一条掉落`);
      ok = false;
    } else {
      item.drop_table.forEach((drop, dropIndex) => {
        if (!validateDropEntry(drop, `${path}.drop_table[${dropIndex}]`, errors)) {
          ok = false;
          return;
        }
        const itemId = (drop as DropEntry).item_id;
        if (!itemIds.has(itemId)) {
          errors.push(`${path}.drop_table[${dropIndex}].item_id 未定义: ${itemId}`);
          ok = false;
        }
      });
    }

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as EnemyContent);
    }
  });

  return output;
}

function validateGateCondition(value: unknown, path: string, itemIds: Set<string>, errors: string[]): value is GateCondition {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`);
    return false;
  }

  let ok = true;
  if (value.required_item_id !== undefined) {
    if (!validateId(value.required_item_id, `${path}.required_item_id`, errors)) {
      ok = false;
    } else if (!itemIds.has(value.required_item_id)) {
      errors.push(`${path}.required_item_id 未定义: ${value.required_item_id}`);
      ok = false;
    }
  }

  if (value.required_aspect !== undefined && !validateString(value.required_aspect, `${path}.required_aspect`, errors, 1, 64)) {
    ok = false;
  }

  if (value.time_window !== undefined && !validateEnum(value.time_window, `${path}.time_window`, TIME_WINDOWS, errors)) {
    ok = false;
  }

  return ok;
}

function validateDungeons(value: unknown[], itemIds: Set<string>, errors: string[]): DungeonContent[] {
  const ids = new Set<string>();
  const output: DungeonContent[] = [];

  value.forEach((item, index) => {
    const path = `dungeons[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateString(item.name, `${path}.name`, errors, 1, 64)) ok = false;
    if (!validateIntRange(item.recommended_level, `${path}.recommended_level`, 1, 99, errors)) ok = false;
    if (!validateIntRange(item.floor_count, `${path}.floor_count`, 1, 100, errors)) ok = false;
    if (!validateEnum(item.seed_scope, `${path}.seed_scope`, SEED_SCOPES, errors)) ok = false;

    if (!Array.isArray(item.floors) || item.floors.length === 0) {
      errors.push(`${path}.floors 至少包含一层`);
      ok = false;
    } else {
      const floorIndices = new Set<number>();
      item.floors.forEach((floor, floorIndex) => {
        const floorPath = `${path}.floors[${floorIndex}]`;
        if (!isRecord(floor)) {
          errors.push(`${floorPath} 必须是对象`);
          ok = false;
          return;
        }

        if (!validateIntRange(floor.index, `${floorPath}.index`, 1, 100, errors)) {
          ok = false;
        } else if (floorIndices.has(floor.index)) {
          errors.push(`${floorPath}.index 重复: ${String(floor.index)}`);
          ok = false;
        } else {
          floorIndices.add(floor.index);
        }

        if (!Array.isArray(floor.nodes) || floor.nodes.length === 0) {
          errors.push(`${floorPath}.nodes 至少包含一个节点`);
          ok = false;
          return;
        }

        const nodeIds = new Set<string>();
        floor.nodes.forEach((node, nodeIndex) => {
          const nodePath = `${floorPath}.nodes[${nodeIndex}]`;
          if (!isRecord(node)) {
            errors.push(`${nodePath} 必须是对象`);
            ok = false;
            return;
          }

          if (!validateId(node.id, `${nodePath}.id`, errors)) {
            ok = false;
          } else if (nodeIds.has(node.id)) {
            errors.push(`${nodePath}.id 重复: ${node.id}`);
            ok = false;
          } else {
            nodeIds.add(node.id);
          }

          if (!validateEnum(node.node_type, `${nodePath}.node_type`, NODE_TYPES, errors)) ok = false;
          if (!validateStringArray(node.scene_aspects, `${nodePath}.scene_aspects`, errors, 0, 3)) ok = false;
          if (!validateIntRange(node.opposition_level, `${nodePath}.opposition_level`, 0, 20, errors)) ok = false;

          if (node.gate_condition !== undefined && !validateGateCondition(node.gate_condition, `${nodePath}.gate_condition`, itemIds, errors)) {
            ok = false;
          }

          if (!Array.isArray(node.rewards) || node.rewards.length === 0) {
            errors.push(`${nodePath}.rewards 至少包含一条`);
            ok = false;
          } else {
            node.rewards.forEach((reward, rewardIndex) => {
              if (!validateDropEntry(reward, `${nodePath}.rewards[${rewardIndex}]`, errors)) {
                ok = false;
                return;
              }
              const itemId = (reward as DropEntry).item_id;
              if (!itemIds.has(itemId)) {
                errors.push(`${nodePath}.rewards[${rewardIndex}].item_id 未定义: ${itemId}`);
                ok = false;
              }
            });
          }
        });
      });

      if (isInteger(item.floor_count) && item.floors.length !== item.floor_count) {
        errors.push(`${path}.floor_count 与 floors.length 不一致`);
        ok = false;
      }
    }

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as DungeonContent);
    }
  });

  return output;
}

function validateQuests(value: unknown[], dungeonIds: Set<string>, itemIds: Set<string>, errors: string[]): QuestContent[] {
  const ids = new Set<string>();
  const output: QuestContent[] = [];

  value.forEach((item, index) => {
    const path = `quests[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`);
      return;
    }

    let ok = true;
    if (!validateId(item.id, `${path}.id`, errors)) ok = false;
    if (!validateEnum(item.quest_type, `${path}.quest_type`, QUEST_TYPES, errors)) ok = false;
    if (!validateIntRange(item.chapter, `${path}.chapter`, 1, 99, errors)) ok = false;
    if (!validateString(item.title, `${path}.title`, errors, 1, 128)) ok = false;

    if (!isRecord(item.objective)) {
      errors.push(`${path}.objective 必须是对象`);
      ok = false;
    }

    if (!isRecord(item.reward)) {
      errors.push(`${path}.reward 必须是对象`);
      ok = false;
    }

    if (item.unlock_condition !== undefined && !isRecord(item.unlock_condition)) {
      errors.push(`${path}.unlock_condition 必须是对象`);
      ok = false;
    }

    if (isRecord(item.objective)) {
      const dungeonId = item.objective.dungeon_id;
      if (typeof dungeonId === "string" && !dungeonIds.has(dungeonId)) {
        errors.push(`${path}.objective.dungeon_id 未定义: ${dungeonId}`);
        ok = false;
      }
      const requiredItem = item.objective.required_item_id;
      if (typeof requiredItem === "string" && !itemIds.has(requiredItem)) {
        errors.push(`${path}.objective.required_item_id 未定义: ${requiredItem}`);
        ok = false;
      }
    }

    if (ok) {
      const id = item.id as string;
      if (ids.has(id)) {
        errors.push(`${path}.id 重复: ${id}`);
        return;
      }
      ids.add(id);
      output.push(item as unknown as QuestContent);
    }
  });

  return output;
}

export function validateContentPack(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return ["content pack 必须是对象"];
  }

  if (!validateString(input.content_version, "content_version", errors, 5, 16)) {
    // no-op
  } else if (!CONTENT_VERSION_PATTERN.test(input.content_version)) {
    errors.push("content_version 必须匹配 0.1.x");
  }

  const racesRaw = readArray(input, "races", errors);
  const classesRaw = readArray(input, "classes", errors);
  const skillsRaw = readArray(input, "skills", errors);
  const stuntsRaw = readArray(input, "stunts", errors);
  const itemsRaw = readArray(input, "items", errors);
  const enemiesRaw = readArray(input, "enemies", errors);
  const dungeonsRaw = readArray(input, "dungeons", errors);
  const questsRaw = readArray(input, "quests", errors);

  const races = validateRaces(racesRaw, errors);
  const skills = validateSkills(skillsRaw, errors);
  const skillIds = new Set(skills.map((skill) => skill.id));
  const stunts = validateStunts(stuntsRaw, errors);
  const stuntIds = new Set(stunts.map((stunt) => stunt.id));
  const items = validateItems(itemsRaw, stuntIds, errors);
  const itemIds = new Set(items.map((item) => item.id));
  const classes = validateClasses(classesRaw, skillIds, errors);
  const enemies = validateEnemies(enemiesRaw, skillIds, itemIds, errors);
  const dungeons = validateDungeons(dungeonsRaw, itemIds, errors);
  const dungeonIds = new Set(dungeons.map((dungeon) => dungeon.id));
  const quests = validateQuests(questsRaw, dungeonIds, itemIds, errors);

  const requiredNonEmpty: Array<[string, number]> = [
    ["races", races.length],
    ["classes", classes.length],
    ["skills", skills.length],
    ["stunts", stunts.length],
    ["items", items.length],
    ["enemies", enemies.length],
    ["dungeons", dungeons.length],
    ["quests", quests.length]
  ];

  requiredNonEmpty.forEach(([key, count]) => {
    if (count === 0) {
      errors.push(`${key} 不可为空`);
    }
  });

  return errors;
}

export function assertContentPack(input: unknown): ContentPack {
  const errors = validateContentPack(input);
  if (errors.length > 0) {
    throw new Error(`Content pack 校验失败:\n${errors.map((item) => `- ${item}`).join("\n")}`);
  }
  return input as ContentPack;
}
