# Brogue Mini — Gameplay Guide

A lightweight Roguelike dungeon crawler inspired by [Brogue](https://sites.google.com/site/broguegame/). Explore 10 procedurally generated dungeon floors, defeat monsters, collect loot, and escape with the Amulet of Yendor.

## Goal

Descend to depth 10, find the **Amulet of Yendor**, then ascend back to the surface (depth 0) to win. Death is permanent — the save is deleted on load (roguelike convention).

## Controls

### Keyboard

| Key | Action |
|-----|--------|
| Arrow keys / `h` `j` `k` `l` | Move (cardinal) |
| `y` `u` `b` `n` | Move (diagonal) |
| `Space` / `.` | Wait one turn |
| `>` | Descend stairs |
| `<` | Ascend stairs |
| `g` | Pick up item |
| `i` | Open/close inventory |
| `Enter` | Use selected item (in inventory) |
| `d` | Drop selected item (in inventory) |
| `x` | Toggle auto-explore |
| `m` | Toggle minimap |
| `1` | Dash ability (then choose direction) |
| `2` | Shield Bash ability |
| `3` | Battle Cry ability |
| `?` | Help screen (`Tab` to switch page) |
| `F1` | Toggle English / Chinese |
| `R` | Restart (game over screen) |

### Touch (Mobile)

On-screen D-pad and action buttons appear automatically on touch devices. Tap overlay areas for inventory use/drop, level-up choices, and shop confirmations.

## Player

| Stat | Starting Value |
|------|---------------|
| HP | 20 |
| Attack | 3 |
| Defense | 1 |
| Hunger | 100 (max 100) |
| Inventory | 8 slots |

### Combat Formula

```
damage = max(1, attacker_ATK - defender_DEF + random(-2, +2))
```

Equipment bonuses add to effective ATK/DEF. Cursed equipment provides 1 less bonus.

### Hunger

- Lose 1 hunger every 12 turns
- Warning at 15 hunger
- At 0 hunger: lose 1 HP per turn (starvation)

### Leveling

- XP to first level-up: 12
- Each level: XP requirement scales by x1.25
- On level-up, choose one:
  - **+5 max HP** (and +5 current HP)
  - **+1 Attack**
  - **+1 Defense**

### Abilities (unlock by level)

| Level | Ability | Effect | Cooldown |
|-------|---------|--------|----------|
| 3 | **Dash** | Move 3 tiles in a direction, dealing 50% ATK to each monster passed through. Stops if a monster survives. | 15 turns |
| 6 | **Shield Bash** | Stun an adjacent monster for 2 turns | 12 turns |
| 9 | **Battle Cry** | Fear all visible monsters for 3 turns (they flee) | 20 turns |

## Pet — Jack

A pet dog (`d`) that accompanies you through the dungeon.

| Stat | Base | Scaling |
|------|------|---------|
| HP | 15 | x(1 + 0.14 per depth) |
| Attack | 2 | x(1 + 0.14 per depth) |
| Defense | 1 | x(1 + 0.14 per depth) |

**Behavior:**
- Attacks adjacent monsters (excluding shopkeeper)
- Chases visible monsters within 4 tiles (if within 5 tiles of player)
- Self-heals every 5 turns (+4 HP)
- Follows player when >2 tiles away
- Grants half XP on kills
- Cannot be resurrected if killed

## Monsters

Monsters unlock progressively — one new type per depth level.

| Depth | Char | Monster | HP | ATK | DEF | XP | Special |
|-------|------|---------|----|-----|-----|----|---------|
| 1 | `r` | Rat | 3 | 2 | 0 | 3 | — |
| 2 | `g` | Goblin | 7 | 3 | 1 | 8 | Flees at <30% HP |
| 3 | `s` | Snake | 5 | 4 | 0 | 7 | Poison (3 turns, 1 dmg/turn) |
| 4 | `a` | Archer | 6 | 3 | 0 | 10 | Ranged attack (6 range, needs LOS) |
| 5 | `O` | Ogre | 14 | 5 | 2 | 15 | Knockback + Slow (2 turns) |
| 6 | `G` | Ghost | 8 | 4 | 0 | 12 | Pass walls, Blind (2 turns) |
| 7 | `S` | Slime | 10 | 2 | 1 | 10 | Splits into 1-2 small slimes on death |
| 8 | `z` | Skeleton | 9 | 4 | 2 | 12 | 50% chance to reassemble after 3 turns (at half HP) |
| 9 | `W` | Wraith | 12 | 5 | 1 | 18 | Pass walls, drains 1 max HP on hit |
| 10 | `f` | Fire Imp | 7 | 3 | 0 | 14 | Ranged fire (5 range), burn status (3 turns, 2 dmg/turn), ignites grass, lava immune |

All monster stats scale by `1 + (depth - 1) * 0.12`. During ascent, an additional x1.2 multiplier applies.

### Bosses

| Depth | Char | Boss | HP | ATK | DEF | XP | Special | Guards |
|-------|------|------|----|-----|-----|----|---------|--------|
| 5 | `D` | Dragon | 22 | 6 | 2 | 50 | Bleed (2 turns, 2 dmg/turn) | Dragon Scale armor |
| 10 | `L` | Lich | 30 | 7 | 3 | 80 | Ranged + Blind (3 turns) + summons skeletons (40% chance/turn) | Amulet of Yendor |

## Items

### Potions (`!`)

Potions are **unidentified** until used or identified by scroll. Labels are randomized each run.

| Potion | Effect |
|--------|--------|
| Health Potion | Heal 8 HP (5 HP from monster drops) |
| Potion of Strength | Permanent +1 ATK |
| Potion of Poison | Lose 5 HP |

### Scrolls (`?`)

Scrolls are **unidentified** until used or identified. Labels are randomized each run.

| Scroll | Effect |
|--------|--------|
| Scroll of Teleport | Teleport to a random floor tile |
| Scroll of Identify | Reveal all unidentified potions/scrolls in inventory + curse status of equipped items |
| Scroll of Enchant | +1 ATK to equipped weapon |
| Scroll of Mapping | Reveal entire floor |
| Scroll of Remove Curse | Remove curse from equipped weapon and armor |

### Equipment

| Weapon | Char | ATK Bonus | Durability |
|--------|------|-----------|------------|
| Short Sword | `)` | +2 | 45 |
| Long Sword | `)` | +4 | 60 |

| Armor | Char | DEF Bonus | Durability |
|-------|------|-----------|------------|
| Leather Armor | `[` | +2 | 52 |
| Chain Mail | `[` | +4 | 65 |
| Dragon Scale | `[` | +2 | Indestructible |

- Long Sword and Chain Mail appear from depth 3+
- Weapons lose 1 durability per player attack; armor loses 1 per hit received
- Warning at 25% durability; breaks at 0
- **Cursed equipment** (20% chance on ground items, depth 3+): -1 bonus and cannot be unequipped until Remove Curse scroll is used

### Enchantments

Enchanted equipment drops from bosses (guaranteed) and depth 4+ monsters (15% chance, then 50% to be enchanted). Level 1-2.

**Weapon enchantments:**

| Type | Effect |
|------|--------|
| Fire | 30% chance to burn target (2 turns) |
| Ice | 30% chance to stun target (1 turn) |
| Vampiric | Heal enchantment-level HP on kill |

**Armor enchantments:**

| Type | Effect |
|------|--------|
| Thorns | Reflect 1 to (level+1) damage back to attacker |
| Swift | Immunity to Slow status |

### Other Items

| Item | Char | Effect |
|------|------|--------|
| Throwing Knife | `/` | 4 damage ranged attack (8 tile range, consumed) |
| Ration | `%` | +40 hunger |
| Whetstone | `)` | Permanent +1 ATK |
| Amulet of Yendor | `"` | Auto-pickup; begins ascent phase |

## Dungeon Features

### Room Types

| Type | Description |
|------|-------------|
| Normal | 1-2 monsters, ~45% chance for an item |
| Treasure | 2-4 items + a guarding monster |
| Shop | 2-4 priced items + shopkeeper (`$`, invincible). Buy with gold (press `y`/`n`). |
| Boss | Dragon (depth 5) or Lich (depth 10) in the last room |

Shops appear from depth 2+. Gold drops from killed monsters (1-5 per kill, 1-3 from pet kills).

### Terrain

| Tile | Char | Effect |
|------|------|--------|
| Floor | `·` | Normal movement |
| Wall | `#` | Impassable (except ghosts/wraiths) |
| Water | `~` | Slows movement (skip next turn) for player and non-ghost monsters |
| Deep Water | `~` | Impassable (except ghosts/wraiths). Appears depth 4+ |
| Grass | `"` | Concealment — monsters >1 tile away cannot see you |
| Burning Grass | `"` | 2 HP damage per turn; spreads to adjacent grass |
| Lava | `~` | 3 HP damage per turn. Fire Imps and shopkeeper immune. Appears depth 8+ |
| Stairs Down | `>` | Descend to next depth |
| Stairs Up | `<` | Ascend (only during ascent phase) |

### Traps (hidden until triggered)

| Trap | Effect |
|------|--------|
| Spike | 2-5 damage |
| Teleport | Random relocation |
| Alarm | Spawns 1-2 rats/goblins nearby |

Trap count per floor: 2 to (3 + current depth).

### Map Generation

- 80x30 tile grid
- 7-12 rooms connected by L-shaped corridors with 1-3 extra loop corridors
- Flood-fill validates all rooms are reachable from spawn
- FOV: 720-ray raycasting with radius 10 (3 when blinded)

## Status Effects

| Status | Icon | Source | Effect |
|--------|------|--------|--------|
| Poison | PSN | Snake | Damage per turn |
| Bleed | BLD | Dragon | Damage per turn |
| Burn | BRN | Fire Imp | Damage per turn |
| Slow | SLW | Ogre | 50% chance to waste movement turn |
| Blind | BLN | Ghost, Lich | FOV reduced to 3 |
| Stun | STN | Shield Bash, Ice enchant | Monster skips turn |
| Fear | FER | Battle Cry | Monster flees from player |

## Monster Loot Drop Rates

| Monster | Drop Chance |
|---------|-------------|
| Rat | 20% |
| Goblin | 35% |
| Snake | 40% |
| Archer | 40% |
| Ogre | 60% |
| Ghost | 30% |
| Slime | 15% |
| Small Slime | 10% |
| Skeleton | 15% |
| Wraith | 35% |
| Fire Imp | 30% |
| Dragon | 100% (enchanted) |
| Lich | 100% (enchanted) |

Normal drops: 45% small health potion, 15% ration, 15% throwing knife, 25% whetstone.

## Auto-Explore

Press `x` to auto-explore. BFS pathfinding moves toward unrevealed tiles. Stops automatically when:
- Monster spotted
- Item found
- Stairs reached
- Player takes damage

## Save System

- Auto-saves when descending stairs
- Save deleted on load (permadeath)
- Leaderboard persists (top 10, sorted: wins first by fewest turns, deaths by deepest depth)
