# 09. 工程交付包（Schema v0.1 + DSL 校验）

## 1. 交付目标

本交付对应已拍板的两项：

1. `schema v0.1`（SQLite DDL + JSON 字段契约）
2. 战术 DSL 枚举常量 + 校验规则（可直接接工程）

## 2. 交付文件

- `/docs/skywake-chronicle/contracts/sql/schema-v0.1.sql`
- `/docs/skywake-chronicle/contracts/json/content-pack-v0.1.schema.json`
- `/docs/skywake-chronicle/contracts/json/tactics-dsl-v1.schema.json`
- `/docs/skywake-chronicle/contracts/json/tactics-config.sample.json`
- `/docs/skywake-chronicle/contracts/ts/tactics-dsl.ts`
- `/docs/skywake-chronicle/contracts/ts/tactics-validator.ts`
- `/docs/skywake-chronicle/contracts/README.md`

## 3. 与已拍板结论对齐

- 静态数据边界：JSON（职业/技能/道具/怪物/迷宫/任务）
- 动态数据边界：SQLite（存档、角色状态、背包、任务进度、runs/events）
- 存档兼容策略：仅同大版本兼容
- DSL 上限：条件 12 / 动作 14
- 冲突策略：队伍规则抢占 + 角色规则合并

## 4. 开工建议

1. 先在模拟器项目中接入 `schema-v0.1.sql` 与 `tactics-validator.ts`。
2. 将策划导表输出映射为 `content-pack-v0.1.schema.json`。
3. 用 `tactics-config.sample.json` 做首个联调样例。

## 5. 最小联调步骤（建议）

1. 初始化本地数据库：
   - `sqlite3 skywake-save.db < docs/skywake-chronicle/contracts/sql/schema-v0.1.sql`
2. 加载静态 content pack 并执行 JSON Schema 校验。
3. 加载战术配置并执行 `validateTacticsConfig`。
4. 触发一场最小 run，检查：
   - `runs` 生成 1 条记录
   - `run_events` 事件序列 `seq` 连续递增
   - 结算事件包含 `reason_tags`

## 6. 完成定义（DoD）

- 数据层：
  - 新增存档可建可读可删，表间外键无破坏。
- 规则层：
  - 非法 DSL 输入可稳定返回错误列表。
- 玩法层：
  - 调整一条战术规则后，日志可观测到行为差异。
