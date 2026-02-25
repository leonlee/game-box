# 04. 日志事件规范（Log Event Spec）

目标：日志既像冒险叙事，又能支撑策略复盘。

## 1. 事件结构（Canonical）

```json
{
  "run_id": "run_20260225_001",
  "seq": 128,
  "time_offset_sec": 842,
  "floor": 7,
  "node_id": "F7_N12",
  "event_type": "combat_action",
  "actor_id": "char_ranger_01",
  "target_id": "enemy_fogbeast_02",
  "action": "create_advantage",
  "outcome": "success",
  "value": 2,
  "aspects_added": ["风向已掌握"],
  "reason_tags": ["advantage_setup"],
  "loc_key": "log.combat.create_advantage.success",
  "loc_args": {
    "actor": "游侠",
    "target": "雾行兽",
    "aspect": "风向已掌握"
  }
}
```

## 2. 必填字段

- `run_id`、`seq`、`floor`、`node_id`
- `event_type`、`outcome`
- `loc_key`、`loc_args`

字段类型约束（MVP）：

- `run_id`: string（非空）
- `seq`: int（>= 1，单 run 内严格递增）
- `time_offset_sec`: int（>= 0）
- `floor`: int（>= 1）
- `event_type`: enum（见第 3 节）
- `reason_tags`: string[]（核心或 `ext.*`）

## 3. 推荐事件类型

- `run_start` / `run_end`
- `floor_enter` / `floor_leave`
- `node_enter` / `node_exit`
- `combat_start` / `combat_action` / `combat_end`
- `overcome_check`
- `loot_drop`
- `retreat_triggered`
- `gate_blocked`
- `quest_progress`

按事件类型的 payload 最小字段：

- `combat_action`：
  - `actor_id`、`action`、`outcome`
- `retreat_triggered`：
  - `rule_id`、`reason_tags`
- `gate_blocked`：
  - `gate_id`、`missing_key`
- `quest_progress`：
  - `quest_id`、`step_index`、`status`

## 4. reason_tags（复盘核心）

标准标签（MVP）：

- `missing_key_item`
- `missing_required_aspect`
- `retreat_hp_threshold`
- `retreat_resource_threshold`
- `time_window_missed`
- `enemy_overwhelm`
- `path_blocked`
- `tactic_no_valid_action`

治理策略（已拍板）：

- 冻结核心白名单（以上标签不随小版本变动）。
- 预留扩展标签命名空间：`ext.*`（例如 `ext.route_hazard_spike`）。
- 统计与告警只对核心标签做稳定看板，扩展标签用于实验与活动。

推荐严重度映射（用于数据看板）：

- `S1`：`enemy_overwhelm`、`tactic_no_valid_action`
- `S2`：`missing_key_item`、`missing_required_aspect`、`time_window_missed`
- `S3`：`retreat_hp_threshold`、`retreat_resource_threshold`、`path_blocked`

## 5. 日志渲染策略

1. 先结构化保存，后文本渲染。
2. 支持“叙事视图”与“调试视图”切换，入口位于日志页顶部双段切换。
3. 调试视图必须展示：
   - 触发规则 ID（仅高级模式显示）
   - 关键判定值
   - retreat reason tags

UI 展示规范：

- 单条日志保持两行以内摘要，点击展开细节。
- 叙事视图默认按“章节化段落”聚合，减少刷屏。
- 调试视图支持按 `reason_tag`、`event_type` 过滤。

## 6. 样例文本模板

- `log.gate.blocked`：
  - zh: `门上的{seal_name}没有响应，你们被迫折返。`
  - en: `The {seal_name} did not respond. The team had to fall back.`

- `log.retreat.triggered`：
  - zh: `队伍触发撤退规则：{rule_name}。`
  - en: `Retreat rule triggered: {rule_name}.`

## 7. 已拍板决策（2026-02-25）

1. `reason_tags`：冻结核心白名单 + 扩展预留（`1C`）。
2. 叙事/调试切换入口：日志页顶部双段切换（`2A`）。
3. 规则 ID 展示：仅高级模式显示（`3B`）。

## 8. 数据保留策略（MVP）

- 本地仅保留最近 30 次 run 的完整事件流。
- 更早数据只保留 run 级摘要（成功率、撤退原因分布）。
- 导出日志时默认脱敏：
  - 玩家昵称可选匿名化。
