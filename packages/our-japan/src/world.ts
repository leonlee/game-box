import { BuildingStage, BuildingSite } from './types';

const BLOCK = 16;

// Block color palette (Minecraft-inspired)
const COLORS = {
  // Terrain
  grass_top: '#5D8A3C',
  grass_side: '#6B4226',
  dirt: '#8B6914',
  stone: '#808080',
  deepStone: '#606060',
  bedrock: '#333333',
  water: '#3399CC',

  // Building materials
  wood_plank: '#C19A6B',
  wood_log: '#6B4226',
  cobblestone: '#999999',
  brick: '#B5482A',
  roof_tile: '#8B0000',
  roof_dark: '#6B0000',
  glass: '#ADD8E6',
  door: '#8B6914',
  door_handle: '#FFD700',
  lantern_body: '#FFD700',
  lantern_glow: '#FFAA00',

  // Decoration
  signpost: '#C19A6B',
  sign_text: '#333',
  flag_pole: '#666',
  flag_red: '#FF4444',
  cherry_blossom: '#FFB7C5',
  flower_red: '#FF4444',
  flower_yellow: '#FFD700',
};

export function drawBlock(ctx: CanvasRenderingContext2D, gx: number, gy: number, color: string, scrollX: number): void {
  const px = gx * BLOCK - scrollX;
  const py = gy * BLOCK;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, BLOCK, BLOCK);
}

export function drawBlockWithBorder(ctx: CanvasRenderingContext2D, gx: number, gy: number, color: string, borderColor: string, scrollX: number): void {
  const px = gx * BLOCK - scrollX;
  const py = gy * BLOCK;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, BLOCK, BLOCK);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, BLOCK - 1, BLOCK - 1);
}

// Draw terrain
export function drawTerrain(ctx: CanvasRenderingContext2D, scrollX: number, groundRow: number): void {
  const startCol = Math.floor(scrollX / BLOCK);
  const endCol = startCol + Math.ceil(960 / BLOCK) + 1;

  for (let gx = startCol; gx <= Math.min(endCol, 119); gx++) {
    // Grass top layer
    drawBlockWithBorder(ctx, gx, groundRow, COLORS.grass_top, '#4A7A2C', scrollX);

    // Dirt layers
    for (let dy = 1; dy <= 3; dy++) {
      drawBlockWithBorder(ctx, gx, groundRow + dy, COLORS.dirt, '#7A5A10', scrollX);
    }

    // Stone layers
    for (let dy = 4; dy <= 7; dy++) {
      drawBlockWithBorder(ctx, gx, groundRow + dy, COLORS.stone, '#707070', scrollX);
    }

    // Deep stone
    for (let dy = 8; dy <= 10; dy++) {
      drawBlockWithBorder(ctx, gx, groundRow + dy, COLORS.deepStone, '#505050', scrollX);
    }
  }

  // Occasional flowers on grass
  for (let gx = startCol; gx <= Math.min(endCol, 119); gx++) {
    if ((gx * 7 + 3) % 13 === 0) {
      const px = gx * BLOCK - scrollX + 4;
      const py = (groundRow - 1) * BLOCK + 10;
      ctx.fillStyle = (gx * 11) % 3 === 0 ? COLORS.flower_red : COLORS.flower_yellow;
      ctx.fillRect(px + 2, py, 3, 3);
      ctx.fillStyle = '#4A7A2C';
      ctx.fillRect(px + 3, py + 3, 1, 4);
    }
  }
}

