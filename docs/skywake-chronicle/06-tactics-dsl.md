# 06. 战术规则 DSL（可视化编辑器后端结构）

目标：让玩家像“写规则”而不是“点技能”。

## 1. 规则执行模型

- 作用域：
  - `party_rules`（队伍级）
  - `character_rules`（角色级）
- 执行时机：
  - `on_node_enter`
  - `on_turn_start`
  - `on_turn_end`
  - `on_combat_end`
- 执行顺序：
  1. 队伍规则（高优先级）
  2. 角色规则（按角色位序）
  3. 默认行为（fallback）

## 2. DSL 结构（JSON）

```json
{
  "version": 1,
  "rules": [
    {
      "id": "rule_retreat_low_stress",
      "scope": "party",
      "trigger": "on_turn_start",
      "priority": 100,
      "when": {
        "all": [
          { "fact": "ally_min_stress_pct", "op": "<=", "value": 20 },
          { "fact": "combat_is_boss", "op": "==", "value": false }
        ]
      },
      "then": { "action": "retreat_combat" },
      "cooldown_turns": 0,
      "enabled": true
    }
  ]
}
```

## 3. 条件枚举（MVP）

MVP 上限：12 条（可配置、可裁剪）。

说明：

- 上限 12 指“单条规则内可用条件叶子数量上限”。
- fact 类型可以超过 12（当前目录为 16），用于内容扩展预留。

- 角色状态：
  - `self_stress_pct`
  - `self_has_consequence`
  - `self_resource_pct`
- 队伍状态：
  - `ally_min_stress_pct`
  - `party_consumable_count`
  - `party_has_item`
- 敌方状态：
  - `enemy_has_aspect`
  - `enemy_count_alive`
  - `enemy_is_elite`
- 场景状态：
  - `scene_has_aspect`
  - `node_type`
  - `time_window`
- 系统状态：
  - `fate_point_count`
  - `turn_index`
  - `rule_triggered_recently`

## 4. 动作枚举（MVP）

MVP 上限：14 条（可配置、可裁剪）。

- Fate 四动作：
  - `attack_skill`
  - `defend_stance`
  - `create_advantage`
  - `overcome_obstacle`
- 资源动作：
  - `use_consumable`
  - `save_resource_mode`
- 队伍动作：
  - `retreat_combat`
  - `retreat_explore`
  - `use_key_item_slot`
- 兜底动作：
  - `basic_attack`
  - `wait`

## 5. 规则求值语义

- `when` 支持 `all` / `any` / `not` 组合。
- 命中后按“混合冲突策略”执行：
  - 队伍规则：高优先级抢占（命中后停止同触发时机低优先级队伍规则）。
  - 角色规则：允许合并执行（按优先级依次执行，直到资源/动作槽耗尽）。
- 若无命中，执行 `fallback_action`。
- 每条规则可设置冷却回合，避免反复抖动。

执行伪代码（简化）：

```text
for trigger in frame:
  run party rules by priority (preemptive)
  run character rules by slot order (merge)
  if no action selected:
    apply fallback by role
```

## 6. 可视化编辑器映射

- 玩家看到的是“触发条件卡片 + 动作卡片 + 优先级”。
- 列表交互：支持拖拽排序、点击展开条件、长按禁用/复制。
- 移动端约束：
  - 单行卡片高度 >= 48dp
  - 条件编辑使用“可触达选项列表”，避免依赖数字键盘
  - 关键确认按钮固定在底部安全区
- 默认兜底行为：
  - 坦克：`defend_stance`
  - 输出：`basic_attack`
  - 辅助：`create_advantage`（无效时 `wait`）

编辑器防错规则（MVP）：

- 队伍作用域禁止绑定角色专属动作（如 `attack_skill`）。
- `in` 运算符仅允许数组值。
- 条件树最大深度 5，单组最大子节点 8。
- 规则 ID 必须唯一且符合正则：`^[a-z][a-z0-9_]{2,63}$`。

## 7. 示例规则包（MVP）

1. 生存优先：
   - `ally_min_stress_pct <= 25` -> `retreat_combat`
2. 破甲起手：
   - `enemy_has_aspect=装甲厚重` -> `create_advantage(关节破绽)`
3. 节省资源：
   - `self_resource_pct < 30` -> `basic_attack`
4. 机关处理：
   - `node_type=gate AND party_has_item=phase_calibrator` -> `use_key_item_slot`

## 8. 调试输出（必须）

每次命中规则记录：

- `rule_id`
- `trigger`
- `condition_eval_trace`
- `selected_action`
- `skip_reason`（若未命中）

这部分日志用于“失败可解释”与线上平衡分析。

## 9. 已拍板决策（2026-02-25）

1. MVP 条件枚举上限：12 条（`1C`）。
2. MVP 动作枚举上限：14 条（`2C`）。
3. 规则冲突策略：混合（队伍规则抢占，角色规则合并）（`3C`）。
4. 默认 fallback：按职业模板（坦克防御/输出进攻/辅助维持）（`4C`）。

## 10. 可执行契约文件

- DSL JSON Schema：
  - `docs/skywake-chronicle/contracts/json/tactics-dsl-v1.schema.json`
- 枚举与类型：
  - `docs/skywake-chronicle/contracts/ts/tactics-dsl.ts`
- 运行时校验器：
  - `docs/skywake-chronicle/contracts/ts/tactics-validator.ts`

## 11. QA 用例建议（MVP）

- 冲突策略验证：
  - 同 trigger 下队伍规则与角色规则冲突时，验证“队伍抢占”生效。
- 上限验证：
  - 单规则 13 个条件叶子时，应返回校验错误。
- 类型验证：
  - `self_stress_pct` 使用字符串值时，应返回 `INVALID_VALUE_TYPE`。
