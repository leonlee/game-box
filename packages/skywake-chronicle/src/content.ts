import { DungeonDefinition, SaveData, TacticsProfile, TacticsRule, QuestState } from "./types";

export const APP_MAJOR_VERSION = 1;
export const SAVE_VERSION = 1;
export const STORAGE_KEY = "skywake_chronicle_save_v1";

export const INVENTORY_CATALOG: Record<string, { name: string; desc: string; price: number }> = {
  phase_calibrator: {
    name: "相位校准器",
    desc: "用于穿越相位锁门，推荐在 gate 节点通过战术槽触发。",
    price: 120
  },
  potion_small: {
    name: "应急药剂",
    desc: "战斗中恢复压力值，降低撤退概率。",
    price: 40
  },
  remedy_kit: {
    name: "净化包",
    desc: "移除轻度后果，适合高惩罚循环。",
    price: 65
  }
};

export const DUNGEONS: DungeonDefinition[] = [
  {
    id: "abyssal_archive",
    name: "渊书库",
    flavor: "古语律印漂浮于断裂回廊，适合新手做日志解谜训练。",
    recommendedLevel: 1,
    maxFloor: 10,
    threatScale: 1,
    floorBaseMin: 3,
    nodeEventMin: 1.4,
    favoredTimeWindow: "day",
    scenePool: ["静电裂隙", "偏移符文", "塌陷长桥", "浓雾走廊"]
  },
  {
    id: "storm_spindle",
    name: "风暴锭塔",
    flavor: "高空湍流与机工残骸混合，环境阻断频率高于常规迷宫。",
    recommendedLevel: 3,
    maxFloor: 12,
    threatScale: 1.25,
    floorBaseMin: 4,
    nodeEventMin: 1.8,
    favoredTimeWindow: "night",
    scenePool: ["乱流壁", "雷蚀平台", "相位折叠门", "失压舱段"]
  }
];

function now(): number {
  return Date.now();
}

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

export function createPresetProfile(style: "aggressive" | "balanced" | "cautious", id: string): TacticsProfile {
  const names: Record<typeof style, string> = {
    aggressive: "好斗",
    balanced: "均衡",
    cautious: "谨慎"
  };

  return {
    id,
    style,
    name: names[style],
    fallbackByRole:
      style === "aggressive"
        ? { tank: "defend_stance", dps: "attack_skill", support: "create_advantage" }
        : style === "cautious"
          ? { tank: "defend_stance", dps: "basic_attack", support: "defend_stance" }
          : { tank: "defend_stance", dps: "basic_attack", support: "create_advantage" },
    rules: buildBaseRules(style),
    updatedAt: now()
  };
}

export function createDefaultQuests(): QuestState[] {
  return [
    {
      id: "quest_archive_probe",
      title: "渊书库校验",
      description: "抵达渊书库第 4 层并带回完整日志。",
      dungeonId: "abyssal_archive",
      targetFloor: 4,
      status: "active",
      progressFloor: 0,
      stableFloor: 0
    },
    {
      id: "quest_storm_anchor",
      title: "风暴锭塔锚点",
      description: "在风暴锭塔第 5 层完成一次成功撤离。",
      dungeonId: "storm_spindle",
      targetFloor: 5,
      status: "active",
      progressFloor: 0,
      stableFloor: 0
    }
  ];
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
