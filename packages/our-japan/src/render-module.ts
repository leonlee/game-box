import { Game, W, H } from './game';
import { HitArea, VocabQuestion, AssemblyQuestion, GrammarCheckQuestion, DialogueQuestion, BossQuestion, ReadingQuestion, QuestionDef } from './types';
import { roundRect, drawButton, drawPanel, drawProgressBar, drawSmallStar } from './render';
import { t } from './i18n';
import { formatTime } from './util';

export function renderModule(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];
  const m = game.module;
  if (!m) return hitAreas;

  // Background
  ctx.fillStyle = '#F5F0E8';
  ctx.fillRect(0, 0, W, H);

  // HUD
  renderHUD(ctx, game, hitAreas);

  // Current question
  if (m.finished) return hitAreas;

  const q = m.questions[m.currentIndex];

  // Dispatch to module-specific renderer
  switch (m.type) {
    case 'vocab_sprint':
      renderVocabSprint(ctx, q as VocabQuestion, game, hitAreas);
      break;
    case 'sentence_assembly':
      renderSentenceAssembly(ctx, q as AssemblyQuestion, game, hitAreas);
      break;
    case 'grammar_check':
      renderGrammarCheck(ctx, q as GrammarCheckQuestion, game, hitAreas);
      break;
    case 'dialogue':
      renderDialogue(ctx, q as DialogueQuestion, game, hitAreas);
      break;
    case 'boss':
      renderBoss(ctx, q, game, hitAreas);
      break;
  }

  // Feedback overlay
  if (m.feedback) {
    renderFeedback(ctx, game);
  }

  return hitAreas;
}

// ── HUD (top bar) ──
function renderHUD(ctx: CanvasRenderingContext2D, game: Game, hitAreas: HitArea[]): void {
  const m = game.module!;

  // Dark bar
  ctx.fillStyle = '#2C3E50';
  ctx.fillRect(0, 0, W, 50);

  // Module type
  ctx.fillStyle = '#E8D5B5';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(t(m.type), 15, 25);

  // Question counter
  ctx.fillStyle = '#AAA';
  ctx.font = '13px sans-serif';
  ctx.fillText(t('question', m.currentIndex + 1, m.questions.length), 160, 25);

  // Progress bar
  const prog = (m.currentIndex + (m.feedback ? 1 : 0)) / m.questions.length;
  drawProgressBar(ctx, 280, 18, 200, 12, prog, '#4CAF50', '#444');

  // Timer
  const timeColor = m.timeRemaining < 30 ? '#EF5350' : '#FFD700';
  ctx.fillStyle = timeColor;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatTime(m.timeRemaining), 540, 25);

  // Score
  ctx.fillStyle = '#4CAF50';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${t('score')}: ${m.score}`, 640, 25);

  // Combo
  if (m.combo > 1) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${t('combo')} ×${m.combo}`, 740, 25);
  }

  // Boss HP
  if (m.bossHp !== undefined && m.bossMaxHp !== undefined) {
    ctx.fillStyle = '#EF5350';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${t('bossHp')}: ${m.bossHp}/${m.bossMaxHp}`, W - 15, 25);
    drawProgressBar(ctx, W - 180, 35, 165, 8, m.bossHp / m.bossMaxHp, '#EF5350', '#444');
  }

  // Exit button (small)
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, W - 55, 8, 40, 30, 4);
  ctx.fill();
  ctx.fillStyle = '#AAA';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✕', W - 35, 25);
  hitAreas.push({ x: W - 55, y: 8, w: 40, h: 30, action: 'exit_module' });
}

// ── Vocab Sprint ──
function renderVocabSprint(ctx: CanvasRenderingContext2D, q: VocabQuestion, game: Game, hitAreas: HitArea[]): void {
  const m = game.module!;
  if (m.feedback) return;

  // Prompt area
  drawPanel(ctx, W / 2 - 200, 80, 400, 120, '#FFF', '#D4C5A0');

  // Speaker icon
  ctx.fillStyle = '#4A90D9';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔊', W / 2 - 150, 140);

  // Prompt text
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(q.prompt, W / 2 + 20, 135);

  // Replay button
  hitAreas.push({ x: W / 2 - 175, y: 115, w: 50, h: 50, action: 'replay_audio' });

  // 4 choice cards (2×2 grid)
  const cardW = 200;
  const cardH = 80;
  const gapX = 30;
  const gapY = 20;
  const startX = W / 2 - cardW - gapX / 2;
  const startY = 240;

  for (let i = 0; i < 4; i++) {
    if (i >= q.choices.length) break;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    drawPanel(ctx, x, y, cardW, cardH, '#FFF', '#D4C5A0');

    ctx.fillStyle = '#2C3E50';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(q.choices[i], x + cardW / 2, y + cardH / 2);

    // Number label
    ctx.fillStyle = '#AAA';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}`, x + 8, y + 15);

    hitAreas.push({ x, y, w: cardW, h: cardH, action: 'answer', data: i });
  }
}

