import {
  MAP_W,
  MAP_H,
  Tile,
  MapCell,
  Room,
  generateDungeon,
  computeFOV,
} from "./map";
import { t, name } from "./i18n";
import { sfx } from "./audio";
import { Inventory } from "./inventory";
import { StatusManager } from "./effects";
import { saveGame, deleteSave } from "./save";
import { AnimationQueue } from "./animation";

export interface Creature {
  x: number;
  y: number;
  char: string;
  color: string;
  nameId: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  waterSlow?: boolean;
  passWall?: boolean;  // ghost: can move through walls
  ranged?: boolean;    // archer: ranged attack
  splits?: boolean;    // slime: splits on death
  xpValue?: number;    // XP reward on kill
  stunTurns?: number;  // skips turns while stunned
  burnTurns?: number;  // takes damage each turn
  fearTurns?: number;  // flees from player
  packBonus?: boolean;     // wolf: gains ATK per adjacent wolf
  disguised?: boolean;     // mimic: pretending to be an item
  disguiseItem?: { char: string; color: string }; // mimic's fake item appearance
  reflectDamage?: number;  // crystal elemental: % damage reflected
  lifeSteal?: number;      // vampire: HP healed per hit
  poisonCloud?: boolean;   // mushroom: AoE poison on death
  slowMonster?: boolean;   // golem: acts every other turn
  summonCooldown?: number; // necromancer: turns until next summon
  healCooldown?: number;   // cultist: turns until next ally heal
  doubleAct?: boolean;     // bat/hydra: acts twice per turn
  stationary?: boolean;    // mushroom: doesn't move
  lavaImmune?: boolean;    // ember sprite: immune to lava
  explodeOnDeath?: number; // ember sprite: AoE damage on death
  teleportCd?: number;     // phantom: turns until next teleport
  webCharge?: number;      // spider: turns until next web
  regenRate?: number;      // hydra: HP regen per turn
}

export type PetStage = 0 | 1 | 2 | 3;
export type PetCommand = "follow" | "stay" | "aggressive";
export type PetAbility = "bark" | "pounce" | "pack_leader";

export type MsgType = "combat" | "pickup" | "system" | "pet" | "info";

export interface GameMessage {
  text: string;
  type: MsgType;
  count: number;
}

export type ItemType = "potion" | "consumable" | "equipment" | "scroll" | "throwing" | "food" | "amulet";

export type EnchantType = "fire" | "ice" | "vampiric" | "thorns" | "swift";

export interface Enchantment {
  type: EnchantType;
  level: number;
}

export interface Item {
  x: number;
  y: number;
  char: string;
  color: string;
  nameId: string;
  type: ItemType;
  value: number;
  equipSlot?: "weapon" | "armor" | "ring";
  durability?: number;
  maxDurability?: number;
  enchantment?: Enchantment;
  cursed?: boolean;
  price?: number; // shop item price
}

interface MonsterDef {
  char: string;
  color: string;
  nameId: string;
  hp: number;
  attack: number;
  defense: number;
  passWall?: boolean;
  ranged?: boolean;
  splits?: boolean;
  xpValue: number;
  depthMin?: number;
  depthMax?: number;
  packBonus?: boolean;
  disguised?: boolean;
  reflectDamage?: number;
  lifeSteal?: number;
  poisonCloud?: boolean;
  slowMonster?: boolean;
  doubleAct?: boolean;
  stationary?: boolean;
  lavaImmune?: boolean;
  explodeOnDeath?: number;
  regenRate?: number;
  healCooldown?: number;
}

const MONSTER_DEFS: MonsterDef[] = [
  { char: "r", color: "#a0522d", nameId: "rat", hp: 3, attack: 2, defense: 0, xpValue: 3 },
  { char: "g", color: "#3cb371", nameId: "goblin", hp: 7, attack: 3, defense: 1, xpValue: 8 },
  { char: "s", color: "#9b59b6", nameId: "snake", hp: 5, attack: 4, defense: 0, xpValue: 7 },
  { char: "a", color: "#c0392b", nameId: "archer", hp: 6, attack: 3, defense: 0, ranged: true, xpValue: 10 },
  { char: "O", color: "#e67e22", nameId: "ogre", hp: 14, attack: 5, defense: 2, xpValue: 15 },
  { char: "G", color: "#5a7a9a", nameId: "ghost", hp: 8, attack: 4, defense: 0, passWall: true, xpValue: 12 },
  { char: "S", color: "#27ae60", nameId: "slime", hp: 10, attack: 2, defense: 1, splits: true, xpValue: 10 },
  { char: "z", color: "#cccccc", nameId: "skeleton", hp: 9, attack: 4, defense: 2, xpValue: 12 },
  { char: "W", color: "#6a0dad", nameId: "wraith", hp: 12, attack: 5, defense: 1, passWall: true, xpValue: 18 },
  { char: "f", color: "#ff4500", nameId: "fire imp", hp: 7, attack: 3, defense: 0, ranged: true, xpValue: 14 },
];

const NEW_MONSTER_DEFS: MonsterDef[] = [
  { char: "h", color: "#8a8a8a", nameId: "wolf", hp: 6, attack: 3, defense: 0, xpValue: 6, depthMin: 1, depthMax: 4, packBonus: true },
  { char: "x", color: "#d3d3d3", nameId: "spider", hp: 4, attack: 2, defense: 0, xpValue: 5, depthMin: 2, depthMax: 5 },
  { char: "M", color: "#cd853f", nameId: "mimic", hp: 12, attack: 5, defense: 1, xpValue: 16, depthMin: 3, depthMax: 7, disguised: true },
  { char: "T", color: "#8b8682", nameId: "golem", hp: 20, attack: 4, defense: 4, xpValue: 20, depthMin: 4, depthMax: 8, slowMonster: true },
  { char: "V", color: "#8b0000", nameId: "vampire", hp: 10, attack: 5, defense: 1, xpValue: 18, depthMin: 5, depthMax: 9, lifeSteal: 2 },
  { char: "m", color: "#8b4513", nameId: "mushroom", hp: 5, attack: 1, defense: 0, xpValue: 8, depthMin: 3, depthMax: 6, stationary: true, poisonCloud: true },
  { char: "C", color: "#87ceeb", nameId: "crystal elemental", hp: 15, attack: 3, defense: 3, xpValue: 22, depthMin: 6, depthMax: 9, reflectDamage: 30 },
  { char: "B", color: "#999999", nameId: "bat", hp: 3, attack: 2, defense: 0, xpValue: 4, depthMin: 1, depthMax: 3, doubleAct: true },
  { char: "N", color: "#6a0dad", nameId: "necromancer", hp: 8, attack: 3, defense: 1, xpValue: 16, depthMin: 7, depthMax: 10, ranged: true },
  { char: "u", color: "#7d5fff", nameId: "cultist", hp: 8, attack: 3, defense: 1, xpValue: 14, depthMin: 4, depthMax: 9, ranged: true, healCooldown: 3 },
  { char: "H", color: "#2e8b57", nameId: "hydra", hp: 18, attack: 4, defense: 2, xpValue: 25, depthMin: 8, depthMax: 10, doubleAct: true, regenRate: 1 },
  { char: "E", color: "#ff6347", nameId: "ember sprite", hp: 5, attack: 3, defense: 0, xpValue: 10, depthMin: 7, depthMax: 10, lavaImmune: true, explodeOnDeath: 3 },
  { char: "P", color: "#b0c4de", nameId: "phantom", hp: 7, attack: 4, defense: 0, xpValue: 14, depthMin: 5, depthMax: 8, passWall: true },
];

const PET_STAGES = [
  { depthMin: 1, nameId: "puppy", char: "p", color: "#deb887", hp: 10, attack: 1, defense: 0, scale: 0.10, abilities: [] as PetAbility[] },
  { depthMin: 3, nameId: "jack", char: "d", color: "#f4a460", hp: 15, attack: 2, defense: 1, scale: 0.14, abilities: ["bark"] as PetAbility[] },
  { depthMin: 5, nameId: "wolf", char: "d", color: "#808080", hp: 22, attack: 4, defense: 2, scale: 0.16, abilities: ["bark", "pounce"] as PetAbility[] },
  { depthMin: 8, nameId: "dire wolf", char: "d", color: "#c0c0c0", hp: 30, attack: 6, defense: 3, scale: 0.18, abilities: ["bark", "pounce", "pack_leader"] as PetAbility[] },
];

