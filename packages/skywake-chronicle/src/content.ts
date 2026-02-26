import { assertContentPack, ContentPack, DungeonContent, ItemContent, QuestContent } from "./content-pack";
import { createTacticsConfig, validateTacticsConfig } from "./tactics";
import {
  DungeonDefinition,
  FallbackByRole,
  QuestState,
  SaveData,
  TacticsProfile,
  TacticsRule,
  TimeWindow
} from "./types";

export const APP_MAJOR_VERSION = 1;
export const SAVE_VERSION = 1;
export const STORAGE_KEY = "skywake_chronicle_save_v1";
export const DEFAULT_META_PROGRESS = {
  infirmaryLevel: 1,
  workshopLevel: 1,
  chapterUnlocked: 1
} as const;

function now(): number {
  return Date.now();
}

function createDungeonFloors(
  dungeonPrefix: string,
  floorCount: number,
  scenes: readonly string[],
  keyItemFloorStep: number,
  favoredWindow: TimeWindow
): DungeonContent["floors"] {
  const floors: DungeonContent["floors"] = [];

  for (let floor = 1; floor <= floorCount; floor += 1) {
    const baseDrop = floor <= 4 ? "aether_shard" : "potion_small";
    const sceneA = scenes[(floor - 1) % scenes.length];
    const sceneB = scenes[floor % scenes.length];

    const gateCondition =
      floor % keyItemFloorStep === 0
        ? { required_item_id: "phase_calibrator" }
        : floor % 4 === 0
          ? { time_window: favoredWindow }
          : undefined;

    floors.push({
      index: floor,
      nodes: [
        {
          id: `${dungeonPrefix}_f${floor}_gate`,
          node_type: "gate",
          scene_aspects: [sceneA],
          opposition_level: Math.min(20, 2 + floor),
          gate_condition: gateCondition,
          rewards: [{ item_id: baseDrop, weight: 100, min_count: 1, max_count: 2 }]
        },
        {
          id: `${dungeonPrefix}_f${floor}_combat`,
          node_type: "combat",
          scene_aspects: [sceneA, sceneB],
          opposition_level: Math.min(20, 4 + floor),
          rewards: [
            { item_id: "aether_shard", weight: 100, min_count: 1, max_count: 3 },
            { item_id: "potion_small", weight: 40, min_count: 1, max_count: 1 }
          ]
        },
        {
          id: `${dungeonPrefix}_f${floor}_event`,
          node_type: "event",
          scene_aspects: [sceneB],
          opposition_level: Math.min(20, 1 + Math.floor(floor / 2)),
          rewards: [{ item_id: "remedy_kit", weight: 30, min_count: 1, max_count: 1 }]
        }
      ]
    });
  }

  return floors;
}

