import { Game, W, H } from './game';
import { HitArea } from './types';
import { renderPlayerSelect, renderTitle, renderStageIntro, renderModuleResult, renderStageResult, renderJournal } from './render-ui';
import { renderWorld } from './render-world';
import { renderModule } from './render-module';

export function render(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  ctx.clearRect(0, 0, W, H);

  let hitAreas: HitArea[] = [];

  switch (game.screen) {
    case 'player_select':
      hitAreas = renderPlayerSelect(ctx, game);
      break;
    case 'title':
      hitAreas = renderTitle(ctx, game);
      break;
    case 'world':
      hitAreas = renderWorld(ctx, game);
      break;
    case 'stage_intro':
      hitAreas = renderStageIntro(ctx, game);
      break;
    case 'gameplay':
      hitAreas = renderModule(ctx, game);
      break;
    case 'module_result':
      hitAreas = renderModuleResult(ctx, game);
      break;
    case 'stage_result':
      hitAreas = renderStageResult(ctx, game);
      break;
    case 'journal':
      hitAreas = renderJournal(ctx, game);
      break;
  }

  // Render animations on top
  game.anim.render(ctx);

  return hitAreas;
}

// ── Shared Drawing Helpers ──

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  text: string, color = '#4A90D9', textColor = '#FFFFFF', fontSize = 18,
): void {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  roundRect(ctx, x + 2, y + 2, w, h, 8);
  ctx.fill();

  // Button body
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, x, y, w, h / 2, 8);
  ctx.fill();

  // Text
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  bgColor = '#F5F0E8', borderColor = '#D4C5A0',
): void {
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();
}

export function drawSmallStar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, filled: boolean,
): void {
  ctx.fillStyle = filled ? '#FFD700' : '#CCC';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const ox = x + Math.cos(angle) * r;
    const oy = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    const ia = angle + Math.PI / 5;
    ctx.lineTo(x + Math.cos(ia) * r * 0.4, y + Math.sin(ia) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  progress: number, color = '#4CAF50', bgColor = '#E0E0E0',
): void {
  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  // Fill
  if (progress > 0) {
    const fw = Math.max(h, w * Math.min(1, progress));
    ctx.fillStyle = color;
    roundRect(ctx, x, y, fw, h, h / 2);
    ctx.fill();
  }
}

export function drawTag(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  text: string, color = '#4A90D9',
): void {
  ctx.font = '12px sans-serif';
  const tw = ctx.measureText(text).width + 12;
  ctx.fillStyle = color + '22';
  roundRect(ctx, x, y, tw, 22, 4);
  ctx.fill();
  ctx.strokeStyle = color + '66';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, tw, 22, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + tw / 2, y + 11);
}
