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
  [Tile.Web]: { char: "*", fg: "#ffffff", bg: "#0c0c18" },
  [Tile.Mushroom]: { char: "\u2663", fg: "#8b4513", bg: "#0c0c18" },
  [Tile.Stalactite]: { char: "^", fg: "#5a6a7a", bg: "#0c0c18" },
  [Tile.BoneFloor]: { char: ",", fg: "#888888", bg: "#0c0c18" },
};

// Revealed trap styles (shown after stepping on)
const TRAP_REVEALED_STYLES: Partial<Record<Tile, TileStyle>> = {
  [Tile.TrapSpike]: { char: "^", fg: "#e74c3c", bg: "#0c0c18" },
  [Tile.TrapTeleport]: { char: "^", fg: "#9b59b6", bg: "#0c0c18" },
  [Tile.TrapAlarm]: { char: "^", fg: "#f39c12", bg: "#0c0c18" },
};

function getZoneTileStyles(depth: number): Record<Tile, TileStyle> {
  const base = { ...TILE_STYLES };
  if (depth >= 4 && depth <= 6) {
    // Cavern zone: blue-gray walls
    base[Tile.Wall] = { char: "#", fg: "#3a4a5a", bg: "#0a1020" };
    base[Tile.Floor] = { char: "\u00B7", fg: "#1a2a3a", bg: "#080e18" };
  } else if (depth >= 7 && depth <= 9) {
    // Necropolis zone: dark red walls
    base[Tile.Wall] = { char: "#", fg: "#6a3030", bg: "#1a0808" };
    base[Tile.Floor] = { char: "\u00B7", fg: "#3a1a1a", bg: "#0e0606" };
  } else if (depth >= 10) {
    // Lich's Domain: purple-black walls
    base[Tile.Wall] = { char: "#", fg: "#5a3a6a", bg: "#100a16" };
    base[Tile.Floor] = { char: "\u00B7", fg: "#2a1a3a", bg: "#0a0610" };
  }
  return base;
}

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
  helpPage = (helpPage + 1) % 3;
}