// ── Sentence Assembly ──
function renderSentenceAssembly(ctx: CanvasRenderingContext2D, q: AssemblyQuestion, game: Game, hitAreas: HitArea[]): void {
  const m = game.module!;
  if (m.feedback) return;

  // Meaning prompt
  drawPanel(ctx, 40, 70, W - 80, 60, '#FFF', '#D4C5A0');
  ctx.fillStyle = '#2C3E50';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(q.meaning, W / 2, 100);

  // Assembly line (where placed blocks go)
  drawPanel(ctx, 40, 155, W - 80, 80, '#FAFAF5', '#CCC');
  ctx.fillStyle = '#AAA';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('▶', 55, 195);

  const assemblyLine = m.assemblyLine ?? [];

  // Placed blocks
  let ax = 80;
  for (let i = 0; i < assemblyLine.length; i++) {
    const text = assemblyLine[i];
    const tw = ctx.measureText(text).width + 24;
    const blockW = Math.max(tw, 50);

    ctx.fillStyle = '#E8A04A';
    roundRect(ctx, ax, 175, blockW, 36, 6);
    ctx.fill();
    ctx.strokeStyle = '#C88A2A';
    ctx.lineWidth = 1.5;
    roundRect(ctx, ax, 175, blockW, 36, 6);
    ctx.stroke();

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, ax + blockW / 2, 193);

    hitAreas.push({ x: ax, y: 175, w: blockW, h: 36, action: 'remove_block', data: i });
    ax += blockW + 6;
  }

  // Available blocks (bottom)
  const usedBlocks = new Map<string, number>();
  for (const b of assemblyLine) {
    usedBlocks.set(b, (usedBlocks.get(b) ?? 0) + 1);
  }

  const available: { block: string; originalIdx: number }[] = [];
  const blockCounts = new Map<string, number>();
  for (let i = 0; i < q.blocks.length; i++) {
    const b = q.blocks[i];
    const count = blockCounts.get(b) ?? 0;
    const usedCount = usedBlocks.get(b) ?? 0;
    if (count < q.blocks.filter(x => x === b).length - usedCount) {
      // This is overly complex; simplify: track which indices are placed
    }
    blockCounts.set(b, count + 1);
  }

  // Simpler approach: track by counting
  const remainingBlocks: string[] = [...q.blocks];
  for (const placed of assemblyLine) {
    const idx = remainingBlocks.indexOf(placed);
    if (idx !== -1) remainingBlocks.splice(idx, 1);
  }

  ctx.font = 'bold 16px sans-serif';
  let bx = 60;
  const by = 290;
  const maxRowW = W - 120;

  let currentRowY = by;
  let currentRowX = bx;

  for (let i = 0; i < remainingBlocks.length; i++) {
    const text = remainingBlocks[i];
    const tw = ctx.measureText(text).width + 24;
    const blockW = Math.max(tw, 50);

    if (currentRowX + blockW > maxRowW + 60) {
      currentRowY += 50;
      currentRowX = bx;
    }

    ctx.fillStyle = '#4A90D9';
    roundRect(ctx, currentRowX, currentRowY, blockW, 40, 6);
    ctx.fill();
    ctx.strokeStyle = '#3A70B9';
    ctx.lineWidth = 1.5;
    roundRect(ctx, currentRowX, currentRowY, blockW, 40, 6);
    ctx.stroke();

    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, currentRowX + blockW / 2, currentRowY + 20);

    hitAreas.push({ x: currentRowX, y: currentRowY, w: blockW, h: 40, action: 'add_block', strData: text });
    currentRowX += blockW + 8;
  }

  // Action buttons
  const btnY = Math.max(currentRowY + 60, 420);

  // Clear button
  drawButton(ctx, W / 2 - 180, btnY, 100, 40, '清空', '#888');
  hitAreas.push({ x: W / 2 - 180, y: btnY, w: 100, h: 40, action: 'clear_assembly' });

  // Check button
  const canCheck = assemblyLine.length > 0;
  drawButton(ctx, W / 2 - 60, btnY, 120, 40, t('check'), canCheck ? '#4CAF50' : '#CCC');
  if (canCheck) {
    hitAreas.push({ x: W / 2 - 60, y: btnY, w: 120, h: 40, action: 'submit_assembly' });
  }

  // Hint
  if (q.hint) {
    ctx.fillStyle = '#888';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`💡 ${q.hint}`, W / 2, btnY + 55);
  }
}

