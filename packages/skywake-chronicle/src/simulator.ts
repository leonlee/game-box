import { DUNGEONS, getDungeonContentById, getItemContentById, getQuestContentById } from "./content";
import { DropEntry, DungeonContent, NodeContent } from "./content-pack";
import { labelAction, labelReason, labelReasonUnknown, labelRunStatusUnknown } from "./i18n";
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
  selectCharacterRuleWithTrace,
  selectPartyRuleWithTrace,
  tickRuleCooldowns
} from "./tactics";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function randomInt(rng: () => number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(rng() * (high - low + 1));
}

function pickWeightedDrop(rng: () => number, drops: readonly DropEntry[]): DropEntry | null {
  if (drops.length === 0) return null;

  const totalWeight = drops.reduce((sum, drop) => sum + Math.max(0, drop.weight), 0);
  if (totalWeight <= 0) return null;

  let cursor = rng() * totalWeight;
  for (const drop of drops) {
    cursor -= Math.max(0, drop.weight);
    if (cursor <= 0) {
      return drop;
    }
  }

  return drops[drops.length - 1];
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

function updateQuestProgress(save: SaveData, dungeonId: string, reachedFloor: number, status: RunStatus): string[] {
  const completedNow: string[] = [];

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
      completedNow.push(quest.id);
    }
  });

  return completedNow;
}

function gainXp(save: SaveData, reachedFloor: number, status: RunStatus): void {
  const baseXp = status === "completed" ? reachedFloor * 20 : status === "retreated" ? reachedFloor * 12 : reachedFloor * 8;
  save.characters.forEach((character) => {
    character.xp += baseXp;
    while (character.xp >= character.level * 100) {
      const threshold = character.level * 100;
      if (threshold <= 0) break;
      character.level += 1;
      character.xp -= threshold;
      character.maxStress += 4;
      character.maxResource += 3;
      character.stressPhysical = Math.min(character.maxStress, character.stressPhysical + 10);
      character.resource = Math.min(character.maxResource, character.resource + 8);
    }
  });
}

interface RecoverySummary {
  stressRecovered: number;
  mentalRecovered: number;
  resourceRecovered: number;
  consequencesCleared: number;
}

