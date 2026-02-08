import { GameState, Screen } from './game';
import { KANA_GROUPS } from './kana';
import { t } from './i18n';
import { drawStar } from './animation';

export const W = 960;
export const H = 640;

export interface HitArea {
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
  data?: number;
  strData?: string;
}

const FONT_KANA = '"Hiragino Kaku Gothic Pro", "Noto Sans JP", "Yu Gothic", sans-serif';
const FONT_UI = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

// Colors
const COL_SKY = '#87CEEB';
const COL_SKY_DARK = '#5DADE2';
const COL_WHITE = '#FFFFFF';
const COL_CARD = '#FFFFFF';
const COL_CARD_BORDER = '#E0C068';
const COL_CARD_CORRECT = '#4CAF50';
const COL_CARD_INCORRECT = '#EF5350';
const COL_CARD_HOVER = '#FFF9E6';
const COL_GOLD = '#FFD700';
const COL_TEXT = '#333333';
const COL_TEXT_LIGHT = '#666666';
const COL_ACCENT = '#FF6B35';
const COL_GREEN = '#4CAF50';
const COL_BUTTON = '#FF6B35';
const COL_BUTTON_HOVER = '#FF8A5C';
const COL_LOCKED = '#AAAAAA';
const COL_PROGRESS_BG = '#DDD';
const COL_PROGRESS_FG = '#4CAF50';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, color = COL_BUTTON) {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  roundRect(ctx, x + 2, y + 3, w, h, 12);
  ctx.fill();

  // Button body
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  // Text
  ctx.fillStyle = COL_WHITE;
  ctx.font = `bold 24px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  glyph: string,
  state: 'normal' | 'correct' | 'incorrect' | 'reveal' = 'normal',
  shakeX = 0, shakeY = 0,
) {
  const dx = x + shakeX;
  const dy = y + shakeY;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  roundRect(ctx, dx + 3, dy + 4, w, h, 16);
  ctx.fill();

  // Card background
  let bgColor = COL_CARD;
  let borderColor = COL_CARD_BORDER;
  if (state === 'correct') { bgColor = '#E8F5E9'; borderColor = COL_CARD_CORRECT; }
  else if (state === 'incorrect') { bgColor = '#FFEBEE'; borderColor = COL_CARD_INCORRECT; }
  else if (state === 'reveal') { bgColor = '#E3F2FD'; borderColor = '#42A5F5'; }

  ctx.fillStyle = bgColor;
  roundRect(ctx, dx, dy, w, h, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  roundRect(ctx, dx, dy, w, h, 16);
  ctx.stroke();

  // Glyph
  ctx.fillStyle = COL_TEXT;
  ctx.font = `72px ${FONT_KANA}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, dx + w / 2, dy + h / 2);
}

function drawSmallStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, filled: boolean) {
  ctx.fillStyle = filled ? COL_GOLD : '#DDD';
  drawStar(ctx, x, y, size);
}

function drawSpeakerIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = COL_ACCENT;
  ctx.strokeStyle = COL_ACCENT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // Speaker body
  const s = size;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y - s * 0.2);
  ctx.lineTo(x - s * 0.1, y - s * 0.2);
  ctx.lineTo(x + s * 0.2, y - s * 0.4);
  ctx.lineTo(x + s * 0.2, y + s * 0.4);
  ctx.lineTo(x - s * 0.1, y + s * 0.2);
  ctx.lineTo(x - s * 0.3, y + s * 0.2);
  ctx.closePath();
  ctx.fill();

  // Sound waves
  ctx.beginPath();
  ctx.arc(x + s * 0.25, y, s * 0.25, -Math.PI * 0.35, Math.PI * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s * 0.25, y, s * 0.4, -Math.PI * 0.35, Math.PI * 0.35);
  ctx.stroke();
}

