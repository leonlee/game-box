import { GameState, Creature, Item, GameMessage } from "./game";
import { MapCell } from "./map";
import { StatusEffect } from "./effects";

const SAVE_KEY = "brogue-mini-save";
const LEADERBOARD_KEY = "brogue-mini-leaderboard";
const SAVE_VERSION = 2;

interface SaveData {
  version: number;
  cells: MapCell[][];
  player: Creature;
  pet: Creature;
  petAlive: boolean;
  monsters: Creature[];
  items: Item[];
  messages: GameMessage[];
  depth: number;
  turnCount: number;
  hunger: number;
  xp: number;
  level: number;
  xpToNext: number;
  inventoryItems: Item[];
  equippedWeapon: Item | null;
  equippedArmor: Item | null;
  statusEffects: StatusEffect[];
  kills: number;
  ascending: boolean;
  identifiedTypes: string[];
  gold: number;
  abilities: string[];
  abilityCooldowns: Record<string, number>;
  potionLabels: Record<string, string>;
  scrollLabels: Record<string, string>;
  deadSkeletons: { x: number; y: number; turnsLeft: number; hp: number; maxHp: number; atk: number; def: number; xp: number }[];
  burningTiles: [string, number][];
}

export interface LeaderboardEntry {
  depth: number;
  level: number;
  turns: number;
  kills: number;
  won: boolean;
  date: string;
}

export function saveGame(game: GameState): void {
  const data: SaveData = {
    version: SAVE_VERSION,
    cells: game.cells,
    player: game.player,
    pet: game.pet,
    petAlive: game.petAlive,
    monsters: game.monsters,
    items: game.items,
    messages: game.messages,
    depth: game.depth,
    turnCount: game.turnCount,
    hunger: game.hunger,
    xp: game.xp,
    level: game.level,
    xpToNext: game.xpToNext,
    inventoryItems: game.inventory.items,
    equippedWeapon: game.inventory.equipped.weapon,
    equippedArmor: game.inventory.equipped.armor,
    statusEffects: game.statusMgr.effects,
    kills: game.kills,
    ascending: game.ascending,
    identifiedTypes: [...game.identifiedTypes],
    gold: game.gold,
    abilities: [...game.abilities],
    abilityCooldowns: { ...game.abilityCooldowns },
    potionLabels: { ...game.potionLabels },
    scrollLabels: { ...game.scrollLabels },
    deadSkeletons: game.deadSkeletons,
    burningTiles: [...game.burningTiles.entries()],
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function loadGame(game: GameState): boolean {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;

  try {
    const data: SaveData = JSON.parse(raw);

    // Discard incompatible saves (roguelike convention)
    if (!data.version || data.version < SAVE_VERSION) {
      deleteSave();
      return false;
    }

    game.cells = data.cells;
    game.player = data.player;
    game.pet = data.pet;
    game.petAlive = data.petAlive;
    game.monsters = data.monsters;
    game.items = data.items;
    game.messages = data.messages;
    game.depth = data.depth;
    game.turnCount = data.turnCount;
    game.hunger = data.hunger;
    game.xp = data.xp;
    game.level = data.level;
    game.xpToNext = data.xpToNext;
    game.inventory.items = data.inventoryItems;
    game.inventory.equipped.weapon = data.equippedWeapon;
    game.inventory.equipped.armor = data.equippedArmor;
    game.statusMgr.effects = data.statusEffects;
    game.kills = data.kills;
    game.ascending = data.ascending;
    game.identifiedTypes = new Set(data.identifiedTypes);
    game.gold = data.gold;
    game.abilities = data.abilities as typeof game.abilities;
    game.abilityCooldowns = data.abilityCooldowns;
    game.potionLabels = data.potionLabels;
    game.scrollLabels = data.scrollLabels;
    game.deadSkeletons = data.deadSkeletons;
    game.burningTiles = new Map(data.burningTiles);
    game.gameOver = false;
    game.won = false;

    // Roguelike: delete save after loading
    deleteSave();
    return true;
  } catch {
    deleteSave();
    return false;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function addLeaderboardEntry(entry: LeaderboardEntry): void {
  const entries = getLeaderboard();
  entries.push(entry);
  entries.sort((a, b) => {
    if (a.won !== b.won) return a.won ? -1 : 1;
    if (a.won) return a.turns - b.turns; // Winners: fewer turns = better
    return b.depth - a.depth || b.level - a.level; // Deaths: deeper = better
  });
  // Keep top 10
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 10)));
}

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]");
  } catch {
    return [];
  }
}