function applyTownRecovery(save: SaveData, status: RunStatus): RecoverySummary {
  const infirmaryLevel = Math.max(1, Math.min(3, Math.floor(save.meta.infirmaryLevel)));
  const stressRatioByStatus: Record<RunStatus, number> = {
    running: 0,
    completed: 0.42,
    retreated: 0.3,
    failed: 0.18
  };
  const resourceRatioByStatus: Record<RunStatus, number> = {
    running: 0,
    completed: 0.5,
    retreated: 0.36,
    failed: 0.22
  };

  const stressRatio = stressRatioByStatus[status];
  const resourceRatio = resourceRatioByStatus[status];
  const bonusMultiplier = 1 + (infirmaryLevel - 1) * 0.2;
  const flatBonus = (infirmaryLevel - 1) * 3;
  const summary: RecoverySummary = {
    stressRecovered: 0,
    mentalRecovered: 0,
    resourceRecovered: 0,
    consequencesCleared: 0
  };

  save.characters.forEach((character) => {
    const stressBefore = character.stressPhysical;
    const mentalBefore = character.stressMental;
    const resourceBefore = character.resource;
    const hadConsequence = character.consequenceLight.length > 0;

    const stressGain = Math.max(6 + flatBonus, Math.round(character.maxStress * stressRatio * bonusMultiplier));
    const mentalGain = Math.max(4 + flatBonus, Math.round(character.maxStress * stressRatio * 0.7 * bonusMultiplier));
    const resourceGain = Math.max(8 + flatBonus, Math.round(character.maxResource * resourceRatio * bonusMultiplier));

    character.stressPhysical = clamp(character.stressPhysical + stressGain, 0, character.maxStress);
    character.stressMental = clamp(character.stressMental + mentalGain, 0, character.maxStress);
    character.resource = clamp(character.resource + resourceGain, 0, character.maxResource);

    if (status === "completed" || status === "retreated" || (status === "failed" && infirmaryLevel >= 3)) {
      character.consequenceLight = "";
    }

    summary.stressRecovered += Math.max(0, character.stressPhysical - stressBefore);
    summary.mentalRecovered += Math.max(0, character.stressMental - mentalBefore);
    summary.resourceRecovered += Math.max(0, character.resource - resourceBefore);
    if (hadConsequence && character.consequenceLight.length === 0) {
      summary.consequencesCleared += 1;
    }
  });

  return summary;
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

function getFloorNodes(dungeonContent: DungeonContent, floor: number): NodeContent[] {
  return dungeonContent.floors.find((floorData) => floorData.index === floor)?.nodes ?? [];
}

function pickSceneAspectFromNodeOrPool(
  rng: () => number,
  node: NodeContent | undefined,
  dungeon: DungeonDefinition
): string {
  if (node && node.scene_aspects.length > 0) {
    return pick(rng, node.scene_aspects);
  }
  return pick(rng, dungeon.scenePool);
}

function gateModeFromNode(node: NodeContent | undefined): "gate" | "environment" | "time" | "none" {
  if (!node?.gate_condition) return "none";
  if (node.gate_condition.required_item_id) return "gate";
  if (node.gate_condition.required_aspect) return "environment";
  if (node.gate_condition.time_window) return "time";
  return "none";
}

interface NodeDropResult {
  itemId: string;
  quantity: number;
}

interface QuestRewardResult {
  questId: string;
  gold: number;
  materials: number;
  itemId: string | null;
  itemCount: number;
}

interface QuestUpdateResult {
  id: string;
  title: string;
  progressFloor: number;
  targetFloor: number;
  stableFloor: number;
  status: "active" | "completed";
}

function rollNodeDrop(rng: () => number, node: NodeContent): NodeDropResult | null {
  const selected = pickWeightedDrop(rng, node.rewards);
  if (!selected) return null;

  return {
    itemId: selected.item_id,
    quantity: randomInt(rng, selected.min_count, selected.max_count)
  };
}

function applyQuestRewards(save: SaveData, questIds: readonly string[]): QuestRewardResult[] {
  const rewards: QuestRewardResult[] = [];

  questIds.forEach((questId) => {
    const quest = getQuestContentById(questId);
    if (!quest) return;

    const rewardData = quest.reward;
    const gold = typeof rewardData.gold === "number" && Number.isFinite(rewardData.gold) ? Math.max(0, Math.floor(rewardData.gold)) : 0;
    const materials =
      typeof rewardData.materials === "number" && Number.isFinite(rewardData.materials)
        ? Math.max(0, Math.floor(rewardData.materials))
        : 0;

    const itemId = typeof rewardData.item_id === "string" ? rewardData.item_id : null;
    const itemCountRaw = rewardData.count;
    const itemCount =
      typeof itemCountRaw === "number" && Number.isFinite(itemCountRaw) ? Math.max(1, Math.floor(itemCountRaw)) : 1;

    if (gold > 0) {
      save.gold += gold;
    }
    if (materials > 0) {
      save.materials += materials;
    }
    if (itemId) {
      save.inventory[itemId] = (save.inventory[itemId] ?? 0) + itemCount;
    }

    rewards.push({
      questId,
      gold,
      materials,
      itemId,
      itemCount: itemId ? itemCount : 0
    });
  });

  return rewards;
}

function buildQuestUpdatesForLog(save: SaveData, dungeonId: string): QuestUpdateResult[] {
  return save.quests
    .filter((quest) => quest.dungeonId === dungeonId)
    .map((quest) => ({
      id: quest.id,
      title: quest.title,
      progressFloor: quest.progressFloor,
      targetFloor: quest.targetFloor,
      stableFloor: quest.stableFloor,
      status: quest.status
    }));
}

function parseQuestUpdatesPayload(payload: Record<string, unknown>): QuestUpdateResult[] {
  const raw = payload.quest_updates;
  if (!Array.isArray(raw)) return [];

  const updates: QuestUpdateResult[] = [];
  raw.forEach((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return;

    const status = item.status === "completed" ? "completed" : "active";
    const progressFloorRaw = typeof item.progress_floor === "number" ? item.progress_floor : item.floor;
    const targetFloorRaw = item.target_floor;
    const stableFloorRaw = item.stable_floor;
    const progressFloor =
      typeof progressFloorRaw === "number" && Number.isFinite(progressFloorRaw) ? Math.max(0, Math.floor(progressFloorRaw)) : 0;
    const targetFloor =
      typeof targetFloorRaw === "number" && Number.isFinite(targetFloorRaw) ? Math.max(0, Math.floor(targetFloorRaw)) : 0;
    const stableFloor =
      typeof stableFloorRaw === "number" && Number.isFinite(stableFloorRaw) ? Math.max(0, Math.floor(stableFloorRaw)) : 0;

    updates.push({
      id: item.id,
      title: typeof item.title === "string" ? item.title : getQuestContentById(item.id)?.title ?? item.id,
      progressFloor,
      targetFloor,
      stableFloor,
      status
    });
  });

  return updates;
}

function parseCompletedQuestIdsPayload(payload: Record<string, unknown>): string[] {
  const raw = payload.completed_quests;
  if (!Array.isArray(raw)) return [];

  return raw.filter((item): item is string => typeof item === "string");
}

function parseQuestRewardsPayload(payload: Record<string, unknown>): QuestRewardResult[] {
  const raw = payload.granted_rewards;
  if (!Array.isArray(raw)) return [];

  const rewards: QuestRewardResult[] = [];
  raw.forEach((item) => {
    if (!isRecord(item) || typeof item.questId !== "string") return;

    const gold = typeof item.gold === "number" && Number.isFinite(item.gold) ? Math.max(0, Math.floor(item.gold)) : 0;
    const materials =
      typeof item.materials === "number" && Number.isFinite(item.materials) ? Math.max(0, Math.floor(item.materials)) : 0;
    const itemId = typeof item.itemId === "string" ? item.itemId : null;
    const itemCount =
      typeof item.itemCount === "number" && Number.isFinite(item.itemCount) ? Math.max(0, Math.floor(item.itemCount)) : 0;

    rewards.push({
      questId: item.questId,
      gold,
      materials,
      itemId,
      itemCount
    });
  });

  return rewards;
}

export function estimateRunMinutes(save: SaveData, request: ExploreRequest): EstimateResult {
  const dungeon = getDungeonById(request.dungeonId);
  const dungeonContent = getDungeonContentById(request.dungeonId);
  const floor = clamp(request.plannedFloor, 1, dungeon.maxFloor);

  const floorBase = dungeon.floorBaseMin * floor;
  const nodeCount = dungeonContent.floors
    .filter((floorData) => floorData.index <= floor)
    .reduce((sum, floorData) => sum + floorData.nodes.length, 0);
  const nodeEvent = Math.ceil(nodeCount * dungeon.nodeEventMin * 0.34);

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

function archiveRunSummary(save: SaveData, run: SaveData["runs"][number]): void {
  const progressRate = Math.min(1, run.reachedFloor / Math.max(1, run.plannedFloor));
  const archived = save.archivedRunSummary;
  archived.archivedRuns += 1;
  archived.progressRateSum += progressRate;
  archived.retainedGoldSum += run.retainedGold;
  archived.retainedMaterialsSum += run.retainedMaterials;

  if (run.status === "completed") archived.completed += 1;
  else if (run.status === "retreated") archived.retreated += 1;
  else if (run.status === "failed") archived.failed += 1;

  run.reasonTags.forEach((tag) => {
    archived.reasonTagCounts[tag] = (archived.reasonTagCounts[tag] ?? 0) + 1;
  });
}

export function simulateRun(save: SaveData, request: ExploreRequest): SimulationResult {
  const dungeon = getDungeonById(request.dungeonId);
  const dungeonContent = getDungeonContentById(request.dungeonId);
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

  const awardNodeDrop = (floor: number, node: NodeContent): void => {
    const drop = rollNodeDrop(rng, node);
    if (!drop) return;

    save.inventory[drop.itemId] = (save.inventory[drop.itemId] ?? 0) + drop.quantity;

    const item = getItemContentById(drop.itemId);
    if (item && item.item_type !== "quest") {
      rawGold += Math.max(0, Math.floor((item.sell_price * drop.quantity) / 3));
    }

    pushEvent(floor, node.id, "loot_drop", "success", {
      source_node: node.node_type,
      item_id: drop.itemId,
      quantity: drop.quantity
    });
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
    const floorNodes = getFloorNodes(dungeonContent, floor);
    const gateNode = floorNodes.find((node) => node.node_type === "gate");
    const combatNode = floorNodes.find((node) => node.node_type === "combat");
    const floorEntryScene = pickSceneAspectFromNodeOrPool(rng, gateNode ?? combatNode, dungeon);

    pushEvent(floor, `F${floor}_ENTRY`, "floor_enter", "success", {
      scene_aspect: floorEntryScene,
      floor_node_count: floorNodes.length
    });

    if (gateNode) {
      const nodeGateId = gateNode.id;
      const gateScene = pickSceneAspectFromNodeOrPool(rng, gateNode, dungeon);
      const blockerType = gateModeFromNode(gateNode);
      const requiredItemId = gateNode.gate_condition?.required_item_id;
      const requiredAspect = gateNode.gate_condition?.required_aspect ?? "相位锁";
      const expectedWindow = gateNode.gate_condition?.time_window ?? dungeon.favoredTimeWindow;

      pushEvent(floor, nodeGateId, "node_enter", "success", {
        node_type: gateNode.node_type,
        blocker_mode: blockerType,
        scene_aspect: gateScene,
        gate_condition: gateNode.gate_condition ?? null
      });

      if (blockerType === "gate") {
        const partyFacts = buildPartyFacts(save, "gate", gateScene, false, 0, 0, false);
        const partyDecision = selectPartyRuleWithTrace(profile, "on_node_enter", partyFacts, cooldowns);
        const partyRule = partyDecision.rule;
        if (partyRule) activateRuleCooldown(cooldowns, partyRule);

        const hasKey = requiredItemId ? (save.inventory[requiredItemId] ?? 0) > 0 : true;
        const used = partyRule?.then.action === "use_key_item_slot";

        if (!requiredItemId) {
          pushEvent(floor, nodeGateId, "overcome_check", "success", {
            gate_id: nodeGateId,
            rule_id: partyRule?.id ?? "none",
            rule_eval_trace: partyDecision.traces
          });
          awardNodeDrop(floor, gateNode);
        } else if (hasKey && used) {
          save.inventory[requiredItemId] = Math.max(0, (save.inventory[requiredItemId] ?? 0) - 1);
          pushEvent(floor, nodeGateId, "overcome_check", "success", {
            gate_id: nodeGateId,
            rule_id: partyRule.id,
            consumed_item: requiredItemId,
            rule_eval_trace: partyDecision.traces
          });
          awardNodeDrop(floor, gateNode);
        } else {
          status = "retreated";
          pushEvent(
            floor,
            nodeGateId,
            "gate_blocked",
            "failed",
            {
              gate_id: nodeGateId,
              missing_key: requiredItemId ?? "phase_calibrator",
              rule_id: partyRule?.id ?? "none",
              rule_eval_trace: partyDecision.traces
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
              reason: "missing_key_item",
              rule_eval_trace: partyDecision.traces
            },
            ["missing_key_item"]
          );
        }
      } else if (blockerType === "environment") {
        const partyFacts = buildPartyFacts(save, "event", gateScene, false, 0, 0, false);
        const partyDecision = selectPartyRuleWithTrace(profile, "on_node_enter", partyFacts, cooldowns);
        const partyRule = partyDecision.rule;
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
              required_aspect: requiredAspect,
              scene_aspect: gateScene,
              pass_chance: Number(passChance.toFixed(2)),
              rule_id: partyRule?.id ?? "none",
              rule_eval_trace: partyDecision.traces
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
              rule_id: partyRule?.id ?? "none",
              rule_eval_trace: partyDecision.traces
            },
            ["missing_required_aspect"]
          );
        } else {
          pushEvent(floor, nodeGateId, "overcome_check", "success", {
            required_aspect: requiredAspect,
            scene_aspect: gateScene,
            rule_id: partyRule?.id ?? "none",
            rule_eval_trace: partyDecision.traces
          });
          awardNodeDrop(floor, gateNode);
        }
      } else if (blockerType === "time") {
        const currentWindow = getCurrentTimeWindow();
        if (currentWindow !== expectedWindow) {
          status = "retreated";
          pushEvent(
            floor,
            nodeGateId,
            "overcome_check",
            "failed",
            {
              expected: expectedWindow,
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
            expected: expectedWindow,
            current: currentWindow
          });
          awardNodeDrop(floor, gateNode);
        }
      } else {
        pushEvent(floor, nodeGateId, "overcome_check", "success", {
          gate_id: nodeGateId,
          note: "no_gate_condition"
        });
        awardNodeDrop(floor, gateNode);
      }

      pushEvent(floor, nodeGateId, "node_exit", status === "running" ? "success" : "failed", {
        node_type: gateNode.node_type,
        blocker_mode: blockerType
      });

      if (status !== "running") break;
    }

    const combatNodeId = combatNode?.id ?? `F${floor}_COMBAT`;
    const combatScene = pickSceneAspectFromNodeOrPool(rng, combatNode, dungeon);
    const combatOpposition = combatNode?.opposition_level ?? Math.min(20, 4 + floor);
    const elite = combatOpposition >= 10 || floor % 5 === 0;
    const isBoss = floor === dungeon.maxFloor;
    let enemyHp = Math.round(
      (28 + floor * 9 + combatOpposition * 2) * dungeon.threatScale * (elite ? 1.35 : 1) * (isBoss ? 1.25 : 1)
    );

    pushEvent(floor, combatNodeId, "node_enter", "success", {
      node_type: "combat",
      scene_aspect: combatScene,
      opposition_level: combatOpposition
    });
    pushEvent(floor, combatNodeId, "combat_start", "success", {
      enemy_hp: enemyHp,
      elite,
      boss: isBoss,
      scene_aspect: combatScene
    });

    let combatResolved = false;

    for (let turn = 1; turn <= 8; turn += 1) {
      if (status !== "running") break;
      tickRuleCooldowns(cooldowns);

      const partyFacts = buildPartyFacts(save, "combat", combatScene, elite, enemyHp > 0 ? 1 : 0, turn, isBoss);
      const partyDecision = selectPartyRuleWithTrace(profile, "on_turn_start", partyFacts, cooldowns);
      const partyRule = partyDecision.rule;
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
          {
            rule_id: partyRule.id,
            reason: tag,
            min_stress_pct: Math.round(minStressPct),
            rule_eval_trace: partyDecision.traces
          },
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

        const decision = selectCharacterRuleWithTrace(profile, "on_turn_start", characterFacts, cooldowns);
        const rule = decision.rule;
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
          rule_id: rule?.id ?? "fallback",
          rule_eval_trace: decision.traces
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

    if (status === "running" && combatResolved && combatNode) {
      awardNodeDrop(floor, combatNode);
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

    const extraNodes = floorNodes.filter((node) => node.id !== gateNode?.id && node.id !== combatNode?.id);
    for (const node of extraNodes) {
      const sceneAspect = pickSceneAspectFromNodeOrPool(rng, node, dungeon);
      pushEvent(floor, node.id, "node_enter", "success", {
        node_type: node.node_type,
        scene_aspect: sceneAspect
      });

      awardNodeDrop(floor, node);

      pushEvent(floor, node.id, "node_exit", "success", {
        node_type: node.node_type
      });
    }

    const floorGold = Math.round((22 + floor * 6) * (elite ? 1.4 : 1));
    const floorMaterials = Math.round((12 + floor * 4) * (elite ? 1.35 : 1));
    rawGold += floorGold;
    rawMaterials += floorMaterials;

    pushEvent(floor, `F${floor}_EXIT`, "floor_leave", "success", {
      reward_gold: floorGold,
      reward_materials: floorMaterials
    });

    const completedQuestIds = updateQuestProgress(save, dungeon.id, floor, status);
    const grantedRewards = applyQuestRewards(save, completedQuestIds);
    pushEvent(floor, `F${floor}_QUEST`, "quest_progress", "success", {
      quest_updates: buildQuestUpdatesForLog(save, dungeon.id).map((quest) => ({
        id: quest.id,
        title: quest.title,
        progress_floor: quest.progressFloor,
        target_floor: quest.targetFloor,
        stable_floor: quest.stableFloor,
        status: quest.status
      })),
      completed_quests: completedQuestIds,
      granted_rewards: grantedRewards
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
  const recovery = applyTownRecovery(save, status);
  const completedAtEnd = updateQuestProgress(save, dungeon.id, reachedFloor, status);
  const rewardsAtEnd = applyQuestRewards(save, completedAtEnd);
  if (completedAtEnd.length > 0) {
    pushEvent(Math.max(1, reachedFloor), "RUN", "quest_progress", "success", {
      quest_updates: buildQuestUpdatesForLog(save, dungeon.id).map((quest) => ({
        id: quest.id,
        title: quest.title,
        progress_floor: quest.progressFloor,
        target_floor: quest.targetFloor,
        stable_floor: quest.stableFloor,
        status: quest.status
      })),
      completed_quests: completedAtEnd,
      granted_rewards: rewardsAtEnd
    });
  }

  pushEvent(Math.max(1, reachedFloor), "RUN", "run_end", status === "completed" ? "success" : "partial", {
    status,
    reached_floor: reachedFloor,
    raw_gold: rawGold,
    raw_materials: rawMaterials,
    retained_gold: retained.gold,
    retained_materials: retained.materials,
    reason_tags: Array.from(reasonTags),
    recovery
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
  if (save.runs.length > 30) {
    const archivedRuns = save.runs.splice(30);
    archivedRuns.forEach((run) => archiveRunSummary(save, run));
  }
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
    case "floor_leave":
      return `离开第 ${event.floor} 层`;
    case "floor_enter":
      return `进入第 ${event.floor} 层，场景 ${String(event.payload.scene_aspect ?? "未知")}`;
    case "node_enter":
      return `进入节点：${String(event.payload.node_type ?? "未知节点")}`;
    case "node_exit":
      return `离开节点：${String(event.payload.node_type ?? "未知节点")}`;
    case "gate_blocked":
      return `机关未响应，缺少 ${String(event.payload.missing_key ?? "关键道具")}`;
    case "overcome_check":
      return event.outcome === "success" ? "机关处理成功" : "机关处理失败，被迫折返";
    case "combat_start":
      return `遭遇战开始（敌方威胁 ${String(event.payload.enemy_hp ?? "?")}）`;
    case "combat_action":
      return `${String(event.payload.actor_name ?? "队员")} 执行 ${labelAction(event.payload.action)}`;
    case "combat_end":
      return event.outcome === "success" ? "战斗结束，敌方瓦解" : "队伍被压制，战斗失败";
    case "loot_drop":
      return `发现补给：${String(event.payload.item_id ?? "物资")}`;
    case "retreat_triggered":
      return `触发撤退：${labelReasonUnknown(event.payload.reason)}`;
    case "quest_progress":
      if (!isRecord(event.payload)) {
        return "任务进度更新";
      }

      const updates = parseQuestUpdatesPayload(event.payload);
      const completedQuestIds = parseCompletedQuestIdsPayload(event.payload);
      const rewards = parseQuestRewardsPayload(event.payload);
      const sections: string[] = [];

      if (updates.length > 0) {
        const progressText = updates
          .map((quest) => {
            const statusLabel = quest.status === "completed" ? "已完成" : "进行中";
            const progressLabel = quest.targetFloor > 0 ? `${quest.progressFloor}/${quest.targetFloor}` : `F${quest.progressFloor}`;
            return `${quest.title} ${progressLabel}（${statusLabel}）`;
          })
          .join("；");
        sections.push(`进度：${progressText}`);
      }

      if (completedQuestIds.length > 0) {
        const titles = completedQuestIds.map((questId) => getQuestContentById(questId)?.title ?? questId);
        sections.push(`完成：${titles.join("、")}`);
      }

      if (rewards.length > 0) {
        const rewardText = rewards
          .map((reward) => {
            const questTitle = getQuestContentById(reward.questId)?.title ?? reward.questId;
            const parts: string[] = [];
            if (reward.gold > 0) parts.push(`+${reward.gold}G`);
            if (reward.materials > 0) parts.push(`+${reward.materials}M`);
            if (reward.itemId && reward.itemCount > 0) {
              const itemName = getItemContentById(reward.itemId)?.name ?? reward.itemId;
              parts.push(`${itemName}x${reward.itemCount}`);
            }
            return `${questTitle}（${parts.join(" ") || "无"}）`;
          })
          .join("；");
        sections.push(`奖励：${rewardText}`);
      }

      return sections.length > 0 ? `任务进度更新｜${sections.join("｜")}` : "任务进度更新";
    case "run_end":
      return `出征结算：${labelRunStatusUnknown(event.payload.status)}`;
    default:
      return "事件更新";
  }
}

export function toNarrative(event: RunEvent): string {
  const reasonTags = event.reason_tags.map((tag) => labelReason(tag));
  const markers = reasonTags.length > 0 ? ` [${reasonTags.join("，")}]` : "";
  return `#${event.seq} F${event.floor} ${eventBrief(event)}${markers}`;
}
