import { Game, W, H } from './game';
import { HitArea, ModuleType } from './types';
import { t } from './i18n';
import { roundRect, drawButton, drawPanel, drawSmallStar, drawProgressBar, drawTag } from './render';
import { getLessonById, getModulesForLesson, getLessonProgress } from './content';
import { formatTime } from './util';

// ── Player Select Screen ──
export function renderPlayerSelect(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#E8D5B5';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('selectPlayer'), W / 2, 60);

  // Profile cards
  const cardW = 200;
  const cardH = 160;
  const profiles = game.store.profiles;
  const totalCards = Math.min(profiles.length + 1, 4); // max 3 profiles + new
  const startX = (W - totalCards * (cardW + 20)) / 2 + 10;
  const cardY = 160;

  // Delete confirmation overlay
  if (game.deleteConfirmId) {
    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // Dialog
    drawPanel(ctx, W / 2 - 160, H / 2 - 80, 320, 160, '#2a2a3e', '#555');
    ctx.fillStyle = '#FFF';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('deleteConfirm'), W / 2, H / 2 - 30);

    drawButton(ctx, W / 2 - 140, H / 2 + 20, 120, 40, t('delete'), '#EF5350');
    hitAreas.push({ x: W / 2 - 140, y: H / 2 + 20, w: 120, h: 40, action: 'confirm_delete' });

    drawButton(ctx, W / 2 + 20, H / 2 + 20, 120, 40, t('cancel'), '#666');
    hitAreas.push({ x: W / 2 + 20, y: H / 2 + 20, w: 120, h: 40, action: 'cancel_delete' });

    return hitAreas;
  }

  for (let i = 0; i < profiles.length && i < 3; i++) {
    const p = profiles[i];
    const x = startX + i * (cardW + 20);

    // Card background
    drawPanel(ctx, x, cardY, cardW, cardH, '#2a2a4e', '#4a4a6e');

    // Avatar circle
    ctx.fillStyle = ['#4A90D9', '#E8A04A', '#4CAF50'][i % 3];
    ctx.beginPath();
    ctx.arc(x + cardW / 2, cardY + 45, 28, 0, Math.PI * 2);
    ctx.fill();

    // Avatar initial
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name[0], x + cardW / 2, cardY + 46);

    // Name
    ctx.fillStyle = '#E8D5B5';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(p.name, x + cardW / 2, cardY + 90);

    // Level
    ctx.fillStyle = '#AAA';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${t('level')} ${p.progress.level}`, x + cardW / 2, cardY + 112);

    // Progress bar
    const lessonProg = (p.progress.currentLesson - 15) / 10;
    drawProgressBar(ctx, x + 20, cardY + 128, cardW - 40, 8, lessonProg, '#4A90D9', '#333');

    // Click to select
    hitAreas.push({ x, y: cardY, w: cardW, h: cardH, action: 'select_profile', strData: p.id });

    // Delete button (small X in top-right)
    ctx.fillStyle = '#EF5350';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×', x + cardW - 14, cardY + 14);
    hitAreas.push({ x: x + cardW - 24, y: cardY, w: 24, h: 24, action: 'delete_profile', strData: p.id });
  }

  // New player card
  if (profiles.length < 3) {
    const nx = startX + profiles.length * (cardW + 20);
    drawPanel(ctx, nx, cardY, cardW, cardH, '#1a1a3e', '#3a3a5e');

    ctx.fillStyle = '#4A90D9';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', nx + cardW / 2, cardY + 60);

    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.fillText(t('newPlayer'), nx + cardW / 2, cardY + 110);

    hitAreas.push({ x: nx, y: cardY, w: cardW, h: cardH, action: 'new_profile' });
  }

  // Name input (if active)
  if (game.profileInput !== undefined && game.screen === 'player_select') {
    // Input hint at bottom
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('appSubtitle'), W / 2, H - 40);
  }

  return hitAreas;
}

// ── Title Screen ──
export function renderTitle(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];
  const profile = game.store.profiles.find(p => p.id === game.store.activeId);

  // Sky background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#87CEEB');
  grad.addColorStop(0.6, '#B0E0E6');
  grad.addColorStop(1, '#90EE90');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Clouds (decorative)
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  drawCloud(ctx, 100, 80, 60);
  drawCloud(ctx, 300, 50, 45);
  drawCloud(ctx, 700, 70, 55);
  drawCloud(ctx, 850, 100, 40);

  // Ground
  ctx.fillStyle = '#5D8A3C';
  ctx.fillRect(0, H - 100, W, 100);
  ctx.fillStyle = '#6B9E4A';
  ctx.fillRect(0, H - 100, W, 8);

  // Title panel
  drawPanel(ctx, W / 2 - 240, 120, 480, 180, 'rgba(255,255,255,0.9)', '#D4C5A0');

  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('appTitle'), W / 2, 175);

  ctx.fillStyle = '#666';
  ctx.font = '16px sans-serif';
  ctx.fillText(t('appSubtitle'), W / 2, 215);

  // Player info
  if (profile) {
    ctx.fillStyle = '#4A90D9';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${profile.name}  |  ${t('level')} ${profile.progress.level}`, W / 2, 260);
  }

  // Start/Continue button
  const hasProgress = profile && profile.progress.currentLesson > 15;
  const btnText = hasProgress ? t('continueAdventure') : t('startAdventure');
  drawButton(ctx, W / 2 - 120, 360, 240, 50, btnText, '#4A90D9');
  hitAreas.push({ x: W / 2 - 120, y: 360, w: 240, h: 50, action: 'go_world' });

  // Journal button
  if (profile && profile.progress.mistakes.length > 0) {
    drawButton(ctx, W / 2 - 80, 430, 160, 40, t('journal'), '#E8A04A', '#FFF', 15);
    hitAreas.push({ x: W / 2 - 80, y: 430, w: 160, h: 40, action: 'go_journal' });
  }

  // Switch player
  drawButton(ctx, W / 2 - 70, 490, 140, 36, t('switchPlayer'), '#888', '#FFF', 13);
  hitAreas.push({ x: W / 2 - 70, y: 490, w: 140, h: 36, action: 'go_player_select' });

  return hitAreas;
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.beginPath();
  ctx.arc(x, y, w * 0.3, 0, Math.PI * 2);
  ctx.arc(x + w * 0.25, y - w * 0.15, w * 0.35, 0, Math.PI * 2);
  ctx.arc(x + w * 0.55, y, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ── Stage Intro Screen ──
export function renderStageIntro(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];
  const lesson = getLessonById(game.currentLessonId);
  if (!lesson) return hitAreas;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#F5F0E8');
  grad.addColorStop(1, '#E8DCC8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(lesson.title, W / 2, 50);

  ctx.fillStyle = '#666';
  ctx.font = '18px sans-serif';
  ctx.fillText(lesson.titleJa, W / 2, 80);

  // Grammar points panel
  drawPanel(ctx, 40, 110, W - 80, 260, '#FFF', '#D4C5A0');
  ctx.fillStyle = '#4A90D9';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(t('grammarPoints'), 60, 135);

  let gy = 160;
  for (const gp of lesson.grammarPoints) {
    ctx.fillStyle = '#E8A04A';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(gp.pattern, 60, gy);
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.fillText(gp.meaning, 60, gy + 20);
    if (gp.examples.length > 0) {
      ctx.fillStyle = '#888';
      ctx.font = '13px sans-serif';
      ctx.fillText(`例：${gp.examples[0].ja}`, 80, gy + 40);
      ctx.fillText(`　　${gp.examples[0].zh}`, 80, gy + 56);
    }
    gy += 72;
    if (gy > 350) break;
  }

  // Module buttons
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('modules'), W / 2, 400);

  const modules = getModulesForLesson(game.currentLessonId);
  const completed = game.progress.completedModules[game.currentLessonId] ?? [];
  const btnW = 150;
  const startX = (W - modules.length * (btnW + 10)) / 2 + 5;

  for (let i = 0; i < modules.length; i++) {
    const mt = modules[i];
    const done = completed.includes(mt);
    const x = startX + i * (btnW + 10);
    const color = done ? '#4CAF50' : '#4A90D9';

    drawButton(ctx, x, 425, btnW, 44, t(mt), color, '#FFF', 13);
    hitAreas.push({ x, y: 425, w: btnW, h: 44, action: 'start_module', strData: mt });

    // Stars
    const key = `${game.currentLessonId}-${mt}`;
    const stars = game.progress.stars[key] ?? 0;
    for (let s = 0; s < 3; s++) {
      drawSmallStar(ctx, x + 40 + s * 28, 480, 10, s < stars);
    }
  }

  // Back button
  drawButton(ctx, 30, H - 60, 100, 40, t('back'), '#888', '#FFF', 14);
  hitAreas.push({ x: 30, y: H - 60, w: 100, h: 40, action: 'go_world' });

  return hitAreas;
}