const BASE_CONTENT_PACK: ContentPack = {
  content_version: "0.1.0",
  races: [
    {
      id: "aerling",
      name: "空羽族",
      base_stats: { str: 8, dex: 11, int: 9, vit: 8, wis: 9, luk: 10 },
      tags: ["sky", "swift"]
    },
    {
      id: "forgeborn",
      name: "炉铸民",
      base_stats: { str: 11, dex: 7, int: 8, vit: 11, wis: 8, luk: 7 },
      tags: ["metal", "steady"]
    },
    {
      id: "mistfolk",
      name: "雾行者",
      base_stats: { str: 7, dex: 9, int: 11, vit: 8, wis: 11, luk: 8 },
      tags: ["arcane", "sensing"]
    }
  ],
  classes: [
    {
      id: "vanguard",
      name: "先锋卫",
      allowed_weapon_tags: ["blade", "shield"],
      starting_skill_ids: ["skill_guard_wall", "skill_pierce_slash"]
    },
    {
      id: "ranger",
      name: "巡风手",
      allowed_weapon_tags: ["bow", "dagger"],
      starting_skill_ids: ["skill_target_mark", "skill_pierce_slash"]
    },
    {
      id: "mystic",
      name: "以太师",
      allowed_weapon_tags: ["staff", "focus"],
      starting_skill_ids: ["skill_phase_bind", "skill_mend_pulse"]
    }
  ],
  skills: [
    {
      id: "skill_guard_wall",
      name: "护墙姿态",
      category: "support",
      base_action: "defend",
      target_type: "self",
      cost_type: "resource",
      cost_value: 6,
      power_formula: "vit*1.6 + lv*2",
      tags: ["guard", "frontline"]
    },
    {
      id: "skill_pierce_slash",
      name: "穿裂斩",
      category: "combat",
      base_action: "attack",
      target_type: "enemy",
      cost_type: "resource",
      cost_value: 8,
      power_formula: "str*1.3 + dex*0.6 + lv*2",
      tags: ["physical", "single"]
    },
    {
      id: "skill_target_mark",
      name: "缚风标记",
      category: "support",
      base_action: "create_advantage",
      target_type: "enemy",
      cost_type: "resource",
      cost_value: 5,
      power_formula: "dex*1.2 + luk*0.5",
      tags: ["mark", "control"]
    },
    {
      id: "skill_phase_bind",
      name: "相位束缚",
      category: "utility",
      base_action: "overcome",
      target_type: "scene",
      cost_type: "resource",
      cost_value: 7,
      power_formula: "int*1.4 + wis*0.8",
      tags: ["gate", "ritual"]
    },
    {
      id: "skill_mend_pulse",
      name: "修复脉冲",
      category: "support",
      base_action: "overcome",
      target_type: "ally",
      cost_type: "resource",
      cost_value: 6,
      power_formula: "wis*1.3 + int*0.7",
      tags: ["heal", "stability"]
    },
    {
      id: "skill_aether_burst",
      name: "以太激涌",
      category: "combat",
      base_action: "attack",
      target_type: "enemy",
      cost_type: "resource",
      cost_value: 10,
      power_formula: "int*1.6 + lv*2",
      tags: ["magic", "burst"]
    }
  ],
  stunts: [
    {
      id: "stunt_phase_guard",
      name: "相位护幕",
      trigger_type: "on_action",
      effect_script: "grant_guard_if_gate_scene",
      cooldown_turns: 2
    },
    {
      id: "stunt_focused_recovery",
      name: "专注回收",
      trigger_type: "passive",
      effect_script: "resource_regen_on_wait",
      cooldown_turns: 0
    },
    {
      id: "stunt_shock_break",
      name: "震裂破甲",
      trigger_type: "on_condition",
      effect_script: "bonus_vs_elite",
      cooldown_turns: 1
    },
    {
      id: "stunt_tempo_shift",
      name: "节奏转位",
      trigger_type: "on_action",
      effect_script: "extra_advantage_on_mark",
      cooldown_turns: 1
    }
  ],
  items: [
    {
      id: "phase_calibrator",
      name: "相位校准器",
      item_type: "consumable",
      rarity: 3,
      use_effect_script: "enable_gate_pass",
      stack_limit: 20,
      sell_price: 60,
      tags: ["key_item", "gate"]
    },
    {
      id: "potion_small",
      name: "应急药剂",
      item_type: "consumable",
      rarity: 1,
      use_effect_script: "restore_stress_18",
      stack_limit: 99,
      sell_price: 20,
      tags: ["recover"]
    },
    {
      id: "remedy_kit",
      name: "净化包",
      item_type: "consumable",
      rarity: 2,
      use_effect_script: "clear_light_consequence",
      stack_limit: 40,
      sell_price: 32,
      tags: ["cleanse"]
    },
    {
      id: "aether_shard",
      name: "以太碎晶",
      item_type: "quest",
      rarity: 2,
      stack_limit: 999,
      sell_price: 8,
      tags: ["material"]
    },
    {
      id: "storm_anchor",
      name: "风暴锚片",
      item_type: "quest",
      rarity: 4,
      stack_limit: 20,
      sell_price: 90,
      tags: ["quest"]
    }
  ],
  enemies: [
    {
      id: "enemy_archive_wisp",
      name: "书库浮灵",
      rank: "normal",
      base_stats: { str: 8, dex: 10, int: 9, vit: 8, wis: 7, luk: 8 },
      skill_ids: ["skill_pierce_slash"],
      resistance_tags: ["mist"],
      drop_table: [
        { item_id: "aether_shard", weight: 100, min_count: 1, max_count: 2 },
        { item_id: "potion_small", weight: 25, min_count: 1, max_count: 1 }
      ]
    },
    {
      id: "enemy_spindle_guard",
      name: "锭塔守卫机",
      rank: "elite",
      base_stats: { str: 12, dex: 9, int: 9, vit: 12, wis: 7, luk: 6 },
      skill_ids: ["skill_guard_wall", "skill_target_mark"],
      resistance_tags: ["armor"],
      drop_table: [
        { item_id: "aether_shard", weight: 100, min_count: 2, max_count: 3 },
        { item_id: "remedy_kit", weight: 20, min_count: 1, max_count: 1 }
      ]
    },
    {
      id: "enemy_storm_avatar",
      name: "风暴拟形",
      rank: "boss",
      base_stats: { str: 16, dex: 12, int: 14, vit: 16, wis: 12, luk: 9 },
      skill_ids: ["skill_aether_burst", "skill_phase_bind"],
      resistance_tags: ["boss", "electric"],
      drop_table: [
        { item_id: "storm_anchor", weight: 100, min_count: 1, max_count: 1 },
        { item_id: "phase_calibrator", weight: 40, min_count: 1, max_count: 2 }
      ]
    }
  ],
  dungeons: [
    {
      id: "abyssal_archive",
      name: "渊书库",
      recommended_level: 1,
      floor_count: 10,
      seed_scope: "save_local",
      floors: createDungeonFloors(
        "archive",
        10,
        ["静电裂隙", "偏移符文", "塌陷长桥", "浓雾走廊"],
        3,
        "day"
      )
    },
    {
      id: "storm_spindle",
      name: "风暴锭塔",
      recommended_level: 3,
      floor_count: 12,
      seed_scope: "save_local",
      floors: createDungeonFloors(
        "spindle",
        12,
        ["乱流壁", "雷蚀平台", "相位折叠门", "失压舱段"],
        4,
        "night"
      )
    }
  ],
  quests: [
    {
      id: "quest_archive_probe",
      quest_type: "main",
      chapter: 1,
      title: "渊书库校验",
      objective: { dungeon_id: "abyssal_archive", target_floor: 4 },
      reward: { gold: 180, materials: 55 }
    },
    {
      id: "quest_storm_anchor",
      quest_type: "side",
      chapter: 1,
      title: "风暴锭塔锚点",
      objective: { dungeon_id: "storm_spindle", target_floor: 5, required_item_id: "phase_calibrator" },
      reward: { item_id: "storm_anchor", count: 1, gold: 220 }
    }
  ]
};

