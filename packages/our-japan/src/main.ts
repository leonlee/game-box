import { Game, W, H } from './game';
import { render } from './render';
import { HitArea } from './types';
import { ensureAudioContext, speak, sfx } from './audio';

const canvas = document.getElementById('game') as HTMLCanvasElement;
let ctx = canvas.getContext('2d')!;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = W / H;

  let cssW = vw;
  let cssH = cssW / aspect;
  if (cssH > vh) {
    cssH = vh;
    cssW = cssH * aspect;
  }

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));

const game = new Game();
let hitAreas: HitArea[] = [];
let lastTime = 0;

// ── Input Handling ──
function getCanvasPos(e: MouseEvent | Touch): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}

function processClick(x: number, y: number): void {
  ensureAudioContext();
  for (let i = hitAreas.length - 1; i >= 0; i--) {
    const a = hitAreas[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
      processAction(a);
      return;
    }
  }
}

function processAction(area: HitArea): void {
  switch (area.action) {
    // ── Profile ──
    case 'select_profile':
      if (area.strData) game.selectProfile(area.strData);
      break;
    case 'new_profile': {
      const name = prompt('请输入名字 (Enter name):');
      if (name) game.addProfile(name);
      break;
    }
    case 'delete_profile':
      if (area.strData) game.confirmDeleteProfile(area.strData);
      break;
    case 'confirm_delete':
      game.doDeleteProfile();
      break;
    case 'cancel_delete':
      game.cancelDelete();
      break;

    // ── Navigation ──
    case 'go_title':
      game.goToTitle();
      break;
    case 'go_world':
      game.goToWorld();
      break;
    case 'go_player_select':
      game.goToPlayerSelect();
      break;
    case 'go_journal':
      game.goToJournal();
      break;

    // ── World ──
    case 'select_lesson':
      if (area.data !== undefined) game.goToStageIntro(area.data);
      break;
    case 'scroll_left':
      game.scrollWorld(-200);
      break;
    case 'scroll_right':
      game.scrollWorld(200);
      break;

    // ── Stage Intro ──
    case 'start_module':
      if (area.strData) game.startModule(area.strData as any);
      break;

    // ── Gameplay ──
    case 'answer':
      if (area.data !== undefined) game.answerQuestion(area.data);
      break;
    case 'add_block': {
      const m = game.module;
      if (m && area.data !== undefined) {
        let q = m.questions[m.currentIndex];
        if (q.type === 'boss') q = (q as any).question;
        if (q.type === 'assembly') {
          game.addBlock((q as any).blocks[area.data]);
        }
      }
      break;
    }
    case 'remove_block':
      if (area.data !== undefined) game.removeBlock(area.data);
      break;
    case 'clear_assembly':
      game.clearAssembly();
      break;
    case 'submit_assembly':
      game.submitAssembly();
      break;
    case 'replay_audio': {
      const m = game.module;
      if (m && m.questions[m.currentIndex]) {
        const q = m.questions[m.currentIndex];
        if (q.type === 'vocab') {
          speak(q.promptAudio ?? q.prompt);
        }
      }
      break;
    }
    case 'exit_module':
      game.goToWorld();
      break;

    // ── Results ──
    case 'retry_module':
      game.retryModule();
      break;
    case 'go_stage_result':
      game.goToStageResult();
      break;
    case 'next_module':
      game.nextModuleOrWorld();
      break;

    // ── Journal ──
    case 'journal_filter':
      if (area.strData) {
        game.journalFilter = area.strData as any;
        game.journalPage = 0;
      }
      break;
    case 'journal_prev':
      if (game.journalPage > 0) game.journalPage--;
      break;
    case 'journal_next':
      game.journalPage++;
      break;
  }
}

// Mouse/touch events
canvas.addEventListener('click', (e) => {
  const pos = getCanvasPos(e);
  processClick(pos.x, pos.y);
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length > 0) {
    const pos = getCanvasPos(e.touches[0]);
    processClick(pos.x, pos.y);
  }
}, { passive: false });

// Drag scrolling for world
let isDragging = false;
let dragStartX = 0;
let dragScrollStart = 0;

canvas.addEventListener('mousedown', (e) => {
  if (game.screen === 'world') {
    isDragging = true;
    dragStartX = e.clientX;
    dragScrollStart = game.world.targetScrollX;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (isDragging && game.screen === 'world') {
    const dx = (dragStartX - e.clientX) * (W / canvas.getBoundingClientRect().width);
    game.world.targetScrollX = dragScrollStart + dx;
    const maxScroll = Math.max(0, 120 * 16 - W);
    game.world.targetScrollX = Math.max(0, Math.min(maxScroll, game.world.targetScrollX));
  }
});

canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });

// Keyboard
document.addEventListener('keydown', (e) => {
  const key = e.key;

  // Number keys for answers
  if (key >= '1' && key <= '4') {
    const idx = parseInt(key) - 1;
    if (game.screen === 'gameplay' && game.module && !game.module.feedback && !game.module.finished) {
      const q = game.module.questions[game.module.currentIndex];
      if (q.type === 'vocab' || q.type === 'grammar_check' || q.type === 'dialogue' || q.type === 'reading') {
        game.answerQuestion(idx);
      }
    }
  }

  // Space for replay audio
  if (key === ' ' && game.screen === 'gameplay' && game.module) {
    e.preventDefault();
    const q = game.module.questions[game.module.currentIndex];
    if (q.type === 'vocab') {
      speak(q.promptAudio ?? q.prompt);
    }
  }

  // Enter for submit assembly
  if (key === 'Enter' && game.screen === 'gameplay' && game.module?.type === 'sentence_assembly') {
    if (game.module.assemblyLine && game.module.assemblyLine.length > 0 && !game.module.feedback) {
      game.submitAssembly();
    }
  }

  // Arrow keys for world scrolling
  if (game.screen === 'world') {
    if (key === 'ArrowLeft') game.scrollWorld(-80);
    if (key === 'ArrowRight') game.scrollWorld(80);
  }

  // Escape
  if (key === 'Escape') {
    if (game.screen === 'gameplay') {
      game.goToWorld();
    } else if (game.screen === 'stage_intro' || game.screen === 'journal') {
      game.goToTitle();
    } else if (game.screen === 'world') {
      game.goToTitle();
    } else if (game.screen === 'module_result' || game.screen === 'stage_result') {
      game.goToWorld();
    }
  }
});

// ── Game Loop ──
function loop(timestamp: number): void {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min(Math.max((timestamp - lastTime) / 1000, 0.016), 0.1);
  lastTime = timestamp;

  game.update(dt);
  hitAreas = render(ctx, game);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