// ── Module Result Screen ──
export function renderModuleResult(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];
  const result = game.lastModuleResult;
  if (!result) return hitAreas;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#E8D5B5';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('moduleComplete'), W / 2, 60);

  // Stars
  for (let i = 0; i < 3; i++) {
    drawSmallStar(ctx, W / 2 - 40 + i * 40, 110, 20, i < result.stars);
  }

  // Stats panel
  drawPanel(ctx, W / 2 - 200, 150, 400, 240, '#2a2a4e', '#4a4a6e');

  const stats = [
    [t('score'), `${result.score} / ${result.total}`],
    [t('accuracy'), `${Math.round(result.accuracy * 100)}%`],
    [t('timeTaken'), formatTime(result.timeTaken)],
    [t('xpEarned'), `+${result.xpEarned} XP`],
    [t('starsEarned'), '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars)],
  ];

  for (let i = 0; i < stats.length; i++) {
    const y = 185 + i * 40;
    ctx.fillStyle = '#AAA';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(stats[i][0], W / 2 - 170, y);
    ctx.fillStyle = '#E8D5B5';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(stats[i][1], W / 2 + 170, y);
  }

  // Encouragement
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  const msg = result.accuracy >= 0.9 ? t('greatJob') : result.accuracy >= 0.5 ? t('keepGoing') : t('tryAgain');
  ctx.fillText(msg, W / 2, 420);

  // Buttons
  drawButton(ctx, W / 2 - 230, 470, 140, 44, t('retry'), '#E8A04A');
  hitAreas.push({ x: W / 2 - 230, y: 470, w: 140, h: 44, action: 'retry_module' });

  drawButton(ctx, W / 2 - 70, 470, 140, 44, t('nextModule'), '#4A90D9');
  hitAreas.push({ x: W / 2 - 70, y: 470, w: 140, h: 44, action: 'go_stage_result' });

  drawButton(ctx, W / 2 + 90, 470, 140, 44, t('backToWorld'), '#888');
  hitAreas.push({ x: W / 2 + 90, y: 470, w: 140, h: 44, action: 'go_world' });

  return hitAreas;
}