// Draw a building at its various stages
export function drawBuilding(ctx: CanvasRenderingContext2D, site: BuildingSite, scrollX: number, groundRow: number): void {
  const bx = site.gridX;
  const by = groundRow;

  switch (site.stage) {
    case 'empty':
      drawSignpost(ctx, bx, by, scrollX, site.lessonId);
      break;
    case 'foundation':
      drawSignpost(ctx, bx - 1, by, scrollX, site.lessonId);
      drawFoundation(ctx, bx, by, scrollX);
      break;
    case 'walls':
      drawFoundation(ctx, bx, by, scrollX);
      drawWalls(ctx, bx, by, scrollX);
      break;
    case 'roof':
      drawFoundation(ctx, bx, by, scrollX);
      drawWalls(ctx, bx, by, scrollX);
      drawRoof(ctx, bx, by, scrollX);
      break;
    case 'decorated':
      drawFoundation(ctx, bx, by, scrollX);
      drawWalls(ctx, bx, by, scrollX);
      drawRoof(ctx, bx, by, scrollX);
      drawDecorations(ctx, bx, by, scrollX);
      break;
    case 'flag':
      drawFoundation(ctx, bx, by, scrollX);
      drawWalls(ctx, bx, by, scrollX);
      drawRoof(ctx, bx, by, scrollX);
      drawDecorations(ctx, bx, by, scrollX);
      drawFlag(ctx, bx, by, scrollX);
      break;
  }
}

function drawSignpost(ctx: CanvasRenderingContext2D, gx: number, groundRow: number, scrollX: number, lessonId: number): void {
  const px = gx * BLOCK - scrollX;
  const py = (groundRow - 2) * BLOCK;

  // Post
  ctx.fillStyle = COLORS.wood_log;
  ctx.fillRect(px + 6, py, 4, BLOCK * 2);

  // Sign board
  ctx.fillStyle = COLORS.signpost;
  ctx.fillRect(px - 4, py - 2, 24, 14);
  ctx.strokeStyle = COLORS.wood_log;
  ctx.lineWidth = 1;
  ctx.strokeRect(px - 4, py - 2, 24, 14);

  // Text
  ctx.fillStyle = COLORS.sign_text;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`L${lessonId}`, px + 8, py + 5);
}

