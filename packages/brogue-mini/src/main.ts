import { GameState } from "./game";
import { initCanvas, render, toggleHelp, nextHelpPage, showHelp, CANVAS_W, CANVAS_H, overlayHitAreas } from "./render";
import { toggleLang } from "./i18n";
import { hasSave, loadGame, addLeaderboardEntry } from "./save";

const canvas = document.getElementById("game") as HTMLCanvasElement;
let ctx = initCanvas(canvas);
const game = new GameState();

// Try loading a saved game
if (hasSave()) {
  loadGame(game);
}

let autoTimer: ReturnType<typeof setInterval> | null = null;
let throwMode = false;
let throwIndex = -1;
let dashMode = false;
let gameOverRecorded = false; // track if we've saved to leaderboard

// --- Touch detection ---
function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

// --- Responsive canvas ---
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const isTouch = isTouchDevice();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // On touch devices, reserve bottom portion for controls
  const controlsHeight = isTouch ? 120 : 0;
  const availH = vh - controlsHeight;
  const aspect = CANVAS_W / CANVAS_H;

  let cssW = vw;
  let cssH = cssW / aspect;

  if (cssH > availH) {
    cssH = availH;
    cssW = cssH * aspect;
  }

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;

  ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Show/hide controls based on device
  const touchControls = document.getElementById("touch-controls");
  const kbControls = document.querySelector(".controls") as HTMLElement | null;
  if (touchControls) touchControls.classList.toggle("visible", isTouch);
  if (kbControls) kbControls.style.display = isTouch ? "none" : "";
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 100));

// --- Auto-explore ---
function stopAuto() {
  if (autoTimer !== null) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  game.stopAutoExplore();
}

function startAuto() {
  game.startAutoExplore();
  if (!game.autoExploring) return;
  autoTimer = setInterval(() => {
    if (!game.autoStep()) {
      stopAuto();
    }
  }, 80);
}

function recordGameOver() {
  if (gameOverRecorded) return;
  gameOverRecorded = true;
  addLeaderboardEntry({
    depth: game.depth,
    level: game.level,
    turns: game.turnCount,
    kills: game.kills,
    won: game.won,
    date: new Date().toISOString().slice(0, 10),
  });
}

// --- Shared action handlers for keyboard + touch ---

function handleDirection(dx: number, dy: number) {
  if (dashMode) {
    game.useDash(dx, dy);
    dashMode = false;
    return;
  }
  if (throwMode) {
    game.throwItem(throwIndex, dx, dy);
    throwMode = false;
    return;
  }
  if (game.showInventory) {
    // Up/down for cursor
    if (dy === -1 && dx === 0) {
      if (game.inventoryCursor > 0) game.inventoryCursor--;
    } else if (dy === 1 && dx === 0) {
      if (game.inventoryCursor < game.inventory.items.length - 1) game.inventoryCursor++;
    }
    return;
  }
  if (game.autoExploring) {
    stopAuto();
    return;
  }
  if (game.gameOver) return;
  game.tryMove(dx, dy);
}

function handleAction(action: string) {
  switch (action) {
    case "wait":
      if (game.autoExploring) { stopAuto(); return; }
      if (game.gameOver) return;
      game.wait();
      break;
    case "stairs":
      if (game.gameOver) return;
      if (!game.tryDescend()) game.tryAscend();
      break;
    case "inventory":
      if (game.gameOver) return;
      if (game.showInventory) {
        game.showInventory = false;
      } else {
        game.showInventory = true;
        game.inventoryCursor = 0;
      }
      break;
    case "pickup":
      if (game.gameOver) return;
      game.tryPickUp();
      break;
    case "auto":
      if (game.gameOver) return;
      if (!game.autoExploring) startAuto();
      else stopAuto();
      break;
    case "invUse": {
      const items = game.inventory.items;
      if (items.length > 0) {
        const item = items[game.inventoryCursor];
        if (item.type === "throwing") {
          throwMode = true;
          throwIndex = game.inventoryCursor;
          game.showInventory = false;
        } else {
          game.useItem(game.inventoryCursor);
        }
      }
      break;
    }
    case "invDrop":
      if (game.inventory.items.length > 0) {
        game.dropItem(game.inventoryCursor);
      }
      break;
    case "invClose":
      game.showInventory = false;
      break;
    case "restart":
      game.restart();
      gameOverRecorded = false;
      break;
    case "levelup":
      // data handled separately via handleOverlayAction
      break;
    case "helpClose":
      toggleHelp();
      break;
    case "helpPage":
      nextHelpPage();
      break;
    case "buyYes":
      if (game.pendingBuy) game.confirmBuy();
      break;
    case "buyNo":
      if (game.pendingBuy) game.declineBuy();
      break;
    case "petcmd":
      game.cyclePetCommand();
      break;
  }
}

