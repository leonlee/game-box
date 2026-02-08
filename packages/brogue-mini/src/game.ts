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
}

export type MsgType = "combat" | "pickup" | "system" | "pet";

export interface GameMessage {
  text: string;
  type: MsgType;
  count: number;
}

export type ItemType = "potion" | "consumable" | "equipment" | "scroll" | "throwing" | "food" | "amulet";

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
  { char: "O", color: "#e67e22", nameId: "ogre", hp: 14, attack: 5, defense: 2, xpValue: 15 },
  { char: "G", color: "#5a7a9a", nameId: "ghost", hp: 8, attack: 4, defense: 0, passWall: true, xpValue: 12 },
  { char: "a", color: "#c0392b", nameId: "archer", hp: 6, attack: 3, defense: 0, ranged: true, xpValue: 10 },
  { char: "S", color: "#27ae60", nameId: "slime", hp: 10, attack: 2, defense: 1, splits: true, xpValue: 10 },
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

  private readonly fovRadius = 10;
  private readonly petHealInterval = 5;
  private readonly petHealAmount = 4;
  private readonly hungerInterval = 10; // lose 1 hunger every N turns

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
    this.pet = this.makePet(0, 0);
    // Start with a ration and a short sword equipped
    this.inventory.add(this.makeItem(0, 0, "ration"));
    this.inventory.add(this.makeItem(0, 0, "short sword"));
    this.inventory.equip(1); // equip the sword
    this.generateLevel();
    this.msg(t("welcome"));
  }

  private makePet(x: number, y: number): Creature {
    // Pet scales with depth
    const scale = 1 + (this.depth - 1) * 0.2;
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
      "short sword": { char: ")", color: "#cccccc", nameId: "short sword", type: "equipment", value: 2, equipSlot: "weapon", durability: 35, maxDurability: 35 },
      "long sword": { char: ")", color: "#e0e0ff", nameId: "long sword", type: "equipment", value: 4, equipSlot: "weapon", durability: 45, maxDurability: 45 },
      "leather armor": { char: "[", color: "#8b6914", nameId: "leather armor", type: "equipment", value: 2, equipSlot: "armor", durability: 40, maxDurability: 40 },
      "chain mail": { char: "[", color: "#b0b0b0", nameId: "chain mail", type: "equipment", value: 4, equipSlot: "armor", durability: 50, maxDurability: 50 },
      "scroll of teleport": { char: "?", color: "#daa520", nameId: "scroll of teleport", type: "scroll", value: 0 },
      "scroll of identify": { char: "?", color: "#87cefa", nameId: "scroll of identify", type: "scroll", value: 0 },
      "throwing knife": { char: "/", color: "#c0c0c0", nameId: "throwing knife", type: "throwing", value: 4 },
      ration: { char: "%", color: "#cd853f", nameId: "ration", type: "food", value: 40 },
    };
    const def = defs[id] ?? defs["health potion"];
    return { x, y, ...def };
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
    const { cells, rooms } = generateDungeon(this.depth);
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

    // Depth 5: place amulet in last room, remove stairs, spawn boss
    if (this.depth >= 5) {
      const last = rooms[rooms.length - 1];
      const sx = Math.floor(last.x + last.w / 2);
      const sy = Math.floor(last.y + last.h / 2);
      this.cells[sy][sx].tile = Tile.Floor;
      this.items.push({
        x: sx,
        y: sy,
        char: '"',
        color: "#ffd700",
        nameId: "Amulet of Yendor",
        type: "amulet",
        value: 0,
      });
      // Spawn boss: powerful ogre
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

    computeFOV(this.cells, this.player.x, this.player.y, this.fovRadius);
  }

  private spawnShopItems(room: Room) {
    const shopItems = ["health potion", "scroll of teleport", "throwing knife", "ration"];
    for (let j = 0; j < rand(2, 3); j++) {
      const id = shopItems[rand(0, shopItems.length - 1)];
      const ix = rand(room.x, room.x + room.w - 1);
      const iy = rand(room.y, room.y + room.h - 1);
      if (this.cells[iy][ix].tile !== Tile.Wall) {
        this.items.push(this.makeItem(ix, iy, id));
      }
    }
  }

  private spawnMonster(room: Room) {
    // Tier progression: depth 1-2 = basic, 3-4 = mid, 5 = all
    const maxTier = Math.min(this.depth + 1, MONSTER_DEFS.length) - 1;
    const def = MONSTER_DEFS[rand(0, maxTier)];
    const scale = 1 + (this.depth - 1) * 0.15;
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
    if (roll < 0.25) id = "health potion";
    else if (roll < 0.35) id = "ration";
    else if (roll < 0.45) id = "throwing knife";
    else if (roll < 0.55) id = "scroll of teleport";
    else if (roll < 0.60) id = "scroll of identify";
    else if (roll < 0.70) id = this.depth >= 3 ? "long sword" : "short sword";
    else if (roll < 0.80) id = this.depth >= 3 ? "chain mail" : "leather armor";
    else id = "whetstone";

    this.items.push(this.makeItem(ix, iy, id));
  }

  private isPassable(x: number, y: number): boolean {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    return this.cells[y][x].tile !== Tile.Wall;
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
    if (monster) {
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
      this.player.x = nx;
      this.player.y = ny;

      // Water slow on entering water
      if (this.cells[ny][nx].tile === Tile.Water) {
        this.player.waterSlow = true;
      }

      this.processTrap(nx, ny);
      this.checkAutoPickUp(nx, ny);
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
    if (this.cells[this.player.y][this.player.x].tile === Tile.StairsDown) {
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
    if (this.cells[this.player.y][this.player.x].tile === Tile.StairsDown) {
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
    deleteSave();
    this.generateLevel();
    this.msg(t("welcome"), "system");
  }

  private endTurn() {
    this.turnCount++;
    this.processStatusEffects();
    this.processHunger();
    this.processPet();
    this.processMonsters();
    // Blind reduces FOV radius
    const fov = this.statusMgr.has("blind") ? 3 : this.fovRadius;
    computeFOV(this.cells, this.player.x, this.player.y, fov);
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
      this.gainXp(Math.ceil((target.xpValue ?? 5) / 2));
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
      // Degrade weapon on player attack
      const brokenW = this.inventory.degradeWeapon();
      if (brokenW) this.msg(t("itemBreaks")(name(brokenW)), "system");
      if (defender.hp <= 0) {
        sfx.monsterDie();
        this.msg(t("monsterDies")(name(defender.nameId)), "combat");
        this.kills++;
        this.gainXp(defender.xpValue ?? 5);
        // Slime splits on death
        if (defender.splits) {
          this.splitMonster(defender);
        }
        this.dropLoot(defender);
        this.monsters = this.monsters.filter((m) => m !== defender);
      }
    } else {
      sfx.playerHurt();
      this.msg(t("monsterHitsYou")(name(attacker.nameId), dmg), "combat");

      // Degrade armor when player is hit
      const brokenA = this.inventory.degradeArmor();
      if (brokenA) this.msg(t("itemBreaks")(name(brokenA)), "system");

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
        this.statusMgr.add("bleed", 3, 2);
        this.msg(t("dragonBleed"), "combat");
      }

      if (this.player.hp <= 0) {
        sfx.playerDied();
        this.msg(t("youDied"), "combat");
        this.gameOver = true;
      }
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

  private gainXp(amount: number) {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.ceil(this.xpToNext * 1.3);
      this.pendingLevelUp = true;
      sfx.pickupWeapon();
      this.msg(t("levelUp")(this.level), "system");
    }
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
    };
    const chance = dropChance[monster.nameId] ?? 0.3;
    if (Math.random() >= chance) return;

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

  /** Check for auto-pickup (only amulet) or notify of items on ground */
  private checkAutoPickUp(x: number, y: number) {
    const item = this.items.find((i) => i.x === x && i.y === y);
    if (!item) return;
    if (item.type === "amulet") {
      sfx.win();
      this.msg(t("foundAmulet"), "pickup");
      this.items = this.items.filter((i) => i !== item);
      this.gameOver = true;
      this.won = true;
      return;
    }
    this.msg(t("itemOnGround")(name(item.nameId)), "system");
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
            const scale = 1 + (this.depth - 1) * 0.15;
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

  /** Try to pick up item at player's feet (called by 'g' key) */
  tryPickUp() {
    if (this.gameOver) return;
    const item = this.items.find((i) => i.x === this.player.x && i.y === this.player.y);
    if (!item) {
      this.msg(t("nothingHere"), "system");
      return;
    }
    // Amulet is always auto-picked up
    if (item.type === "amulet") {
      sfx.win();
      this.msg(t("foundAmulet"), "pickup");
      this.items = this.items.filter((i) => i !== item);
      this.gameOver = true;
      this.won = true;
      return;
    }
    if (this.inventory.isFull()) {
      this.msg(t("inventoryFull"), "system");
      return;
    }
    this.inventory.add(item);
    this.items = this.items.filter((i) => i !== item);
    sfx.pickupPotion();
    this.msg(t("pickUpItem")(name(item.nameId)), "pickup");
    this.endTurn();
  }

  /** Use item from inventory by index */
  useItem(index: number) {
    const item = this.inventory.items[index];
    if (!item) return;

    if (item.type === "potion") {
      sfx.pickupPotion();
      const healed = Math.min(item.value, this.player.maxHp - this.player.hp);
      this.player.hp += healed;
      this.msg(t("drinkPotion")(name(item.nameId), healed), "pickup");
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
      const prev = this.inventory.equip(index);
      sfx.pickupWeapon();
      this.msg(t("equipItem")(name(item.nameId)), "pickup");
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
    if (item.nameId === "scroll of teleport") {
      // Teleport to random passable cell
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
      // Reveal equipment durability info (show as message)
      const wep = this.inventory.equipped.weapon;
      const arm = this.inventory.equipped.armor;
      if (wep && wep.durability !== undefined) {
        this.msg(t("identify")(name(wep.nameId), wep.durability, wep.maxDurability!), "pickup");
      }
      if (arm && arm.durability !== undefined) {
        this.msg(t("identify")(name(arm.nameId), arm.durability, arm.maxDurability!), "pickup");
      }
      if (!wep && !arm) {
        this.msg(t("identifyNothing"), "system");
      }
      sfx.pickupPotion();
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
    this.msg(t("dropItem")(name(item.nameId)), "system");
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
    for (const m of this.monsters) {
      if (!this.cells[m.y][m.x].visible) continue;

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

      // Archer: ranged attack from distance (with LOS check)
      if (m.ranged && distP > 1 && distP <= 6 && !playerConcealed && this.hasLOS(m.x, m.y, this.player.x, this.player.y)) {
        this.rangedAttack(m);
        // Degrade armor when player is hit by ranged
        const brokenAR = this.inventory.degradeArmor();
        if (brokenAR) this.msg(t("itemBreaks")(name(brokenAR)), "system");
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
