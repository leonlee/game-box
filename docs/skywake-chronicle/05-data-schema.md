# 05. 数据 Schema（JSON/SQLite 草案）

## 1. 核心表（建议）

- `characters`
- `skills`
- `stunts`
- `aspects`
- `items`
- `dungeons`
- `dungeon_nodes`
- `quests`
- `runs`
- `run_events`
- `saves`

## 2. 字段示例

### 2.1 characters

```sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  race_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  stress_physical INTEGER NOT NULL,
  stress_mental INTEGER NOT NULL,
  consequence_light TEXT,
  consequence_mid TEXT,
  consequence_heavy TEXT,
  aspect_high_concept TEXT NOT NULL,
  aspect_trouble TEXT NOT NULL,
  aspect_background TEXT,
  created_at INTEGER NOT NULL
);
```

### 2.2 skills

```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,        -- combat / support / utility
  base_action TEXT NOT NULL,     -- overcome / create_advantage / attack / defend
  target_type TEXT NOT NULL,     -- self / ally / enemy / scene
  cost_type TEXT NOT NULL,       -- none / stress / resource
  cost_value INTEGER NOT NULL,
  power_formula TEXT NOT NULL,   -- 表达式或脚本键
  tags_json TEXT NOT NULL
);
```

### 2.3 stunts

```sql
CREATE TABLE stunts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,    -- passive / on_action / on_condition
  effect_script TEXT NOT NULL,
  cooldown_turns INTEGER NOT NULL DEFAULT 0
);
```

### 2.4 items

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL,       -- weapon / armor / accessory / consumable / quest
  rarity INTEGER NOT NULL,
  gear_aspect TEXT,
  gear_stunt_id TEXT,
  use_effect_script TEXT,
  stack_limit INTEGER NOT NULL DEFAULT 1,
  sell_price INTEGER NOT NULL DEFAULT 0
);
```

### 2.5 dungeons / nodes

```sql
CREATE TABLE dungeons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  recommended_level INTEGER NOT NULL,
  floor_count INTEGER NOT NULL,
  seed_scope TEXT NOT NULL
);

CREATE TABLE dungeon_nodes (
  id TEXT PRIMARY KEY,
  dungeon_id TEXT NOT NULL,
  floor INTEGER NOT NULL,
  node_type TEXT NOT NULL,       -- combat / event / trap / gate / camp / chest
  scene_aspects_json TEXT NOT NULL,
  opposition_level INTEGER NOT NULL,
  gate_condition_json TEXT,      -- 需求道具/标签/时间
  rewards_json TEXT NOT NULL
);
```

### 2.6 quests

```sql
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  quest_type TEXT NOT NULL,      -- main / side / challenge
  chapter INTEGER NOT NULL,
  title TEXT NOT NULL,
  objective_json TEXT NOT NULL,
  reward_json TEXT NOT NULL,
  unlock_condition_json TEXT
);
```

### 2.7 runs / events

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  dungeon_id TEXT NOT NULL,
  planned_floor INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  expected_end_at INTEGER NOT NULL,
  status TEXT NOT NULL            -- running / completed / failed / retreated
);

CREATE TABLE run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  floor INTEGER NOT NULL,
  node_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  reason_tags_json TEXT,
  timestamp_offset_sec INTEGER NOT NULL
);
```

## 3. 存档建议

- `save_version` 强制版本字段。
- 存档结构中保留：
  - 当前城镇状态
  - 队伍配置（技能/装备/战术）
  - 任务进度
  - run 快照

## 4. 实现建议

- 静态配置：JSON（版本控制友好）。
- 玩家状态：SQLite（查询高效）。
- 后续云同步：以 `runs` 与 `run_events` 增量上传。

## 5. 已拍板决策（2026-02-25）

1. JSON + SQLite 边界：`1A`
   - 静态内容（职业/技能/道具/怪物/迷宫模板）放 JSON。
   - 动态内容（角色状态/背包/任务进度/runs/run_events）放 SQLite。
2. 存档迁移策略：`2A`
   - 仅保证同大版本兼容。
   - 跨大版本不承诺自动迁移（需要升级提示与备份导出）。
3. 云同步优先级：`3B`
   - MVP 不做云同步，后续版本再接入。

## 6. 可执行契约文件

- SQLite DDL：
  - `docs/skywake-chronicle/contracts/sql/schema-v0.1.sql`
- 静态内容 JSON Schema：
  - `docs/skywake-chronicle/contracts/json/content-pack-v0.1.schema.json`

## 7. 草案表与可执行表映射

为避免“文档名词”和“SQL 实表”错位，MVP 以可执行 SQL 为准：

- `characters`（草案）-> `character_instances`（SQL）
- `runs`（草案）-> `runs`（SQL）
- `run_events`（草案）-> `run_events`（SQL）
- `items`（静态草案）-> JSON content pack（非 SQLite 静态表）
- `skills/stunts/dungeons/quests`（静态草案）-> JSON content pack

结论：

- SQLite 专注“玩家动态状态与运行态数据”。
- 静态内容统一从 JSON pack 装载到内存索引。

## 8. 关键查询场景（MVP）

- 回城结算页：
  - 读取 `runs` 最新一条 + 对应 `run_events` 聚合。
- 失败复盘页：
  - 按 `run_id` 查询 `run_events`，并按 `reason_tags_json` 聚类。
- 队伍配置页：
  - 读取 `character_instances` + `character_skill_slots` + `character_loadouts`。
- 背包页：
  - 按 `save_id` 查询 `inventory_items`，按 `is_locked`、`is_equipped` 过滤。

## 9. 迁移与回滚策略（同大版本）

- 升级流程：
  1. 检查 `schema_meta.schema_version`
  2. 顺序执行未应用迁移（记录到 `applied_migrations`）
  3. 执行迁移后做一次完整性检查（关键表 row count、索引存在性）
- 回滚原则：
  - 迁移失败即回滚事务，不进入半迁移状态。
  - 迁移前先做本地存档快照备份。