function drawCompanion(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, mood: string) {
  // Simple cute character — round body with face
  const r = size;

  // Body
  ctx.fillStyle = '#FFB74D';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#FF9800';
  ctx.beginPath();
  ctx.arc(x - r * 0.7, y - r * 0.7, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.7, y - r * 0.7, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#333';
  const eyeY = y - r * 0.15;
  ctx.beginPath();
  ctx.arc(x - r * 0.3, eyeY, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.3, eyeY, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, eyeY - r * 0.05, r * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.35, eyeY - r * 0.05, r * 0.04, 0, Math.PI * 2);
  ctx.fill();

  // Cheeks
  ctx.fillStyle = 'rgba(255, 138, 101, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.5, y + r * 0.1, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.5, y + r * 0.1, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth — changes with mood
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const mouthY = y + r * 0.3;
  if (mood === 'excited') {
    ctx.beginPath();
    ctx.arc(x, mouthY - r * 0.1, r * 0.2, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (mood === 'happy') {
    ctx.beginPath();
    ctx.arc(x, mouthY - r * 0.05, r * 0.15, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    // encouraging — slight smile
    ctx.beginPath();
    ctx.arc(x, mouthY, r * 0.1, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }
}

// ---- Screen renderers ----

function renderPlayerSelect(ctx: CanvasRenderingContext2D, game: GameState, hitAreas: HitArea[]) {
  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#E8F5E9');
  grad.addColorStop(1, '#B2DFDB');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  drawCloud(ctx, 120, 70, 50);
  drawCloud(ctx, 680, 100, 45);
  drawCloud(ctx, 850, 60, 35);

  // Title
  ctx.fillStyle = COL_TEXT;
  ctx.font = `bold 42px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('player_select'), W / 2, 70);

  // Player cards in a row
  const profiles = game.store.profiles;
  const cardW = 160;
  const cardH = 220;
  const cardGap = 24;
  const maxCards = profiles.length + 1; // +1 for the "+" card
  const totalCardsW = maxCards * cardW + (maxCards - 1) * cardGap;
  const startX = Math.max(40, (W - totalCardsW) / 2);
  const cardY = 170;

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const cx = startX + i * (cardW + cardGap);

    // Card shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    roundRect(ctx, cx + 3, cardY + 4, cardW, cardH, 16);
    ctx.fill();

    // Card background
    const isActive = p.id === game.store.activeId;
    ctx.fillStyle = isActive ? '#FFF9E6' : COL_WHITE;
    roundRect(ctx, cx, cardY, cardW, cardH, 16);
    ctx.fill();

    // Card border
    ctx.strokeStyle = isActive ? COL_GOLD : COL_CARD_BORDER;
    ctx.lineWidth = isActive ? 3 : 2;
    roundRect(ctx, cx, cardY, cardW, cardH, 16);
    ctx.stroke();

    // Companion avatar
    drawCompanion(ctx, cx + cardW / 2, cardY + 60, 30, p.progress.companion?.mood ?? 'happy');

    // Player name
    ctx.fillStyle = COL_TEXT;
    ctx.font = `bold 20px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, cx + cardW / 2, cardY + 115);

    // Level indicator
    const lvl = p.progress.currentLevel ?? 0;
    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `16px ${FONT_UI}`;
    ctx.fillText(`Lv.${p.progress.companion?.level ?? 1}`, cx + cardW / 2, cardY + 145);

    // Sticker count
    const stickers = p.progress.stickers ?? 0;
    if (stickers > 0) {
      ctx.fillStyle = COL_GOLD;
      ctx.font = `16px ${FONT_UI}`;
      ctx.fillText(`贴纸 ${stickers}`, cx + cardW / 2, cardY + 170);
    }

    // Stars count
    const totalStars = Object.values(p.progress.stars ?? {}).reduce((a: number, b: number) => a + b, 0);
    if (totalStars > 0) {
      ctx.fillStyle = COL_GOLD;
      drawStar(ctx, cx + cardW / 2 - 20, cardY + 195, 8);
      ctx.fillStyle = COL_TEXT_LIGHT;
      ctx.font = `14px ${FONT_UI}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${totalStars}`, cx + cardW / 2 - 8, cardY + 195);
      ctx.textAlign = 'center';
    }

    // Select card hit area
    hitAreas.push({ x: cx, y: cardY, w: cardW, h: cardH, action: 'select_profile', strData: p.id });

    // Delete "x" button (top-right corner)
    const delSize = 24;
    const delX = cx + cardW - delSize - 4;
    const delY = cardY + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.arc(delX + delSize / 2, delY + delSize / 2, delSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL_WHITE;
    ctx.font = `bold 14px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', delX + delSize / 2, delY + delSize / 2);
    hitAreas.push({ x: delX, y: delY, w: delSize, h: delSize, action: 'confirm_delete', strData: p.id });
  }

  // "+" create new player card
  const plusX = startX + profiles.length * (cardW + cardGap);
  if (plusX + cardW <= W - 20) {
    // Card shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, plusX + 3, cardY + 4, cardW, cardH, 16);
    ctx.fill();

    // Dashed border card
    ctx.fillStyle = '#F5F5F5';
    roundRect(ctx, plusX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    roundRect(ctx, plusX, cardY, cardW, cardH, 16);
    ctx.stroke();
    ctx.setLineDash([]);

    // Plus icon
    ctx.fillStyle = '#BDBDBD';
    ctx.font = `bold 60px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', plusX + cardW / 2, cardY + cardH / 2 - 15);

    // Label
    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `18px ${FONT_UI}`;
    ctx.fillText(t('new_player'), plusX + cardW / 2, cardY + cardH / 2 + 35);

    hitAreas.push({ x: plusX, y: cardY, w: cardW, h: cardH, action: 'create_profile' });
  }

  // Delete confirmation overlay
  if (game.confirmDeleteId) {
    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);

    // Dialog box
    const dlgW = 400;
    const dlgH = 180;
    const dlgX = (W - dlgW) / 2;
    const dlgY = (H - dlgH) / 2;

    ctx.fillStyle = COL_WHITE;
    roundRect(ctx, dlgX, dlgY, dlgW, dlgH, 20);
    ctx.fill();
    ctx.strokeStyle = COL_CARD_BORDER;
    ctx.lineWidth = 2;
    roundRect(ctx, dlgX, dlgY, dlgW, dlgH, 20);
    ctx.stroke();

    // Message
    ctx.fillStyle = COL_TEXT;
    ctx.font = `bold 22px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('confirm_delete'), W / 2, dlgY + 55);

    // Buttons
    const btnW = 120;
    const btnH = 44;
    const btnGap = 30;

    // Cancel button
    const cancelX = W / 2 - btnW - btnGap / 2;
    const btnBaseY = dlgY + 115;
    drawButton(ctx, cancelX, btnBaseY, btnW, btnH, t('confirm_no'), '#78909C');
    hitAreas.push({ x: cancelX, y: btnBaseY, w: btnW, h: btnH, action: 'cancel_delete' });

    // Confirm button
    const confirmX = W / 2 + btnGap / 2;
    drawButton(ctx, confirmX, btnBaseY, btnW, btnH, t('confirm_yes'), COL_CARD_INCORRECT);
    hitAreas.push({ x: confirmX, y: btnBaseY, w: btnW, h: btnH, action: 'delete_profile', strData: game.confirmDeleteId });
  }
}

function renderTitle(ctx: CanvasRenderingContext2D, game: GameState, hitAreas: HitArea[]) {
  // Sky gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#87CEEB');
  grad.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  drawCloud(ctx, 100, 80, 60);
  drawCloud(ctx, 700, 120, 50);
  drawCloud(ctx, 400, 60, 45);

  // Title
  ctx.fillStyle = COL_WHITE;
  ctx.strokeStyle = COL_ACCENT;
  ctx.lineWidth = 4;
  ctx.font = `bold 52px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(t('title'), W / 2, 160);
  ctx.fillText(t('title'), W / 2, 160);

  // Active player name
  const playerName = game.activePlayerName;
  if (playerName) {
    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `22px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerName, W / 2, 205);
  }

  // Companion
  drawCompanion(ctx, W / 2, 320, 50, game.progress.companion.mood);

  // Companion level
  ctx.fillStyle = COL_TEXT_LIGHT;
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillText(`${t('companion_level')} ${game.progress.companion.level}`, W / 2, 390);

  // Start button
  const btnText = game.isNewGame ? t('start') : t('continue');
  const btnW = 240;
  const btnH = 56;
  const btnX = (W - btnW) / 2;
  const btnY = 430;
  drawButton(ctx, btnX, btnY, btnW, btnH, btnText);
  hitAreas.push({ x: btnX, y: btnY, w: btnW, h: btnH, action: 'start_game' });

  // Sticker count
  if (game.progress.stickers > 0) {
    ctx.fillStyle = COL_GOLD;
    ctx.font = `20px ${FONT_UI}`;
    ctx.fillText(`贴纸: ${game.progress.stickers}`, W / 2, 520);
  }

  // Switch player button
  const spW = 160;
  const spH = 40;
  const spX = (W - spW) / 2;
  const spY = 560;
  drawButton(ctx, spX, spY, spW, spH, t('switch_player'), '#78909C');
  hitAreas.push({ x: spX, y: spY, w: spW, h: spH, action: 'go_player_select' });
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.8, y - r * 0.2, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 1.4, y, r * 0.6, 0, Math.PI * 2);
  ctx.arc(x - r * 0.6, y + r * 0.1, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderLevelSelect(ctx: CanvasRenderingContext2D, game: GameState, hitAreas: HitArea[]) {
  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#B0E0E6');
  grad.addColorStop(1, '#98D8C8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = COL_TEXT;
  ctx.font = `bold 36px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('level_select'), W / 2, 40);

  // Back button
  const backW = 80;
  const backH = 40;
  drawButton(ctx, 20, 16, backW, backH, t('back'), '#78909C');
  hitAreas.push({ x: 20, y: 16, w: backW, h: backH, action: 'go_title' });

  // Island map — grid of row groups with level bubbles
  const startY = 80;
  const rowH = 55;
  const levels = game.levels;

  // Group levels by groupIndex
  const grouped: Map<number, typeof levels> = new Map();
  for (const lv of levels) {
    const arr = grouped.get(lv.groupIndex) ?? [];
    arr.push(lv);
    grouped.set(lv.groupIndex, arr);
  }

  let yOff = startY - game.levelSelectScroll;

  for (let gi = 0; gi < KANA_GROUPS.length; gi++) {
    const group = KANA_GROUPS[gi];
    const groupLevels = grouped.get(gi) ?? [];
    const isRowComplete = game.progress.completedRows.includes(group.row);

    if (yOff + rowH < 0 || yOff > H) {
      yOff += rowH;
      continue;
    }

    // Row label
    ctx.fillStyle = isRowComplete ? COL_GREEN : COL_TEXT;
    ctx.font = `bold 20px ${FONT_UI}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(group.label, 30, yOff + rowH / 2);

    // Island piece indicator
    if (isRowComplete) {
      ctx.fillStyle = COL_GOLD;
      drawStar(ctx, 100, yOff + rowH / 2, 10);
    }

    // Level bubbles
    const bubbleStartX = 130;
    const bubbleSpacing = 75;

    for (let li = 0; li < groupLevels.length; li++) {
      const lv = groupLevels[li];
      const bx = bubbleStartX + li * bubbleSpacing;
      const by = yOff + rowH / 2;
      const br = 22;
      const unlocked = game.isLevelUnlocked(lv.id);
      const completed = game.progress.completedLevels.includes(lv.id);
      const stars = game.progress.stars[lv.id] ?? 0;

      // Bubble
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      if (!unlocked) {
        ctx.fillStyle = COL_LOCKED;
      } else if (completed) {
        ctx.fillStyle = lv.isReview ? '#AB47BC' : COL_GREEN;
      } else {
        ctx.fillStyle = COL_WHITE;
      }
      ctx.fill();
      ctx.strokeStyle = unlocked ? COL_CARD_BORDER : '#999';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Level number or lock
      ctx.fillStyle = completed ? COL_WHITE : (unlocked ? COL_TEXT : '#888');
      ctx.font = `bold 16px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (unlocked) {
        ctx.fillText(lv.isReview ? '★' : `${li + 1}`, bx, by);
      } else {
        ctx.fillText('🔒', bx, by);
      }

      // Stars below bubble
      if (completed && stars > 0) {
        for (let s = 0; s < 3; s++) {
          drawSmallStar(ctx, bx - 12 + s * 12, by + br + 10, 5, s < stars);
        }
      }

      if (unlocked) {
        hitAreas.push({ x: bx - br, y: by - br, w: br * 2, h: br * 2, action: 'start_level', data: lv.id });
      }
    }

    yOff += rowH;
  }
}

function renderGameplay(ctx: CanvasRenderingContext2D, game: GameState, hitAreas: HitArea[]) {
  const q = game.currentQuestion;
  if (!q) return;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, COL_SKY);
  grad.addColorStop(1, '#AED9E0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Top bar: progress + combo + back
  const progress = game.questions.length > 0
    ? game.questionIndex / game.questions.length
    : 0;

  // Back button
  drawButton(ctx, 20, 15, 70, 36, t('back'), '#78909C');
  hitAreas.push({ x: 20, y: 15, w: 70, h: 36, action: 'go_level_select' });

  // Progress bar
  const barX = 110;
  const barY = 22;
  const barW = 600;
  const barH = 20;
  ctx.fillStyle = COL_PROGRESS_BG;
  roundRect(ctx, barX, barY, barW, barH, 10);
  ctx.fill();
  ctx.fillStyle = COL_PROGRESS_FG;
  if (progress > 0) {
    roundRect(ctx, barX, barY, barW * progress, barH, 10);
    ctx.fill();
  }

  // Question counter
  ctx.fillStyle = COL_TEXT;
  ctx.font = `16px ${FONT_UI}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${game.questionIndex + 1}/${game.questions.length}`, barX + barW + 12, barY + barH / 2);

  // Combo
  if (game.combo >= 2) {
    ctx.fillStyle = COL_GOLD;
    ctx.font = `bold 20px ${FONT_UI}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${t('combo')} ×${game.combo}`, W - 30, barY + barH / 2);
  }

  // Prompt area (centered)
  const promptY = 160;
  if (q.mode === 'listen_pick') {
    // Speaker icon — tap to replay
    drawSpeakerIcon(ctx, W / 2, promptY, 50);

    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `22px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('listen_prompt'), W / 2, promptY + 70);
    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `16px ${FONT_UI}`;
    ctx.fillText(t('tap_to_hear'), W / 2, promptY + 100);

    hitAreas.push({ x: W / 2 - 50, y: promptY - 50, w: 100, h: 100, action: 'replay_sound' });
  } else {
    // see_pick — show the kana, ask for romaji pronunciation choice
    ctx.fillStyle = COL_TEXT;
    ctx.font = `100px ${FONT_KANA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(q.targetKana.glyph, W / 2, promptY);

    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `22px ${FONT_UI}`;
    ctx.fillText(t('see_prompt'), W / 2, promptY + 75);
  }

  // Answer cards
  const numChoices = q.choices.length;
  const cardW = 160;
  const cardH = 190;
  const spacing = 30;
  const totalW = numChoices * cardW + (numChoices - 1) * spacing;
  const startX = (W - totalW) / 2;
  const cardY = 350;

  for (let i = 0; i < numChoices; i++) {
    const kana = q.choices[i];
    const cx = startX + i * (cardW + spacing);

    let state: 'normal' | 'correct' | 'incorrect' | 'reveal' = 'normal';
    let shakeX = 0;
    let shakeY = 0;

    if (q.answered) {
      if (kana.id === q.targetKana.id) {
        state = 'correct';
      } else if (i === q.selectedIndex) {
        state = 'incorrect';
        const shake = game.animations.getShake('card');
        if (shake) { shakeX = shake.offsetX; shakeY = shake.offsetY; }
      }
    }

    // In see_pick mode, show romaji on cards instead of glyph
    const displayText = q.mode === 'see_pick' ? kana.romaji : kana.glyph;

    drawCard(ctx, cx, cardY, cardW, cardH, displayText, state, shakeX, shakeY);

    // Keyboard shortcut label
    ctx.fillStyle = COL_TEXT_LIGHT;
    ctx.font = `14px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${i + 1}`, cx + cardW / 2, cardY + cardH + 6);

    if (!q.answered) {
      hitAreas.push({ x: cx, y: cardY, w: cardW, h: cardH, action: 'select_answer', data: i });
    }
  }

  // Feedback overlay
  if (game.feedbackTimer > 0) {
    ctx.fillStyle = game.feedbackCorrect
      ? 'rgba(76, 175, 80, 0.15)'
      : 'rgba(239, 83, 80, 0.1)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = game.feedbackCorrect ? COL_GREEN : COL_CARD_INCORRECT;
    ctx.font = `bold 42px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.feedbackMsg, W / 2, 560);

    // If incorrect, show correct answer
    if (!game.feedbackCorrect) {
      ctx.fillStyle = COL_TEXT;
      ctx.font = `28px ${FONT_UI}`;
      ctx.fillText(`${q.targetKana.glyph} = ${q.targetKana.romaji}`, W / 2, 605);
    }
  }
}

function renderLevelComplete(ctx: CanvasRenderingContext2D, game: GameState, hitAreas: HitArea[]) {
  const result = game.levelResult;
  if (!result) return;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#FFF8E1');
  grad.addColorStop(1, '#FFECB3');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = COL_TEXT;
  ctx.font = `bold 40px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('level_complete'), W / 2, 60);

  // Stars
  const starY = 140;
  for (let i = 0; i < 3; i++) {
    const sx = W / 2 - 80 + i * 80;
    drawSmallStar(ctx, sx, starY, 28, i < result.stars);
  }

  // Score
  ctx.fillStyle = COL_TEXT;
  ctx.font = `24px ${FONT_UI}`;
  ctx.fillText(`${t('score')}: ${result.correctFirst}/${result.totalQuestions}`, W / 2, 210);

  // Stickers
  ctx.fillStyle = COL_GOLD;
  ctx.font = `22px ${FONT_UI}`;
  ctx.fillText(`${t('stickers_earned')}: ${result.stickersEarned}`, W / 2, 255);

  // Row completion
  if (result.newRowCompleted) {
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold 26px ${FONT_UI}`;
    ctx.fillText(t('row_complete'), W / 2, 305);
    ctx.fillText(t('island_piece'), W / 2, 340);
  }

  // Companion
  const compY = result.newRowCompleted ? 420 : 380;
  drawCompanion(ctx, W / 2, compY, 40, game.progress.companion.mood);
  ctx.fillStyle = COL_TEXT_LIGHT;
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillText(
    game.progress.companion.mood === 'excited' ? t('companion_happy') : t('companion_cheer'),
    W / 2, compY + 55,
  );

  // Buttons
  const btnY = compY + 90;
  const btnW = 180;
  const btnH = 50;
  const gap = 20;

  // Back to levels
  const backX = W / 2 - btnW - gap / 2 - btnW / 2;
  drawButton(ctx, backX, btnY, btnW, btnH, t('back'), '#78909C');
  hitAreas.push({ x: backX, y: btnY, w: btnW, h: btnH, action: 'go_level_select' });

  // Replay
  const replayX = W / 2 - btnW / 2;
  drawButton(ctx, replayX, btnY, btnW, btnH, t('replay'), '#AB47BC');
  hitAreas.push({ x: replayX, y: btnY, w: btnW, h: btnH, action: 'replay_level' });

  // Next
  const nextLevelId = result.levelId + 1;
  if (nextLevelId < game.levels.length) {
    const nextX = W / 2 + btnW / 2 + gap;
    drawButton(ctx, nextX, btnY, btnW, btnH, t('next'), COL_GREEN);
    hitAreas.push({ x: nextX, y: btnY, w: btnW, h: btnH, action: 'next_level' });
  }
}

export function render(ctx: CanvasRenderingContext2D, game: GameState): HitArea[] {
  const hitAreas: HitArea[] = [];

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  switch (game.screen) {
    case 'player_select': renderPlayerSelect(ctx, game, hitAreas); break;
    case 'title': renderTitle(ctx, game, hitAreas); break;
    case 'level_select': renderLevelSelect(ctx, game, hitAreas); break;
    case 'gameplay': renderGameplay(ctx, game, hitAreas); break;
    case 'level_complete': renderLevelComplete(ctx, game, hitAreas); break;
  }

  // Render animations on top
  game.animations.render(ctx);

  ctx.restore();
  return hitAreas;
}