export const CONTENT_PACK: ContentPack = assertContentPack(BASE_CONTENT_PACK);

const DUNGEON_RUNTIME_META: Record<
  string,
  { flavor: string; threatScale: number; floorBaseMin: number; nodeEventMin: number; favoredTimeWindow: TimeWindow }
> = {
  abyssal_archive: {
    flavor: "古语律印漂浮于断裂回廊，适合新手做日志解谜训练。",
    threatScale: 1,
    floorBaseMin: 3,
    nodeEventMin: 1.4,
    favoredTimeWindow: "day"
  },
  storm_spindle: {
    flavor: "高空湍流与机工残骸混合，环境阻断频率高于常规迷宫。",
    threatScale: 1.25,
    floorBaseMin: 4,
    nodeEventMin: 1.8,
    favoredTimeWindow: "night"
  }
};

function collectScenePool(dungeon: DungeonContent): string[] {
  const pool = new Set<string>();
  dungeon.floors.forEach((floor) => {
    floor.nodes.forEach((node) => {
      node.scene_aspects.forEach((aspect) => {
        if (aspect.length > 0) {
          pool.add(aspect);
        }
      });
    });
  });
  return [...pool];
}

export const DUNGEONS: DungeonDefinition[] = CONTENT_PACK.dungeons.map((dungeon) => {
  const runtime = DUNGEON_RUNTIME_META[dungeon.id] ?? {
    flavor: "未知迷宫，等待内容扩展。",
    threatScale: 1,
    floorBaseMin: 3,
    nodeEventMin: 1.4,
    favoredTimeWindow: "day" as const
  };

  return {
    id: dungeon.id,
    name: dungeon.name,
    flavor: runtime.flavor,
    recommendedLevel: dungeon.recommended_level,
    maxFloor: dungeon.floor_count,
    threatScale: runtime.threatScale,
    floorBaseMin: runtime.floorBaseMin,
    nodeEventMin: runtime.nodeEventMin,
    favoredTimeWindow: runtime.favoredTimeWindow,
    scenePool: collectScenePool(dungeon)
  };
});

