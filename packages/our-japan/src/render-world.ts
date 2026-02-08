import { Game, W, H } from './game';
import { HitArea } from './types';
import { drawTerrain, drawBuilding, drawCherryBlossoms, getBuildingHitArea } from './world';
import { isLessonUnlocked, getLessonProgress } from './content';
import { roundRect, drawSmallStar, drawProgressBar } from './render';
import { t } from './i18n';
import { lerp } from './util';

const BLOCK = 16;
const GROUND_ROW = 30;

export function renderWorld(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];
  const { scrollX, clouds } = game.world;
  const time = Date.now() / 1000;

  // ── Sky gradient ──
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_ROW * BLOCK);
  grad.addColorStop(0, '#5DADE2');
  grad.addColorStop(0.4, '#87CEEB');
  grad.addColorStop(0.8, '#B0E0E6');
  grad.addColorStop(1, '#C8E6C9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Background mountains (parallax) ──
  drawMountains(ctx, scrollX * 0.3, GROUND_ROW);

  // ── Clouds (parallax) ──
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const cloud of clouds) {
    const cx = cloud.x - scrollX * 0.5;
    if (cx > -cloud.width * 2 && cx < W + cloud.width) {
      drawCloud(ctx, cx, cloud.y, cloud.width);
    }
  }

  // ── Terrain ──
  drawTerrain(ctx, scrollX, GROUND_ROW);

  // ── Buildings ──
  for (const site of game.world.sites) {
    const px = site.gridX * BLOCK - scrollX;
    if (px > -8 * BLOCK && px < W + 2 * BLOCK) {
      drawBuilding(ctx, site, scrollX, GROUND_ROW);
      drawCherryBlossoms(ctx, site, scrollX, time);

      // Lesson label above building
      const labelX = (site.gridX + 2) * BLOCK - scrollX;
      const unlocked = isLessonUnlocked(site.lessonId, game.progress);

      if (unlocked) {
        // Lesson number bubble
        ctx.fillStyle = '#4A90D9';
        ctx.beginPath();
        ctx.arc(labelX, (GROUND_ROW - 10) * BLOCK, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${site.lessonId}`, labelX, (GROUND_ROW - 10) * BLOCK);

        // Stars below bubble
        const { completed, total } = getLessonProgress(site.lessonId, game.progress);
        const starY = (GROUND_ROW - 9) * BLOCK + 4;
        for (let s = 0; s < Math.min(4, total); s++) {
          drawSmallStar(ctx, labelX - 18 + s * 12, starY, 5, s < completed.length);
        }

        // Hit area
        const area = getBuildingHitArea(site, scrollX, GROUND_ROW);
        hitAreas.push({
          x: area.x,
          y: area.y,
          w: area.w,
          h: area.h,
          action: 'select_lesson',
          data: site.lessonId,
        });
      } else {
        // Lock icon
        ctx.fillStyle = '#888';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔒', labelX, (GROUND_ROW - 10) * BLOCK);
      }
    }
  }

  // ── HUD overlay ──
  drawWorldHUD(ctx, game);

  // ── Scroll arrows ──
  const maxScroll = Math.max(0, 120 * BLOCK - W);
  if (scrollX > 0) {
    drawScrollArrow(ctx, 20, H / 2, 'left');
    hitAreas.push({ x: 0, y: H / 2 - 30, w: 40, h: 60, action: 'scroll_left' });
  }
  if (scrollX < maxScroll) {
    drawScrollArrow(ctx, W - 20, H / 2, 'right');
    hitAreas.push({ x: W - 40, y: H / 2 - 30, w: 40, h: 60, action: 'scroll_right' });
  }

  // Back button
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, 15, 15, 80, 32, 6);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('back'), 55, 31);
  hitAreas.push({ x: 15, y: 15, w: 80, h: 32, action: 'go_title' });

  // Journal button
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, W - 95, 15, 80, 32, 6);
  ctx.fill();
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('journal'), W - 55, 31);
  hitAreas.push({ x: W - 95, y: 15, w: 80, h: 32, action: 'go_journal' });

  return hitAreas;
}

function drawMountains(ctx: CanvasRenderingContext2D, offsetX: number, groundRow: number): void {
  const baseY = groundRow * BLOCK;
  const mountainColor1 = '#7BA878';
  const mountainColor2 = '#6B9868';
  const mountainColor3 = '#8BB898';

  // Far mountains
  ctx.fillStyle = mountainColor3;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 4) {
    const h = Math.sin((x + offsetX * 0.3) * 0.008) * 60 +
              Math.sin((x + offsetX * 0.3) * 0.015) * 30 + 80;
    ctx.lineTo(x, baseY - h);
  }
  ctx.lineTo(W, baseY);
  ctx.closePath();
  ctx.fill();

  // Mid mountains
  ctx.fillStyle = mountainColor1;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 4) {
    const h = Math.sin((x + offsetX * 0.5) * 0.012) * 40 +
              Math.sin((x + offsetX * 0.5) * 0.02) * 25 + 55;
    ctx.lineTo(x, baseY - h);
  }
  ctx.lineTo(W, baseY);
  ctx.closePath();
  ctx.fill();

  // Near hills
  ctx.fillStyle = mountainColor2;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 4) {
    const h = Math.sin((x + offsetX * 0.7) * 0.018) * 25 +
              Math.sin((x + offsetX * 0.7) * 0.03) * 15 + 30;
    ctx.lineTo(x, baseY - h);
  }
  ctx.lineTo(W, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.beginPath();
  ctx.arc(x, y, w * 0.3, 0, Math.PI * 2);
  ctx.arc(x + w * 0.25, y - w * 0.15, w * 0.35, 0, Math.PI * 2);
  ctx.arc(x + w * 0.55, y, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawScrollArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 'left' | 'right'): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  if (dir === 'left') {
    ctx.moveTo(x + 15, y - 20);
    ctx.lineTo(x - 5, y);
    ctx.lineTo(x + 15, y + 20);
  } else {
    ctx.moveTo(x - 15, y - 20);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x - 15, y + 20);
  }
  ctx.closePath();
  ctx.fill();
}

function drawWorldHUD(ctx: CanvasRenderingContext2D, game: Game): void {
  // Player info bar at top center
  const barW = 300;
  const barX = (W - barW) / 2;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, barX, 10, barW, 40, 8);
  ctx.fill();

  const profile = game.store.profiles.find(p => p.id === game.store.activeId);
  if (profile) {
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(profile.name, barX + 15, 30);

    // XP bar
    const xpInLevel = game.progress.xp % 100;
    drawProgressBar(ctx, barX + 120, 22, 100, 10, xpInLevel / 100, '#FFD700', '#555');

    ctx.fillStyle = '#FFD700';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Lv.${game.progress.level}`, barX + 230, 30);

    // Streak
    if (game.progress.streak > 0) {
      ctx.fillStyle = '#FF6347';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`🔥${game.progress.streak}${t('days')}`, barX + barW - 10, 30);
    }
  }
}
