# Madora

**Markdown editing, powered by AI.**

Madora 是一款基于 Tauri 的桌面 Markdown 编辑器，深度集成 AI 自动补全，提供流畅的写作体验。

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (推荐) 或 Node.js >= 20
- [Rust](https://rustup.rs/) (用于 Tauri 开发)

### Development

```bash
# 安装前端依赖
bun install

# 启动 Vite 开发服务器（浏览器模式，仅前端）
bun run dev

# 启动 Tauri 桌面应用（含 Rust 后端）
bun run tauri dev
```

Vite 开发服务器运行在 `http://localhost:1420`，HMR 端口 `1421`。

### Build

```bash
# 仅构建前端
bun run build          # 执行 tsc && vite build

# 构建桌面应用
bun run tauri build
```

## Project Structure

```
madora/
├── src/                    # React 前端
│   ├── components/
│   │   ├── explorer/       # 工作区、文件浏览器、Markdown 编辑器、Git 面板
│   │   ├── system/         # 标题栏、主题、设置对话框
│   │   └── ui/             # coss.com/ui 基础组件
│   ├── hooks/              # 自定义 React Hooks
│   ├── layout/             # 布局组件
│   ├── lib/                # 工具函数
│   └── router/             # 路由配置
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── commands/       # Tauri 命令
│       ├── models/         # 数据模型
│       ├── services/       # 业务逻辑
│       ├── providers/      # AI 提供商实现
│       └── prompt/         # 提示词模板
├── public/                 # 静态资源
└── scripts/                # 工具脚本
```

## Version Management

版本号统一管理：

```bash
bun run bump-version <new-version>
```

同步更新 `package.json`、`tauri.conf.json` 和 `Cargo.toml`。

## Links

- Website: https://madora.ichiyo.in
- Source: https://github.com/1Yie/madora

## License

[GNU General Public License v3.0](LICENSE)