// --- Touch controls setup ---
function setupTouchControls() {
  const container = document.getElementById("touch-controls");
  if (!container) return;

  // D-pad buttons
  container.querySelectorAll("[data-dir]").forEach((btn) => {
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const dir = (btn as HTMLElement).dataset.dir!;
      const [dx, dy] = dir.split(",").map(Number);
      handleDirection(dx, dy);
    }, { passive: false });
  });

  // Action buttons
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const action = (btn as HTMLElement).dataset.action!;
      handleAction(action);
    }, { passive: false });
  });
}

setupTouchControls();

// --- Canvas touch handler for overlays ---
function getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  };
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);

  // Hit test against overlay areas (reverse order for z-ordering)
  for (let i = overlayHitAreas.length - 1; i >= 0; i--) {
    const area = overlayHitAreas[i];
    if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
      if (area.action === "levelup" && area.data !== undefined) {
        game.applyLevelUp(area.data);
      } else if (area.action === "invUse" && area.data !== undefined) {
        game.inventoryCursor = area.data;
        handleAction("invUse");
      } else if (area.action === "invDrop" && area.data !== undefined) {
        game.inventoryCursor = area.data;
        handleAction("invDrop");
      } else {
        handleAction(area.action);
      }
      return;
    }
  }
}, { passive: false });

