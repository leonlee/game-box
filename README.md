[![Build & Deploy to GitHub Pages](https://github.com/leonlee/game-box/actions/workflows/deploy.yml/badge.svg)](https://github.com/leonlee/game-box/actions/workflows/deploy.yml)
# Sandbox Games

浏览器小游戏合集。

## 游戏列表

### 苍穹航痕 (Skywake Chronicle)

自动探索日志 RPG 原型，围绕“配置战术 -> 自动出征 -> 阅读日志 -> 调参复跑”循环构建。

- 3 人队伍自动探索与结构化日志
- 战术风格模板（好斗/均衡/谨慎）+ 手动规则编辑
- 叙事/调试双视图日志
- 重惩罚结算与任务推进
- 移动端触控友好 UI

### 迷你地牢 (Brogue Mini)

一款受 Brogue 启发的轻量 Roguelike 地牢探险游戏。探索随机生成的地牢、击败怪物、收集战利品。

- 随机生成 10 层地牢关卡
- 怪物、陷阱、物品系统
- 装备耐久度与状态效果
- 宠物伙伴与技能系统
- 中英文双语支持
- 排行榜与存档
- 移动端触控支持
- [详细玩法说明 (Gameplay Guide)](packages/brogue-mini/GAMEPLAY.md)

### 五十音学习 (Japan Syllabary)

日语假名学习游戏，支持多玩家存档与关卡进度。

- 平假名 / 片假名学习
- 听音选字与看字选音
- 多难度关卡与星级评价
- 同伴成长系统
- TTS 语音朗读

### 我们的日语 (Our Japan)

Minecraft 风格的日语学习冒险游戏，基于《大家的日本语》教材第 15-25 课。

- 词汇冲刺、句子组装、语法检查、对话、Boss 战五种题型
- 2D 横向卷轴世界与建筑成长系统
- 错题本与复习机制
- 经验值与等级系统
- 多玩家存档

## 开发

```bash
# 安装依赖
npm install

# 构建所有游戏
npm run build

# 构建单个游戏
npm run build:brogue-mini
npm run build:skywake-chronicle
npm run build:japan-syllabary
npm run build:our-japan

# 开发模式（监听文件变更）
npm run watch -w packages/brogue-mini

# 类型检查（所有游戏）
npm run typecheck

# 类型检查（单个游戏）
npx tsc --noEmit -p packages/brogue-mini
```

## 项目结构

```
game-box/
├── packages/
│   ├── skywake-chronicle/ # 苍穹航痕
│   ├── brogue-mini/       # 迷你地牢
│   ├── japan-syllabary/   # 五十音学习
│   └── our-japan/         # 我们的日语
├── index.html             # 首页
├── package.json           # 工作区配置
└── tsconfig.base.json     # 共享 TS 配置
```

## 技术栈

- TypeScript + Canvas 2D / DOM（无框架依赖）
- esbuild 打包
- npm workspaces monorepo
- GitHub Actions 自动部署至 GitHub Pages

## License

[MIT](LICENSE)
