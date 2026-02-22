export const MAP_W = 80;
export const MAP_H = 30;

export enum Tile {
  Wall,
  Floor,
  StairsDown,
  StairsUp,
  Water,
  Grass,
  TrapSpike,
  TrapTeleport,
  TrapAlarm,
  DeepWater,
  Lava,
  BurningGrass,
}

export interface MapCell {
  tile: Tile;
  visible: boolean;
  revealed: boolean;
  trapRevealed?: boolean; // traps hidden until stepped on or high perception
}

export type RoomTag = "normal" | "treasure" | "boss" | "shop";

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: RoomTag;
}

export interface DungeonResult {
  cells: MapCell[][];
  rooms: Room[];
}

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function roomsOverlap(a: Room, b: Room): boolean {
  return (
    a.x - 1 < b.x + b.w &&
    a.x + a.w + 1 > b.x &&
    a.y - 1 < b.y + b.h &&
    a.y + a.h + 1 > b.y
  );
}

export function generateDungeon(depth = 1, ascending = false): DungeonResult {
  const cells: MapCell[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    cells[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      cells[y][x] = { tile: Tile.Wall, visible: false, revealed: false };
    }
  }

  // Place rooms via room accretion
  const rooms: Room[] = [];
  const targetRooms = rand(7, 12);

  for (let attempt = 0; attempt < 300 && rooms.length < targetRooms; attempt++) {
    const w = rand(4, 10);
    const h = rand(3, 6);
    const x = rand(1, MAP_W - w - 2);
    const y = rand(1, MAP_H - h - 2);
    const room: Room = { x, y, w, h, tag: "normal" };

    if (rooms.some((r) => roomsOverlap(r, room))) continue;
    rooms.push(room);

    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        cells[ry][rx].tile = Tile.Floor;
      }
    }
  }

  // Tag special rooms (skip first=spawn, last=stairs/boss)
  if (rooms.length > 3) {
    // Treasure room: one random middle room
    const midRooms = rooms.slice(1, -1);
    const treasureIdx = rand(0, midRooms.length - 1);
    midRooms[treasureIdx].tag = "treasure";

    // Shop room on depth 2+
    if (depth >= 2 && midRooms.length > 2) {
      let shopIdx = rand(0, midRooms.length - 1);
      while (shopIdx === treasureIdx) shopIdx = rand(0, midRooms.length - 1);
      midRooms[shopIdx].tag = "shop";
    }
  }

  // Boss room on depth 5 (mid-boss) and 10 (final boss)
  if ((depth === 5 || depth >= 10) && rooms.length > 1) {
    rooms[rooms.length - 1].tag = "boss";
  }

  // Connect rooms with L-shaped corridors
  for (let i = 1; i < rooms.length; i++) {
    const ax = Math.floor(rooms[i - 1].x + rooms[i - 1].w / 2);
    const ay = Math.floor(rooms[i - 1].y + rooms[i - 1].h / 2);
    const bx = Math.floor(rooms[i].x + rooms[i].w / 2);
    const by = Math.floor(rooms[i].y + rooms[i].h / 2);

    if (Math.random() < 0.5) {
      carveCorrH(cells, ax, bx, ay);
      carveCorrV(cells, ay, by, bx);
    } else {
      carveCorrV(cells, ay, by, ax);
      carveCorrH(cells, ax, bx, by);
    }
  }

  // Add 1-3 extra corridors between non-adjacent rooms (creates loops)
  if (rooms.length > 3) {
    const extraCorridors = rand(1, 3);
    for (let e = 0; e < extraCorridors; e++) {
      const a = rand(0, rooms.length - 1);
      let b = rand(0, rooms.length - 1);
      if (b === a) b = (a + 2) % rooms.length;
      if (Math.abs(a - b) <= 1) continue; // already connected by linear chain
      const ax = Math.floor(rooms[a].x + rooms[a].w / 2);
      const ay = Math.floor(rooms[a].y + rooms[a].h / 2);
      const bx = Math.floor(rooms[b].x + rooms[b].w / 2);
      const by = Math.floor(rooms[b].y + rooms[b].h / 2);
      if (Math.random() < 0.5) {
        carveCorrH(cells, ax, bx, ay);
        carveCorrV(cells, ay, by, bx);
      } else {
        carveCorrV(cells, ay, by, ax);
        carveCorrH(cells, ax, bx, by);
      }
    }
  }

  // Flood-fill reachability validation
  const spawn = rooms[0];
  const spawnX = Math.floor(spawn.x + spawn.w / 2);
  const spawnY = Math.floor(spawn.y + spawn.h / 2);
  const reachable: boolean[][] = [];
  for (let y = 0; y < MAP_H; y++) reachable[y] = new Array(MAP_W).fill(false);
  const floodQ: number[] = [spawnX, spawnY];
  let fqi = 0;
  reachable[spawnY][spawnX] = true;
  while (fqi < floodQ.length) {
    const fx = floodQ[fqi++];
    const fy = floodQ[fqi++];
    for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = fx + ddx, ny = fy + ddy;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && !reachable[ny][nx] && cells[ny][nx].tile !== Tile.Wall && cells[ny][nx].tile !== Tile.DeepWater) {
        reachable[ny][nx] = true;
        floodQ.push(nx, ny);
      }
    }
  }
  // If any room center unreachable, add emergency corridor from spawn
  for (let ri = 1; ri < rooms.length; ri++) {
    const rcx = Math.floor(rooms[ri].x + rooms[ri].w / 2);
    const rcy = Math.floor(rooms[ri].y + rooms[ri].h / 2);
    if (!reachable[rcy][rcx]) {
      if (Math.random() < 0.5) {
        carveCorrH(cells, spawnX, rcx, spawnY);
        carveCorrV(cells, spawnY, rcy, rcx);
      } else {
        carveCorrV(cells, spawnY, rcy, spawnX);
        carveCorrH(cells, spawnX, rcx, rcy);
      }
    }
  }

  // Scatter water pools
  for (let i = 0; i < rand(1, 3); i++) {
    const cx = rand(3, MAP_W - 4);
    const cy = rand(3, MAP_H - 4);
    const r = rand(1, 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (ny > 0 && ny < MAP_H - 1 && nx > 0 && nx < MAP_W - 1) {
          if (cells[ny][nx].tile === Tile.Floor && Math.random() < 0.5) {
            cells[ny][nx].tile = Tile.Water;
          }
        }
      }
    }
  }

  // Scatter grass patches
  for (let i = 0; i < rand(2, 4); i++) {
    const cx = rand(3, MAP_W - 4);
    const cy = rand(3, MAP_H - 4);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (ny > 0 && ny < MAP_H - 1 && nx > 0 && nx < MAP_W - 1) {
          if (cells[ny][nx].tile === Tile.Floor && Math.random() < 0.35) {
            cells[ny][nx].tile = Tile.Grass;
          }
        }
      }
    }
  }

  // Scatter deep water pools (depth 4+) — only in open areas to avoid blocking corridors
  if (depth >= 4) {
    for (let i = 0; i < rand(1, 2); i++) {
      const cx = rand(3, MAP_W - 4);
      const cy = rand(3, MAP_H - 4);
      const r = rand(1, 2);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (ny > 0 && ny < MAP_H - 1 && nx > 0 && nx < MAP_W - 1) {
            if (cells[ny][nx].tile !== Tile.Floor) continue;
            // Only place if tile has 3+ passable orthogonal neighbors (not in corridors)
            let open = 0;
            for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              if (cells[ny + ddy][nx + ddx].tile !== Tile.Wall) open++;
            }
            if (open >= 3 && Math.random() < 0.4) {
              cells[ny][nx].tile = Tile.DeepWater;
            }
          }
        }
      }
    }
  }

  // Scatter lava pools (depth 8+)
  if (depth >= 8) {
    for (let i = 0; i < rand(1, 2); i++) {
      const cx = rand(3, MAP_W - 4);
      const cy = rand(3, MAP_H - 4);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (ny > 0 && ny < MAP_H - 1 && nx > 0 && nx < MAP_W - 1) {
            if (cells[ny][nx].tile === Tile.Floor && Math.random() < 0.5) {
              cells[ny][nx].tile = Tile.Lava;
            }
          }
        }
      }
    }
  }

  // Place traps in corridors and rooms (not first room)
  const trapTypes = [Tile.TrapSpike, Tile.TrapTeleport, Tile.TrapAlarm];
  const numTraps = rand(2, 3 + depth);
  for (let i = 0; i < numTraps; i++) {
    const tx = rand(2, MAP_W - 3);
    const ty = rand(2, MAP_H - 3);
    if (cells[ty][tx].tile === Tile.Floor) {
      // Don't place in first room
      const first = rooms[0];
      if (tx >= first.x && tx < first.x + first.w && ty >= first.y && ty < first.y + first.h) continue;
      cells[ty][tx].tile = trapTypes[rand(0, trapTypes.length - 1)];
    }
  }

  // Place stairs in last room (down stairs, unless at depth 10 non-ascending)
  if (depth < 10 || ascending) {
    const last = rooms[rooms.length - 1];
    const sx = Math.floor(last.x + last.w / 2);
    const sy = Math.floor(last.y + last.h / 2);
    cells[sy][sx].tile = Tile.StairsDown;
  }

  // Place up stairs in first room when ascending
  if (ascending) {
    const first = rooms[0];
    // Place stairs up offset from room center so player doesn't spawn on them
    const ux = first.x + 1;
    const uy = first.y + 1;
    if (cells[uy][ux].tile === Tile.Floor) {
      cells[uy][ux].tile = Tile.StairsUp;
    }
  }

  return { cells, rooms };
}