// --- Keyboard handler ---
document.addEventListener("keydown", (e) => {
  if (e.key === "F1") {
    toggleLang();
    e.preventDefault();
    return;
  }

  if (e.key === "?") {
    if (game.autoExploring) stopAuto();
    if (game.showInventory) game.showInventory = false;
    toggleHelp();
    e.preventDefault();
    return;
  }

  if (showHelp) {
    if (e.key === "Tab") {
      nextHelpPage();
      e.preventDefault();
    }
    return;
  }

  // --- Dash mode: waiting for direction ---
  if (dashMode) {
    let dx = 0, dy = 0;
    switch (e.key) {
      case "ArrowUp": case "k": dx = 0; dy = -1; break;
      case "ArrowDown": case "j": dx = 0; dy = 1; break;
      case "ArrowLeft": case "h": dx = -1; dy = 0; break;
      case "ArrowRight": case "l": dx = 1; dy = 0; break;
      case "y": dx = -1; dy = -1; break;
      case "u": dx = 1; dy = -1; break;
      case "b": dx = -1; dy = 1; break;
      case "n": dx = 1; dy = 1; break;
      case "Escape": dashMode = false; e.preventDefault(); return;
      default: e.preventDefault(); return;
    }
    game.useDash(dx, dy);
    dashMode = false;
    e.preventDefault();
    return;
  }

  // --- Throw mode: waiting for direction ---
  if (throwMode) {
    let dx = 0, dy = 0;
    switch (e.key) {
      case "ArrowUp": case "k": dx = 0; dy = -1; break;
      case "ArrowDown": case "j": dx = 0; dy = 1; break;
      case "ArrowLeft": case "h": dx = -1; dy = 0; break;
      case "ArrowRight": case "l": dx = 1; dy = 0; break;
      case "y": dx = -1; dy = -1; break;
      case "u": dx = 1; dy = -1; break;
      case "b": dx = -1; dy = 1; break;
      case "n": dx = 1; dy = 1; break;
      case "Escape": throwMode = false; e.preventDefault(); return;
      default: e.preventDefault(); return;
    }
    game.throwItem(throwIndex, dx, dy);
    throwMode = false;
    e.preventDefault();
    return;
  }

  // --- Inventory mode ---
  if (game.showInventory) {
    const items = game.inventory.items;
    switch (e.key) {
      case "Escape":
      case "i":
        game.showInventory = false;
        break;
      case "ArrowUp":
      case "k":
        if (game.inventoryCursor > 0) game.inventoryCursor--;
        break;
      case "ArrowDown":
      case "j":
        if (game.inventoryCursor < items.length - 1) game.inventoryCursor++;
        break;
      case "Enter":
        if (items.length > 0) {
          const item = items[game.inventoryCursor];
          if (item.type === "throwing") {
            throwMode = true;
            throwIndex = game.inventoryCursor;
            game.showInventory = false;
          } else {
            game.useItem(game.inventoryCursor);
          }
        }
        break;
      case "d":
        if (items.length > 0) {
          game.dropItem(game.inventoryCursor);
        }
        break;
    }
    e.preventDefault();
    return;
  }

  // --- Buy confirmation ---
  if (game.pendingBuy) {
    if (e.key === "y" || e.key === "Y") { game.confirmBuy(); e.preventDefault(); return; }
    game.declineBuy();
    e.preventDefault();
    return;
  }

  // --- Level up selection ---
  if (game.pendingLevelUp) {
    if (e.key === "1") game.applyLevelUp(0);
    else if (e.key === "2") game.applyLevelUp(1);
    else if (e.key === "3") game.applyLevelUp(2);
    e.preventDefault();
    return;
  }

  // Ability keys (when not leveling up)
  if (e.key === "1" && game.abilities.length >= 1) {
    // Dash needs direction
    dashMode = true;
    e.preventDefault();
    return;
  }
  if (e.key === "2" && game.abilities.length >= 2) {
    game.useAbility(1);
    e.preventDefault();
    return;
  }
  if (e.key === "3" && game.abilities.length >= 3) {
    game.useAbility(2);
    e.preventDefault();
    return;
  }

  // Any key stops auto-explore (except x to start it)
  if (game.autoExploring && e.key !== "x") {
    stopAuto();
    e.preventDefault();
    return;
  }

  if (game.gameOver) {
    if (e.key === "r" || e.key === "R") {
      game.restart();
      gameOverRecorded = false;
    }
    return;
  }

  let handled = true;

  switch (e.key) {
    // Auto-explore
    case "x":
      if (!game.autoExploring) startAuto();
      break;

    // Inventory
    case "i":
      game.showInventory = true;
      game.inventoryCursor = 0;
      break;

    // Pick up
    case "g":
      game.tryPickUp();
      break;

    // Minimap toggle
    case "m":
      game.showMinimap = !game.showMinimap;
      break;

    // Cardinal movement
    case "ArrowUp":
    case "k":
      game.tryMove(0, -1);
      break;
    case "ArrowDown":
    case "j":
      game.tryMove(0, 1);
      break;
    case "ArrowLeft":
    case "h":
      game.tryMove(-1, 0);
      break;
    case "ArrowRight":
    case "l":
      game.tryMove(1, 0);
      break;

    // Diagonal movement
    case "y":
      game.tryMove(-1, -1);
      break;
    case "u":
      game.tryMove(1, -1);
      break;
    case "b":
      game.tryMove(-1, 1);
      break;
    case "n":
      game.tryMove(1, 1);
      break;

    // Stairs
    case ">":
      game.tryDescend();
      break;
    case "<":
      game.tryAscend();
      break;

    // Wait
    case " ":
    case ".":
      game.wait();
      break;

    case "c":
      game.cyclePetCommand();
      break;

    default:
      handled = false;
  }

  if (handled) e.preventDefault();
});

// --- Draw loop ---
function draw() {
  // Record leaderboard entry on game over
  if (game.gameOver && !gameOverRecorded) {
    recordGameOver();
  }
  render(ctx, game);
  requestAnimationFrame(draw);
}

draw();