// ── Grammar Check ──
function renderGrammarCheck(ctx: CanvasRenderingContext2D, q: GrammarCheckQuestion, game: Game, hitAreas: HitArea[]): void {
  const m = game.module!;
  if (m.feedback) return;

  // Prompt
  drawPanel(ctx, 40, 70, W - 80, 60, '#FFF', '#D4C5A0');
  ctx.fillStyle = '#2C3E50';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(q.prompt, W / 2, 100);

  // Sentence cards stacked vertically
  for (let i = 0; i < q.sentences.length; i++) {
    const y = 160 + i * 90;
    const cardH = 70;

    drawPanel(ctx, 60, y, W - 120, cardH, '#FFF', '#D4C5A0');

    // Number
    ctx.fillStyle = '#4A90D9';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i + 1}`, 80, y + cardH / 2);

    // Sentence
    ctx.fillStyle = '#2C3E50';
    ctx.font = '17px sans-serif';
    ctx.textAlign = 'left';
    // Truncate long sentences
    const maxW = W - 200;
    let text = q.sentences[i];
    while (ctx.measureText(text).width > maxW && text.length > 0) {
      text = text.slice(0, -1);
    }
    ctx.fillText(text, 110, y + cardH / 2);

    hitAreas.push({ x: 60, y, w: W - 120, h: cardH, action: 'answer', data: i });
  }
}

// ── Dialogue ──
function renderDialogue(ctx: CanvasRenderingContext2D, q: DialogueQuestion, game: Game, hitAreas: HitArea[]): void {
  const m = game.module!;
  if (m.feedback) return;

  // Context box
  drawPanel(ctx, 40, 65, W - 80, 45, '#E8E0D0', '#D4C5A0');
  ctx.fillStyle = '#666';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(q.context, W / 2, 88);

  // Chat bubbles
  let chatY = 130;
  for (const line of q.lines) {
    const isLeft = q.lines.indexOf(line) % 2 === 0;
    const bubbleX = isLeft ? 80 : 300;
    const maxBubbleW = 500;

    // Speaker name
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.fillText(line.speaker, isLeft ? bubbleX : bubbleX + maxBubbleW, chatY);
    chatY += 18;

    // Bubble
    ctx.font = '16px sans-serif';
    const text = line.isBlank ? '___________' : line.text;
    const tw = Math.min(ctx.measureText(text).width + 24, maxBubbleW);

    const bx = isLeft ? bubbleX : bubbleX + maxBubbleW - tw;
    const bgColor = line.isBlank ? '#FFF3E0' : '#FFF';
    drawPanel(ctx, bx, chatY, tw, 40, bgColor, line.isBlank ? '#E8A04A' : '#DDD');

    ctx.fillStyle = line.isBlank ? '#E8A04A' : '#2C3E50';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 12, chatY + 20);

    chatY += 55;
  }

  // Choice pills
  const pillY = Math.max(chatY + 10, 400);

  for (let i = 0; i < q.choices.length; i++) {
    const py = pillY + i * 50;
    if (py + 40 > H - 10) break;

    ctx.font = '15px sans-serif';
    const pillW = Math.min(ctx.measureText(q.choices[i]).width + 40, W - 120);

    drawPanel(ctx, 60, py, pillW, 40, '#FFF', '#4A90D9');

    ctx.fillStyle = '#2C3E50';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(q.choices[i], 80, py + 20);

    // Number
    ctx.fillStyle = '#4A90D9';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${i + 1}`, W - 70, py + 20);

    hitAreas.push({ x: 60, y: py, w: pillW, h: 40, action: 'answer', data: i });
  }
}

