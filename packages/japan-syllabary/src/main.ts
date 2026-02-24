import { GameState } from './game';
import { render, W, H, HitArea } from './render';
import { ensureAudioContext } from './audio';

const canvas = document.getElementById('game') as HTMLCanvasElement;
let ctx = canvas.getContext('2d')!;
const appShell = document.querySelector('.app-shell') as HTMLElement | null;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const shellW = Math.max(1, Math.floor(appShell?.clientWidth ?? window.innerWidth));
  const shellH = Math.max(1, Math.floor(appShell?.clientHeight ?? window.innerHeight));
  const aspect = W / H;

  let cssW = shellW;
  let cssH = cssW / aspect;
  if (cssH > shellH) {
    cssH = shellH;
    cssW = cssH * aspect;
  }

  canvas.style.width = Math.floor(cssW) + 'px';
  canvas.style.height = Math.floor(cssH) + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.visualViewport?.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));

const game = new GameState();
let hitAreas: HitArea[] = [];
let lastTime = 0;
let audioInitialized = false;
let touchHandled = false;

function initAudio() {
  if (!audioInitialized) {
    ensureAudioContext();
    audioInitialized = true;
  }
}

function getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (W / rect.width),
    y: (clientY - rect.top) * (H / rect.height),
  };
}

function hitTest(px: number, py: number): HitArea | null {
  // Iterate in reverse so top-most areas are hit first
  for (let i = hitAreas.length - 1; i >= 0; i--) {
    const a = hitAreas[i];
    if (px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h) {
      return a;
    }
  }
  return null;
}

function processAction(action: string, data?: number, strData?: string) {
  initAudio();

  switch (action) {
    case 'select_profile':
      if (strData) game.selectProfile(strData);
      break;
    case 'create_profile':
      game.createNewProfile();
      break;
    case 'confirm_delete':
      if (strData) game.confirmDelete(strData);
      break;
    case 'cancel_delete':
      game.cancelDelete();
      break;
    case 'delete_profile':
      if (strData) game.deleteProfile(strData);
      break;
    case 'go_player_select':
      game.goToPlayerSelect();
      break;
    case 'start_game':
      game.startGame();
      break;
    case 'go_title':
      game.goToTitle();
      break;
    case 'go_level_select':
      game.goToLevelSelect();
      break;
    case 'start_level':
      if (data !== undefined) game.startLevel(data);
      break;
    case 'select_answer':
      if (data !== undefined) {
        game.selectAnswer(data);
        if (!game.currentQuestion?.correct) {
          game.animations.addShake('card', 0, 0, 8, 0.3);
        } else {
          game.animations.addStarBurst(W / 2, 400, 16);
        }
      }
      break;
    case 'replay_sound':
      game.speakCurrent();
      break;
    case 'next_level':
      game.nextLevel();
      break;
    case 'replay_level':
      game.replayLevel();
      break;
  }
}

// Touch input (primary for tablets)
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchHandled = true;
  const touch = e.touches[0];
  const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
  const hit = hitTest(x, y);
  if (hit) processAction(hit.action, hit.data, hit.strData);
}, { passive: false });

// Click fallback for desktop
canvas.addEventListener('click', (e) => {
  if (touchHandled) { touchHandled = false; return; }
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  const hit = hitTest(x, y);
  if (hit) processAction(hit.action, hit.data, hit.strData);
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  initAudio();

  if (game.screen === 'gameplay') {
    if (e.key >= '1' && e.key <= '4') {
      const idx = parseInt(e.key) - 1;
      const q = game.currentQuestion;
      if (q && idx < q.choices.length) {
        processAction('select_answer', idx);
      }
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      processAction('replay_sound');
    } else if (e.key === 'Escape') {
      processAction('go_level_select');
    }
  } else if (game.screen === 'level_complete') {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      processAction('next_level');
    } else if (e.key === 'Escape') {
      processAction('go_level_select');
    }
  } else if (game.screen === 'title') {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      processAction('start_game');
    } else if (e.key === 'Escape') {
      processAction('go_player_select');
    }
  } else if (game.screen === 'player_select') {
    if (e.key === 'Escape') {
      game.cancelDelete();
    }
  } else if (game.screen === 'level_select') {
    if (e.key === 'Escape') {
      processAction('go_title');
    }
  }
});

// Game loop
function loop(time: number) {
  const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  game.update(dt);
  hitAreas = render(ctx, game);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
