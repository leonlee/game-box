# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install                                    # Install all workspace dependencies
npm run build                                  # Build all games
npm run build:brogue-mini                      # Build single game
npm run build:japan-syllabary
npm run build:our-japan
npm run watch -w packages/brogue-mini          # Watch mode for development
npm run typecheck                              # Type-check all packages
npx tsc --noEmit -p packages/brogue-mini       # Type-check a single package
```

No test framework, linter, or formatter is configured.

## Architecture

npm workspaces monorepo with three browser games under `packages/`. Each game is a standalone TypeScript project bundled with esbuild into a single `dist/game.js`. No external runtime dependencies — everything is vanilla TypeScript rendering to Canvas 2D.

### Games

- **brogue-mini** — Roguelike dungeon crawler (10 procedurally generated levels, combat, items, pets, shops)
- **japan-syllabary** — Kana learning game with multi-player profiles and level progression
- **our-japan** — Minecraft-style Japanese language learning game (Minna no Nihongo lessons 15-25, five question module types, boss encounters)

### Shared Patterns Across All Games

Each game follows the same file-per-concern structure with consistent module roles:

| Module | Role |
|--------|------|
| `main.ts` | Entry point: canvas setup, responsive sizing, input handling (keyboard + touch), game loop via `requestAnimationFrame` |
| `game.ts` | Central game state class and core logic |
| `render.ts` | Canvas 2D drawing; generates hit-area arrays during render for click/touch detection |
| `animation.ts` | Time-based animation queue using `performance.now()` |
| `audio.ts` | Procedural sound via Web Audio API oscillators (no audio files) |
| `i18n.ts` | English/Chinese bilingual string tables |
| `save.ts` | LocalStorage persistence for profiles, saves, leaderboards |

**Input architecture:** Both keyboard and touch inputs map to shared action handlers. Touch uses a hit-area system — render functions push `{x, y, w, h, action}` objects into an array that input handlers test against on tap. Hit areas are regenerated each frame during rendering.

**Canvas sizing:** All games dynamically scale the canvas to fit the viewport while preserving aspect ratio, with DPR-aware rendering for sharp display on high-density screens.

### our-japan Specifics

Largest game with additional structure:
- `src/content/lesson*.ts` — Lesson data files (vocabulary, grammar, questions) as pure data
- `src/modules/` — Five question module types: `vocab-sprint`, `sentence-assembly`, `grammar-check`, `dialogue`, `boss`
- Rendering split across `render.ts` (coordinator), `render-ui.ts`, `render-world.ts`, `render-module.ts`
- `types.ts` — Comprehensive discriminated union types for all game data

## Deployment

GitHub Actions builds on push to `main` and deploys to GitHub Pages. The workflow assembles a `_site/` directory with root `index.html` and each package at `packages/{name}/`.