// ── Stage Result Screen ──
export function renderStageResult(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];
  const result = game.lastStageResult;
  if (!result) return hitAreas;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a2a1a');
  grad.addColorStop(1, '#1a3a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const lesson = getLessonById(result.lessonId);
  ctx.fillStyle = '#E8D5B5';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(lesson ? lesson.title : t('stageComplete'), W / 2, 60);

  // Building stage indicator
  ctx.fillStyle = '#AAA';
  ctx.font = '16px sans-serif';
  ctx.fillText(`${t('modules')}: ${result.modulesCompleted} / ${result.totalModules}`, W / 2, 100);

  // Building growth notification
  if (result.buildingGrew) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(t('buildingGrew'), W / 2, 160);

    // Draw building stage name
    ctx.fillStyle = '#4CAF50';
    ctx.font = '18px sans-serif';
    ctx.fillText(result.newStage, W / 2, 195);
  }

  // Progress bar
  drawProgressBar(ctx, W / 2 - 150, 240, 300, 20, result.modulesCompleted / result.totalModules, '#4CAF50');

  // Module status
  const modules = getModulesForLesson(result.lessonId);
  const completed = game.progress.completedModules[result.lessonId] ?? [];
  const btnY = 300;

  for (let i = 0; i < modules.length; i++) {
    const mt = modules[i];
    const done = completed.includes(mt);
    const x = (W - modules.length * 130) / 2 + i * 130;

    ctx.fillStyle = done ? '#4CAF5066' : '#33333366';
    roundRect(ctx, x, btnY, 120, 50, 8);
    ctx.fill();

    ctx.fillStyle = done ? '#4CAF50' : '#888';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t(mt), x + 60, btnY + 20);
    ctx.fillText(done ? '✓' : '−', x + 60, btnY + 38);
  }

  // Buttons
  const hasNext = completed.length < modules.length;

  if (hasNext) {
    drawButton(ctx, W / 2 - 120, 420, 240, 50, t('nextModule'), '#4A90D9');
    hitAreas.push({ x: W / 2 - 120, y: 420, w: 240, h: 50, action: 'next_module' });
  }

  drawButton(ctx, W / 2 - 100, 490, 200, 44, t('backToWorld'), '#888');
  hitAreas.push({ x: W / 2 - 100, y: 490, w: 200, h: 44, action: 'go_world' });

  return hitAreas;
}

