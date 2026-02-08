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
}

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
  equipSlot?: "weapon" | "armor";
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
    const potionTypes = ["health potion", "potion of strength", "potion of poison"];
    const scrollTypes = ["scroll of teleport", "scroll of identify", "scroll of enchant", "scroll of mapping", "scroll of remove curse"];
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
    // Pet scales with depth
    const scale = 1 + (this.depth - 1) * 0.14;
    return {
      x, y,
      char: "d",
      color: "#f4a460",
      nameId: "jack",
      hp: Math.ceil(15 * scale),
      maxHp: Math.ceil(15 * scale),
      attack: Math.ceil(2 * scale),
      defense: Math.ceil(1 * scale),
    };
  }

  private makeItem(x: number, y: number, id: string): Item {
    const defs: Record<string, Omit<Item, "x" | "y">> = {
      "health potion": { char: "!", color: "#ff69b4", nameId: "health potion", type: "potion", value: 8 },
      "health potion small": { char: "!", color: "#ff69b4", nameId: "health potion", type: "potion", value: 5 },
      whetstone: { char: ")", color: "#87ceeb", nameId: "whetstone", type: "consumable", value: 1 },
      "short sword": { char: ")", color: "#cccccc", nameId: "short sword", type: "equipment", value: 2, equipSlot: "weapon", durability: 45, maxDurability: 45 },
      "long sword": { char: ")", color: "#e0e0ff", nameId: "long sword", type: "equipment", value: 4, equipSlot: "weapon", durability: 60, maxDurability: 60 },
      "leather armor": { char: "[", color: "#8b6914", nameId: "leather armor", type: "equipment", value: 2, equipSlot: "armor", durability: 52, maxDurability: 52 },
      "chain mail": { char: "[", color: "#b0b0b0", nameId: "chain mail", type: "equipment", value: 4, equipSlot: "armor", durability: 65, maxDurability: 65 },
      "scroll of teleport": { char: "?", color: "#daa520", nameId: "scroll of teleport", type: "scroll", value: 0 },
      "scroll of identify": { char: "?", color: "#87cefa", nameId: "scroll of identify", type: "scroll", value: 0 },
      "scroll of enchant": { char: "?", color: "#ff6666", nameId: "scroll of enchant", type: "scroll", value: 0 },
      "scroll of mapping": { char: "?", color: "#66ff66", nameId: "scroll of mapping", type: "scroll", value: 0 },
      "scroll of remove curse": { char: "?", color: "#ffffff", nameId: "scroll of remove curse", type: "scroll", value: 0 },
      "potion of strength": { char: "!", color: "#ff4444", nameId: "potion of strength", type: "potion", value: 1 },
      "potion of poison": { char: "!", color: "#44ff44", nameId: "potion of poison", type: "potion", value: 5 },
      "throwing knife": { char: "/", color: "#c0c0c0", nameId: "throwing knife", type: "throwing", value: 4 },
      ration: { char: "%", color: "#cd853f", nameId: "ration", type: "food", value: 40 },
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
      }
    }

    // Depth 10: Lich boss guards Amulet of Yendor
    if (this.depth >= 10) {
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
      { id: "potion of strength", price: 20 },
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
    // depth 1: rat, 2: +goblin, 3: +snake, 4: +archer, 5: +ogre, 6: +ghost, 7: +slime, 8: +skeleton, 9: +wraith, 10: +fire imp
    const tierByDepth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const maxTier = Math.min((tierByDepth[Math.min(this.depth, tierByDepth.length) - 1] ?? MONSTER_DEFS.length), MONSTER_DEFS.length) - 1;
    const def = MONSTER_DEFS[rand(0, maxTier)];
    let scale = 1 + (this.depth - 1) * 0.12;
    if (this.ascending) scale *= 1.2; // dungeon is "angry" during ascent
    const mx = rand(room.x, room.x + room.w - 1);
    const my = rand(room.y, room.y + room.h - 1);

    if (this.cells[my][mx].tile === Tile.Wall) return;

    this.monsters.push({
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
    });
  }

  private spawnItem(room: Room) {
    const ix = rand(room.x, room.x + room.w - 1);
    const iy = rand(room.y, room.y + room.h - 1);
    if (this.cells[iy][ix].tile === Tile.Wall) return;

    const roll = Math.random();
    let id: string;
    if (roll < 0.18) id = "health potion";
    else if (roll < 0.24) id = "potion of strength";
    else if (roll < 0.28) id = "potion of poison";
    else if (roll < 0.36) id = "ration";
    else if (roll < 0.44) id = "throwing knife";
    else if (roll < 0.52) id = "scroll of teleport";
    else if (roll < 0.56) id = "scroll of identify";
    else if (roll < 0.60) id = "scroll of enchant";
    else if (roll < 0.63) id = "scroll of mapping";
    else if (roll < 0.66) id = "scroll of remove curse";
    else if (roll < 0.76) id = this.depth >= 3 ? "long sword" : "short sword";
    else if (roll < 0.86) id = this.depth >= 3 ? "chain mail" : "leather armor";
    else id = "whetstone";

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

      // Water slow on entering water
      if (this.cells[ny][nx].tile === Tile.Water) {
        this.player.waterSlow = true;
      }

      this.checkAutoPickUp(nx, ny);
    } else if (this.isPassable(nx, ny)) {
      this.animations.addMove(this.player.x, this.player.y, nx, ny);
      this.player.x = nx;
      this.player.y = ny;

      // Water slow on entering water
      if (this.cells[ny][nx].tile === Tile.Water) {
        this.player.waterSlow = true;
      }

      this.processTrap(nx, ny);
      this.checkAutoPickUp(nx, ny);
    } else {
      return; // Wall/impassable — no turn consumed
    }

    this.endTurn();
  }

  tryDescend() {
    if (this.gameOver) return;

    if (this.cells[this.player.y][this.player.x].tile === Tile.StairsDown) {
      this.depth++;
      sfx.descend();
      this.msg(t("descend")(this.depth), "system");
      this.generateLevel();
      // Auto-save on descend
      saveGame(this);
    } else {
      this.msg(t("noStairs"), "system");
    }
  }

  tryAscend() {
    if (this.gameOver) return;
    if (!this.ascending) {
      this.msg(t("noStairsUp"), "system");
      return;
    }
    if (this.cells[this.player.y][this.player.x].tile === Tile.StairsUp) {
      this.depth--;
      if (this.depth <= 0) {
        // Escaped the dungeon!
        sfx.win();
        this.msg(t("escaped"), "system");
        this.gameOver = true;
        this.won = true;
        return;
      }
      sfx.descend();
      this.msg(t("ascend")(this.depth), "system");
      this.generateLevel();
      saveGame(this);
    } else {
      this.msg(t("noStairsUp"), "system");
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
    queue.push(px, py);
    visited[py][px] = true;

    let tx = -1;
    let ty = -1;

    while (queue.length > 0) {
      const cx = queue.shift()!;
      const cy = queue.shift()!;

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
    // Blind reduces FOV radius
    const fov = this.statusMgr.has("blind") ? 3 : this.fovRadius;
    computeFOV(this.cells, this.player.x, this.player.y, fov);
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
    // Monsters on lava take damage (fire imps immune)
    for (const m of [...this.monsters]) {
      if (this.cells[m.y][m.x].tile === Tile.Lava && m.nameId !== "fire imp") {
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

  private processPet() {
    if (!this.petAlive) return;

    const dx = this.player.x - this.pet.x;
    const dy = this.player.y - this.pet.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    // Attack adjacent monster, or move toward a nearby one
    const adjacent = this.monsters.find(
      (m) => Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y) <= 1
    );
    if (adjacent) {
      this.petCombat(adjacent);
      return;
    }

    // Seek nearest visible monster within 4 tiles
    const nearby = this.monsters
      .filter((m) => this.cells[m.y][m.x].visible && Math.abs(m.x - this.pet.x) + Math.abs(m.y - this.pet.y) <= 4)
      .sort((a, b) => (Math.abs(a.x - this.pet.x) + Math.abs(a.y - this.pet.y)) - (Math.abs(b.x - this.pet.x) + Math.abs(b.y - this.pet.y)));
    if (nearby.length > 0 && dist <= 5) {
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
    const dmg = Math.max(1, this.pet.attack - target.defense + rand(-2, 2));
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

  private combat(attacker: Creature, defender: Creature) {
    const atkVal = attacker === this.player ? this.getEffectiveAttack() : attacker.attack;
    const defVal = defender === this.player ? this.getEffectiveDefense() : defender.defense;
    const dmg = Math.max(1, atkVal - defVal + rand(-2, 2));
    defender.hp -= dmg;

    if (attacker === this.player) {
      sfx.playerAttack();
      this.msg(t("youHit")(name(defender.nameId), dmg), "combat");
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
        this.checkSkeletonReassembly(defender);
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
    };
    const chance = dropChance[monster.nameId] ?? 0.3;
    if (Math.random() >= chance) return;

    // Bosses and depth 4+ monsters have chance to drop enchanted equipment
    const isBoss = monster.nameId === "dragon" || monster.nameId === "lich";
    if ((isBoss || (this.depth >= 4 && Math.random() < 0.15)) && Math.random() < (isBoss ? 1.0 : 0.5)) {
      const enchItem = this.makeEnchantedItem(monster.x, monster.y);
      this.items.push(enchItem);
      sfx.drop();
      this.msg(t("monsterDrops")(name(monster.nameId)), "pickup");
      return;
    }

    const roll = Math.random();
    let id: string;
    if (roll < 0.45) id = "health potion small";
    else if (roll < 0.60) id = "ration";
    else if (roll < 0.75) id = "throwing knife";
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
      const baseId = this.depth >= 6 ? "long sword" : "short sword";
      const item = this.makeItem(x, y, baseId);
      const etype = weaponEnchants[rand(0, weaponEnchants.length - 1)];
      item.enchantment = { type: etype, level: rand(1, 2) };
      return item;
    } else {
      const baseId = this.depth >= 6 ? "chain mail" : "leather armor";
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
    }
    this.inventory.remove(index);
    this.showInventory = false;
    this.endTurn();
  }

  /** Throw item at nearest visible monster in given direction */
  throwItem(index: number, dx: number, dy: number) {
    const item = this.inventory.items[index];
    if (!item || item.type !== "throwing") return;

    // Find first monster along the line
    let tx = this.player.x + dx;
    let ty = this.player.y + dy;
    let target: Creature | undefined;
    for (let i = 0; i < 8; i++) {
      if (!this.isPassable(tx, ty)) break;
      target = this.monsterAt(tx, ty);
      if (target) break;
      tx += dx;
      ty += dy;
    }

    this.inventory.remove(index);
    if (target) {
      const dmg = Math.max(1, item.value - target.defense);
      target.hp -= dmg;
      sfx.playerAttack();
      this.msg(t("throwHit")(name(item.nameId), name(target.nameId), dmg), "combat");
      if (target.hp <= 0) {
        sfx.monsterDie();
        this.msg(t("monsterDies")(name(target.nameId)), "combat");
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
    return this.player.defense + this.inventory.getArmorBonus();
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
          this.dropLoot(m);
          this.monsters = this.monsters.filter(mm => mm !== m);
        }
      }
      if (m.fearTurns && m.fearTurns > 0) m.fearTurns--;
      if (m.stunTurns && m.stunTurns > 0) m.stunTurns--;
    }

    for (const m of this.monsters) {
      if (m.nameId === "shopkeeper") continue;
      if (!this.cells[m.y][m.x].visible) continue;

      // Stunned: skip turn
      if (m.stunTurns && m.stunTurns > 0) continue;

      // Water slow: skip this monster's turn
      if (m.waterSlow) {
        m.waterSlow = false;
        continue;
      }

      const dxP = this.player.x - m.x;
      const dyP = this.player.y - m.y;
      const distP = Math.abs(dxP) + Math.abs(dyP);

      // Grass concealment: player on grass is invisible to monsters >1 cell away
      const playerConcealed = this.isConcealed(this.player) && distP > 1;

      // Fear: flee from player
      if (m.fearTurns && m.fearTurns > 0) {
        this.fleeFromPlayer(m, dxP, dyP);
        continue;
      }

      // Goblin flee: runs away when low HP
      if (m.nameId === "goblin" && m.hp <= Math.ceil(m.maxHp * 0.3)) {
        this.fleeFromPlayer(m, dxP, dyP);
        continue;
      }

      // Check if adjacent to pet — 50% chance to attack pet instead
      if (this.petAlive) {
        const distPet = Math.abs(this.pet.x - m.x) + Math.abs(this.pet.y - m.y);
        if (distPet <= 1 && Math.random() < 0.5) {
          this.monsterAttackPet(m);
          continue;
        }
      }

      if (playerConcealed) continue;

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
          continue;
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
        continue;
      }

      // Archer: ranged attack from distance (with LOS check)
      if (m.ranged && m.nameId !== "lich" && m.nameId !== "fire imp" && distP > 1 && distP <= 6 && !playerConcealed && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        this.rangedAttack(m);
        // Degrade armor when player is hit by ranged
        const armR2 = this.inventory.degradeArmor();
        if (armR2.broken) this.msg(t("itemBreaks")(name(armR2.broken)), "system");
        else if (armR2.warning) this.msg(t("durabilityWarning"), "system");
        continue;
      }

      if (distP <= 1) {
        this.combat(m, this.player);
        if (this.gameOver) return;
      } else if (distP < 12) {
        this.chasePlayer(m, dxP, dyP);
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
      sfx.petDied();
      this.petAlive = false;
      this.msg(t("petDied"), "pet");
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

    // Water slow for monsters entering water (ghosts immune)
    if (!m.passWall && (m.x !== prevX || m.y !== prevY) && this.cells[m.y][m.x].tile === Tile.Water) {
      m.waterSlow = true;
    }
  }
}
