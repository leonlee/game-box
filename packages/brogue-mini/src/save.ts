import { GameState, Creature, Item, GameMessage } from "./game";
import { MapCell } from "./map";
import { StatusEffect } from "./effects";

const SAVE_KEY = "brogue-mini-save";
const LEADERBOARD_KEY = "brogue-mini-leaderboard";

interface SaveData {
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