export function getDungeonContentById(dungeonId: string): DungeonContent {
  return CONTENT_PACK.dungeons.find((dungeon) => dungeon.id === dungeonId) ?? CONTENT_PACK.dungeons[0];
}

export function getItemContentById(itemId: string): ItemContent | undefined {
  return CONTENT_PACK.items.find((item) => item.id === itemId);
}

export function getQuestContentById(questId: string): QuestContent | undefined {
  return CONTENT_PACK.quests.find((quest) => quest.id === questId);
}

const SHOP_DESC_BY_ID: Record<string, string> = {
  phase_calibrator: "用于穿越相位锁门，推荐在 gate 节点通过战术槽触发。",
  potion_small: "战斗中恢复压力值，降低撤退概率。",
  remedy_kit: "移除轻度后果，适合高惩罚循环。"
};

export const INVENTORY_CATALOG: Record<string, { name: string; desc: string; price: number }> =
  CONTENT_PACK.items.reduce<Record<string, { name: string; desc: string; price: number }>>((acc, item) => {
    if (!(item.id in SHOP_DESC_BY_ID)) {
      return acc;
    }

    acc[item.id] = {
      name: item.name,
      desc: SHOP_DESC_BY_ID[item.id],
      price: Math.max(1, item.sell_price * 2)
    };
    return acc;
  }, {});

