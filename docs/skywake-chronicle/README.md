# 苍穹航痕（Skywake Chronicle）文档索引

这是新游戏的可开工文档包（Fate 风味自动探索日志 RPG）。

## 文档列表

1. [01-product-gdd.md](./01-product-gdd.md)
2. [02-worldbuilding.md](./02-worldbuilding.md)
3. [03-systems.md](./03-systems.md)
4. [04-log-event-spec.md](./04-log-event-spec.md)
5. [05-data-schema.md](./05-data-schema.md)
6. [06-tactics-dsl.md](./06-tactics-dsl.md)
7. [07-mvp-roadmap.md](./07-mvp-roadmap.md)
8. [08-discussion-checklist.md](./08-discussion-checklist.md)
9. [09-engineering-handoff.md](./09-engineering-handoff.md)
10. [contracts/README.md](./contracts/README.md)

## 建议讨论顺序

1. `01-product-gdd.md`：确认目标用户、核心循环、胜负体验。
2. `02-worldbuilding.md`：确认世界观名词与阵营冲突主轴。
3. `03-systems.md`：确认战斗/探索/经济系统边界。
4. `06-tactics-dsl.md`：确认战术编辑器最小可玩集合。
5. `04-log-event-spec.md`：确认日志可解释性标准。
6. `05-data-schema.md`：确认工程落地字段。
7. `07-mvp-roadmap.md`：确认排期和产能。
8. `08-discussion-checklist.md`：复核已拍板项与开工前检查。
9. `09-engineering-handoff.md`：从文档进入工程落地（Schema/DSL）。

## 目标

- 先把“可跑 + 可解释 + 可扩展”的底层文档钉死。
- 再进入原型开发（先规则模拟器，再 UI，再内容）。

## 当前状态（2026-02-25）

- 讨论项已全部拍板（见 `08-discussion-checklist.md`）。
- 工程契约已落地（见 `contracts/` 与 `09-engineering-handoff.md`）。
- 当前可直接进入：
  - 模拟器联调
  - 首包内容导表
  - 战术编辑器接线