function carveCorrH(cells: MapCell[][], x1: number, x2: number, y: number) {
  const start = Math.min(x1, x2);
  const end = Math.max(x1, x2);
  for (let x = start; x <= end; x++) {
    if (cells[y][x].tile === Tile.Wall) cells[y][x].tile = Tile.Floor;
  }
}

function carveCorrV(cells: MapCell[][], y1: number, y2: number, x: number) {
  const start = Math.min(y1, y2);
  const end = Math.max(y1, y2);
  for (let y = start; y <= end; y++) {
    if (cells[y][x].tile === Tile.Wall) cells[y][x].tile = Tile.Floor;
  }
}

// Raycasting FOV
export function computeFOV(
  cells: MapCell[][],
  px: number,
  py: number,
  radius: number
): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      cells[y][x].visible = false;
    }
  }

  cells[py][px].visible = true;
  cells[py][px].revealed = true;

  const numRays = 720;
  for (let i = 0; i < numRays; i++) {
    const angle = (i / numRays) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let x = px + 0.5;
    let y = py + 0.5;

    for (let step = 0; step < radius * 2; step++) {
      x += dx * 0.5;
      y += dy * 0.5;
      const ix = Math.floor(x);
      const iy = Math.floor(y);

      if (ix < 0 || ix >= MAP_W || iy < 0 || iy >= MAP_H) break;

      cells[iy][ix].visible = true;
      cells[iy][ix].revealed = true;

      if (cells[iy][ix].tile === Tile.Wall) break;
    }
  }
}
