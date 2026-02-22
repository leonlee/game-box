import { MAP_W, MAP_H, Tile } from "./map";
import { GameState, MsgType, EnchantType } from "./game";
import { t, name } from "./i18n";
import { getLeaderboard } from "./save";

const ENCHANT_COLORS: Record<EnchantType, string> = {
  fire: "#ff6600",
  ice: "#66ccff",
  vampiric: "#cc0033",
  thorns: "#33cc33",
  swift: "#ffcc00",
};

const MSG_COLORS: Record<MsgType, string> = {
  combat: "#e74c3c",
  pickup: "#2ecc71",
  system: "#999999",
  pet: "#f39c12",
  info: "#5599cc",
};

export const CANVAS_W = 800;
export const CANVAS_H = 608;

export interface OverlayHitArea {
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
  data?: number;
}

export let overlayHitAreas: OverlayHitArea[] = [];
const CELL_W = 10;
const CELL_H = 18;
const MAP_OX = Math.floor((CANVAS_W - MAP_W * CELL_W) / 2);
const MAP_H_PX = MAP_H * CELL_H;
const PANEL_Y = MAP_H_PX + 2;
const PANEL_H = 66;
const STATS_X = 430;

const GLYPH_FONT = '14px monospace';
const UI_FONT = '12px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace';
const MSG_FONT = '13px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace';
const TITLE_FONT = 'bold 26px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace';
const SUB_FONT = '14px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace';

interface TileStyle {
  char: string;
  fg: string;
  bg: string;
}

const TILE_STYLES: Record<Tile, TileStyle> = {
  [Tile.Wall]: { char: "#", fg: "#4a4a6a", bg: "#16162a" },
  [Tile.Floor]: { char: "\u00B7", fg: "#2a2a4a", bg: "#0c0c18" },
  [Tile.StairsDown]: { char: ">", fg: "#ffffff", bg: "#0c0c18" },
  [Tile.StairsUp]: { char: "<", fg: "#ffffff", bg: "#0c0c18" },
  [Tile.Water]: { char: "~", fg: "#4488cc", bg: "#0a1a3a" },
  [Tile.Grass]: { char: '"', fg: "#2d6b2d", bg: "#0a1a0a" },
  [Tile.TrapSpike]: { char: "\u00B7", fg: "#2a2a4a", bg: "#0c0c18" },    // Hidden: looks like floor
  [Tile.TrapTeleport]: { char: "\u00B7", fg: "#2a2a4a", bg: "#0c0c18" },
  [Tile.TrapAlarm]: { char: "\u00B7", fg: "#2a2a4a", bg: "#0c0c18" },
  [Tile.DeepWater]: { char: "~", fg: "#1155aa", bg: "#050f2a" },
  [Tile.Lava]: { char: "~", fg: "#ff4400", bg: "#330a00" },
  [Tile.BurningGrass]: { char: '"', fg: "#ff6600", bg: "#1a0a00" },
};

// Revealed trap styles (shown after stepping on)
const TRAP_REVEALED_STYLES: Partial<Record<Tile, TileStyle>> = {
  [Tile.TrapSpike]: { char: "^", fg: "#e74c3c", bg: "#0c0c18" },
  [Tile.TrapTeleport]: { char: "^", fg: "#9b59b6", bg: "#0c0c18" },
  [Tile.TrapAlarm]: { char: "^", fg: "#f39c12", bg: "#0c0c18" },
};

function applyAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function dimColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${(r * factor) | 0},${(g * factor) | 0},${(b * factor) | 0})`;
}

export function initCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = CANVAS_W + "px";
  canvas.style.height = CANVAS_H + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return ctx;
}

export let showHelp = false;
export let helpPage = 0;

export function toggleHelp() {
  showHelp = !showHelp;
  helpPage = 0;
}

export function nextHelpPage() {
  helpPage = helpPage === 0 ? 1 : 0;
}

export function render(ctx: CanvasRenderingContext2D, game: GameState) {
  overlayHitAreas = [];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // --- Map ---
  ctx.font = GLYPH_FONT;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = game.cells[y][x];
      if (!cell.revealed) continue;

      const revealedTrap = cell.trapRevealed && TRAP_REVEALED_STYLES[cell.tile];
      const style = revealedTrap || TILE_STYLES[cell.tile];
      const dim = cell.visible ? 1.0 : 0.3;

      ctx.fillStyle = dimColor(style.bg, dim);
      ctx.fillRect(MAP_OX + x * CELL_W, y * CELL_H, CELL_W, CELL_H);

      ctx.fillStyle = dimColor(style.fg, dim);
      ctx.fillText(style.char, MAP_OX + x * CELL_W + CELL_W / 2, y * CELL_H + 2);
    }
  }

  // Flash overlays
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!game.cells[y][x].visible) continue;
      const flash = game.animations.getFlash(x, y);
      if (flash) {
        ctx.fillStyle = applyAlpha(flash.color, flash.alpha * 0.5);
        ctx.fillRect(MAP_OX + x * CELL_W, y * CELL_H, CELL_W, CELL_H);
      }
    }
  }

  // Items
  for (const item of game.items) {
    if (game.cells[item.y][item.x].visible) {
      ctx.fillStyle = item.color;
      ctx.fillText(item.char, MAP_OX + item.x * CELL_W + CELL_W / 2, item.y * CELL_H + 2);
    }
  }

  // Monsters (with animation interpolation)
  for (const m of game.monsters) {
    if (game.cells[m.y][m.x].visible) {
      const [rx, ry] = game.animations.getPosition(m.x, m.y);
      ctx.fillStyle = m.color;
      ctx.fillText(m.char, MAP_OX + rx * CELL_W + CELL_W / 2, ry * CELL_H + 2);
    }
  }

  // Pet (with animation interpolation)
  if (game.petAlive && game.cells[game.pet.y][game.pet.x].visible) {
    const [rx, ry] = game.animations.getPosition(game.pet.x, game.pet.y);
    ctx.fillStyle = game.pet.color;
    ctx.fillText(game.pet.char, MAP_OX + rx * CELL_W + CELL_W / 2, ry * CELL_H + 2);
  }

  // Player (with animation interpolation)
  {
    const [rx, ry] = game.animations.getPosition(game.player.x, game.player.y);
    ctx.fillStyle = game.player.color;
    ctx.fillText(game.player.char, MAP_OX + rx * CELL_W + CELL_W / 2, ry * CELL_H + 2);
  }

  // Cleanup expired animations
  game.animations.cleanup();

  // --- Bottom panel (messages + stats) ---
  renderPanel(ctx, game);

  // --- Minimap (top-right corner) ---
  if (game.showMinimap) {
    renderMinimap(ctx, game);
  }

  // --- Inventory overlay ---
  if (game.showInventory) {
    renderInventory(ctx, game);
    return;
  }

  // --- Help overlay ---
  if (showHelp) {
    renderHelp(ctx);
    return;
  }

  // --- Level up overlay ---
  if (game.pendingLevelUp) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, CANVAS_W, MAP_H_PX);

    ctx.font = TITLE_FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd700";
    ctx.fillText(t("levelUp")(game.level), CANVAS_W / 2, MAP_H_PX / 2 - 20);

    ctx.font = SUB_FONT;
    ctx.fillStyle = "#ccc";
    ctx.fillText("1: +5 HP   2: +1 ATK   3: +1 DEF", CANVAS_W / 2, MAP_H_PX / 2 + 16);

    // Touch hit areas for level-up choices
    const luY = MAP_H_PX / 2 + 4;
    const luW = 120;
    const luH = 24;
    overlayHitAreas.push({ x: CANVAS_W / 2 - 180, y: luY, w: luW, h: luH, action: "levelup", data: 0 });
    overlayHitAreas.push({ x: CANVAS_W / 2 - 50, y: luY, w: luW, h: luH, action: "levelup", data: 1 });
    overlayHitAreas.push({ x: CANVAS_W / 2 + 80, y: luY, w: luW, h: luH, action: "levelup", data: 2 });
    return;
  }

  // --- Game over overlay ---
  if (game.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, CANVAS_W, MAP_H_PX);

    ctx.font = TITLE_FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = game.won ? "#ffd700" : "#e74c3c";
    ctx.fillText(game.won ? t("youWin") : t("youDiedTitle"), CANVAS_W / 2, 60);

    // Stats
    ctx.font = SUB_FONT;
    ctx.fillStyle = "#ccc";
    const statsY = 100;
    ctx.fillText(`${t("depth")}: ${game.depth}  ${t("lvLabel")}: ${game.level}  ${t("turn")}: ${game.turnCount}  ${t("killsLabel")}: ${game.kills}`, CANVAS_W / 2, statsY);

    // Leaderboard
    const lb = getLeaderboard();
    if (lb.length > 0) {
      ctx.fillStyle = "#ffd700";
      ctx.fillText(t("leaderboard"), CANVAS_W / 2, statsY + 36);
      ctx.font = UI_FONT;
      ctx.fillStyle = "#aaa";
      for (let i = 0; i < Math.min(lb.length, 5); i++) {
        const e = lb[i];
        const status = e.won ? "WIN" : "DIED";
        ctx.fillText(
          `${i + 1}. ${status} D:${e.depth} Lv:${e.level} T:${e.turns} K:${e.kills}`,
          CANVAS_W / 2, statsY + 56 + i * 18
        );
      }
    }

    ctx.font = SUB_FONT;
    ctx.fillStyle = "#888";
    ctx.fillText(t("pressR"), CANVAS_W / 2, MAP_H_PX - 30);

    // Touch hit area: tap anywhere in the overlay to restart
    overlayHitAreas.push({ x: 0, y: 0, w: CANVAS_W, h: MAP_H_PX, action: "restart" });
  }
}

/** Draw text with dark shadow so it's readable on any bar color */
function barLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = "#000";
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  cur: number, max: number,
  colorHigh: string, colorMid: string, colorLow: string
) {
  ctx.fillStyle = "#1a0a0a";
  ctx.fillRect(x, y, w, h);
  const frac = Math.max(0, cur / max);
  const color = frac > 0.6 ? colorHigh : frac > 0.3 ? colorMid : colorLow;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * frac, h);
}

function renderHelp(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const boxW = 440;
  const boxH = 420;
  const bx = (CANVAS_W - boxW) / 2;
  const by = (CANVAS_H - boxH) / 2;

  ctx.fillStyle = "#0e0e1a";
  ctx.strokeStyle = "#4a4a6a";
  ctx.lineWidth = 2;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeRect(bx, by, boxW, boxH);

  const pageLabel = helpPage === 0 ? t("helpPageControls") : t("helpPageSymbols");
  ctx.font = TITLE_FONT;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700";
  ctx.fillText(`${t("helpTitle")} - ${pageLabel}`, CANVAS_W / 2, by + 18);

  const contentY = by + 52;

  if (helpPage === 0) {
    const lines: readonly string[] = t("helpControls");
    ctx.font = UI_FONT;
    ctx.textAlign = "left";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = lines[i] === "" ? "transparent" : "#ccc";
      ctx.fillText(lines[i], bx + 24, contentY + i * 20);
    }
  } else {
    const symbols: readonly { char: string; color: string; desc: string }[] = t("helpSymbols");
    const col1X = bx + 24;
    const col2X = bx + boxW / 2 + 10;
    const half = Math.ceil(symbols.length / 2);

    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      const x = i < half ? col1X : col2X;
      const row = i < half ? i : i - half;
      const sy = contentY + row * 24;

      ctx.font = '16px monospace';
      ctx.textAlign = "left";
      ctx.fillStyle = s.color;
      ctx.fillText(s.char, x, sy);

      ctx.font = UI_FONT;
      ctx.fillStyle = "#bbb";
      ctx.fillText(s.desc, x + 20, sy);
    }
  }

  ctx.font = SUB_FONT;
  ctx.textAlign = "center";
  ctx.fillStyle = "#666";
  ctx.fillText(t("helpClose"), CANVAS_W / 2, by + boxH - 16);

  // Touch hit areas: tap left half to close, right half to switch page
  overlayHitAreas.push({ x: bx, y: by, w: boxW / 2, h: boxH, action: "helpClose" });
  overlayHitAreas.push({ x: bx + boxW / 2, y: by, w: boxW / 2, h: boxH, action: "helpPage" });
}

function renderInventory(ctx: CanvasRenderingContext2D, game: GameState) {
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const boxW = 400;
  const boxH = 380;
  const bx = (CANVAS_W - boxW) / 2;
  const by = (CANVAS_H - boxH) / 2;

  ctx.fillStyle = "#0e0e1a";
  ctx.strokeStyle = "#4a4a6a";
  ctx.lineWidth = 2;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeRect(bx, by, boxW, boxH);

  // Title
  ctx.font = TITLE_FONT;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700";
  ctx.fillText(t("inventoryTitle"), CANVAS_W / 2, by + 18);

  let curY = by + 52;

  // Equipped items
  ctx.font = UI_FONT;
  ctx.textAlign = "left";
  ctx.fillStyle = "#aaa";
  ctx.fillText(`[${t("equipped")}]`, bx + 20, curY);
  curY += 20;

  const wep = game.inventory.equipped.weapon;
  const arm = game.inventory.equipped.armor;

  ctx.fillStyle = wep ? (wep.enchantment ? ENCHANT_COLORS[wep.enchantment.type] : "#ccc") : "#555";
  const wepName = wep ? game.getItemDisplayName(wep) : "";
  const wepDur = wep?.durability !== undefined ? ` [${wep.durability}/${wep.maxDurability}]` : "";
  const wepText = wep ? `${wep.char} ${wepName} (+${wep.value} ${t("atk")})${wepDur}` : `- (${t("atk")}: none)`;
  ctx.fillText(`  ${t("atk")}: ${wepText}`, bx + 20, curY);
  curY += 18;

  ctx.fillStyle = arm ? (arm.enchantment ? ENCHANT_COLORS[arm.enchantment.type] : "#ccc") : "#555";
  const armName = arm ? game.getItemDisplayName(arm) : "";
  const armDur = arm?.durability !== undefined ? ` [${arm.durability}/${arm.maxDurability}]` : "";
  const armText = arm ? `${arm.char} ${armName} (+${arm.value} ${t("def")})${armDur}` : `- (${t("def")}: none)`;
  ctx.fillText(`  ${t("def")}: ${armText}`, bx + 20, curY);
  curY += 24;

  // Backpack
  ctx.fillStyle = "#aaa";
  ctx.fillText(`[${t("inventoryTitle")} ${game.inventory.items.length}/8]`, bx + 20, curY);
  curY += 20;

  if (game.inventory.items.length === 0) {
    ctx.fillStyle = "#555";
    ctx.fillText(`  ${t("emptyInventory")}`, bx + 20, curY);
  } else {
    for (let i = 0; i < game.inventory.items.length; i++) {
      const item = game.inventory.items[i];
      const selected = i === game.inventoryCursor;

      if (selected) {
        ctx.fillStyle = "rgba(255,215,0,0.15)";
        ctx.fillRect(bx + 16, curY - 4, boxW - 32, 20);
      }

      ctx.font = '14px monospace';
      ctx.fillStyle = item.color;
      ctx.fillText(item.char, bx + 24, curY);

      ctx.font = UI_FONT;
      ctx.fillStyle = selected ? "#ffd700" : "#ccc";
      let label = game.getItemDisplayName(item);
      if (item.type === "equipment" && item.durability !== undefined && item.maxDurability) {
        const frac = item.durability / item.maxDurability;
        const durColor = frac > 0.5 ? "#2ecc71" : frac > 0.25 ? "#f39c12" : "#e74c3c";
        const durText = ` [${item.durability}/${item.maxDurability}]`;
        // Draw base name, then durability in color
        ctx.fillText(label, bx + 42, curY);
        const baseWidth = ctx.measureText(label).width;
        ctx.fillStyle = durColor;
        ctx.fillText(durText, bx + 42 + baseWidth, curY);
        curY += 20;
        continue;
      }
      const identified = game.identifiedTypes.has(item.nameId);
      if (item.type === "potion" && identified && item.nameId === "health potion") label += ` (+${item.value} HP)`;
      if (item.type === "potion" && identified && item.nameId === "potion of strength") label += ` (+${item.value} ATK)`;
      if (item.type === "food") label += ` (+${item.value})`;
      if (item.type === "throwing") label += ` (${item.value} dmg)`;
      ctx.fillText(label, bx + 42, curY);

      curY += 20;
    }
  }

  // Hint
  ctx.font = SUB_FONT;
  ctx.textAlign = "center";
  ctx.fillStyle = "#666";
  ctx.fillText(t("inventoryHint"), CANVAS_W / 2, by + boxH - 16);

  // Touch hit areas for inventory items (use = tap left 2/3, drop = tap right 1/3)
  if (game.inventory.items.length > 0) {
    const itemStartY = by + 114; // approximate start of item list
    for (let i = 0; i < game.inventory.items.length; i++) {
      const iy = itemStartY + i * 20 - 4;
      overlayHitAreas.push({ x: bx + 16, y: iy, w: (boxW - 32) * 0.67, h: 20, action: "invUse", data: i });
      overlayHitAreas.push({ x: bx + 16 + (boxW - 32) * 0.67, y: iy, w: (boxW - 32) * 0.33, h: 20, action: "invDrop", data: i });
    }
  }
  // Tap outside items to close
  overlayHitAreas.push({ x: bx, y: by + boxH - 30, w: boxW, h: 30, action: "invClose" });
}

function renderPanel(ctx: CanvasRenderingContext2D, game: GameState) {
  // Background
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, PANEL_Y, CANVAS_W, PANEL_H);
  // Top separator
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, PANEL_Y, CANVAS_W, 1);
  // Vertical divider
  ctx.fillRect(STATS_X, PANEL_Y, 1, PANEL_H);

  // --- Messages (left side) ---
  const msgLineH = 15;
  const maxVisible = 4;
  const msgs = game.messages.slice(-maxVisible);

  ctx.font = MSG_FONT;
  ctx.textAlign = "left";
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const age = msgs.length - 1 - i;
    const alpha = age === 0 ? 1.0 : Math.max(0.35, 1.0 - age * 0.18);
    const baseColor = MSG_COLORS[msg.type] || "#dddceb";
    ctx.fillStyle = applyAlpha(baseColor, alpha);
    const suffix = msg.count > 1 ? ` x${msg.count}` : "";
    ctx.fillText(msg.text + suffix, 10, PANEL_Y + 6 + i * msgLineH + 2);
  }

  // --- Stats (right side) ---
  const sx = STATS_X + 8;
  const row1Y = PANEL_Y + 8;
  const row2Y = PANEL_Y + 28;
  const hpBarH = 12;

  // Row 1: HP + Pet + Hunger bars
  const hpBarW = 130;
  drawBar(ctx, sx, row1Y, hpBarW, hpBarH, game.player.hp, game.player.maxHp, "#2ecc71", "#f39c12", "#e74c3c");
  ctx.font = UI_FONT;
  ctx.textAlign = "left";
  barLabel(ctx, `${t("hp")}:${game.player.hp}/${game.player.maxHp}`, sx + 3, row1Y - 1);

  let nextX = sx + hpBarW + 8;
  if (game.petAlive) {
    const petBarW = 80;
    drawBar(ctx, nextX, row1Y, petBarW, hpBarH, game.pet.hp, game.pet.maxHp, "#f4a460", "#cd853f", "#a0522d");
    barLabel(ctx, `d:${game.pet.hp}/${game.pet.maxHp}`, nextX + 3, row1Y - 1);
    nextX += petBarW + 8;
  }

  const hungerBarW = 55;
  drawBar(ctx, nextX, row1Y, hungerBarW, hpBarH, game.hunger, game.maxHunger, "#cd853f", "#a0522d", "#8b0000");
  barLabel(ctx, `${t("hunger")}:${game.hunger}`, nextX + 3, row1Y - 1);

  // Row 2: Level, XP, Atk, Def, Depth + status icons + hints
  const effAtk = game.getEffectiveAttack();
  const effDef = game.getEffectiveDefense();
  ctx.font = UI_FONT;
  ctx.fillStyle = "#999";
  ctx.textAlign = "left";
  ctx.fillText(
    `${t("lvLabel")}:${game.level} ${t("xpLabel")}:${game.xp}/${game.xpToNext} ${t("atk")}:${effAtk} ${t("def")}:${effDef} ${t("depth")}:${game.depth} $:${game.gold}`,
    sx, row2Y
  );

  const statusIcons = game.statusMgr.getIcons();
  if (statusIcons.length > 0) {
    let iconX = sx + 230;
    for (const si of statusIcons) {
      ctx.fillStyle = si.color;
      ctx.fillText(si.icon, iconX, row2Y);
      iconX += 30;
    }
  }

  // Abilities row (row 3)
  if (game.abilities.length > 0) {
    const row3Y = PANEL_Y + 46;
    ctx.font = UI_FONT;
    ctx.textAlign = "left";
    const abilityLabels: Record<string, string> = { dash: "1:Dash", shield_bash: "2:Bash", battle_cry: "3:Cry" };
    let abX = sx;
    for (const ab of game.abilities) {
      const cd = game.abilityCooldowns[ab] ?? 0;
      ctx.fillStyle = cd > 0 ? "#555" : "#66ccff";
      const label = cd > 0 ? `${abilityLabels[ab]}(${cd})` : abilityLabels[ab];
      ctx.fillText(label, abX, row3Y);
      abX += 75;
    }
  }

  // Hints (right-aligned)
  ctx.fillStyle = "#444";
  ctx.textAlign = "right";
  ctx.fillText(`?:${t("helpTitle")}  ${t("langToggle")}`, CANVAS_W - 8, row2Y);

  // Buy confirmation touch areas
  if (game.pendingBuy) {
    overlayHitAreas.push({ x: 0, y: PANEL_Y, w: CANVAS_W / 2, h: PANEL_H, action: "buyYes" });
    overlayHitAreas.push({ x: CANVAS_W / 2, y: PANEL_Y, w: CANVAS_W / 2, h: PANEL_H, action: "buyNo" });
  }
}

function renderMinimap(ctx: CanvasRenderingContext2D, game: GameState) {
  const mmW = 160;
  const mmH = 60;
  const mmX = CANVAS_W - mmW - 4;
  const mmY = 4;
  const cellW = mmW / MAP_W;
  const cellH = mmH / MAP_H;

  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = game.cells[y][x];
      if (!cell.revealed) continue;

      let color: string;
      if (cell.tile === Tile.Wall) color = "#333";
      else if (cell.tile === Tile.StairsDown || cell.tile === Tile.StairsUp) color = "#fff";
      else if (cell.tile === Tile.Water || cell.tile === Tile.DeepWater) color = "#246";
      else if (cell.tile === Tile.Lava) color = "#630";
      else if (cell.tile === Tile.BurningGrass) color = "#630";
      else color = "#1a1a2e";

      ctx.fillStyle = color;
      ctx.fillRect(mmX + x * cellW, mmY + y * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  // Player position
  ctx.fillStyle = "#ffd700";
  ctx.fillRect(mmX + game.player.x * cellW - 1, mmY + game.player.y * cellH - 1, 3, 3);

  // Stairs position
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (game.cells[y][x].revealed && (game.cells[y][x].tile === Tile.StairsDown || game.cells[y][x].tile === Tile.StairsUp)) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(mmX + x * cellW - 1, mmY + y * cellH - 1, 3, 3);
      }
    }
  }
}
