import { GameState } from "./game";
import { initCanvas, render, toggleHelp, nextHelpPage, showHelp } from "./render";
import { toggleLang } from "./i18n";
import { hasSave, loadGame, addLeaderboardEntry } from "./save";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = initCanvas(canvas);
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

function draw() {
  // Record leaderboard entry on game over
  if (game.gameOver && !gameOverRecorded) {
    recordGameOver();
  }
  render(ctx, game);
  requestAnimationFrame(draw);
}

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
    // Any other key auto-declines and falls through to normal handling
    game.declineBuy();
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

    default:
      handled = false;
  }

  if (handled) e.preventDefault();
});

draw();