function buildBaseRules(style: TacticsProfile["style"]): TacticsRule[] {
  if (style === "aggressive") {
    return [
      {
        id: "rule_retreat_critical",
        scope: "party",
        trigger: "on_turn_start",
        priority: 999,
        when: { fact: "ally_min_stress_pct", op: "<=", value: 12 },
        then: { action: "retreat_combat" },
        cooldown_turns: 0,
        enabled: true
      },
      {
        id: "rule_gate_use_item",
        scope: "party",
        trigger: "on_node_enter",
        priority: 900,
        when: {
          all: [
            { fact: "node_type", op: "==", value: "gate" },
            { fact: "party_has_item", op: "contains", value: "phase_calibrator" }
          ]
        },
        then: { action: "use_key_item_slot" },
        cooldown_turns: 0,
        enabled: true
      },
      {
        id: "rule_open_with_advantage",
        scope: "character",
        trigger: "on_turn_start",
        priority: 220,
        when: {
          any: [
            { fact: "enemy_is_elite", op: "==", value: true },
            { fact: "combat_is_boss", op: "==", value: true }
          ]
        },
        then: { action: "create_advantage", params: { aspect: "破绽标记" } },
        cooldown_turns: 1,
        enabled: true
      },
      {
        id: "rule_press_attack",
        scope: "character",
        trigger: "on_turn_start",
        priority: 140,
        when: { fact: "self_resource_pct", op: ">", value: 12 },
        then: { action: "attack_skill" },
        cooldown_turns: 0,
        enabled: true
      }
    ];
  }

  if (style === "cautious") {
    return [
      {
        id: "rule_retreat_safe_line",
        scope: "party",
        trigger: "on_turn_start",
        priority: 999,
        when: { fact: "ally_min_stress_pct", op: "<=", value: 32 },
        then: { action: "retreat_combat" },
        cooldown_turns: 0,
        enabled: true
      },
      {
        id: "rule_gate_use_item",
        scope: "party",
        trigger: "on_node_enter",
        priority: 910,
        when: {
          all: [
            { fact: "node_type", op: "==", value: "gate" },
            { fact: "party_has_item", op: "contains", value: "phase_calibrator" }
          ]
        },
        then: { action: "use_key_item_slot" },
        cooldown_turns: 0,
        enabled: true
      },
      {
        id: "rule_resource_protect",
        scope: "character",
        trigger: "on_turn_start",
        priority: 250,
        when: { fact: "self_stress_pct", op: "<=", value: 55 },
        then: { action: "use_consumable" },
        cooldown_turns: 1,
        enabled: true
      },
      {
        id: "rule_slow_attack",
        scope: "character",
        trigger: "on_turn_start",
        priority: 120,
        when: { fact: "self_resource_pct", op: "<=", value: 30 },
        then: { action: "basic_attack" },
        cooldown_turns: 0,
        enabled: true
      },
      {
        id: "rule_keep_guard",
        scope: "character",
        trigger: "on_turn_start",
        priority: 100,
        when: { fact: "enemy_count_alive", op: ">", value: 0 },
        then: { action: "defend_stance" },
        cooldown_turns: 0,
        enabled: true
      }
    ];
  }

  return [
    {
      id: "rule_retreat_default",
      scope: "party",
      trigger: "on_turn_start",
      priority: 999,
      when: { fact: "ally_min_stress_pct", op: "<=", value: 22 },
      then: { action: "retreat_combat" },
      cooldown_turns: 0,
      enabled: true
    },
    {
      id: "rule_gate_use_item",
      scope: "party",
      trigger: "on_node_enter",
      priority: 905,
      when: {
        all: [
          { fact: "node_type", op: "==", value: "gate" },
          { fact: "party_has_item", op: "contains", value: "phase_calibrator" }
        ]
      },
      then: { action: "use_key_item_slot" },
      cooldown_turns: 0,
      enabled: true
    },
    {
      id: "rule_advantage_elite",
      scope: "character",
      trigger: "on_turn_start",
      priority: 190,
      when: { fact: "enemy_is_elite", op: "==", value: true },
      then: { action: "create_advantage", params: { aspect: "关节破绽" } },
      cooldown_turns: 1,
      enabled: true
    },
    {
      id: "rule_heal_if_low",
      scope: "character",
      trigger: "on_turn_start",
      priority: 160,
      when: { fact: "self_stress_pct", op: "<=", value: 40 },
      then: { action: "use_consumable" },
      cooldown_turns: 1,
      enabled: true
    },
    {
      id: "rule_attack_default",
      scope: "character",
      trigger: "on_turn_start",
      priority: 100,
      when: { fact: "self_resource_pct", op: ">", value: 20 },
      then: { action: "attack_skill" },
      cooldown_turns: 0,
      enabled: true
    }
  ];
}

function presetFallback(style: "aggressive" | "balanced" | "cautious"): FallbackByRole {
  if (style === "aggressive") {
    return { tank: "defend_stance", dps: "attack_skill", support: "create_advantage" };
  }

  if (style === "cautious") {
    return { tank: "defend_stance", dps: "basic_attack", support: "defend_stance" };
  }

  return { tank: "defend_stance", dps: "basic_attack", support: "create_advantage" };
}

export function createPresetProfile(style: "aggressive" | "balanced" | "cautious", id: string): TacticsProfile {
  const names: Record<typeof style, string> = {
    aggressive: "好斗",
    balanced: "均衡",
    cautious: "谨慎"
  };

  const config = createTacticsConfig(buildBaseRules(style), presetFallback(style));
  const errors = validateTacticsConfig(config);
  if (errors.length > 0) {
    throw new Error(`预设战术配置无效: ${errors.join("; ")}`);
  }

  return {
    id,
    style,
    name: names[style],
    config,
    updatedAt: now()
  };
}