// ── Journal Screen ──
export function renderJournal(ctx: CanvasRenderingContext2D, game: Game): HitArea[] {
  const hitAreas: HitArea[] = [];

  // Background
  ctx.fillStyle = '#F5F0E8';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('journal'), W / 2, 45);

  // Filter tabs
  const filters: ('all' | ModuleType)[] = ['all', 'vocab_sprint', 'sentence_assembly', 'grammar_check', 'dialogue'];
  const filterLabels = [t('all'), t('vocab_sprint'), t('sentence_assembly'), t('grammar_check'), t('dialogue')];
  const tabW = 130;
  const tabStartX = (W - filters.length * (tabW + 6)) / 2;

  for (let i = 0; i < filters.length; i++) {
    const x = tabStartX + i * (tabW + 6);
    const active = game.journalFilter === filters[i];
    drawButton(ctx, x, 65, tabW, 30, filterLabels[i], active ? '#4A90D9' : '#CCC', active ? '#FFF' : '#666', 12);
    hitAreas.push({ x, y: 65, w: tabW, h: 30, action: 'journal_filter', strData: filters[i] });
  }

  // Mistakes list
  const mistakes = game.getFilteredMistakes();
  const perPage = 6;
  const page = game.journalPage;
  const startIdx = page * perPage;
  const pageItems = mistakes.slice(startIdx, startIdx + perPage);

  if (mistakes.length === 0) {
    ctx.fillStyle = '#999';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('noMistakes'), W / 2, H / 2);
  } else {
    for (let i = 0; i < pageItems.length; i++) {
      const m = pageItems[i];
      const y = 115 + i * 75;

      drawPanel(ctx, 40, y, W - 80, 68, m.reviewed ? '#E8F5E9' : '#FFF', '#DDD');

      ctx.fillStyle = '#2C3E50';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';

      // Question preview
      let preview = '';
      if (m.question.type === 'vocab') preview = m.question.prompt;
      else if (m.question.type === 'assembly') preview = m.question.meaning;
      else if (m.question.type === 'grammar_check') preview = m.question.prompt;
      else if (m.question.type === 'dialogue') preview = m.question.context;
      ctx.fillText(preview.slice(0, 50), 60, y + 22);

      // Answer info
      ctx.fillStyle = '#EF5350';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${t('correctAnswer')}: ${m.correctAnswer.slice(0, 40)}`, 60, y + 44);

      // Module type tag
      drawTag(ctx, W - 200, y + 10, t(m.moduleType), '#4A90D9');

      // Lesson tag
      drawTag(ctx, W - 200, y + 38, t('lesson', m.lessonId), '#E8A04A');
    }

    // Pagination
    const totalPages = Math.ceil(mistakes.length / perPage);
    if (totalPages > 1) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${page + 1} / ${totalPages}`, W / 2, H - 70);

      if (page > 0) {
        drawButton(ctx, W / 2 - 120, H - 85, 40, 30, '◀', '#888', '#FFF', 14);
        hitAreas.push({ x: W / 2 - 120, y: H - 85, w: 40, h: 30, action: 'journal_prev' });
      }
      if (page < totalPages - 1) {
        drawButton(ctx, W / 2 + 80, H - 85, 40, 30, '▶', '#888', '#FFF', 14);
        hitAreas.push({ x: W / 2 + 80, y: H - 85, w: 40, h: 30, action: 'journal_next' });
      }
    }
  }

  // Back button
  drawButton(ctx, 30, H - 50, 100, 36, t('back'), '#888', '#FFF', 14);
  hitAreas.push({ x: 30, y: H - 50, w: 100, h: 36, action: 'go_title' });

  return hitAreas;
}