// ── Boss ──
function renderBoss(ctx: CanvasRenderingContext2D, q: QuestionDef, game: Game, hitAreas: HitArea[]): void {
  // Boss questions wrap inner question types
  if (q.type === 'boss') {
    const bq = q as BossQuestion;
    const inner = bq.question;
    switch (inner.type) {
      case 'vocab':
        renderVocabSprint(ctx, inner, game, hitAreas);
        break;
      case 'assembly':
        renderSentenceAssembly(ctx, inner, game, hitAreas);
        break;
      case 'grammar_check':
        renderGrammarCheck(ctx, inner, game, hitAreas);
        break;
      case 'dialogue':
        renderDialogue(ctx, inner, game, hitAreas);
        break;
      case 'reading':
        renderReading(ctx, inner as ReadingQuestion, game, hitAreas);
        break;
    }
  } else {
    // Direct question (from mixed generation)
    switch (q.type) {
      case 'vocab':
        renderVocabSprint(ctx, q, game, hitAreas);
        break;
      case 'assembly':
        renderSentenceAssembly(ctx, q, game, hitAreas);
        break;
      case 'grammar_check':
        renderGrammarCheck(ctx, q, game, hitAreas);
        break;
      case 'dialogue':
        renderDialogue(ctx, q, game, hitAreas);
        break;
    }
  }
}

// ── Reading (for boss) ──
function renderReading(ctx: CanvasRenderingContext2D, q: ReadingQuestion, game: Game, hitAreas: HitArea[]): void {
  const m = game.module!;
  if (m.feedback) return;

  // Passage panel
  drawPanel(ctx, 40, 70, W - 80, 160, '#FFF', '#D4C5A0');

  // Passage text (wrap if needed)
  ctx.fillStyle = '#2C3E50';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, q.passage, 60, 85, W - 140, 22);

  // Chinese hint
  ctx.fillStyle = '#888';
  ctx.font = '13px sans-serif';
  wrapText(ctx, q.passageZh, 60, 180, W - 140, 18);

  // Question
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(q.question, W / 2, 260);

  // Choices
  for (let i = 0; i < q.choices.length; i++) {
    const y = 290 + i * 55;
    drawPanel(ctx, 80, y, W - 160, 45, '#FFF', '#D4C5A0');

    ctx.fillStyle = '#4A90D9';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i + 1}`, 100, y + 22);

    ctx.fillStyle = '#2C3E50';
    ctx.font = '15px sans-serif';
    ctx.fillText(q.choices[i], 130, y + 22);

    hitAreas.push({ x: 80, y, w: W - 160, h: 45, action: 'answer', data: i });
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  let line = '';
  let dy = 0;
  for (const char of text) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxW) {
      ctx.fillText(line, x, y + dy);
      line = char;
      dy += lineH;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y + dy);
}

// ── Feedback Overlay ──
function renderFeedback(ctx: CanvasRenderingContext2D, game: Game): void {
  const m = game.module!;
  const fb = m.feedback!;

  // Semi-transparent overlay
  ctx.fillStyle = fb.correct ? 'rgba(76,175,80,0.15)' : 'rgba(239,83,80,0.15)';
  ctx.fillRect(0, 50, W, H - 50);

  // Feedback card
  const cardW = 420;
  const cardH = fb.explanation || fb.correctAnswer ? 180 : 100;
  const cardX = W / 2 - cardW / 2;
  const cardY = H / 2 - cardH / 2;

  ctx.fillStyle = fb.correct ? '#E8F5E9' : '#FFEBEE';
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = fb.correct ? '#4CAF50' : '#EF5350';
  ctx.lineWidth = 3;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.stroke();

  // Icon + text
  ctx.fillStyle = fb.correct ? '#4CAF50' : '#EF5350';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fb.correct ? `✓ ${t('correct')}` : `✗ ${t('incorrect')}`, W / 2, cardY + 35);

  // Combo indicator
  if (fb.correct && m.combo > 1) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${t('combo')} ×${m.combo}`, W / 2, cardY + 60);
  }

  // Correct answer (if wrong)
  if (fb.correctAnswer) {
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${t('correctAnswer')}:`, W / 2, cardY + 80);
    ctx.fillStyle = '#2C3E50';
    ctx.font = 'bold 16px sans-serif';
    // Truncate if too long
    let ans = fb.correctAnswer;
    while (ctx.measureText(ans).width > cardW - 40 && ans.length > 0) {
      ans = ans.slice(0, -1) + '…';
    }
    ctx.fillText(ans, W / 2, cardY + 105);
  }

  // Explanation
  if (fb.explanation) {
    ctx.fillStyle = '#888';
    ctx.font = '13px sans-serif';
    const ey = fb.correctAnswer ? cardY + 135 : cardY + 80;
    wrapText(ctx, fb.explanation, cardX + 20, ey, cardW - 40, 18);
  }
}