export function createDefaultQuests(): QuestState[] {
  const defaultDungeon = DUNGEONS[0]?.id ?? "abyssal_archive";

  return CONTENT_PACK.quests.map((quest) => {
    const dungeonId =
      typeof quest.objective.dungeon_id === "string" && DUNGEONS.some((dungeon) => dungeon.id === quest.objective.dungeon_id)
        ? quest.objective.dungeon_id
        : defaultDungeon;

    const targetFloorRaw = quest.objective.target_floor;
    const targetFloor =
      typeof targetFloorRaw === "number" && Number.isFinite(targetFloorRaw) && targetFloorRaw > 0
        ? Math.floor(targetFloorRaw)
        : 1;

    return {
      id: quest.id,
      title: quest.title,
      description: `${quest.title}（${quest.quest_type}）`,
      dungeonId,
      targetFloor,
      status: "active",
      progressFloor: 0,
      stableFloor: 0
    };
  });
}

function createSaveId(): string {
  return `save_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultSave(): SaveData {
  const createdAt = now();
  const balanced = createPresetProfile("balanced", "profile_balanced");
  const aggressive = createPresetProfile("aggressive", "profile_aggressive");
  const cautious = createPresetProfile("cautious", "profile_cautious");

  return {
    saveId: createSaveId(),
    saveVersion: SAVE_VERSION,
    appMajorVersion: APP_MAJOR_VERSION,
    createdAt,
    updatedAt: createdAt,
    playerName: "Sky Captain",
    currentTownId: "helios_harbor",
    gold: 280,
    materials: 110,
    fatePoints: 2,
    runCounter: 0,
    activePartyTacticProfileId: balanced.id,
    hintClaims: {},
    meta: {
      infirmaryLevel: DEFAULT_META_PROGRESS.infirmaryLevel,
      workshopLevel: DEFAULT_META_PROGRESS.workshopLevel,
      chapterUnlocked: DEFAULT_META_PROGRESS.chapterUnlocked
    },
    settings: {
      showOnboardingCard: true,
      defaultLogView: "narrative",
      notifyOnRunComplete: false,
      notifyFailOnly: false,
      advancedDebugView: false,
      expeditionTimeScale: 1
    },
    onboarding: {
      openedPartyTab: false,
      appliedPreset: false,
      startedRun: false,
      viewedDebugLog: false
    },
    activeRunPlan: null,
    archivedRunSummary: {
      archivedRuns: 0,
      completed: 0,
      retreated: 0,
      failed: 0,
      reasonTagCounts: {},
      progressRateSum: 0,
      retainedGoldSum: 0,
      retainedMaterialsSum: 0
    },
    inventory: {
      potion_small: 3,
      phase_calibrator: 0,
      remedy_kit: 1
    },
    characters: [
      {
        uid: "char_tank_01",
        name: "艾妲",
        role: "tank",
        classId: "vanguard",
        level: 1,
        xp: 0,
        stressPhysical: 100,
        stressMental: 85,
        maxStress: 100,
        resource: 50,
        maxResource: 50,
        consequenceLight: ""
      },
      {
        uid: "char_dps_01",
        name: "蕾芙",
        role: "dps",
        classId: "ranger",
        level: 1,
        xp: 0,
        stressPhysical: 92,
        stressMental: 90,
        maxStress: 92,
        resource: 65,
        maxResource: 65,
        consequenceLight: ""
      },
      {
        uid: "char_sup_01",
        name: "弥卡",
        role: "support",
        classId: "mystic",
        level: 1,
        xp: 0,
        stressPhysical: 88,
        stressMental: 100,
        maxStress: 88,
        resource: 78,
        maxResource: 78,
        consequenceLight: ""
      }
    ],
    tacticsProfiles: [balanced, aggressive, cautious],
    quests: createDefaultQuests(),
    runs: []
  };
}