function drawFoundation(ctx: CanvasRenderingContext2D, gx: number, groundRow: number, scrollX: number): void {
  // 5 blocks wide foundation
  for (let dx = 0; dx < 5; dx++) {
    drawBlockWithBorder(ctx, gx + dx, groundRow - 1, COLORS.cobblestone, '#888888', scrollX);
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, gx: number, groundRow: number, scrollX: number): void {
  // 3 rows of wood planks, 5 blocks wide
  for (let dy = 2; dy <= 4; dy++) {
    for (let dx = 0; dx < 5; dx++) {
      // Corners are logs
      if (dx === 0 || dx === 4) {
        drawBlockWithBorder(ctx, gx + dx, groundRow - dy, COLORS.wood_log, '#5A3520', scrollX);
      } else {
        drawBlockWithBorder(ctx, gx + dx, groundRow - dy, COLORS.wood_plank, '#A88A5B', scrollX);
      }
    }
  }
}

function drawRoof(ctx: CanvasRenderingContext2D, gx: number, groundRow: number, scrollX: number): void {
  // Triangular roof: wider at base, narrower at top
  // Row 1 (bottom of roof): 7 blocks (overhangs by 1 on each side)
  for (let dx = -1; dx <= 5; dx++) {
    drawBlockWithBorder(ctx, gx + dx, groundRow - 5, COLORS.roof_tile, COLORS.roof_dark, scrollX);
  }
  // Row 2: 5 blocks
  for (let dx = 0; dx <= 4; dx++) {
    drawBlockWithBorder(ctx, gx + dx, groundRow - 6, COLORS.roof_tile, COLORS.roof_dark, scrollX);
  }
  // Row 3: 3 blocks
  for (let dx = 1; dx <= 3; dx++) {
    drawBlockWithBorder(ctx, gx + dx, groundRow - 7, COLORS.roof_tile, COLORS.roof_dark, scrollX);
  }
  // Top: 1 block
  drawBlockWithBorder(ctx, gx + 2, groundRow - 8, COLORS.roof_dark, '#500000', scrollX);
}

function drawDecorations(ctx: CanvasRenderingContext2D, gx: number, groundRow: number, scrollX: number): void {
  // Windows (replace middle wall blocks with glass)
  drawBlockWithBorder(ctx, gx + 1, groundRow - 3, COLORS.glass, '#8ABCD6', scrollX);
  drawBlockWithBorder(ctx, gx + 3, groundRow - 3, COLORS.glass, '#8ABCD6', scrollX);

  // Window cross pattern
  const drawWindowCross = (wx: number, wy: number) => {
    const px = wx * BLOCK - scrollX;
    const py = wy * BLOCK;
    ctx.strokeStyle = '#6A8A9A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + BLOCK / 2, py);
    ctx.lineTo(px + BLOCK / 2, py + BLOCK);
    ctx.moveTo(px, py + BLOCK / 2);
    ctx.lineTo(px + BLOCK, py + BLOCK / 2);
    ctx.stroke();
  };
  drawWindowCross(gx + 1, groundRow - 3);
  drawWindowCross(gx + 3, groundRow - 3);

  // Door
  drawBlockWithBorder(ctx, gx + 2, groundRow - 2, COLORS.door, '#7A5A10', scrollX);
  drawBlockWithBorder(ctx, gx + 2, groundRow - 3, COLORS.door, '#7A5A10', scrollX);
  // Door handle
  const dpx = (gx + 2) * BLOCK - scrollX;
  const dpy = (groundRow - 2) * BLOCK;
  ctx.fillStyle = COLORS.door_handle;
  ctx.fillRect(dpx + 10, dpy + 6, 3, 3);

  // Lantern
  const lpx = (gx - 1) * BLOCK - scrollX;
  const lpy = (groundRow - 3) * BLOCK;
  ctx.fillStyle = COLORS.lantern_body;
  ctx.fillRect(lpx + 4, lpy + 2, 8, 10);
  ctx.fillStyle = COLORS.lantern_glow;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(lpx + 8, lpy + 7, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#333';
  ctx.fillRect(lpx + 5, lpy, 6, 3);
  ctx.fillRect(lpx + 5, lpy + 11, 6, 2);
}

function drawFlag(ctx: CanvasRenderingContext2D, gx: number, groundRow: number, scrollX: number): void {
  // Flag pole on roof top
  const px = (gx + 2) * BLOCK - scrollX + 7;
  const py = (groundRow - 8) * BLOCK;

  ctx.fillStyle = COLORS.flag_pole;
  ctx.fillRect(px, py - 20, 2, 20);

  // Flag
  ctx.fillStyle = COLORS.flag_red;
  ctx.beginPath();
  ctx.moveTo(px + 2, py - 20);
  ctx.lineTo(px + 16, py - 15);
  ctx.lineTo(px + 2, py - 10);
  ctx.closePath();
  ctx.fill();
}

// Draw cherry blossom particles (for completed buildings)
export function drawCherryBlossoms(ctx: CanvasRenderingContext2D, site: BuildingSite, scrollX: number, time: number): void {
  if (site.stage !== 'flag') return;
  const basePx = site.gridX * BLOCK - scrollX;
  for (let i = 0; i < 5; i++) {
    const t = (time * 0.5 + i * 1.3) % 4;
    const px = basePx + 20 + Math.sin(t * 2 + i) * 30;
    const py = (27 - 8) * BLOCK + t * 40;
    const alpha = Math.max(0, 1 - t / 4);
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = COLORS.cherry_blossom;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Get the click area for a building site
export function getBuildingHitArea(site: BuildingSite, scrollX: number, groundRow: number): { x: number; y: number; w: number; h: number } {
  const px = site.gridX * BLOCK - scrollX;
  const topRow = site.stage === 'empty' ? groundRow - 2 : groundRow - 8;
  return {
    x: px - BLOCK,
    y: topRow * BLOCK,
    w: 7 * BLOCK,
    h: (groundRow - topRow + 1) * BLOCK,
  };
}