export function render(ctx: CanvasRenderingContext2D, game: GameState) {
  overlayHitAreas = [];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // --- Map ---
  ctx.font = GLYPH_FONT;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  const zoneTiles = getZoneTileStyles(game.depth);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = game.cells[y][x];
      if (!cell.revealed) continue;

      const revealedTrap = cell.trapRevealed && TRAP_REVEALED_STYLES[cell.tile];
      const style = revealedTrap || zoneTiles[cell.tile];
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
      // Disguised mimics render as their fake item
      if (m.disguised && m.disguiseItem) {
        ctx.fillStyle = m.disguiseItem.color;
        ctx.fillText(m.disguiseItem.char, MAP_OX + m.x * CELL_W + CELL_W / 2, m.y * CELL_H + 2);
        continue;
      }
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

    const listW = 360;
    const rowH = 30;
    const listX = CANVAS_W / 2 - listW / 2;
    const listY = MAP_H_PX / 2 - 6;
    const labels = ["1  +5 HP", "2  +1 ATK", "3  +1 DEF"];

    for (let i = 0; i < labels.length; i++) {
      const y = listY + i * (rowH + 6);
      const selected = i === game.levelUpCursor;
      ctx.fillStyle = selected ? "rgba(255,215,0,0.18)" : "rgba(18,18,30,0.9)";
      ctx.fillRect(listX, y, listW, rowH);
      ctx.strokeStyle = selected ? "#ffd700" : "#555";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(listX, y, listW, rowH);

      ctx.font = UI_FONT;
      ctx.fillStyle = selected ? "#ffd700" : "#ccc";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[i], listX + 14, y + rowH / 2);

      // Touch: select level-up choice
      overlayHitAreas.push({ x: listX, y, w: listW, h: rowH, action: "levelupSelect", data: i });
    }

    const confirmW = 180;
    const confirmH = 28;
    const confirmX = CANVAS_W / 2 - confirmW / 2;
    const confirmY = listY + labels.length * (rowH + 6) + 4;
    ctx.fillStyle = "#2a3145";
    ctx.fillRect(confirmX, confirmY, confirmW, confirmH);
    ctx.strokeStyle = "#5f7ca8";
    ctx.lineWidth = 1;
    ctx.strokeRect(confirmX, confirmY, confirmW, confirmH);
    ctx.font = UI_FONT;
    ctx.fillStyle = "#d8e8ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("levelupConfirmBtn"), confirmX + confirmW / 2, confirmY + confirmH / 2);
    overlayHitAreas.push({ x: confirmX, y: confirmY, w: confirmW, h: confirmH, action: "levelupConfirm" });

    ctx.font = UI_FONT;
    ctx.fillStyle = "#999";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(t("levelupHint"), CANVAS_W / 2, confirmY + confirmH + 6);
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

  const pageLabel = helpPage === 0 ? t("helpPageControls") : helpPage === 1 ? t("helpPageSymbols") : t("helpPageSymbols") + " 2";
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
    const allSymbols: readonly { char: string; color: string; desc: string }[] = t("helpSymbols");
    const pageSize = 28; // max symbols per page (2 columns x 14 rows)
    const offset = helpPage === 1 ? 0 : pageSize;
    const symbols = allSymbols.slice(offset, offset + pageSize);
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

  const listStartY = curY;
  const rowH = 22;

  if (game.inventory.items.length === 0) {
    ctx.fillStyle = "#555";
    ctx.fillText(`  ${t("emptyInventory")}`, bx + 20, curY);
  } else {
    for (let i = 0; i < game.inventory.items.length; i++) {
      const item = game.inventory.items[i];
      const selected = i === game.inventoryCursor;
      const rowY = listStartY + i * rowH;

      if (selected) {
        ctx.fillStyle = "rgba(255,215,0,0.15)";
        ctx.fillRect(bx + 16, rowY - 5, boxW - 32, rowH - 2);
      }

      ctx.font = '14px monospace';
      ctx.fillStyle = item.color;
      ctx.fillText(item.char, bx + 24, rowY);

      ctx.font = UI_FONT;
      ctx.fillStyle = selected ? "#ffd700" : "#ccc";
      let label = game.getItemDisplayName(item);
      if (item.type === "equipment" && item.durability !== undefined && item.maxDurability) {
        const frac = item.durability / item.maxDurability;
        const durColor = frac > 0.5 ? "#2ecc71" : frac > 0.25 ? "#f39c12" : "#e74c3c";
        const durText = ` [${item.durability}/${item.maxDurability}]`;
        // Draw base name, then durability in color
        ctx.fillText(label, bx + 42, rowY);
        const baseWidth = ctx.measureText(label).width;
        ctx.fillStyle = durColor;
        ctx.fillText(durText, bx + 42 + baseWidth, rowY);
        continue;
      }
      const identified = game.identifiedTypes.has(item.nameId);
      if (item.type === "potion" && identified && item.nameId === "health potion") label += ` (+${item.value} HP)`;
      if (item.type === "potion" && identified && item.nameId === "potion of strength") label += ` (+${item.value} ATK)`;
      if (item.type === "food") label += ` (+${item.value})`;
      if (item.type === "throwing") label += ` (${item.value} dmg)`;
      ctx.fillText(label, bx + 42, rowY);
    }
  }

  // Action buttons (touch-friendly)
  const btnAreaX = bx + 20;
  const btnAreaW = boxW - 40;
  const btnGap = 8;
  const btnY = by + boxH - 54;
  const btnH = 24;
  const btnW = Math.floor((btnAreaW - btnGap * 2) / 3);
  const useX = btnAreaX;
  const dropX = useX + btnW + btnGap;
  const closeX = dropX + btnW + btnGap;

  const drawInvButton = (x: number, label: string, fill: string, border: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, btnY, btnW, btnH);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, btnY, btnW, btnH);
    ctx.font = UI_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ddd";
    ctx.fillText(label, x + btnW / 2, btnY + btnH / 2);
  };

  drawInvButton(useX, t("invUseBtn"), "#1a2538", "#3b5f8a");
  drawInvButton(dropX, t("invDropBtn"), "#321e24", "#8a3b4a");
  drawInvButton(closeX, t("invCloseBtn"), "#222", "#555");

  // Hint
  ctx.font = SUB_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#666";
  ctx.fillText(t("inventoryHint"), CANVAS_W / 2, by + boxH - 16);

  // Touch hit areas for selecting inventory rows
  if (game.inventory.items.length > 0) {
    for (let i = 0; i < game.inventory.items.length; i++) {
      const iy = listStartY + i * rowH - 5;
      overlayHitAreas.push({ x: bx + 16, y: iy, w: boxW - 32, h: rowH, action: "invSelect", data: i });
    }
  }

  // Touch hit areas for actions
  overlayHitAreas.push({ x: useX, y: btnY, w: btnW, h: btnH, action: "invUse" });
  overlayHitAreas.push({ x: dropX, y: btnY, w: btnW, h: btnH, action: "invDrop" });
  overlayHitAreas.push({ x: closeX, y: btnY, w: btnW, h: btnH, action: "invClose" });
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
    barLabel(ctx, `${game.pet.char}:${game.pet.hp}/${game.pet.maxHp}`, nextX + 3, row1Y - 1);
    nextX += petBarW + 8;

    // Pet command indicator
    ctx.font = UI_FONT;
    ctx.fillStyle = game.petCommand === "aggressive" ? "#e74c3c" : game.petCommand === "stay" ? "#3498db" : "#2ecc71";
    const cmdLabel = game.petCommand === "aggressive" ? "[A]" : game.petCommand === "stay" ? "[S]" : "[F]";
    ctx.fillText(cmdLabel, nextX, row1Y - 1);
    nextX += 24;
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
    ctx.fillStyle = "#66ccff";
    ctx.fillText("c:Pet", abX, row3Y);
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
      else if (cell.tile === Tile.Web) color = "#444";
      else if (cell.tile === Tile.BoneFloor) color = "#222";
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
