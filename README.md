[![Build & Deploy to GitHub Pages](https://github.com/leonlee/game-box/actions/workflows/deploy.yml/badge.svg)](https://github.com/leonlee/game-box/actions/workflows/deploy.yml)
# Sandbox Games

浏览器小游戏合集。

## 游戏列表

### 迷你地牢 (Brogue Mini)

一款受 Brogue 启发的轻量 Roguelike 地牢探险游戏。探索随机生成的地牢、击败怪物、收集战利品。

- 随机生成地牢关卡
- 怪物、陷阱、物品系统
- 装备耐久度与状态效果
- 中英文双语支持
- 排行榜与存档

## 开发

```bash
# 安装依赖
npm install

# 构建所有游戏
npm run build

# 构建单个游戏
npm run build:brogue-mini

# 类型检查
npx tsc --noEmit -p packages/brogue-mini
```

## 项目结构

```
game/
├── packages/
│   └── brogue-mini/    # 迷你地牢
├── index.html          # 首页
├── package.json        # 工作区配置
└── tsconfig.base.json  # 共享 TS 配置
```

## License

[MIT](LICENSE)
