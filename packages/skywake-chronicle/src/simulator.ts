import { DUNGEONS } from "./content";
import {
  DungeonDefinition,
  EstimateResult,
  ExploreRequest,
  ReasonTag,
  Role,
  RunEvent,
  RunStatus,
  SaveData,
  SimulationResult,
  TimeWindow
} from "./types";
import {
  activateRuleCooldown,
  fallbackActionForRole,
  getActiveProfile,
  selectCharacterRule,
  selectPartyRule,
  tickRuleCooldowns
} from "./tactics";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getNow(): number {
  return Date.now();
}

function getCurrentTimeWindow(): TimeWindow {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "day" : "night";
}

function hashSeed(source: string): number {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function pickWeightedBlocker(rng: () => number): "gate" | "environment" | "time" {
  const roll = rng();
  if (roll < 0.3) return "gate";
  if (roll < 0.8) return "environment";
  return "time";
}

function roleWeight(role: Role): number {
  if (role === "tank") return 0.5;
  if (role === "dps") return 0.3;
  return 0.2;
}

function averageLevel(save: SaveData): number {
  const sum = save.characters.reduce((acc, item) => acc + item.level, 0);
  return sum / Math.max(1, save.characters.length);
}

function applyRewardByStatus(rawGold: number, rawMaterials: number, status: RunStatus): { gold: number; materials: number } {
  const multipliers: Record<RunStatus, { gold: number; materials: number }> = {
    running: { gold: 0, materials: 0 },
    completed: { gold: 1, materials: 1 },
    retreated: { gold: 0.45, materials: 0.6 },
    failed: { gold: 0.2, materials: 0.3 }
  };

  const rule = multipliers[status];
  return {
    gold: Math.floor(rawGold * rule.gold),
    materials: Math.floor(rawMaterials * rule.materials)
  };
}

function anyAlive(save: SaveData): boolean {
  return save.characters.some((character) => character.stressPhysical > 0);
}

function buildPartyFacts(
  save: SaveData,
  nodeType: string,
  sceneAspect: string,
  enemyIsElite: boolean,
  enemyCount: number,
  turn: number,
  combatIsBoss: boolean
): Record<string, unknown> {
  const minStress = Math.min(...save.characters.map((item) => item.stressPhysical / item.maxStress * 100));
  const consumableCount = (save.inventory.potion_small ?? 0) + (save.inventory.remedy_kit ?? 0);
  const partyItems = Object.keys(save.inventory).filter((itemId) => (save.inventory[itemId] ?? 0) > 0);

  return {
    ally_min_stress_pct: Math.floor(minStress),
    party_consumable_count: consumableCount,
    party_has_item: partyItems,
    node_type: nodeType,
    scene_has_aspect: [sceneAspect],
    enemy_is_elite: enemyIsElite,
    enemy_count_alive: enemyCount,
    turn_index: turn,
    time_window: getCurrentTimeWindow(),
    fate_point_count: save.fatePoints,
    combat_is_boss: combatIsBoss,
    rule_triggered_recently: false
  };
}

function chooseEnemyTarget(rng: () => number, save: SaveData): number {
  const living = save.characters
    .map((character, index) => ({ index, character }))
    .filter((item) => item.character.stressPhysical > 0);

  const pool = living.flatMap((item) => {
    const weight = Math.round(roleWeight(item.character.role) * 10);
    return Array.from({ length: Math.max(1, weight) }, () => item.index);
  });

  if (pool.length === 0) return 0;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

function updateQuestProgress(save: SaveData, dungeonId: string, reachedFloor: number, status: RunStatus): void {
  save.quests.forEach((quest) => {
    if (quest.dungeonId !== dungeonId || quest.status === "completed") return;

    if (status === "failed") {
      quest.progressFloor = quest.stableFloor;
      return;
    }

    if (reachedFloor > quest.progressFloor) {
      quest.progressFloor = reachedFloor;
      quest.stableFloor = Math.max(quest.stableFloor, reachedFloor - 1);
    }

    if (quest.progressFloor >= quest.targetFloor) {
      quest.status = "completed";
      quest.stableFloor = quest.targetFloor;
    }
  });
}

function gainXp(save: SaveData, reachedFloor: number, status: RunStatus): void {
  const baseXp = status === "completed" ? reachedFloor * 20 : status === "retreated" ? reachedFloor * 12 : reachedFloor * 8;
  save.characters.forEach((character) => {
    character.xp += baseXp;
    const threshold = character.level * 100;
    if (character.xp >= threshold) {
      character.level += 1;
      character.xp -= threshold;
      character.maxStress += 4;
      character.maxResource += 3;
      character.stressPhysical = Math.min(character.maxStress, character.stressPhysical + 10);
      character.resource = Math.min(character.maxResource, character.resource + 8);
    }
  });
}

function pickRandomLivingCharacterIndex(rng: () => number, save: SaveData): number {
  const livingIndices = save.characters
    .map((character, index) => ({ character, index }))
    .filter((item) => item.character.stressPhysical > 0)
    .map((item) => item.index);

  if (livingIndices.length === 0) {
    return 0;
  }

  return pick(rng, livingIndices);
}

function applyFailureConsequence(rng: () => number, save: SaveData): void {
  const index = pickRandomLivingCharacterIndex(rng, save);
  const character = save.characters[index];
  character.consequenceLight = "轻度后果：过载擦伤";

  const repairCost = Math.max(20, character.level * 14);
  save.gold = Math.max(0, save.gold - repairCost);
}

function getDungeonById(dungeonId: string): DungeonDefinition {
  const hit = DUNGEONS.find((dungeon) => dungeon.id === dungeonId);
  return hit ?? DUNGEONS[0];
}

export function estimateRunMinutes(save: SaveData, request: ExploreRequest): EstimateResult {
  const dungeon = getDungeonById(request.dungeonId);
  const floor = clamp(request.plannedFloor, 1, dungeon.maxFloor);

  const floorBase = dungeon.floorBaseMin * floor;
  const nodeEvent = Math.ceil(floor * dungeon.nodeEventMin * 1.6);

  const hasKeyItem = (save.inventory.phase_calibrator ?? 0) > 0;
  const detourWeight = hasKeyItem ? 0.18 : 0.35;
  const detour = Math.ceil(floor * detourWeight * 0.5);

  const etaMin = Math.max(6, Math.floor(floorBase + nodeEvent + detour));
  const etaMax = Math.min(90, Math.ceil(etaMin * 1.35));

  return {
    minMinutes: etaMin,
    maxMinutes: etaMax
  };
}

function eventLocKey(eventType: string, outcome: "success" | "partial" | "failed"): string {
  return `log.${eventType}.${outcome}`;
}

export function simulateRun(save: SaveData, request: ExploreRequest): SimulationResult {
  const dungeon = getDungeonById(request.dungeonId);
  const plannedFloor = clamp(request.plannedFloor, 1, dungeon.maxFloor);
  const profile = getActiveProfile(save.tacticsProfiles, save.activePartyTacticProfileId);

  save.runCounter += 1;
  const seed = hashSeed(`${save.saveId}:${save.runCounter}:${dungeon.id}:${plannedFloor}`);
  const rng = mulberry32(seed);

  const runId = `run_${save.runCounter}_${seed.toString(16)}`;
  const startedAt = getNow();
  let finishedAt = startedAt;
  let seq = 1;
  let reachedFloor = 0;
  let status: RunStatus = "running";
  let rawGold = 0;
  let rawMaterials = 0;
  const reasonTags = new Set<ReasonTag>();
  const events: RunEvent[] = [];

  const cooldowns: Record<string, number> = {};

  const pushEvent = (
    floor: number,
    nodeId: string,
    eventType: RunEvent["event_type"],
    outcome: RunEvent["outcome"],
    payload: Record<string, unknown>,
    tags: ReasonTag[] = []
  ): void => {
    const now = getNow();
    finishedAt = now;
    const event: RunEvent = {
      run_id: runId,
      seq,
      time_offset_sec: Math.max(0, Math.floor((now - startedAt) / 1000)),
      floor: Math.max(1, floor),
      node_id: nodeId,
      event_type: eventType,
      outcome,
      loc_key: eventLocKey(eventType, outcome),
      loc_args: {
        floor,
        nodeId,
        outcome
      },
      reason_tags: tags,
      payload
    };
    tags.forEach((tag) => reasonTags.add(tag));
    events.push(event);
    seq += 1;
  };

  pushEvent(1, "RUN", "run_start", "success", {
    dungeon_id: dungeon.id,
    planned_floor: plannedFloor,
    seed,
    profile_id: profile.id
  });

  for (let floor = 1; floor <= plannedFloor; floor += 1) {
    if (status !== "running") break;

    reachedFloor = floor;
    const sceneAspect = pick(rng, dungeon.scenePool);
    pushEvent(floor, `F${floor}_ENTRY`, "floor_enter", "success", { scene_aspect: sceneAspect });

    const nodeGateId = `F${floor}_GATE`;
    if (rng() < 0.55) {
      const blockerType = pickWeightedBlocker(rng);
      pushEvent(floor, nodeGateId, "node_enter", "success", { node_type: blockerType, scene_aspect: sceneAspect });

      if (blockerType === "gate") {
        const partyFacts = buildPartyFacts(save, "gate", sceneAspect, false, 0, 0, false);
        const partyRule = selectPartyRule(profile, "on_node_enter", partyFacts, cooldowns);
        if (partyRule) activateRuleCooldown(cooldowns, partyRule);

        const hasKey = (save.inventory.phase_calibrator ?? 0) > 0;
        const used = partyRule?.then.action === "use_key_item_slot";

        if (hasKey && used) {
          save.inventory.phase_calibrator = Math.max(0, (save.inventory.phase_calibrator ?? 0) - 1);
          pushEvent(floor, nodeGateId, "overcome_check", "success", {
            gate_id: nodeGateId,
            rule_id: partyRule.id,
            consumed_item: "phase_calibrator"
          });
        } else {
          status = "retreated";
          pushEvent(
            floor,
            nodeGateId,
            "gate_blocked",
            "failed",
            {
              gate_id: nodeGateId,
              missing_key: "phase_calibrator",
              rule_id: partyRule?.id ?? "none"
            },
            ["missing_key_item"]
          );
          pushEvent(
            floor,
            nodeGateId,
            "retreat_triggered",
            "failed",
            {
              rule_id: partyRule?.id ?? "none",
              reason: "missing_key_item"
            },
            ["missing_key_item"]
          );
        }
      } else if (blockerType === "environment") {
        const partyFacts = buildPartyFacts(save, "event", sceneAspect, false, 0, 0, false);
        const partyRule = selectPartyRule(profile, "on_node_enter", partyFacts, cooldowns);
        if (partyRule) activateRuleCooldown(cooldowns, partyRule);

        const avgLv = averageLevel(save);
        const action = partyRule?.then.action;
        const passChance =
          0.35 +
          avgLv * 0.03 +
          (action === "overcome_obstacle" ? 0.4 : 0) +
          (action === "create_advantage" ? 0.2 : 0);

        if (rng() > clamp(passChance, 0.1, 0.95)) {
          status = "retreated";
          pushEvent(
            floor,
            nodeGateId,
            "overcome_check",
            "failed",
            {
              scene_aspect: sceneAspect,
              pass_chance: Number(passChance.toFixed(2)),
              rule_id: partyRule?.id ?? "none"
            },
            ["missing_required_aspect", "path_blocked"]
          );
          pushEvent(
            floor,
            nodeGateId,
            "retreat_triggered",
            "failed",
            {
              reason: "missing_required_aspect",
              rule_id: partyRule?.id ?? "none"
            },
            ["missing_required_aspect"]
          );
        } else {
          pushEvent(floor, nodeGateId, "overcome_check", "success", {
            scene_aspect: sceneAspect,
            rule_id: partyRule?.id ?? "none"
          });
        }
      } else {
        const currentWindow = getCurrentTimeWindow();
        if (currentWindow !== dungeon.favoredTimeWindow) {
          status = "retreated";
          pushEvent(
            floor,
            nodeGateId,
            "overcome_check",
            "failed",
            {
              expected: dungeon.favoredTimeWindow,
              current: currentWindow
            },
            ["time_window_missed"]
          );
          pushEvent(
            floor,
            nodeGateId,
            "retreat_triggered",
            "failed",
            {
              reason: "time_window_missed"
            },
            ["time_window_missed"]
          );
        } else {
          pushEvent(floor, nodeGateId, "overcome_check", "success", {
            expected: dungeon.favoredTimeWindow,
            current: currentWindow
          });
        }
      }

      pushEvent(floor, nodeGateId, "node_exit", status === "running" ? "success" : "failed", {
        node_type: blockerType
      });

      if (status !== "running") break;
    }

    const combatNodeId = `F${floor}_COMBAT`;
    const elite = floor % 5 === 0;
    const isBoss = floor === dungeon.maxFloor;
    let enemyHp = Math.round((28 + floor * 9) * dungeon.threatScale * (elite ? 1.35 : 1) * (isBoss ? 1.25 : 1));

    pushEvent(floor, combatNodeId, "node_enter", "success", {
      node_type: "combat",
      scene_aspect: sceneAspect
    });
    pushEvent(floor, combatNodeId, "combat_start", "success", {
      enemy_hp: enemyHp,
      elite,
      boss: isBoss,
      scene_aspect: sceneAspect
    });

    let combatResolved = false;

    for (let turn = 1; turn <= 8; turn += 1) {
      if (status !== "running") break;
      tickRuleCooldowns(cooldowns);

      const partyFacts = buildPartyFacts(save, "combat", sceneAspect, elite, enemyHp > 0 ? 1 : 0, turn, isBoss);
      const partyRule = selectPartyRule(profile, "on_turn_start", partyFacts, cooldowns);
      if (partyRule) {
        activateRuleCooldown(cooldowns, partyRule);
      }

      if (partyRule?.then.action === "retreat_combat") {
        const minStressPct = Math.min(...save.characters.map((item) => item.stressPhysical / item.maxStress * 100));
        const tag: ReasonTag = minStressPct <= 25 ? "retreat_hp_threshold" : "retreat_resource_threshold";
        status = "retreated";
        pushEvent(
          floor,
          combatNodeId,
          "retreat_triggered",
          "failed",
          { rule_id: partyRule.id, reason: tag, min_stress_pct: Math.round(minStressPct) },
          [tag]
        );
        break;
      }

      let advantageStacks = 0;
      const guardSet = new Set<string>();
      let turnDamage = 0;
      let anyAction = false;

      for (const character of save.characters) {
        if (character.stressPhysical <= 0) continue;

        const selfStressPct = Math.floor((character.stressPhysical / character.maxStress) * 100);
        const selfResourcePct = Math.floor((character.resource / character.maxResource) * 100);
        const characterFacts = {
          ...partyFacts,
          self_stress_pct: selfStressPct,
          self_resource_pct: selfResourcePct,
          self_has_consequence: character.consequenceLight.length > 0,
          enemy_has_aspect: elite ? ["装甲厚重"] : ["游离护甲"]
        };

        const rule = selectCharacterRule(profile, "on_turn_start", characterFacts, cooldowns);
        if (rule) activateRuleCooldown(cooldowns, rule);

        let action = rule?.then.action ?? fallbackActionForRole(profile, character.role);
        let value = 0;

        if (action === "attack_skill" && character.resource < 8) {
          action = "basic_attack";
        }

        if (action === "attack_skill") {
          character.resource = clamp(character.resource - 8, 0, character.maxResource);
          value = Math.round(12 + character.level * 2 + rng() * 8);
          turnDamage += value;
          anyAction = true;
        } else if (action === "basic_attack") {
          value = Math.round(8 + character.level * 1.5 + rng() * 5);
          turnDamage += value;
          anyAction = true;
        } else if (action === "create_advantage") {
          advantageStacks += 1;
          value = 1;
          anyAction = true;
        } else if (action === "defend_stance") {
          guardSet.add(character.uid);
          value = 1;
          anyAction = true;
        } else if (action === "use_consumable") {
          if ((save.inventory.potion_small ?? 0) > 0 && selfStressPct <= 70) {
            save.inventory.potion_small = Math.max(0, (save.inventory.potion_small ?? 0) - 1);
            character.stressPhysical = clamp(character.stressPhysical + 18, 0, character.maxStress);
            value = 18;
            anyAction = true;
          } else {
            action = "wait";
          }
        } else if (action === "cleanse_ally") {
          const target = save.characters.find((item) => item.consequenceLight.length > 0);
          if (target && (save.inventory.remedy_kit ?? 0) > 0) {
            save.inventory.remedy_kit = Math.max(0, (save.inventory.remedy_kit ?? 0) - 1);
            target.consequenceLight = "";
            value = 1;
            anyAction = true;
          } else {
            action = "wait";
          }
        } else if (action === "save_resource_mode") {
          character.resource = clamp(character.resource + 5, 0, character.maxResource);
          value = 1;
          anyAction = true;
        } else if (action === "overcome_obstacle" || action === "swap_target" || action === "mark_priority_target") {
          value = 1;
          anyAction = true;
        }

        pushEvent(floor, combatNodeId, "combat_action", "success", {
          actor_id: character.uid,
          actor_name: character.name,
          role: character.role,
          action,
          value,
          enemy_hp_before: enemyHp,
          enemy_is_elite: elite,
          rule_id: rule?.id ?? "fallback"
        });
      }

      if (!anyAction) {
        status = "retreated";
        pushEvent(
          floor,
          combatNodeId,
          "retreat_triggered",
          "failed",
          {
            reason: "tactic_no_valid_action"
          },
          ["tactic_no_valid_action"]
        );
        break;
      }

      const scaledDamage = Math.max(1, Math.round(turnDamage * (1 + advantageStacks * 0.12)));
      enemyHp -= scaledDamage;

      if (enemyHp <= 0) {
        combatResolved = true;
        pushEvent(floor, combatNodeId, "combat_end", "success", {
          turn,
          remaining_party: save.characters.filter((item) => item.stressPhysical > 0).length
        });
        break;
      }

      const targetIndex = chooseEnemyTarget(rng, save);
      const target = save.characters[targetIndex];
      const baseIncoming = Math.round((10 + floor * 2 + (elite ? 7 : 0)) * (0.8 + rng() * 0.6));
      const mitigated = guardSet.has(target.uid) ? Math.round(baseIncoming * 0.6) : baseIncoming;
      target.stressPhysical = clamp(target.stressPhysical - mitigated, 0, target.maxStress);
      target.stressMental = clamp(target.stressMental - Math.round(mitigated * 0.35), 0, target.maxStress);

      if (target.stressPhysical <= 0 && target.consequenceLight.length === 0) {
        target.consequenceLight = "轻度后果：眩晕";
      }

      if (!anyAlive(save)) {
        status = "failed";
        pushEvent(
          floor,
          combatNodeId,
          "combat_end",
          "failed",
          {
            turn,
            reason: "enemy_overwhelm"
          },
          ["enemy_overwhelm"]
        );
        break;
      }
    }

    if (status === "running" && !combatResolved) {
      status = "retreated";
      pushEvent(
        floor,
        combatNodeId,
        "retreat_triggered",
        "failed",
        {
          reason: "retreat_resource_threshold"
        },
        ["retreat_resource_threshold"]
      );
    }

    pushEvent(
      floor,
      combatNodeId,
      "node_exit",
      status === "running" ? "success" : status === "failed" ? "failed" : "partial",
      { node_type: "combat" }
    );

    if (status !== "running") {
      break;
    }

    const floorGold = Math.round((22 + floor * 6) * (elite ? 1.4 : 1));
    const floorMaterials = Math.round((12 + floor * 4) * (elite ? 1.35 : 1));
    rawGold += floorGold;
    rawMaterials += floorMaterials;

    if (rng() < 0.24) {
      save.inventory.potion_small = (save.inventory.potion_small ?? 0) + 1;
      pushEvent(floor, `F${floor}_LOOT`, "loot_drop", "success", {
        item_id: "potion_small",
        quantity: 1
      });
    }

    pushEvent(floor, `F${floor}_EXIT`, "floor_leave", "success", {
      reward_gold: floorGold,
      reward_materials: floorMaterials
    });

    updateQuestProgress(save, dungeon.id, floor, status);
    pushEvent(floor, `F${floor}_QUEST`, "quest_progress", "success", {
      quest_updates: save.quests
        .filter((quest) => quest.dungeonId === dungeon.id)
        .map((quest) => ({ id: quest.id, floor: quest.progressFloor, status: quest.status }))
    });
  }

  if (status === "running") {
    status = "completed";
  }

  if (status === "failed") {
    applyFailureConsequence(rng, save);
  }

  const retained = applyRewardByStatus(rawGold, rawMaterials, status);
  save.gold += retained.gold;
  save.materials += retained.materials;

  gainXp(save, reachedFloor, status);
  updateQuestProgress(save, dungeon.id, reachedFloor, status);

  pushEvent(Math.max(1, reachedFloor), "RUN", "run_end", status === "completed" ? "success" : "partial", {
    status,
    reached_floor: reachedFloor,
    raw_gold: rawGold,
    raw_materials: rawMaterials,
    retained_gold: retained.gold,
    retained_materials: retained.materials,
    reason_tags: Array.from(reasonTags)
  }, Array.from(reasonTags));

  const summary = {
    runId,
    dungeonId: dungeon.id,
    plannedFloor,
    reachedFloor,
    status,
    startedAt,
    finishedAt,
    seed,
    rawGold,
    rawMaterials,
    retainedGold: retained.gold,
    retainedMaterials: retained.materials,
    reasonTags: Array.from(reasonTags),
    events
  };

  save.runs.unshift(summary);
  save.runs = save.runs.slice(0, 30);
  save.updatedAt = getNow();

  return {
    save,
    run: summary
  };
}

function eventBrief(event: RunEvent): string {
  switch (event.event_type) {
    case "run_start":
      return `出征开始，目标层数 ${String(event.payload.planned_floor ?? "?")}`;
    case "floor_enter":
      return `进入第 ${event.floor} 层，场景 ${String(event.payload.scene_aspect ?? "未知")}`;
    case "gate_blocked":
      return `机关未响应，缺少 ${String(event.payload.missing_key ?? "关键道具")}`;
    case "overcome_check":
      return event.outcome === "success" ? "机关处理成功" : "机关处理失败，被迫折返";
    case "combat_start":
      return `遭遇战开始（敌方威胁 ${String(event.payload.enemy_hp ?? "?")}）`;
    case "combat_action":
      return `${String(event.payload.actor_name ?? "队员")} 执行 ${String(event.payload.action ?? "动作")}`;
    case "combat_end":
      return event.outcome === "success" ? "战斗结束，敌方瓦解" : "队伍被压制，战斗失败";
    case "loot_drop":
      return `发现补给：${String(event.payload.item_id ?? "物资")}`;
    case "retreat_triggered":
      return `触发撤退：${String(event.payload.reason ?? "未知原因")}`;
    case "quest_progress":
      return "任务进度更新";
    case "run_end":
      return `出征结算：${String(event.payload.status ?? "unknown")}`;
    default:
      return `${event.event_type}`;
  }
}

export function toNarrative(event: RunEvent): string {
  const markers = event.reason_tags.length > 0 ? ` [${event.reason_tags.join(",")}]` : "";
  return `#${event.seq} F${event.floor} ${eventBrief(event)}${markers}`;
}