const DIRS4: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export class GameState {
  cells: MapCell[][] = [];
  player: Creature;
  pet: Creature;
  petAlive = true;
  monsters: Creature[] = [];
  items: Item[] = [];
  messages: GameMessage[] = [];
  depth = 1;
  gameOver = false;
  won = false;
  turnCount = 0;
  autoExploring = false;
  inventory = new Inventory();
  showInventory = false;
  inventoryCursor = 0;
  hunger = 100;
  maxHunger = 100;
  xp = 0;
  level = 1;
  xpToNext = 12;
  statusMgr = new StatusManager();
  pendingLevelUp = false;
  kills = 0;
  showMinimap = false;
  ascending = false;
  identifiedTypes: Set<string> = new Set();
  deadSkeletons: { x: number; y: number; turnsLeft: number; hp: number; maxHp: number; atk: number; def: number; xp: number }[] = [];
  abilities: ("dash" | "shield_bash" | "battle_cry")[] = [];
  abilityCooldowns: Record<string, number> = {};
  gold = 0;
  pendingBuy: Item | null = null;
  burningTiles: Map<string, number> = new Map(); // "x,y" -> turns remaining
  animations = new AnimationQueue();
  potionLabels: Record<string, string> = {};
  scrollLabels: Record<string, string> = {};
  petStage: PetStage = 0;
  petCommand: PetCommand = "follow";
  petAbilityCooldowns: Record<string, number> = {};

  private readonly fovRadius = 10;
  private readonly petHealInterval = 5;
  private readonly petHealAmount = 4;
  private readonly hungerInterval = 12; // lose 1 hunger every N turns

  constructor() {
    this.player = {
      x: 0,
      y: 0,
      char: "@",
      color: "#ffd700",
      nameId: "player",
      hp: 20,
      maxHp: 20,
      attack: 3,
      defense: 1,
    };
    this.randomizeLabels();
    this.pet = this.makePet(0, 0);
    // Start with a ration and a short sword equipped
    this.inventory.add(this.makeItem(0, 0, "ration"));
    this.inventory.add(this.makeItem(0, 0, "short sword"));
    this.inventory.equip(1); // equip the sword
    this.generateLevel();
    this.msg(t("welcome"));
  }

  private randomizeLabels() {
    const potionColors = ["red", "blue", "green", "pink", "black", "white", "yellow", "purple"];
    const scrollAdj = ["charred", "tattered", "glowing", "ancient", "damp", "faded", "ornate", "dusty"];
    const shuffle = <T>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const potionTypes = ["health potion", "potion of strength", "potion of poison", "potion of speed", "potion of invisibility"];
    const scrollTypes = ["scroll of teleport", "scroll of identify", "scroll of enchant", "scroll of mapping", "scroll of remove curse", "scroll of protection"];
    const sColors = shuffle([...potionColors]);
    const sAdj = shuffle([...scrollAdj]);
    for (let i = 0; i < potionTypes.length; i++) {
      this.potionLabels[potionTypes[i]] = sColors[i] + " potion";
    }
    for (let i = 0; i < scrollTypes.length; i++) {
      this.scrollLabels[scrollTypes[i]] = sAdj[i] + " scroll";
    }
  }

  private makePet(x: number, y: number): Creature {
    const stage = PET_STAGES[this.petStage];
    const scale = 1 + (this.depth - 1) * stage.scale;
    return {
      x, y,
      char: stage.char,
      color: stage.color,
      nameId: stage.nameId,
      hp: Math.ceil(stage.hp * scale),
      maxHp: Math.ceil(stage.hp * scale),
      attack: Math.ceil(stage.attack * scale),
      defense: Math.ceil(stage.defense * scale),
    };
  }

  private makeItem(x: number, y: number, id: string): Item {
    const defs: Record<string, Omit<Item, "x" | "y">> = {
      "health potion": { char: "!", color: "#ff69b4", nameId: "health potion", type: "potion", value: 8 },
      "health potion small": { char: "!", color: "#ff69b4", nameId: "health potion", type: "potion", value: 5 },
      whetstone: { char: ")", color: "#87ceeb", nameId: "whetstone", type: "consumable", value: 1 },
      "short sword": { char: ")", color: "#cccccc", nameId: "short sword", type: "equipment", value: 2, equipSlot: "weapon", durability: 45, maxDurability: 45 },
      "long sword": { char: ")", color: "#e0e0ff", nameId: "long sword", type: "equipment", value: 4, equipSlot: "weapon", durability: 60, maxDurability: 60 },
      dagger: { char: ")", color: "#aaaaaa", nameId: "dagger", type: "equipment", value: 1, equipSlot: "weapon", durability: 35, maxDurability: 35 },
      "battle axe": { char: ")", color: "#dd7733", nameId: "battle axe", type: "equipment", value: 5, equipSlot: "weapon", durability: 50, maxDurability: 50 },
      "war hammer": { char: ")", color: "#8888cc", nameId: "war hammer", type: "equipment", value: 6, equipSlot: "weapon", durability: 40, maxDurability: 40 },
      "leather armor": { char: "[", color: "#8b6914", nameId: "leather armor", type: "equipment", value: 2, equipSlot: "armor", durability: 52, maxDurability: 52 },
      "chain mail": { char: "[", color: "#b0b0b0", nameId: "chain mail", type: "equipment", value: 4, equipSlot: "armor", durability: 65, maxDurability: 65 },
      "plate armor": { char: "[", color: "#d0d0d0", nameId: "plate armor", type: "equipment", value: 5, equipSlot: "armor", durability: 80, maxDurability: 80 },
      "mithril mail": { char: "[", color: "#e0e8ff", nameId: "mithril mail", type: "equipment", value: 6, equipSlot: "armor" },
      "scroll of teleport": { char: "?", color: "#daa520", nameId: "scroll of teleport", type: "scroll", value: 0 },
      "scroll of identify": { char: "?", color: "#87cefa", nameId: "scroll of identify", type: "scroll", value: 0 },
      "scroll of enchant": { char: "?", color: "#ff6666", nameId: "scroll of enchant", type: "scroll", value: 0 },
      "scroll of mapping": { char: "?", color: "#66ff66", nameId: "scroll of mapping", type: "scroll", value: 0 },
      "scroll of remove curse": { char: "?", color: "#ffffff", nameId: "scroll of remove curse", type: "scroll", value: 0 },
      "scroll of protection": { char: "?", color: "#ffdd00", nameId: "scroll of protection", type: "scroll", value: 0 },
      "potion of strength": { char: "!", color: "#ff4444", nameId: "potion of strength", type: "potion", value: 1 },
      "potion of poison": { char: "!", color: "#44ff44", nameId: "potion of poison", type: "potion", value: 5 },
      "potion of speed": { char: "!", color: "#00ccff", nameId: "potion of speed", type: "potion", value: 10 },
      "potion of invisibility": { char: "!", color: "#aaaaff", nameId: "potion of invisibility", type: "potion", value: 8 },
      "throwing knife": { char: "/", color: "#c0c0c0", nameId: "throwing knife", type: "throwing", value: 4 },
      bomb: { char: "o", color: "#ff8844", nameId: "bomb", type: "throwing", value: 5 },
      ration: { char: "%", color: "#cd853f", nameId: "ration", type: "food", value: 40 },
      "ring of regeneration": { char: "=", color: "#2ecc71", nameId: "ring of regeneration", type: "equipment", value: 1, equipSlot: "ring" },
      "ring of perception": { char: "=", color: "#f1c40f", nameId: "ring of perception", type: "equipment", value: 1, equipSlot: "ring" },
      "phoenix feather": { char: "*", color: "#ff4400", nameId: "phoenix feather", type: "consumable", value: 0 },
    };
    const def = defs[id] ?? defs["health potion"];
    return { x, y, ...def };
  }

  /** Get display name for an item (handles unidentified potions/scrolls and enchantments) */
  getItemDisplayName(item: Item): string {
    if ((item.type === "potion" || item.type === "scroll") && !this.identifiedTypes.has(item.nameId)) {
      const label = this.potionLabels[item.nameId] || this.scrollLabels[item.nameId];
      if (label) return name(label);
    }
    let displayName = name(item.nameId);
    if (item.enchantment) {
      const prefixes: Record<string, string> = {
        fire: "flaming", ice: "frozen", vampiric: "vampiric", thorns: "thorned", swift: "swift",
      };
      displayName = `${prefixes[item.enchantment.type]} ${displayName}`;
    }
    if (item.cursed && this.identifiedTypes.has("curse:" + item.nameId)) {
      displayName = `cursed ${displayName}`;
    }
    return displayName;
  }

  private msg(text: string, type: MsgType = "system") {
    // Dedup: merge with last message if same text
    const last = this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    if (last && last.text === text && last.type === type) {
      last.count++;
      return;
    }
    this.messages.push({ text, type, count: 1 });
    if (this.messages.length > 7) this.messages.shift();
  }

  private generateLevel() {
    const { cells, rooms } = generateDungeon(this.depth, this.ascending);
    this.cells = cells;
    this.monsters = [];
    this.items = [];
    this.checkPetEvolution();

    // Player in first room
    const first = rooms[0];
    this.player.x = Math.floor(first.x + first.w / 2);
    this.player.y = Math.floor(first.y + first.h / 2);

    // Place pet next to player (scale stats with depth)
    if (this.petAlive) {
      const oldHpRatio = this.pet.hp / this.pet.maxHp;
      const newPet = this.makePet(this.player.x + 1, this.player.y);
      this.pet.x = newPet.x;
      this.pet.y = newPet.y;
      this.pet.maxHp = newPet.maxHp;
      this.pet.hp = Math.ceil(newPet.maxHp * oldHpRatio);
      this.pet.attack = newPet.attack;
      this.pet.defense = newPet.defense;
    }

    // Populate rooms based on tags
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];

      if (room.tag === "treasure") {
        // Treasure room: more items, potentially trapped
        const count = rand(2, 4);
        for (let j = 0; j < count; j++) this.spawnItem(room);
        // Also some monsters guarding
        this.spawnMonster(room);
      } else if (room.tag === "boss") {
        // Boss room handled below
      } else if (room.tag === "shop") {
        // Shop room: place some good items (player can just pick them up - simplified shop)
        this.spawnShopItems(room);
      } else {
        // Normal room: monsters + optional items
        const mCount = rand(1, 2);
        for (let j = 0; j < mCount; j++) this.spawnMonster(room);
        if (Math.random() < 0.45 && i < rooms.length - 1) {
          this.spawnItem(room);
        }
      }
    }

    // Depth 5: mid-boss Dragon guards Dragon Scale
    if (this.depth === 5) {
      const last = rooms[rooms.length - 1];
      const sx = Math.floor(last.x + last.w / 2);
      const sy = Math.floor(last.y + last.h / 2);
      // Dragon Scale: permanent +2 DEF, indestructible
      this.items.push({
        x: sx, y: sy,
        char: "[", color: "#ff6600",
        nameId: "dragon scale",
        type: "equipment",
        value: 2,
        equipSlot: "armor",
      });
      for (let attempt = 0; attempt < 20; attempt++) {
        const bossX = rand(last.x, last.x + last.w - 1);
        const bossY = rand(last.y, last.y + last.h - 1);
        if (this.cells[bossY][bossX].tile !== Tile.Wall && !(bossX === sx && bossY === sy)) {
          this.monsters.push({
            x: bossX, y: bossY,
            char: "D", color: "#ff4444",
            nameId: "dragon",
            hp: 22, maxHp: 22,
            attack: 6, defense: 2,
            xpValue: 50,
          });
          break;
        }
      }
    }

    // Depth 3: Spider Queen boss
    if (this.depth === 3) {
      const last = rooms[rooms.length - 1];
      const sx = Math.floor(last.x + last.w / 2);
      const sy = Math.floor(last.y + last.h / 2);
      // Pre-place web tiles in boss room
      for (let ry = last.y; ry < last.y + last.h; ry++) {
        for (let rx = last.x; rx < last.x + last.w; rx++) {
          if (this.cells[ry][rx].tile === Tile.Floor && Math.random() < 0.3) {
            this.cells[ry][rx].tile = Tile.Web;
          }
        }
      }
      for (let attempt = 0; attempt < 20; attempt++) {
        const bossX = rand(last.x, last.x + last.w - 1);
        const bossY = rand(last.y, last.y + last.h - 1);
        if (this.cells[bossY][bossX].tile !== Tile.Wall && !(bossX === sx && bossY === sy)) {
          this.monsters.push({
            x: bossX, y: bossY,
            char: "Q", color: "#8b4513",
            nameId: "spider queen",
            hp: 16, maxHp: 16,
            attack: 4, defense: 1,
            xpValue: 30,
            summonCooldown: 3,
          });
          break;
        }
      }
    }

    // Depth 7: Necromancer Lord boss
    if (this.depth === 7) {
      const last = rooms[rooms.length - 1];
      const sx = Math.floor(last.x + last.w / 2);
      const sy = Math.floor(last.y + last.h / 2);
      // BoneFloor tiles in boss room
      for (let ry = last.y; ry < last.y + last.h; ry++) {
        for (let rx = last.x; rx < last.x + last.w; rx++) {
          if (this.cells[ry][rx].tile === Tile.Floor) {
            this.cells[ry][rx].tile = Tile.BoneFloor;
          }
        }
      }
      // Phoenix feather drop
      this.items.push({
        x: sx, y: sy,
        char: "*", color: "#ff4400",
        nameId: "phoenix feather",
        type: "consumable",
        value: 0,
      });
      for (let attempt = 0; attempt < 20; attempt++) {
        const bossX = rand(last.x, last.x + last.w - 1);
        const bossY = rand(last.y, last.y + last.h - 1);
        if (this.cells[bossY][bossX].tile !== Tile.Wall && !(bossX === sx && bossY === sy)) {
          this.monsters.push({
            x: bossX, y: bossY,
            char: "K", color: "#4b0082",
            nameId: "necromancer lord",
            hp: 28, maxHp: 28,
            attack: 5, defense: 2,
            ranged: true,
            xpValue: 65,
            summonCooldown: 3,
          });
          break;
        }
      }
    }

    // Depth 10: Lich boss guards Amulet of Yendor
    if (this.depth === 10) {
      const last = rooms[rooms.length - 1];
      const sx = Math.floor(last.x + last.w / 2);
      const sy = Math.floor(last.y + last.h / 2);
      this.cells[sy][sx].tile = Tile.Floor;
      this.items.push({
        x: sx, y: sy,
        char: '"', color: "#ffd700",
        nameId: "Amulet of Yendor",
        type: "amulet",
        value: 0,
      });
      for (let attempt = 0; attempt < 20; attempt++) {
        const bossX = rand(last.x, last.x + last.w - 1);
        const bossY = rand(last.y, last.y + last.h - 1);
        if (this.cells[bossY][bossX].tile !== Tile.Wall && !(bossX === sx && bossY === sy)) {
          this.monsters.push({
            x: bossX, y: bossY,
            char: "L", color: "#9933ff",
            nameId: "lich",
            hp: 30, maxHp: 30,
            attack: 7, defense: 3,
            ranged: true,
            xpValue: 80,
          });
          break;
        }
      }
    }

    computeFOV(this.cells, this.player.x, this.player.y, this.fovRadius);
  }

  private spawnShopItems(room: Room) {
    const shopItems: { id: string; price: number }[] = [
      { id: "health potion", price: 8 },
      { id: "scroll of teleport", price: 12 },
      { id: "throwing knife", price: 6 },
      { id: "ration", price: 5 },
      { id: "scroll of identify", price: 10 },
      { id: "bomb", price: 12 },
      { id: "potion of strength", price: 20 },
      { id: "potion of speed", price: 15 },
      { id: "scroll of protection", price: 18 },
    ];
    for (let j = 0; j < rand(2, 4); j++) {
      const pick = shopItems[rand(0, shopItems.length - 1)];
      const ix = rand(room.x, room.x + room.w - 1);
      const iy = rand(room.y, room.y + room.h - 1);
      if (this.cells[iy][ix].tile !== Tile.Wall) {
        const item = this.makeItem(ix, iy, pick.id);
        item.price = pick.price;
        this.items.push(item);
      }
    }
    // Place shopkeeper in center of room (friendly, not a monster)
    const kx = Math.floor(room.x + room.w / 2);
    const ky = Math.floor(room.y + room.h / 2);
    if (this.cells[ky][kx].tile !== Tile.Wall) {
      this.monsters.push({
        x: kx, y: ky,
        char: "$", color: "#ffd700",
        nameId: "shopkeeper",
        hp: 999, maxHp: 999,
        attack: 0, defense: 99,
        xpValue: 0,
      });
    }
  }

  private spawnMonster(room: Room) {
    // Tier progression spread across 10 depths
    const tierByDepth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const maxTier = Math.min((tierByDepth[Math.min(this.depth, tierByDepth.length) - 1] ?? MONSTER_DEFS.length), MONSTER_DEFS.length) - 1;

    let def: MonsterDef;
    // 40% chance to pick from new monster pool (filtered by depth)
    const newPool = NEW_MONSTER_DEFS.filter(d => this.depth >= (d.depthMin ?? 1) && this.depth <= (d.depthMax ?? 10));
    if (newPool.length > 0 && Math.random() < 0.4) {
      def = newPool[rand(0, newPool.length - 1)];
    } else {
      def = MONSTER_DEFS[rand(0, maxTier)];
    }

    let scale = 1 + (this.depth - 1) * 0.12;
    if (this.ascending) scale *= 1.2; // dungeon is "angry" during ascent
    const mx = rand(room.x, room.x + room.w - 1);
    const my = rand(room.y, room.y + room.h - 1);

    if (this.cells[my][mx].tile === Tile.Wall) return;
    if (this.monsterAt(mx, my)) return;

    const monster: Creature = {
      x: mx,
      y: my,
      char: def.char,
      color: def.color,
      nameId: def.nameId,
      hp: Math.ceil(def.hp * scale),
      maxHp: Math.ceil(def.hp * scale),
      attack: Math.ceil(def.attack * scale),
      defense: Math.ceil(def.defense * scale),
      passWall: def.passWall,
      ranged: def.ranged,
      splits: def.splits,
      xpValue: Math.ceil(def.xpValue * scale),
    };

    // Copy special properties from def
    if (def.packBonus) monster.packBonus = true;
    if (def.slowMonster) monster.slowMonster = true;
    if (def.doubleAct) monster.doubleAct = true;
    if (def.stationary) monster.stationary = true;
    if (def.lavaImmune) monster.lavaImmune = true;
    if (def.poisonCloud) monster.poisonCloud = true;
    if (def.reflectDamage) monster.reflectDamage = def.reflectDamage;
    if (def.lifeSteal) monster.lifeSteal = def.lifeSteal;
    if (def.explodeOnDeath) monster.explodeOnDeath = def.explodeOnDeath;
    if (def.regenRate) monster.regenRate = def.regenRate;
    if (def.healCooldown !== undefined) monster.healCooldown = def.healCooldown;

    // Mimic starts disguised
    if (def.disguised) {
      monster.disguised = true;
      const fakeItems = [
        { char: "!", color: "#ff69b4" },
        { char: ")", color: "#cccccc" },
        { char: "[", color: "#8b6914" },
        { char: "?", color: "#daa520" },
        { char: "%", color: "#cd853f" },
      ];
      monster.disguiseItem = fakeItems[rand(0, fakeItems.length - 1)];
    }

    // Spider web charge
    if (def.nameId === "spider") monster.webCharge = 3;
    // Necromancer summon cooldown
    if (def.nameId === "necromancer") monster.summonCooldown = 4;
    // Phantom teleport cooldown
    if (def.nameId === "phantom") monster.teleportCd = 2;

    this.monsters.push(monster);
  }

  private spawnItem(room: Room) {
    const ix = rand(room.x, room.x + room.w - 1);
    const iy = rand(room.y, room.y + room.h - 1);
    if (this.cells[iy][ix].tile === Tile.Wall) return;

    const roll = Math.random();
    let id: string;
    if (roll < 0.14) id = "health potion";
    else if (roll < 0.18) id = "potion of strength";
    else if (roll < 0.21) id = "potion of poison";
    else if (roll < 0.24) id = "potion of speed";
    else if (roll < 0.27) id = "potion of invisibility";
    else if (roll < 0.33) id = "ration";
    else if (roll < 0.38) id = "throwing knife";
    else if (roll < 0.40) id = "bomb";
    else if (roll < 0.46) id = "scroll of teleport";
    else if (roll < 0.49) id = "scroll of identify";
    else if (roll < 0.52) id = "scroll of enchant";
    else if (roll < 0.55) id = "scroll of mapping";
    else if (roll < 0.57) id = "scroll of remove curse";
    else if (roll < 0.59) id = "scroll of protection";
    else if (roll < 0.67) {
      // Weapon tier by depth
      if (this.depth >= 7) id = Math.random() < 0.5 ? "war hammer" : "battle axe";
      else if (this.depth >= 5) id = Math.random() < 0.5 ? "battle axe" : "long sword";
      else if (this.depth >= 3) id = "long sword";
      else id = Math.random() < 0.5 ? "short sword" : "dagger";
    } else if (roll < 0.77) {
      // Armor tier by depth
      if (this.depth >= 8 && Math.random() < 0.15) id = "mithril mail";
      else if (this.depth >= 6) id = Math.random() < 0.5 ? "plate armor" : "chain mail";
      else if (this.depth >= 3) id = "chain mail";
      else id = "leather armor";
    } else if (roll < 0.82 && this.depth >= 4) {
      id = Math.random() < 0.5 ? "ring of regeneration" : "ring of perception";
    } else id = "whetstone";

    const item = this.makeItem(ix, iy, id);
    // 20% chance ground equipment is cursed (depth 3+)
    if (item.type === "equipment" && this.depth >= 3 && Math.random() < 0.2) {
      item.cursed = true;
    }
    this.items.push(item);
  }

  private isPassable(x: number, y: number, passWall = false): boolean {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    const tile = this.cells[y][x].tile;
    if (tile === Tile.Wall) return passWall;
    if (tile === Tile.DeepWater) return passWall; // only ghosts/flying can cross
    if (tile === Tile.Stalactite) return false; // decorative, impassable
    return true;
  }

  private monsterAt(x: number, y: number): Creature | undefined {
    return this.monsters.find((m) => m.x === x && m.y === y);
  }

  /** Check line of sight between two points (Bresenham) */
  private hasLOS(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0, cy = y0;
    while (cx !== x1 || cy !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
      if (cx === x1 && cy === y1) break;
      if (this.cells[cy][cx].tile === Tile.Wall) return false;
    }
    return true;
  }

  /** Check if a creature is concealed by grass (invisible to non-adjacent enemies) */
  private isConcealed(c: Creature): boolean {
    return this.cells[c.y][c.x].tile === Tile.Grass;
  }

  tryMove(dx: number, dy: number) {
    if (this.gameOver) return;

    // Water slow: skip this move
    if (this.player.waterSlow) {
      this.player.waterSlow = false;
      this.msg(t("waterSlow"), "system");
      this.endTurn();
      return;
    }

    // Slow status: 50% chance to waste turn
    if (this.statusMgr.has("slow") && Math.random() < 0.5) {
      this.msg(t("slowedMove"), "combat");
      this.endTurn();
      return;
    }

    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    const monster = this.monsterAt(nx, ny);
    const isPet = this.petAlive && this.pet.x === nx && this.pet.y === ny;
    if (monster && monster.nameId === "shopkeeper") {
      this.msg(t("shopkeeperGreet"), "system");
      return; // Bumping shopkeeper doesn't cost a turn
    } else if (monster) {
      this.animations.addFlash(monster.x, monster.y, "#ff0000");
      this.combat(this.player, monster);
    } else if (isPet) {
      // Swap positions with pet
      this.pet.x = this.player.x;
      this.pet.y = this.player.y;
      this.player.x = nx;
      this.player.y = ny;

      // Water/Web slow on entering water or web
      if ((this.cells[ny][nx].tile === Tile.Water || this.cells[ny][nx].tile === Tile.Web) && !this.statusMgr.has("speed")) {
        this.player.waterSlow = true;
      }

      this.checkAutoPickUp(nx, ny);
    } else if (this.isPassable(nx, ny)) {
      this.animations.addMove(this.player.x, this.player.y, nx, ny);
      this.player.x = nx;
      this.player.y = ny;

      // Water/Web slow on entering water or web
      if ((this.cells[ny][nx].tile === Tile.Water || this.cells[ny][nx].tile === Tile.Web) && !this.statusMgr.has("speed")) {
        this.player.waterSlow = true;
      }

      this.processTrap(nx, ny);
      this.checkAutoPickUp(nx, ny);
    } else {
      return; // Wall/impassable — no turn consumed
    }

    this.endTurn();
  }

  tryDescend(): boolean {
    if (this.gameOver) return false;

    if (this.cells[this.player.y][this.player.x].tile === Tile.StairsDown) {
      this.depth++;
      sfx.descend();
      this.msg(t("descend")(this.depth), "system");
      this.generateLevel();
      // Auto-save on descend
      saveGame(this);
      return true;
    } else {
      this.msg(t("noStairs"), "system");
      return false;
    }
  }

  tryAscend(): boolean {
    if (this.gameOver) return false;
    if (!this.ascending) {
      this.msg(t("noStairsUp"), "system");
      return false;
    }
    if (this.cells[this.player.y][this.player.x].tile === Tile.StairsUp) {
      this.depth--;
      if (this.depth <= 0) {
        // Escaped the dungeon!
        sfx.win();
        this.msg(t("escaped"), "system");
        this.gameOver = true;
        this.won = true;
        return true;
      }
      sfx.descend();
      this.msg(t("ascend")(this.depth), "system");
      this.generateLevel();
      saveGame(this);
      return true;
    } else {
      this.msg(t("noStairsUp"), "system");
      return false;
    }
  }

  wait() {
    if (this.gameOver) return;
    this.endTurn();
  }

  startAutoExplore() {
    if (this.gameOver) return;
    // Pre-check: any visible monsters?
    if (this.hasVisibleMonster()) {
      this.msg(t("autoMonster"), "system");
      return;
    }
    this.autoExploring = true;
    this.msg(t("autoExplore"), "system");
  }

  stopAutoExplore(reason?: string) {
    this.autoExploring = false;
    if (reason) this.msg(reason, "system");
  }

  /** Take one auto-explore step. Returns true if moved. */
  autoStep(): boolean {
    if (!this.autoExploring || this.gameOver) {
      this.autoExploring = false;
      return false;
    }

    const hpBefore = this.player.hp;

    // Stop if monster visible
    if (this.hasVisibleMonster()) {
      this.stopAutoExplore(t("autoMonster"));
      return false;
    }

    // Stop if standing on stairs
    const tile = this.cells[this.player.y][this.player.x].tile;
    if (tile === Tile.StairsDown || tile === Tile.StairsUp) {
      this.stopAutoExplore(t("autoStairs"));
      return false;
    }

    // Find next step via BFS
    const step = this.findExploreStep();
    if (!step) {
      this.stopAutoExplore(t("autoDone"));
      return false;
    }

    this.tryMove(step.dx, step.dy);

    // Post-move checks
    if (this.player.hp < hpBefore) {
      this.stopAutoExplore(t("autoStop"));
      return false;
    }
    if (this.hasVisibleMonster()) {
      this.stopAutoExplore(t("autoMonster"));
      return false;
    }
    if (this.hasVisibleItem()) {
      this.stopAutoExplore(t("autoItem"));
      return false;
    }
    const postTile = this.cells[this.player.y][this.player.x].tile;
    if (postTile === Tile.StairsDown || postTile === Tile.StairsUp) {
      this.stopAutoExplore(t("autoStairs"));
      return false;
    }

    return true;
  }

  private hasVisibleMonster(): boolean {
    return this.monsters.some((m) => this.cells[m.y][m.x].visible);
  }

  private hasVisibleItem(): boolean {
    return this.items.some((i) => this.cells[i.y][i.x].visible);
  }

  private findExploreStep(): { dx: number; dy: number } | null {
    const px = this.player.x;
    const py = this.player.y;
    const visited: boolean[][] = [];
    const parentX: number[][] = [];
    const parentY: number[][] = [];
    for (let y = 0; y < MAP_H; y++) {
      visited[y] = new Array(MAP_W).fill(false);
      parentX[y] = new Array(MAP_W).fill(-1);
      parentY[y] = new Array(MAP_W).fill(-1);
    }

    const queue: number[] = []; // flat pairs: x, y
    let qi = 0;
    queue.push(px, py);
    visited[py][px] = true;

    let tx = -1;
    let ty = -1;

    while (qi < queue.length) {
      const cx = queue[qi++];
      const cy = queue[qi++];

      // Is this cell next to something unrevealed?
      if (this.adjacentToUnrevealed(cx, cy)) {
        tx = cx;
        ty = cy;
        break;
      }

      for (const [dx, dy] of DIRS4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
        if (visited[ny][nx]) continue;
        if (!this.cells[ny][nx].revealed) continue;
        if (!this.isPassable(nx, ny)) continue;
        if (this.monsterAt(nx, ny)) continue;

        visited[ny][nx] = true;
        parentX[ny][nx] = cx;
        parentY[ny][nx] = cy;
        queue.push(nx, ny);
      }
    }

    if (tx < 0) return null;

    // Trace back to first step from player
    let sx = tx;
    let sy = ty;
    while (parentX[sy][sx] >= 0) {
      const ppx = parentX[sy][sx];
      const ppy = parentY[sy][sx];
      if (ppx === px && ppy === py) break;
      sx = ppx;
      sy = ppy;
    }

    if (sx === px && sy === py) return null;
    return { dx: sx - px, dy: sy - py };
  }

  private adjacentToUnrevealed(x: number, y: number): boolean {
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      if (!this.cells[ny][nx].revealed) return true;
    }
    return false;
  }

  restart() {
    this.depth = 1;
    this.gameOver = false;
    this.won = false;
    this.turnCount = 0;
    this.player.hp = 20;
    this.player.maxHp = 20;
    this.player.attack = 3;
    this.player.defense = 1;
    this.messages = [];
    this.pet = this.makePet(0, 0);
    this.petAlive = true;
    this.inventory.clear();
    this.inventory.add(this.makeItem(0, 0, "ration"));
    this.inventory.add(this.makeItem(0, 0, "short sword"));
    this.inventory.equip(1);
    this.hunger = this.maxHunger;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 12;
    this.pendingLevelUp = false;
    this.statusMgr.clear();
    this.kills = 0;
    this.showMinimap = false;
    this.showInventory = false;
    this.inventoryCursor = 0;
    this.ascending = false;
    this.identifiedTypes = new Set();
    this.abilities = [];
    this.abilityCooldowns = {};
    this.deadSkeletons = [];
    this.gold = 0;
    this.pendingBuy = null;
    this.burningTiles = new Map();
    this.petStage = 0;
    this.petCommand = "follow";
    this.petAbilityCooldowns = {};
    this.randomizeLabels();
    deleteSave();
    this.generateLevel();
    this.msg(t("welcome"), "system");
  }

  private endTurn() {
    this.turnCount++;
    this.processStatusEffects();
    this.processLavaDamage();
    this.processBurningGrass();
    this.processHunger();
    this.processSkeletonReassembly();
    this.processPet();
    this.processMonsters();
    // Tick ability cooldowns
    for (const key of Object.keys(this.abilityCooldowns)) {
      if (this.abilityCooldowns[key] > 0) this.abilityCooldowns[key]--;
    }
    // Tick pet ability cooldowns
    for (const key of Object.keys(this.petAbilityCooldowns)) {
      if (this.petAbilityCooldowns[key] > 0) this.petAbilityCooldowns[key]--;
    }
    // Ring of regeneration
    if (this.inventory.getRingEffect() === "regeneration" && this.turnCount % 8 === 0) {
      if (this.player.hp < this.player.maxHp) {
        this.player.hp++;
        this.msg(t("ringRegen"), "pickup");
      }
    }
    // Blind reduces FOV radius
    const fov = this.statusMgr.has("blind") ? 3 : this.fovRadius;
    computeFOV(this.cells, this.player.x, this.player.y, fov);
    // Ring of perception reveals traps in FOV
    if (this.inventory.getRingEffect() === "perception") {
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (this.cells[y][x].visible && !this.cells[y][x].trapRevealed) {
            const t2 = this.cells[y][x].tile;
            if (t2 === Tile.TrapSpike || t2 === Tile.TrapTeleport || t2 === Tile.TrapAlarm) {
              this.cells[y][x].trapRevealed = true;
            }
          }
        }
      }
    }
    this.showContextInfo();
  }

  private showContextInfo() {
    // Replace any previous info message instead of stacking
    // Remove trailing info messages to prevent spam
    while (this.messages.length > 0 && this.messages[this.messages.length - 1].type === "info") {
      this.messages.pop();
    }

    // Show adjacent monster info
    for (const [dx, dy] of DIRS4) {
      const nx = this.player.x + dx, ny = this.player.y + dy;
      const m = this.monsters.find(m => m.x === nx && m.y === ny);
      if (m) {
        const special = this.getMonsterSpecial(m.nameId);
        const info = special
          ? `${name(m.nameId)} HP:${m.hp}/${m.maxHp} ATK:${m.attack} DEF:${m.defense} (${special})`
          : `${name(m.nameId)} HP:${m.hp}/${m.maxHp} ATK:${m.attack} DEF:${m.defense}`;
        this.msg(info, "info");
        break; // only show one
      }
    }
    // Show item stats on ground
    const item = this.items.find(i => i.x === this.player.x && i.y === this.player.y);
    if (item && !item.price) {
      let stats = "";
      if (item.type === "equipment" && item.equipSlot === "weapon") stats = ` +${item.value} ATK`;
      else if (item.type === "equipment" && item.equipSlot === "armor") stats = ` +${item.value} DEF`;
      else if (item.type === "potion" && this.identifiedTypes.has(item.nameId)) stats = item.nameId === "health potion" ? ` +${item.value} HP` : "";
      else if (item.type === "food") stats = ` +${item.value} satiety`;
      else if (item.type === "throwing") stats = ` ${item.value} dmg`;
      if (item.enchantment) stats += ` [${item.enchantment.type}]`;
      if (stats) this.msg(`${this.getItemDisplayName(item)}:${stats}`, "info");
    }
  }

  private getMonsterSpecial(nameId: string): string | null {
    const specials: Record<string, string> = {
      snake: "poison",
      ogre: "knockback",
      ghost: "blind, pass walls",
      archer: "ranged",
      slime: "splits",
      dragon: "bleed",
      lich: "summon, blind, ranged",
      skeleton: "reassembles",
      wraith: "drains max HP",
      "fire imp": "ranged fire",
      wolf: "pack bonus",
      spider: "webs",
      mimic: "disguise",
      golem: "slow, tough",
      vampire: "life steal",
      mushroom: "poison cloud",
      "crystal elemental": "reflects damage",
      bat: "double attack",
      necromancer: "summons, ranged",
      hydra: "regen, double attack",
      "ember sprite": "explodes on death",
      phantom: "teleports, pass walls",
      cultist: "heals allies, ranged",
      "spider queen": "summons, webs, poison",
      "necromancer lord": "summons, ranged, teleport",
    };
    return specials[nameId] ?? null;
  }

  private processStatusEffects() {
    const dmg = this.statusMgr.tick();
    if (dmg > 0) {
      this.player.hp -= dmg;
      this.msg(t("statusDamage")(dmg), "combat");
      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
    }
  }

  private processBurningGrass() {
    const toRemove: string[] = [];
    for (const [key, turns] of this.burningTiles) {
      const [sx, sy] = key.split(",").map(Number);
      // Damage entities on burning tile
      if (this.player.x === sx && this.player.y === sy) {
        this.player.hp -= 2;
        this.msg(t("burningGrassDmg"), "combat");
        if (this.player.hp <= 0) {
          sfx.playerDied();
          this.msg(t("youDied"), "combat");
          this.gameOver = true;
        }
      }
      // Spread to adjacent grass
      if (turns === 4 || turns === 2) { // spread twice during lifetime
        for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = sx + ddx, ny = sy + ddy;
          if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
            if (this.cells[ny][nx].tile === Tile.Grass) {
              const nk = `${nx},${ny}`;
              if (!this.burningTiles.has(nk)) {
                this.cells[ny][nx].tile = Tile.BurningGrass;
                this.burningTiles.set(nk, 5);
              }
            }
          }
        }
      }
      if (turns <= 1) {
        this.cells[sy][sx].tile = Tile.Floor;
        toRemove.push(key);
      } else {
        this.burningTiles.set(key, turns - 1);
      }
    }
    for (const k of toRemove) this.burningTiles.delete(k);
  }

  private processLavaDamage() {
    if (this.cells[this.player.y][this.player.x].tile === Tile.Lava) {
      this.player.hp -= 3;
      this.msg(t("lavaDamage"), "combat");
      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
    }
    // Monsters on lava take damage (fire imps, ember sprites, shopkeeper immune)
    for (const m of [...this.monsters]) {
      if (this.cells[m.y][m.x].tile === Tile.Lava && m.nameId !== "fire imp" && m.nameId !== "shopkeeper" && !m.lavaImmune) {
        m.hp -= 3;
        if (m.hp <= 0) {
          this.monsters = this.monsters.filter(mm => mm !== m);
        }
      }
    }
  }

  private processSkeletonReassembly() {
    for (let i = this.deadSkeletons.length - 1; i >= 0; i--) {
      const sk = this.deadSkeletons[i];
      sk.turnsLeft--;
      if (sk.turnsLeft <= 0) {
        this.deadSkeletons.splice(i, 1);
        // Only reassemble if the tile is passable and not occupied
        if (this.isPassable(sk.x, sk.y) && !this.monsterAt(sk.x, sk.y) &&
            !(sk.x === this.player.x && sk.y === this.player.y)) {
          this.monsters.push({
            x: sk.x, y: sk.y,
            char: "z", color: "#cccccc", nameId: "skeleton",
            hp: Math.ceil(sk.maxHp / 2), maxHp: sk.maxHp,
            attack: sk.atk, defense: sk.def,
            xpValue: sk.xp,
          });
          if (this.cells[sk.y][sk.x].visible) {
            this.msg(t("skeletonReassemble"), "combat");
          }
        }
      }
    }
  }

  private processHunger() {
    if (this.turnCount % this.hungerInterval === 0 && this.hunger > 0) {
      this.hunger--;
    }
    if (this.hunger <= 0) {
      this.player.hp -= 1;
      this.msg(t("starving"), "combat");
      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
    } else if (this.hunger <= 15 && this.turnCount % this.hungerInterval === 0) {
      this.msg(t("hungry"), "system");
    }
  }

  private checkPetEvolution() {
    if (!this.petAlive) return;
    let targetStage: PetStage = 0;
    if (this.depth >= 8) targetStage = 3;
    else if (this.depth >= 5) targetStage = 2;
    else if (this.depth >= 3) targetStage = 1;

    if (targetStage > this.petStage) {
      this.petStage = targetStage;
      const stage = PET_STAGES[targetStage];
      const oldHpRatio = this.pet.hp / this.pet.maxHp;
      this.pet.char = stage.char;
      this.pet.color = stage.color;
      this.pet.nameId = stage.nameId;
      this.pet.maxHp = Math.ceil(stage.hp * (1 + (this.depth - 1) * stage.scale));
      this.pet.hp = Math.ceil(this.pet.maxHp * oldHpRatio);
      this.pet.attack = Math.ceil(stage.attack * (1 + (this.depth - 1) * stage.scale));
      this.pet.defense = Math.ceil(stage.defense * (1 + (this.depth - 1) * stage.scale));
      sfx.petEvolve();
      this.msg(t("petEvolve")(name(stage.nameId)), "pet");
    }
  }

  private checkPetRevival() {
    if (this.pet.hp > 0) return;
    // Check for phoenix feather in inventory
    const featherIdx = this.inventory.items.findIndex(i => i.nameId === "phoenix feather");
    if (featherIdx >= 0) {
      this.inventory.remove(featherIdx);
      this.pet.hp = Math.ceil(this.pet.maxHp * 0.5);
      this.petAlive = true;
      sfx.petEvolve();
      this.msg(t("petRevive"), "pet");
    } else {
      sfx.petDied();
      this.petAlive = false;
      this.msg(t("petDied"), "pet");
    }
  }

  private tryPetAbility() {
    if (!this.petAlive) return;
    const stage = PET_STAGES[this.petStage];

    // Bark: fear adjacent monsters when 2+ enemies adjacent (stage 1+)
    if (stage.abilities.includes("bark") && (this.petAbilityCooldowns["bark"] ?? 0) <= 0) {
      let adjCount = 0;
      for (const m of this.monsters) {
        if (m.nameId !== "shopkeeper" && Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y) <= 1) adjCount++;
      }
      if (adjCount >= 2) {
        sfx.petBark();
        for (const m of this.monsters) {
          if (m.nameId !== "shopkeeper" && Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y) <= 1) {
            m.fearTurns = (m.fearTurns ?? 0) + 2;
          }
        }
        this.msg(t("petBark"), "pet");
        this.petAbilityCooldowns["bark"] = 8;
        return;
      }
    }

    // Pounce: leap to target 2 tiles away (stage 2+)
    if (stage.abilities.includes("pounce") && (this.petAbilityCooldowns["pounce"] ?? 0) <= 0) {
      for (const m of this.monsters) {
        if (m.nameId === "shopkeeper") continue;
        const dist = Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y);
        if (dist === 2 && this.cells[m.y][m.x].visible) {
          // Leap to adjacent tile near target
          const dx = m.x - this.pet.x;
          const dy = m.y - this.pet.y;
          const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
          const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
          const nx = this.pet.x + sx;
          const ny = this.pet.y + sy;
          if (this.isPassable(nx, ny) && !this.monsterAt(nx, ny) && !(nx === this.player.x && ny === this.player.y)) {
            this.pet.x = nx;
            this.pet.y = ny;
            const pounceDmg = Math.max(1, Math.ceil(this.pet.attack * 1.5) - m.defense);
            m.hp -= pounceDmg;
            sfx.monsterHit();
            this.msg(t("petPounce")(name(m.nameId), pounceDmg), "pet");
            if (m.hp <= 0) {
              sfx.monsterDie();
              this.msg(t("petKills")(name(m.nameId)), "pet");
              this.kills++;
              this.gold += rand(1, 3);
              this.gainXp(Math.ceil((m.xpValue ?? 5) / 2));
              this.monsters = this.monsters.filter(mm => mm !== m);
            }
            this.petAbilityCooldowns["pounce"] = 12;
            return;
          }
        }
      }
    }
  }

  private processPet() {
    if (!this.petAlive) return;

    // Try abilities first
    this.tryPetAbility();

    // Stay command: only self-heal
    if (this.petCommand === "stay") {
      if (this.turnCount % this.petHealInterval === 0 && this.pet.hp < this.pet.maxHp) {
        const healed = Math.min(this.petHealAmount, this.pet.maxHp - this.pet.hp);
        this.pet.hp += healed;
        sfx.petHeal();
        this.msg(t("petHeals")(healed), "pet");
      }
      return;
    }

    const pursueRange = this.petCommand === "aggressive" ? 8 : 4;
    const leashRange = this.petCommand === "aggressive" ? 10 : 5;

    const dx = this.player.x - this.pet.x;
    const dy = this.player.y - this.pet.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    // Attack adjacent monster
    const adjacent = this.monsters.find(
      (m) => m.nameId !== "shopkeeper" && !m.disguised && Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y) <= 1
    );
    if (adjacent) {
      this.petCombat(adjacent);
      return;
    }

    // Seek nearest visible monster within pursue range
    const nearby = this.monsters
      .filter((m) => m.nameId !== "shopkeeper" && !m.disguised && this.cells[m.y][m.x].visible && Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y) <= pursueRange)
      .sort((a, b) => (Math.abs(a.x - this.pet.x) + Math.abs(a.y - this.pet.y)) - (Math.abs(b.x - this.pet.x) + Math.abs(b.y - this.pet.y)));
    if (nearby.length > 0 && dist <= leashRange) {
      this.movePetToward(nearby[0].x, nearby[0].y);
      return;
    }

    // Heal itself periodically
    if (this.turnCount % this.petHealInterval === 0 && this.pet.hp < this.pet.maxHp) {
      const healed = Math.min(this.petHealAmount, this.pet.maxHp - this.pet.hp);
      this.pet.hp += healed;
      sfx.petHeal();
      this.msg(t("petHeals")(healed), "pet");
      return;
    }

    // Follow player if too far
    if (dist > 2) {
      this.movePetToward(this.player.x, this.player.y);
    }
  }

  private petCombat(target: Creature) {
    let atkVal = this.pet.attack;
    if (this.petStage >= 3) {
      const petDist = Math.abs(target.x - this.pet.x) + Math.abs(target.y - this.pet.y);
      if (petDist <= 1) atkVal += 2;
    }
    const dmg = Math.max(1, atkVal - target.defense + rand(-2, 2));
    target.hp -= dmg;
    sfx.monsterHit();
    this.msg(t("petAttacks")(name(target.nameId), dmg), "pet");
    if (target.hp <= 0) {
      sfx.monsterDie();
      this.msg(t("petKills")(name(target.nameId)), "pet");
      this.kills++;
      this.gold += rand(1, 3);
      this.gainXp(Math.ceil((target.xpValue ?? 5) / 2));
      this.checkSkeletonReassembly(target);
      this.dropLoot(target);
      this.monsters = this.monsters.filter((m) => m !== target);
    }
  }

  private movePetToward(tx: number, ty: number) {
    const dx = tx - this.pet.x;
    const dy = ty - this.pet.y;
    const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

    const canMove = (nx: number, ny: number) =>
      this.isPassable(nx, ny) &&
      !this.monsterAt(nx, ny) &&
      !(nx === this.player.x && ny === this.player.y);

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (sx !== 0 && canMove(this.pet.x + sx, this.pet.y)) this.pet.x += sx;
      else if (sy !== 0 && canMove(this.pet.x, this.pet.y + sy)) this.pet.y += sy;
    } else {
      if (sy !== 0 && canMove(this.pet.x, this.pet.y + sy)) this.pet.y += sy;
      else if (sx !== 0 && canMove(this.pet.x + sx, this.pet.y)) this.pet.x += sx;
    }
  }

  cyclePetCommand() {
    if (this.gameOver) return;
    const commands: PetCommand[] = ["follow", "stay", "aggressive"];
    const idx = commands.indexOf(this.petCommand);
    this.petCommand = commands[(idx + 1) % commands.length];
    this.msg(t("petCommandChange")(this.petCommand), "pet");
  }

  private combat(attacker: Creature, defender: Creature) {
    let atkVal = attacker === this.player ? this.getEffectiveAttack() : attacker.attack;
    const defVal = defender === this.player ? this.getEffectiveDefense() : defender.defense;

    // Wolf pack bonus: +1 ATK per adjacent wolf
    if (attacker.packBonus) {
      let packCount = 0;
      for (const other of this.monsters) {
        if (other !== attacker && other.nameId === "wolf" && Math.abs(other.x - attacker.x) + Math.abs(other.y - attacker.y) <= 1) {
          packCount++;
        }
      }
      if (packCount > 0) {
        atkVal += packCount;
        this.msg(t("wolfPackBonus")(packCount), "combat");
      }
    }

    // Pack Leader passive: monsters adjacent to pet take +2 damage from player
    if (attacker === this.player && this.petAlive && this.petStage >= 3) {
      const petDist = Math.abs(defender.x - this.pet.x) + Math.abs(defender.y - this.pet.y);
      if (petDist <= 1) atkVal += 2;
    }

    const dmg = Math.max(1, atkVal - defVal + rand(-2, 2));
    defender.hp -= dmg;

    if (attacker === this.player) {
      sfx.playerAttack();
      this.msg(t("youHit")(name(defender.nameId), dmg), "combat");
      // Crystal elemental reflects damage to player
      if (defender.reflectDamage && defender.hp > 0) {
        const reflDmg = Math.max(1, Math.ceil(dmg * defender.reflectDamage / 100));
        this.player.hp -= reflDmg;
        sfx.crystalReflect();
        this.msg(t("crystalReflect")(reflDmg), "combat");
        if (this.player.hp <= 0) {
          sfx.playerDied();
          this.msg(t("youDied"), "combat");
          this.gameOver = true;
          return;
        }
      }
      // Weapon enchantment effects
      const wep = this.inventory.equipped.weapon;
      if (wep?.enchantment) {
        this.applyWeaponEnchant(wep.enchantment, defender);
      }
      // Degrade weapon on player attack
      const wepResult = this.inventory.degradeWeapon();
      if (wepResult.broken) this.msg(t("itemBreaks")(name(wepResult.broken)), "system");
      else if (wepResult.warning) this.msg(t("durabilityWarning"), "system");
      if (defender.hp <= 0) {
        sfx.monsterDie();
        this.msg(t("monsterDies")(name(defender.nameId)), "combat");
        this.kills++;
        this.gold += rand(1, 5);
        this.gainXp(defender.xpValue ?? 5);
        // Vampiric heal on kill
        if (wep?.enchantment?.type === "vampiric") {
          const heal = Math.min(wep.enchantment.level, this.player.maxHp - this.player.hp);
          if (heal > 0) {
            this.player.hp += heal;
            this.msg(t("vampiricHeal")(heal), "pickup");
          }
        }
        // Slime splits on death
        if (defender.splits) {
          this.splitMonster(defender);
        }
        this.handleMonsterDeath(defender);
        this.dropLoot(defender);
        this.monsters = this.monsters.filter((m) => m !== defender);
      }
    } else {
      sfx.playerHurt();
      this.animations.addFlash(this.player.x, this.player.y, "#ff3333");
      this.msg(t("monsterHitsYou")(name(attacker.nameId), dmg), "combat");

      // Armor enchantment: thorns reflect damage
      const arm = this.inventory.equipped.armor;
      if (arm?.enchantment?.type === "thorns") {
        const reflect = rand(1, arm.enchantment.level + 1);
        attacker.hp -= reflect;
        this.msg(t("thornsReflect")(reflect), "combat");
        if (attacker.hp <= 0) {
          sfx.monsterDie();
          this.msg(t("monsterDies")(name(attacker.nameId)), "combat");
          this.kills++;
          this.gainXp(attacker.xpValue ?? 5);
          this.dropLoot(attacker);
          this.monsters = this.monsters.filter((m) => m !== attacker);
        }
      }

      // Degrade armor when player is hit
      const armResult = this.inventory.degradeArmor();
      if (armResult.broken) this.msg(t("itemBreaks")(name(armResult.broken)), "system");
      else if (armResult.warning) this.msg(t("durabilityWarning"), "system");

      // Crystal elemental: reflect 30% damage
      if (attacker.reflectDamage) {
        const reflDmg = Math.max(1, Math.ceil(dmg * attacker.reflectDamage / 100));
        this.player.hp -= reflDmg;
        sfx.crystalReflect();
        this.msg(t("crystalReflect")(reflDmg), "combat");
        if (this.player.hp <= 0) {
          sfx.playerDied();
          this.msg(t("youDied"), "combat");
          this.gameOver = true;
        }
      }

      // Vampire: life steal
      if (attacker.lifeSteal) {
        const steal = attacker.lifeSteal;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + steal);
        this.msg(t("vampireDrain")(steal), "combat");
      }

      // Monster special abilities on attack
      if (attacker.nameId === "snake") {
        this.statusMgr.add("poison", 3, 1);
        this.msg(t("snakePoison"), "combat");
      } else if (attacker.nameId === "ogre") {
        this.knockBack(attacker);
        this.statusMgr.add("slow", 2, 0);
        this.msg(t("ogreSlow"), "combat");
      } else if (attacker.nameId === "ghost") {
        this.statusMgr.add("blind", 2, 0);
        this.msg(t("ghostBlind"), "combat");
      } else if (attacker.nameId === "dragon") {
        this.statusMgr.add("bleed", 2, 2);
        this.msg(t("dragonBleed"), "combat");
      } else if (attacker.nameId === "wraith") {
        this.player.maxHp = Math.max(5, this.player.maxHp - 1);
        if (this.player.hp > this.player.maxHp) this.player.hp = this.player.maxHp;
        this.msg(t("wraithDrain"), "combat");
      } else if (attacker.nameId === "spider queen") {
        this.statusMgr.add("poison", 3, 1);
        this.msg(t("spiderQueenPoison"), "combat");
      }

      // Swift armor: immunity to slow
      if (arm?.enchantment?.type === "swift" && this.statusMgr.has("slow")) {
        this.statusMgr.effects = this.statusMgr.effects.filter(e => e.type !== "slow");
      }

      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
    }
  }

  private checkSkeletonReassembly(m: Creature) {
    if (m.nameId === "skeleton" && Math.random() < 0.5) {
      this.deadSkeletons.push({
        x: m.x, y: m.y, turnsLeft: 3,
        hp: m.maxHp, maxHp: m.maxHp,
        atk: m.attack, def: m.defense,
        xp: m.xpValue ?? 12,
      });
    }
  }

  private applyWeaponEnchant(ench: Enchantment, target: Creature) {
    if (ench.type === "fire" && Math.random() < 0.3) {
      target.burnTurns = 2;
      this.msg(t("enchantBurn"), "combat");
    } else if (ench.type === "ice" && Math.random() < 0.3) {
      target.stunTurns = (target.stunTurns ?? 0) + 1;
      this.msg(t("enchantFreeze"), "combat");
    }
  }

  private knockBack(attacker: Creature) {
    const dx = this.player.x - attacker.x;
    const dy = this.player.y - attacker.y;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (this.isPassable(nx, ny) && !this.monsterAt(nx, ny)) {
      this.player.x = nx;
      this.player.y = ny;
      this.msg(t("ogreKnockback"), "combat");
      this.processTrap(nx, ny);
    }
  }

  private splitMonster(parent: Creature) {
    // Spawn 1-2 smaller slimes nearby
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    let spawned = 0;
    for (const [dx, dy] of dirs) {
      if (spawned >= 2) break;
      const nx = parent.x + dx;
      const ny = parent.y + dy;
      if (this.isPassable(nx, ny) && !this.monsterAt(nx, ny) &&
          !(nx === this.player.x && ny === this.player.y)) {
        const halfHp = Math.max(2, Math.ceil(parent.maxHp / 3));
        this.monsters.push({
          x: nx, y: ny,
          char: "s", color: "#27ae60",
          nameId: "small slime",
          hp: halfHp, maxHp: halfHp,
          attack: Math.max(1, parent.attack - 1),
          defense: 0,
          xpValue: 3,
        });
        spawned++;
      }
    }
    if (spawned > 0) {
      this.msg(t("slimeSplit"), "combat");
    }
  }

  private lichSummon(lich: Creature) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const count = rand(1, 2);
    let spawned = 0;
    for (const [dx, dy] of dirs) {
      if (spawned >= count) break;
      const nx = lich.x + dx;
      const ny = lich.y + dy;
      if (this.isPassable(nx, ny) && !this.monsterAt(nx, ny) &&
          !(nx === this.player.x && ny === this.player.y)) {
        const scale = 1 + (this.depth - 1) * 0.12;
        this.monsters.push({
          x: nx, y: ny,
          char: "z", color: "#cccccc",
          nameId: "skeleton",
          hp: Math.ceil(9 * scale), maxHp: Math.ceil(9 * scale),
          attack: Math.ceil(4 * scale), defense: Math.ceil(2 * scale),
          xpValue: Math.ceil(12 * scale),
        });
        spawned++;
      }
    }
    if (spawned > 0) {
      this.msg(t("lichSummon"), "combat");
    }
  }

  private gainXp(amount: number) {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.ceil(this.xpToNext * 1.25);
      this.pendingLevelUp = true;
      sfx.pickupWeapon();
      this.msg(t("levelUp")(this.level), "system");
      // Unlock abilities at levels 3, 6, 9
      if (this.level === 3 && !this.abilities.includes("dash")) {
        this.abilities.push("dash");
        this.msg(t("abilityUnlock")("Dash"), "system");
      } else if (this.level === 6 && !this.abilities.includes("shield_bash")) {
        this.abilities.push("shield_bash");
        this.msg(t("abilityUnlock")("Shield Bash"), "system");
      } else if (this.level === 9 && !this.abilities.includes("battle_cry")) {
        this.abilities.push("battle_cry");
        this.msg(t("abilityUnlock")("Battle Cry"), "system");
      }
    }
  }

  /** Activate ability by index (0=dash, 1=shield bash, 2=battle cry) */
  useAbility(index: number, dx?: number, dy?: number) {
    const abilityName = this.abilities[index];
    if (!abilityName) return;
    if ((this.abilityCooldowns[abilityName] ?? 0) > 0) {
      this.msg(t("abilityCooldown")(this.abilityCooldowns[abilityName]), "system");
      return;
    }

    if (abilityName === "dash") {
      // Move 3 tiles through enemies dealing 50% ATK
      if (!dx || !dy) return; // need direction
      // dx/dy here is the dash direction
    } else if (abilityName === "shield_bash") {
      // Stun adjacent monster for 2 turns
      const adj = this.monsters.find(m =>
        Math.abs(m.x - this.player.x) + Math.abs(m.y - this.player.y) <= 1 &&
        this.cells[m.y][m.x].visible && m.nameId !== "shopkeeper"
      );
      if (!adj) {
        this.msg(t("noTarget"), "system");
        return;
      }
      adj.stunTurns = (adj.stunTurns ?? 0) + 2;
      sfx.playerAttack();
      this.msg(t("shieldBash")(name(adj.nameId)), "combat");
      this.abilityCooldowns["shield_bash"] = 12;
      this.endTurn();
    } else if (abilityName === "battle_cry") {
      // Fear all visible monsters for 3 turns
      let feared = 0;
      for (const m of this.monsters) {
        if (this.cells[m.y][m.x].visible && m.nameId !== "shopkeeper") {
          m.fearTurns = (m.fearTurns ?? 0) + 3;
          feared++;
        }
      }
      sfx.playerAttack();
      this.msg(t("battleCry")(feared), "combat");
      this.abilityCooldowns["battle_cry"] = 20;
      this.endTurn();
    }
  }

  /** Activate dash in a direction */
  useDash(dx: number, dy: number) {
    if (!this.abilities.includes("dash")) return;
    if ((this.abilityCooldowns["dash"] ?? 0) > 0) {
      this.msg(t("abilityCooldown")(this.abilityCooldowns["dash"]), "system");
      return;
    }
    const atkDmg = Math.max(1, Math.ceil(this.getEffectiveAttack() * 0.5));
    for (let i = 0; i < 3; i++) {
      const nx = this.player.x + dx;
      const ny = this.player.y + dy;
      if (!this.isPassable(nx, ny)) break;
      const monster = this.monsterAt(nx, ny);
      if (monster) {
        monster.hp -= atkDmg;
        this.msg(t("dashHit")(name(monster.nameId), atkDmg), "combat");
        if (monster.hp <= 0) {
          sfx.monsterDie();
          this.msg(t("monsterDies")(name(monster.nameId)), "combat");
          this.kills++;
          this.gainXp(monster.xpValue ?? 5);
          this.checkSkeletonReassembly(monster);
          this.dropLoot(monster);
          this.monsters = this.monsters.filter(m => m !== monster);
        } else {
          break; // monster survived, can't pass through
        }
      }
      this.player.x = nx;
      this.player.y = ny;
    }
    sfx.playerAttack();
    this.abilityCooldowns["dash"] = 15;
    this.endTurn();
  }

  /** Apply level-up choice: 0=HP, 1=ATK, 2=DEF */
  applyLevelUp(choice: number) {
    if (!this.pendingLevelUp) return;
    if (choice === 0) {
      this.player.maxHp += 5;
      this.player.hp += 5;
      this.msg(t("levelHp"), "system");
    } else if (choice === 1) {
      this.player.attack += 1;
      this.msg(t("levelAtk"), "system");
    } else {
      this.player.defense += 1;
      this.msg(t("levelDef"), "system");
    }
    this.pendingLevelUp = false;
  }

  private dropLoot(monster: Creature) {
    const dropChance: Record<string, number> = {
      rat: 0.2, goblin: 0.35, snake: 0.4, ogre: 0.6,
      ghost: 0.3, archer: 0.4, slime: 0.15, "small slime": 0.1,
      dragon: 1.0, lich: 1.0, skeleton: 0.15, wraith: 0.35, "fire imp": 0.3,
      wolf: 0.2, spider: 0.25, mimic: 0.8, golem: 0.5,
      vampire: 0.45, mushroom: 0.15, "crystal elemental": 0.5,
      bat: 0.15, necromancer: 0.4, hydra: 0.6,
      "ember sprite": 0.3, phantom: 0.35,
      cultist: 0.35,
      "spider queen": 1.0, "necromancer lord": 1.0,
    };
    const chance = dropChance[monster.nameId] ?? 0.3;
    if (Math.random() >= chance) return;

    // Bosses and depth 4+ monsters have chance to drop enchanted equipment
    const isBoss = monster.nameId === "dragon" || monster.nameId === "lich" ||
                   monster.nameId === "spider queen" || monster.nameId === "necromancer lord";
    if ((isBoss || (this.depth >= 4 && Math.random() < 0.15)) && Math.random() < (isBoss ? 1.0 : 0.5)) {
      const enchItem = this.makeEnchantedItem(monster.x, monster.y);
      this.items.push(enchItem);
      sfx.drop();
      this.msg(t("monsterDrops")(name(monster.nameId)), "pickup");
      return;
    }

    const roll = Math.random();
    let id: string;
    if (roll < 0.40) id = "health potion small";
    else if (roll < 0.55) id = "ration";
    else if (roll < 0.70) id = "throwing knife";
    else if (roll < 0.78) id = "bomb";
    else id = "whetstone";

    this.items.push(this.makeItem(monster.x, monster.y, id));
    sfx.drop();
    this.msg(t("monsterDrops")(name(monster.nameId)), "pickup");
  }

  private makeEnchantedItem(x: number, y: number): Item {
    const weaponEnchants: EnchantType[] = ["fire", "ice", "vampiric"];
    const armorEnchants: EnchantType[] = ["thorns", "swift"];
    const isWeapon = Math.random() < 0.5;
    if (isWeapon) {
      const baseId = this.depth >= 8 ? "war hammer" : this.depth >= 6 ? "battle axe" : this.depth >= 4 ? "long sword" : "short sword";
      const item = this.makeItem(x, y, baseId);
      const etype = weaponEnchants[rand(0, weaponEnchants.length - 1)];
      item.enchantment = { type: etype, level: rand(1, 2) };
      return item;
    } else {
      const baseId = this.depth >= 8 ? "plate armor" : this.depth >= 6 ? "chain mail" : "leather armor";
      const item = this.makeItem(x, y, baseId);
      const etype = armorEnchants[rand(0, armorEnchants.length - 1)];
      item.enchantment = { type: etype, level: rand(1, 2) };
      return item;
    }
  }

  /** Check for auto-pickup (only amulet) or notify of items on ground */
  private checkAutoPickUp(x: number, y: number) {
    const item = this.items.find((i) => i.x === x && i.y === y);
    if (!item) return;
    if (item.type === "amulet") {
      sfx.win();
      this.msg(t("foundAmulet"), "pickup");
      this.items = this.items.filter((i) => i !== item);
      this.ascending = true;
      return;
    }
    if (item.price) {
      this.pendingBuy = item;
      this.msg(t("shopBuy")(this.getItemDisplayName(item), item.price), "system");
    } else {
      this.msg(t("itemOnGround")(this.getItemDisplayName(item)), "system");
    }
  }

  private processTrap(x: number, y: number) {
    const cell = this.cells[y][x];
    if (cell.tile === Tile.TrapSpike) {
      cell.trapRevealed = true;
      const dmg = rand(2, 5);
      this.player.hp -= dmg;
      sfx.playerHurt();
      this.msg(t("trapSpike")(dmg), "combat");
      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
    } else if (cell.tile === Tile.TrapTeleport) {
      cell.trapRevealed = true;
      // Teleport player to random location
      for (let i = 0; i < 100; i++) {
        const rx = rand(1, MAP_W - 2);
        const ry = rand(1, MAP_H - 2);
        if (this.isPassable(rx, ry) && !this.monsterAt(rx, ry)) {
          this.player.x = rx;
          this.player.y = ry;
          break;
        }
      }
      sfx.descend();
      this.msg(t("trapTeleport"), "system");
    } else if (cell.tile === Tile.TrapAlarm) {
      cell.trapRevealed = true;
      sfx.playerHurt();
      this.msg(t("trapAlarm"), "combat");
      // Spawn 1-2 monsters nearby
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      const count = rand(1, 2);
      for (let i = 0; i < count; i++) {
        for (const [dx, dy] of dirs) {
          const mx = x + dx * 2;
          const my = y + dy * 2;
          if (this.isPassable(mx, my) && !this.monsterAt(mx, my)) {
            // Spawn a rat or goblin
            const def = MONSTER_DEFS[rand(0, 1)];
            const scale = 1 + (this.depth - 1) * 0.12;
            this.monsters.push({
              x: mx, y: my,
              char: def.char, color: def.color, nameId: def.nameId,
              hp: Math.ceil(def.hp * scale), maxHp: Math.ceil(def.hp * scale),
              attack: Math.ceil(def.attack * scale), defense: Math.ceil(def.defense * scale),
              xpValue: Math.ceil(def.xpValue * scale),
            });
            break;
          }
        }
      }
    }
  }

  /** Confirm buying a shop item */
  confirmBuy() {
    if (!this.pendingBuy) return;
    const item = this.pendingBuy;
    if (this.gold < (item.price ?? 0)) {
      this.msg(t("shopNoGold"), "system");
      this.pendingBuy = null;
      return;
    }
    if (this.inventory.isFull()) {
      this.msg(t("inventoryFull"), "system");
      this.pendingBuy = null;
      return;
    }
    this.gold -= item.price!;
    item.price = undefined;
    this.inventory.add(item);
    this.items = this.items.filter(i => i !== item);
    sfx.pickupPotion();
    this.msg(t("shopBought")(this.getItemDisplayName(item)), "pickup");
    this.pendingBuy = null;
    this.endTurn();
  }

  declineBuy() {
    this.pendingBuy = null;
  }

  /** Try to pick up item at player's feet (called by 'g' key) */
  tryPickUp() {
    if (this.gameOver) return;
    const item = this.items.find((i) => i.x === this.player.x && i.y === this.player.y);
    if (!item) {
      this.msg(t("nothingHere"), "system");
      return;
    }
    // Amulet is always auto-picked up — begins ascension
    if (item.type === "amulet") {
      sfx.win();
      this.msg(t("foundAmulet"), "pickup");
      this.items = this.items.filter((i) => i !== item);
      this.ascending = true;
      return;
    }
    // Shop items need buying
    if (item.price) {
      this.pendingBuy = item;
      this.msg(t("shopBuy")(this.getItemDisplayName(item), item.price), "system");
      return;
    }
    if (this.inventory.isFull()) {
      this.msg(t("inventoryFull"), "system");
      return;
    }
    this.inventory.add(item);
    this.items = this.items.filter((i) => i !== item);
    sfx.pickupPotion();
    this.msg(t("pickUpItem")(this.getItemDisplayName(item)), "pickup");
    this.endTurn();
  }

  /** Use item from inventory by index */
  useItem(index: number) {
    const item = this.inventory.items[index];
    if (!item) return;

    if (item.type === "potion") {
      this.identifiedTypes.add(item.nameId);
      if (item.nameId === "potion of strength") {
        sfx.pickupWeapon();
        this.player.attack += item.value;
        this.msg(t("drinkStrength")(item.value), "pickup");
      } else if (item.nameId === "potion of poison") {
        sfx.playerHurt();
        this.player.hp -= item.value;
        this.msg(t("drinkPoison")(item.value), "combat");
        if (this.player.hp <= 0) {
          sfx.playerDied();
          this.msg(t("youDied"), "combat");
          this.gameOver = true;
        }
      } else if (item.nameId === "potion of speed") {
        sfx.pickupPotion();
        this.statusMgr.add("speed", item.value, 0);
        this.msg(t("drinkSpeed"), "pickup");
      } else if (item.nameId === "potion of invisibility") {
        sfx.pickupPotion();
        this.statusMgr.add("invisible", item.value, 0);
        this.msg(t("drinkInvisibility"), "pickup");
      } else {
        sfx.pickupPotion();
        const healed = Math.min(item.value, this.player.maxHp - this.player.hp);
        this.player.hp += healed;
        this.msg(t("drinkPotion")(name(item.nameId), healed), "pickup");
      }
      this.inventory.remove(index);
      this.showInventory = false;
      this.endTurn();
    } else if (item.type === "consumable") {
      // Whetstone: permanent ATK boost
      sfx.pickupWeapon();
      this.player.attack += item.value;
      this.msg(t("useWeapon")(name(item.nameId), item.value), "pickup");
      this.inventory.remove(index);
      this.showInventory = false;
      this.endTurn();
    } else if (item.type === "equipment") {
      // Check if slot is blocked by a cursed item before attempting equip
      const currentInSlot = this.inventory.equipped[item.equipSlot!];
      if (currentInSlot?.cursed) {
        this.msg(t("cursedSlot"), "system");
        this.showInventory = false;
        return;
      }
      const prev = this.inventory.equip(index);
      sfx.pickupWeapon();
      this.msg(t("equipItem")(name(item.nameId)), "pickup");
      if (item.cursed) {
        this.msg(t("equipCursed"), "combat");
      }
      if (prev) {
        this.msg(t("unequipItem")(name(prev.nameId)), "pickup");
      }
      this.showInventory = false;
      this.endTurn();
    } else if (item.type === "scroll") {
      this.useScroll(item, index);
    } else if (item.type === "throwing") {
      // Throwing handled separately via direction input
      this.msg(t("throwHint"), "system");
    } else if (item.type === "food") {
      sfx.pickupPotion();
      this.hunger = Math.min(this.maxHunger, this.hunger + item.value);
      this.msg(t("eat")(name(item.nameId), item.value), "pickup");
      this.inventory.remove(index);
      this.showInventory = false;
      this.endTurn();
    }
  }

  private useScroll(item: Item, index: number) {
    this.identifiedTypes.add(item.nameId);
    if (item.nameId === "scroll of teleport") {
      let attempts = 0;
      while (attempts < 100) {
        const rx = rand(1, MAP_W - 2);
        const ry = rand(1, MAP_H - 2);
        if (this.isPassable(rx, ry) && !this.monsterAt(rx, ry)) {
          this.player.x = rx;
          this.player.y = ry;
          break;
        }
        attempts++;
      }
      sfx.descend();
      this.msg(t("useTeleport"), "pickup");
    } else if (item.nameId === "scroll of identify") {
      // Identify all unidentified potions/scrolls in inventory + reveal curse status
      let identifiedAny = false;
      for (const inv of this.inventory.items) {
        if ((inv.type === "potion" || inv.type === "scroll") && !this.identifiedTypes.has(inv.nameId)) {
          this.identifiedTypes.add(inv.nameId);
          this.msg(t("identifyReveal")(name(inv.nameId)), "pickup");
          identifiedAny = true;
        }
      }
      // Reveal curse status on equipped items
      const wep = this.inventory.equipped.weapon;
      const arm = this.inventory.equipped.armor;
      if (wep) {
        this.identifiedTypes.add("curse:" + wep.nameId);
        if (wep.cursed) this.msg(t("identifyCursed")(name(wep.nameId)), "combat");
      }
      if (arm) {
        this.identifiedTypes.add("curse:" + arm.nameId);
        if (arm.cursed) this.msg(t("identifyCursed")(name(arm.nameId)), "combat");
      }
      const ring = this.inventory.equipped.ring;
      if (ring) {
        this.identifiedTypes.add("curse:" + ring.nameId);
        if (ring.cursed) this.msg(t("identifyCursed")(name(ring.nameId)), "combat");
      }
      if (!identifiedAny && !wep && !arm) {
        this.msg(t("identifyNothing"), "system");
      }
      sfx.pickupPotion();
    } else if (item.nameId === "scroll of enchant") {
      const wep = this.inventory.equipped.weapon;
      if (wep) {
        wep.value += 1;
        sfx.pickupWeapon();
        this.msg(t("enchantWeapon")(name(wep.nameId)), "pickup");
      } else {
        this.msg(t("enchantNothing"), "system");
      }
    } else if (item.nameId === "scroll of remove curse") {
      const wep = this.inventory.equipped.weapon;
      const arm = this.inventory.equipped.armor;
      let removed = false;
      if (wep?.cursed) { wep.cursed = false; removed = true; }
      if (arm?.cursed) { arm.cursed = false; removed = true; }
      const ring = this.inventory.equipped.ring;
      if (ring?.cursed) { ring.cursed = false; removed = true; }
      sfx.pickupPotion();
      this.msg(removed ? t("removeCurse") : t("removeCurseNone"), removed ? "pickup" : "system");
    } else if (item.nameId === "scroll of mapping") {
      // Reveal entire level
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          this.cells[y][x].revealed = true;
        }
      }
      sfx.pickupPotion();
      this.msg(t("useMapping"), "pickup");
    } else if (item.nameId === "scroll of protection") {
      this.statusMgr.add("protection", 15, 3);
      sfx.pickupPotion();
      this.msg(t("useProtection"), "pickup");
    }
    this.inventory.remove(index);
    this.showInventory = false;
    this.endTurn();
  }

  private detonateBomb(cx: number, cy: number, baseDamage: number) {
    sfx.explosion();
    this.msg(t("bombExplode"), "combat");

    let hitCount = 0;
    for (const m of [...this.monsters]) {
      if (m.nameId === "shopkeeper") continue;
      const dist = Math.abs(m.x - cx) + Math.abs(m.y - cy);
      if (dist > 1) continue;
      const dmg = Math.max(1, baseDamage - m.defense + rand(-1, 1));
      m.hp -= dmg;
      hitCount++;
      if (m.hp <= 0) {
        sfx.monsterDie();
        this.msg(t("monsterDies")(name(m.nameId)), "combat");
        this.kills++;
        this.gold += rand(1, 4);
        this.gainXp(m.xpValue ?? 5);
        this.handleMonsterDeath(m);
        this.dropLoot(m);
        this.monsters = this.monsters.filter(mm => mm !== m);
      }
    }
    if (hitCount > 0) this.msg(t("bombHits")(hitCount), "combat");

    const playerDist = Math.abs(this.player.x - cx) + Math.abs(this.player.y - cy);
    if (playerDist <= 1) {
      const dmg = Math.max(1, Math.ceil(baseDamage / 2) - this.getEffectiveDefense());
      this.player.hp -= dmg;
      this.msg(t("bombSelf")(dmg), "combat");
      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
    }

    if (this.petAlive) {
      const petDist = Math.abs(this.pet.x - cx) + Math.abs(this.pet.y - cy);
      if (petDist <= 1) {
        const dmg = Math.max(1, Math.ceil(baseDamage / 2) - this.pet.defense);
        this.pet.hp -= dmg;
        this.msg(t("bombPet")(dmg), "pet");
        if (this.pet.hp <= 0) this.checkPetRevival();
      }
    }

    for (const [dx, dy] of [[0, 0], ...DIRS4]) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      if (this.cells[y][x].tile === Tile.Grass) {
        this.cells[y][x].tile = Tile.BurningGrass;
        this.burningTiles.set(`${x},${y}`, 5);
      }
    }
  }

  /** Throw item at nearest visible monster in given direction */
  throwItem(index: number, dx: number, dy: number) {
    const item = this.inventory.items[index];
    if (!item || item.type !== "throwing") return;

    // Find first monster along the line and track impact position
    const range = item.nameId === "bomb" ? 5 : 8;
    let tx = this.player.x + dx;
    let ty = this.player.y + dy;
    let target: Creature | undefined;
    let impactX = this.player.x;
    let impactY = this.player.y;
    for (let i = 0; i < range; i++) {
      if (!this.isPassable(tx, ty)) break;
      impactX = tx;
      impactY = ty;
      target = this.monsterAt(tx, ty);
      if (target) break;
      tx += dx;
      ty += dy;
    }

    this.inventory.remove(index);
    if (item.nameId === "bomb") {
      this.detonateBomb(impactX, impactY, item.value);
    } else if (target) {
      const dmg = Math.max(1, item.value - target.defense);
      target.hp -= dmg;
      sfx.playerAttack();
      this.msg(t("throwHit")(name(item.nameId), name(target.nameId), dmg), "combat");
      if (target.hp <= 0) {
        sfx.monsterDie();
        this.msg(t("monsterDies")(name(target.nameId)), "combat");
        this.kills++;
        this.gainXp(target.xpValue ?? 5);
        this.checkSkeletonReassembly(target);
        this.dropLoot(target);
        this.monsters = this.monsters.filter((m) => m !== target);
      }
    } else {
      this.msg(t("throwMiss")(name(item.nameId)), "combat");
    }
    this.showInventory = false;
    this.endTurn();
  }

  /** Drop item from inventory onto the ground */
  dropItem(index: number) {
    const item = this.inventory.remove(index);
    if (!item) return;
    item.x = this.player.x;
    item.y = this.player.y;
    this.items.push(item);
    sfx.drop();
    this.msg(t("dropItem")(this.getItemDisplayName(item)), "system");
    if (this.inventoryCursor >= this.inventory.items.length && this.inventoryCursor > 0) {
      this.inventoryCursor--;
    }
  }

  /** Get effective attack including equipment */
  getEffectiveAttack(): number {
    return this.player.attack + this.inventory.getWeaponBonus();
  }

  /** Get effective defense including equipment */
  getEffectiveDefense(): number {
    let def = this.player.defense + this.inventory.getArmorBonus();
    if (this.statusMgr.has("protection")) def += 3;
    return def;
  }

  private processMonsters() {
    // Process monster statuses first
    for (const m of [...this.monsters]) {
      if (m.burnTurns && m.burnTurns > 0) {
        m.hp -= 2;
        m.burnTurns--;
        if (m.hp <= 0) {
          this.msg(t("monsterDies")(name(m.nameId)), "combat");
          this.kills++;
          this.gainXp(m.xpValue ?? 5);
          this.handleMonsterDeath(m);
          this.dropLoot(m);
          this.monsters = this.monsters.filter(mm => mm !== m);
        }
      }
      if (m.fearTurns && m.fearTurns > 0) m.fearTurns--;
      if (m.stunTurns && m.stunTurns > 0) m.stunTurns--;
      // Hydra regen
      if (m.regenRate && m.hp < m.maxHp && m.hp > 0) {
        m.hp = Math.min(m.maxHp, m.hp + m.regenRate);
      }
    }

    const processOnce = (m: Creature) => {
      if (m.nameId === "shopkeeper") return;
      if (!this.cells[m.y][m.x].visible) return;

      // Stunned: skip turn
      if (m.stunTurns && m.stunTurns > 0) return;

      // Water slow: skip this monster's turn
      if (m.waterSlow) {
        m.waterSlow = false;
        return;
      }

      // Golem: acts every other turn
      if (m.slowMonster && this.turnCount % 2 === 0) return;

      // Mimic: skip processing while disguised; reveal when player adjacent
      if (m.disguised) {
        const dToPlayer = Math.abs(this.player.x - m.x) + Math.abs(this.player.y - m.y);
        if (dToPlayer <= 1) {
          m.disguised = false;
          m.disguiseItem = undefined;
          sfx.monsterHit();
          this.msg(t("mimicReveal"), "combat");
        }
        return;
      }

      // Stationary monsters (mushroom) don't move
      if (m.stationary) return;

      const dxP = this.player.x - m.x;
      const dyP = this.player.y - m.y;
      const distP = Math.abs(dxP) + Math.abs(dyP);

      // Invisible player: monsters can't see
      const playerInvisible = this.statusMgr.has("invisible") && distP > 1;

      // Grass concealment: player on grass is invisible to monsters >1 cell away
      const playerConcealed = (this.isConcealed(this.player) && distP > 1) || playerInvisible;

      // Fear: flee from player
      if (m.fearTurns && m.fearTurns > 0) {
        this.fleeFromPlayer(m, dxP, dyP);
        return;
      }

      // Goblin flee: runs away when low HP
      if (m.nameId === "goblin" && m.hp <= Math.ceil(m.maxHp * 0.3)) {
        this.fleeFromPlayer(m, dxP, dyP);
        return;
      }

      // Check if adjacent to pet — 50% chance to attack pet instead
      if (this.petAlive) {
        const distPet = Math.abs(this.pet.x - m.x) + Math.abs(this.pet.y - m.y);
        if (distPet <= 1 && Math.random() < 0.5) {
          this.monsterAttackPet(m);
          return;
        }
      }

      if (playerConcealed) return;

      // Phantom: teleport every 2 turns
      if (m.nameId === "phantom") {
        if (m.teleportCd !== undefined) m.teleportCd--;
        if (m.teleportCd !== undefined && m.teleportCd <= 0) {
          // Teleport to random visible floor tile
          for (let a = 0; a < 50; a++) {
            const rx = rand(1, MAP_W - 2);
            const ry = rand(1, MAP_H - 2);
            if (this.isPassable(rx, ry) && !this.monsterAt(rx, ry) &&
                !(rx === this.player.x && ry === this.player.y) &&
                this.cells[ry][rx].visible) {
              m.x = rx;
              m.y = ry;
              break;
            }
          }
          m.teleportCd = 2;
        }
      }

      // Spider: place Web tile near player every 3 turns
      if (m.nameId === "spider" && distP <= 3 && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        if (m.webCharge !== undefined) m.webCharge--;
        if (m.webCharge !== undefined && m.webCharge <= 0) {
          // Place web at player's tile or adjacent
          const webX = this.player.x;
          const webY = this.player.y;
          if (this.cells[webY][webX].tile === Tile.Floor) {
            this.cells[webY][webX].tile = Tile.Web;
            this.msg(t("spiderWeb"), "combat");
          }
          m.webCharge = 3;
        }
      }

      // Necromancer: summon skeleton every 4 turns
      if (m.nameId === "necromancer" && distP <= 8) {
        if (m.summonCooldown !== undefined) m.summonCooldown--;
        if (m.summonCooldown !== undefined && m.summonCooldown <= 0) {
          this.necromancerSummon(m);
          m.summonCooldown = 4;
        }
      }

      // Cultist: periodically heals nearby injured allies
      if (m.nameId === "cultist" && distP <= 8 && !playerConcealed && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        if (m.healCooldown === undefined) m.healCooldown = 3;
        m.healCooldown--;
        if (m.healCooldown <= 0) {
          const ally = this.monsters
            .filter(other =>
              other !== m &&
              other.nameId !== "shopkeeper" &&
              other.hp < other.maxHp &&
              Math.abs(other.x - m.x) + Math.abs(other.y - m.y) <= 4
            )
            .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
          if (ally) {
            const heal = rand(2, 3);
            ally.hp = Math.min(ally.maxHp, ally.hp + heal);
            this.msg(t("cultistHeal")(name(ally.nameId), heal), "combat");
            m.healCooldown = 5;
            return;
          }
        }
      }

      // Spider Queen boss AI
      if (m.nameId === "spider queen" && distP <= 8 && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        if (m.summonCooldown !== undefined) m.summonCooldown--;
        if (m.summonCooldown !== undefined && m.summonCooldown <= 0) {
          this.spiderQueenSummon(m);
          m.summonCooldown = 3;
        }
        // Place web near player
        if (Math.random() < 0.3) {
          const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
          for (const [ddx, ddy] of dirs) {
            const wx = this.player.x + ddx, wy = this.player.y + ddy;
            if (wx >= 0 && wx < MAP_W && wy >= 0 && wy < MAP_H && this.cells[wy][wx].tile === Tile.Floor) {
              this.cells[wy][wx].tile = Tile.Web;
              break;
            }
          }
        }
      }

      // Necromancer Lord boss AI
      if (m.nameId === "necromancer lord" && distP <= 8 && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        if (m.summonCooldown !== undefined) m.summonCooldown--;
        const phase2 = m.hp <= m.maxHp / 2;
        if (m.summonCooldown !== undefined && m.summonCooldown <= 0) {
          if (phase2) {
            this.necroLordSummonWraith(m);
          } else {
            this.lichSummon(m); // reuse skeleton summon
          }
          m.summonCooldown = 3;
        }
        // Ranged dark bolt
        if (distP > 1 && distP <= 6) {
          if (phase2 && Math.random() < 0.3) {
            this.statusMgr.add("blind", 2, 0);
            this.msg(t("necroLordBlind"), "combat");
          }
          const dmg = Math.max(1, m.attack - this.getEffectiveDefense() + rand(-2, 2));
          this.player.hp -= dmg;
          sfx.playerHurt();
          this.msg(t("archerShoot")(name(m.nameId), dmg), "combat");
          if (this.player.hp <= 0) {
            sfx.playerDied();
            this.msg(t("youDied"), "combat");
            this.gameOver = true;
          }
          // Phase 2: teleport away if adjacent
          if (phase2 && distP <= 1) {
            for (let a = 0; a < 50; a++) {
              const rx = rand(m.x - 5, m.x + 5);
              const ry = rand(m.y - 5, m.y + 5);
              if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H &&
                  this.isPassable(rx, ry) && !this.monsterAt(rx, ry) &&
                  !(rx === this.player.x && ry === this.player.y)) {
                m.x = rx; m.y = ry;
                this.msg(t("necroLordTeleport"), "combat");
                break;
              }
            }
          }
          return;
        }
      }

      // Lich: summon skeletons and cast blind at range
      if (m.nameId === "lich" && distP <= 8 && !playerConcealed && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        // Summon 1-2 skeletons nearby
        if (Math.random() < 0.4) {
          this.lichSummon(m);
        }
        // Cast blind at range
        if (distP > 1 && distP <= 6) {
          this.statusMgr.add("blind", 3, 0);
          sfx.playerHurt();
          this.msg(t("lichBlind"), "combat");
          const dmg = Math.max(1, m.attack - this.getEffectiveDefense() + rand(-2, 2));
          this.player.hp -= dmg;
          this.msg(t("archerShoot")(name(m.nameId), dmg), "combat");
          const armR = this.inventory.degradeArmor();
          if (armR.broken) this.msg(t("itemBreaks")(name(armR.broken)), "system");
          else if (armR.warning) this.msg(t("durabilityWarning"), "system");
          if (this.player.hp <= 0) {
            sfx.playerDied();
            this.msg(t("youDied"), "combat");
            this.gameOver = true;
          }
          return;
        }
      }

      // Fire imp: ranged fire attack that burns
      if (m.nameId === "fire imp" && distP > 1 && distP <= 5 && !playerConcealed && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        const dmg = Math.max(1, m.attack - this.getEffectiveDefense() + rand(-1, 1));
        this.player.hp -= dmg;
        this.statusMgr.add("burn", 3, 2);
        sfx.playerHurt();
        this.msg(t("fireImpAttack")(dmg), "combat");
        // Set player's tile on fire if it's grass
        const ptile = this.cells[this.player.y][this.player.x].tile;
        if (ptile === Tile.Grass) {
          this.cells[this.player.y][this.player.x].tile = Tile.BurningGrass;
          this.burningTiles.set(`${this.player.x},${this.player.y}`, 5);
        }
        const armR2 = this.inventory.degradeArmor();
        if (armR2.broken) this.msg(t("itemBreaks")(name(armR2.broken)), "system");
        else if (armR2.warning) this.msg(t("durabilityWarning"), "system");
        if (this.player.hp <= 0) {
          sfx.playerDied();
          this.msg(t("youDied"), "combat");
          this.gameOver = true;
        }
        return;
      }

      // Archer/Necromancer: ranged attack from distance (with LOS check)
      if (m.ranged && m.nameId !== "lich" && m.nameId !== "fire imp" && m.nameId !== "necromancer lord" &&
          distP > 1 && distP <= 6 && !playerConcealed && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        this.rangedAttack(m);
        // Degrade armor when player is hit by ranged
        const armR2 = this.inventory.degradeArmor();
        if (armR2.broken) this.msg(t("itemBreaks")(name(armR2.broken)), "system");
        else if (armR2.warning) this.msg(t("durabilityWarning"), "system");
        return;
      }

      if (distP <= 1) {
        this.combat(m, this.player);
        if (this.gameOver) return;
      } else if (distP < 12) {
        this.chasePlayer(m, dxP, dyP);
      }
    };

    for (const m of [...this.monsters]) {
      if (m.hp <= 0) continue; // may have died in status processing
      processOnce(m);
      if (this.gameOver) return;
      // Double-act monsters get a second action
      if (m.doubleAct && m.hp > 0 && !m.disguised) {
        processOnce(m);
        if (this.gameOver) return;
      }
    }
  }

  /** Handle on-death effects for monsters (mushroom poison cloud, ember sprite explosion) */
  private handleMonsterDeath(m: Creature) {
    this.checkSkeletonReassembly(m);

    // Mushroom: poison cloud on death (2-tile AoE)
    if (m.poisonCloud) {
      for (const other of [...this.monsters]) {
        if (other === m) continue;
        const dist = Math.abs(other.x - m.x) + Math.abs(other.y - m.y);
        if (dist <= 2) {
          other.hp -= 3;
          if (other.hp <= 0) {
            this.monsters = this.monsters.filter(mm => mm !== other);
            this.kills++;
            this.gainXp(other.xpValue ?? 5);
          }
        }
      }
      // Poison player if nearby
      const playerDist = Math.abs(this.player.x - m.x) + Math.abs(this.player.y - m.y);
      if (playerDist <= 2) {
        this.statusMgr.add("poison", 3, 2);
        this.msg(t("mushroomCloud"), "combat");
      }
      // Poison pet if nearby
      if (this.petAlive) {
        const petDist = Math.abs(this.pet.x - m.x) + Math.abs(this.pet.y - m.y);
        if (petDist <= 2) {
          this.pet.hp -= 3;
          if (this.pet.hp <= 0) {
            this.checkPetRevival();
          }
        }
      }
    }

    // Ember sprite: explode for AoE damage on death
    if (m.explodeOnDeath) {
      const aoe = m.explodeOnDeath;
      sfx.explosion();
      this.msg(t("emberExplode"), "combat");
      // Damage player if adjacent
      const pDist = Math.abs(this.player.x - m.x) + Math.abs(this.player.y - m.y);
      if (pDist <= 1) {
        this.player.hp -= aoe;
        if (this.player.hp <= 0) {
          sfx.playerDied();
          this.msg(t("youDied"), "combat");
          this.gameOver = true;
        }
      }
      // Ignite adjacent grass
      for (const [ddx, ddy] of DIRS4) {
        const gx = m.x + ddx, gy = m.y + ddy;
        if (gx >= 0 && gx < MAP_W && gy >= 0 && gy < MAP_H && this.cells[gy][gx].tile === Tile.Grass) {
          this.cells[gy][gx].tile = Tile.BurningGrass;
          this.burningTiles.set(`${gx},${gy}`, 5);
        }
      }
    }
  }

  private necromancerSummon(necro: Creature) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dx, dy] of dirs) {
      const nx = necro.x + dx, ny = necro.y + dy;
      if (this.isPassable(nx, ny) && !this.monsterAt(nx, ny) &&
          !(nx === this.player.x && ny === this.player.y)) {
        const scale = 1 + (this.depth - 1) * 0.12;
        this.monsters.push({
          x: nx, y: ny, char: "z", color: "#cccccc", nameId: "skeleton",
          hp: Math.ceil(9 * scale), maxHp: Math.ceil(9 * scale),
          attack: Math.ceil(4 * scale), defense: Math.ceil(2 * scale),
          xpValue: Math.ceil(12 * scale),
        });
        this.msg(t("necromancerSummon"), "combat");
        return;
      }
    }
  }

  private spiderQueenSummon(queen: Creature) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    let spawned = 0;
    for (const [dx, dy] of dirs) {
      if (spawned >= 2) break;
      const nx = queen.x + dx, ny = queen.y + dy;
      if (this.isPassable(nx, ny) && !this.monsterAt(nx, ny) &&
          !(nx === this.player.x && ny === this.player.y)) {
        const scale = 1 + (this.depth - 1) * 0.12;
        this.monsters.push({
          x: nx, y: ny, char: "x", color: "#d3d3d3", nameId: "spider",
          hp: Math.ceil(4 * scale), maxHp: Math.ceil(4 * scale),
          attack: Math.ceil(2 * scale), defense: 0,
          xpValue: Math.ceil(5 * scale), webCharge: 3,
        });
        spawned++;
      }
    }
    if (spawned > 0) this.msg(t("spiderQueenSummon"), "combat");
  }

  private necroLordSummonWraith(lord: Creature) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dx, dy] of dirs) {
      const nx = lord.x + dx, ny = lord.y + dy;
      if (this.isPassable(nx, ny, true) && !this.monsterAt(nx, ny) &&
          !(nx === this.player.x && ny === this.player.y)) {
        const scale = 1 + (this.depth - 1) * 0.12;
        this.monsters.push({
          x: nx, y: ny, char: "W", color: "#6a0dad", nameId: "wraith",
          hp: Math.ceil(12 * scale), maxHp: Math.ceil(12 * scale),
          attack: Math.ceil(5 * scale), defense: Math.ceil(1 * scale),
          passWall: true, xpValue: Math.ceil(18 * scale),
        });
        this.msg(t("necroLordSummon"), "combat");
        return;
      }
    }
  }

  private fleeFromPlayer(m: Creature, dxToPlayer: number, dyToPlayer: number) {
    // Move away from player
    const sx = dxToPlayer === 0 ? 0 : dxToPlayer > 0 ? -1 : 1;
    const sy = dyToPlayer === 0 ? 0 : dyToPlayer > 0 ? -1 : 1;

    const canMove = (nx: number, ny: number) =>
      this.isPassable(nx, ny) && !this.monsterAt(nx, ny) &&
      !(nx === this.player.x && ny === this.player.y);

    if (sx !== 0 && canMove(m.x + sx, m.y)) m.x += sx;
    else if (sy !== 0 && canMove(m.x, m.y + sy)) m.y += sy;
  }

  private rangedAttack(m: Creature) {
    const dmg = Math.max(1, m.attack - this.getEffectiveDefense() + rand(-2, 2));
    this.player.hp -= dmg;
    sfx.playerHurt();
    this.msg(t("archerShoot")(name(m.nameId), dmg), "combat");
    if (this.player.hp <= 0) {
      sfx.playerDied();
      this.msg(t("youDied"), "combat");
      this.gameOver = true;
    }
  }

  private monsterAttackPet(attacker: Creature) {
    const dmg = Math.max(1, attacker.attack - this.pet.defense + rand(-2, 2));
    this.pet.hp -= dmg;
    sfx.petHurt();
    this.msg(t("petHurt")(name(attacker.nameId), dmg), "pet");
    if (this.pet.hp <= 0) {
      this.checkPetRevival();
    }
  }

  private chasePlayer(m: Creature, dx: number, dy: number) {
    const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    const prevX = m.x, prevY = m.y;

    const canGo = (nx: number, ny: number) => {
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return false;
      const passable = m.passWall || this.isPassable(nx, ny);
      return passable && !this.monsterAt(nx, ny) &&
        !(nx === this.player.x && ny === this.player.y);
    };

    const tryX = (): boolean => {
      if (sx !== 0 && canGo(m.x + sx, m.y)) { m.x += sx; return true; }
      return false;
    };

    const tryY = (): boolean => {
      if (sy !== 0 && canGo(m.x, m.y + sy)) { m.y += sy; return true; }
      return false;
    };

    if (Math.abs(dx) >= Math.abs(dy)) {
      tryX() || tryY();
    } else {
      tryY() || tryX();
    }

    // Water/Web slow for monsters entering water or web (ghosts immune)
    if (!m.passWall && (m.x !== prevX || m.y !== prevY) &&
        (this.cells[m.y][m.x].tile === Tile.Water || this.cells[m.y][m.x].tile === Tile.Web)) {
      m.waterSlow = true;
    }
  }
}
