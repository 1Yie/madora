# Repository Guidelines

## Project Overview

Madora is a Tauri v2 desktop app for Markdown editing with AI autocompletion. The frontend is React 19 + Vite 7 + TypeScript (strict mode), styled with Tailwind CSS v4 via shadcn/ui (radix-nova style, `@base-ui/react` primitives). The backend is Rust with 40+ Tauri commands across 8 modules. AI completions use a Fill-in-the-Middle (FIM) pattern with 5 provider implementations (OpenAI, Anthropic, DeepSeek, Kimi, Custom).

## Architecture & Data Flow

```
Frontend (React/TypeScript)
    ↕ Tauri IPC (invoke + Channel<String> for streaming)
Commands (src-tauri/src/commands/) — thin wrappers
    ↕ service calls
Services (src-tauri/src/services/) — business logic
    ↕ model types
Models (src-tauri/src/models/) — serde serialization types
```

**Provider chain (React → Tauri):** `main.tsx` mounts `ThemeProvider → ToastProvider → AiSettingsProvider → ProseThemeProvider → App`. `App` renders a custom title bar + hash router. The single route `/` loads `MainLayout` → `WorkspaceBrowser`, which orchestrates the resizable sidebar (file tree) + content pane (editor/preview).

**AI completion data flow:** User types in CodeMirror → `use-editor` hook debounces input (80ms) → calls `invoke('generate_completion_stream')` with prefix/suffix → Rust `AiCompletionService` checks cache (15s TTL, 128 entries), deduplicates in-flight → delegates to `CompletionProvider` trait → `PromptManager` renders FIM templates → HTTP request to provider → SSE stream back through `Channel<String>` → rendered as inline ghost text via CodeMirror `Decoration.widget`.

**State management:** No global state library — React Context for providers, `useState`/`useReducer` for component state, `EditorEntry` registry pattern (`unsaved-registry.ts`) backed by `Map<string, EditorEntry>` with localStorage draft fallback.

## Key Directories

| Path                       | Purpose                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/`                     | React frontend source                                                                                       |
| `src/components/ui/`       | ~55 shadcn-style UI primitives on `@base-ui/react` (Dialog, Sheet, Button, Select, Toast, ScrollArea, etc.) |
| `src/components/system/`   | Desktop chrome: title bar, settings dialog, theme/AI-settings/prose-theme providers                         |
| `src/components/explorer/` | Workspace browser, file tree sidebar, preview pane, markdown editor/preview, git panel                      |
| `src/hooks/`               | Custom hooks: `use-editor` (CodeMirror + AI completion), `use-media-query`                                  |
| `src/lib/`                 | Utilities: `cn()` (clsx+tailwind-merge), cross-platform path utils, unsaved registry, prose theme defaults  |
| `src/__tests__/`           | Vitest test files                                                                                           |
| `src-tauri/src/commands/`  | 8 Tauri command modules (ai, explorer, git, project, secure_storage, system, theme, utility)                |
| `src-tauri/src/services/`  | 3 services: ai, explorer, project                                                                           |
| `src-tauri/src/providers/` | 5 AI provider implementations + common SSE parser                                                           |
| `src-tauri/src/models/`    | Shared serde types for AI, explorer, git                                                                    |
| `src-tauri/src/prompt/`    | Prompt template manager with per-provider FIM templates                                                     |
| `src-tauri/prompts/`       | Compiled-in FIM prompt templates (`{provider}/fim_{system,user}.md`)                                        |
| `src-tauri/gen/`           | Auto-generated Tauri v2 schemas                                                                             |
| `src-tauri/tests/`         | Rust integration tests                                                                                      |

## Development Commands

Frontend validation with `bun run build` (runs `tsc && vite build`).

```bash
bun run dev          # Vite dev server (port 1420, HMR 1421)
bun run build        # tsc + vite build
bun run test         # Vitest
bun run test:watch   # Vitest watch mode
bun run tauri dev    # Tauri desktop shell (from repo root)
bun run tauri build  # Production build
bun run lint         # ESLint 10 flat config
bun run lint:fix     # ESLint with --fix
bun run format       # Prettier (tabs, single quotes, semicolons, trailingComma es5)
```

In `src-tauri/`:

```bash
cargo check          # Rust-only validation
cargo test           # Rust tests (includes git integration tests)
```

## Code Conventions & Common Patterns

### TypeScript / React

- **TypeScript strict mode**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` — unused locals/params are build errors.
- **Imports**: Use `@/` alias (maps to `src/`). No relative imports outside immediate directory.
- **UI primitives**: All in `src/components/ui/`. Use `cn()` (clsx + tailwind-merge) for class composition, `cva` for variant slots, `useRender` + `mergeProps` for polymorphism (from `@base-ui/react`). Follow shadcn patterns.
- **Error handling**: Error calls surfaced via `showErrorToast()` from `@/components/ui/toast`. No error boundaries currently.
- **Hooks**: Custom hooks in `src/hooks/`. `use-editor.tsx` uses React 19 `useEffectEvent` for stable callbacks, `useSyncExternalStore` for subscription-based state.
- **Side effects**: Tauri `invoke` calls are async. `useState`/`useReducer` for local state. Commands return `Result<T, string>` from Rust.
- **No form libraries**: Forms built from primitives (Button, Input, Select, Switch, etc.).

### Rust

- **All `#[tauri::command]` are `async fn`** (except `greet`, `get_system_theme`).
- **Return type**: `Result<T, String>` — errors are stringified, no custom error enum.
- **Managed state**: accessed via `tauri::State<'_, T>`, registered in `app.rs`.
- **`CompletionProvider` trait**: `#[async_trait] pub trait CompletionProvider: Send + Sync` with required `request_fim_completion` and default `request_fim_completion_stream` (calls non-stream by default). Providers are static singletons.
- **Streaming**: Uses Tauri `Channel<String>`. Provider callbacks are `&mut dyn FnMut(String) -> Result<(), String>`. Common SSE parser in `providers/common.rs`.
- **AI caching**: `AiCompletionService` holds `Mutex<HashMap<CompletionCacheKey, CachedCompletion>>`, 15s TTL, 128 max entries, with in-flight dedup via `Arc<InFlightCompletionRequest>`.
- **Secure storage**: API keys via OS keyring (`keyring` crate, service name `"madora.ai"`), cached in `LazyLock<Mutex<HashMap>>`.
- **Path safety**: All filesystem operations validate paths stay within workspace root via `ensure_within_root` + canonicalization.
- **Encoding**: File reads use `chardetng` for detection + `encoding_rs` for decoding. BOM handling. UTF-8 canonical.
- **Prompt system**: `PromptManager` resolves templates from XDG config dir with fallback to compiled-in defaults (`include_str!`). `{{variable}}` substitution via serde JSON flatten.

### Git

- **Conventional commits**: Enforced via commitlint + husky `commit-msg` hook.
- **Pre-commit format**: lint-staged runs `prettier --write` on staged `*.{js,jsx,ts,tsx,vue,json,css,scss,md}` files.

## Important Files

| File                                                      | Role                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/main.tsx`                                            | React entry point — provider tree + App mount                      |
| `src/App.tsx`                                             | Shell: title bar + hash router                                     |
| `src/router/index.tsx`                                    | Hash router config (`createHashRouter`)                            |
| `src/components/explorer/workspace/workspace-browser.tsx` | Main orchestrator (~1196 lines) — workspace state machine          |
| `src/components/explorer/file/file-explorer-sidebar.tsx`  | File tree sidebar (~1350 lines)                                    |
| `src/components/explorer/file/file-preview.tsx`           | Content preview pane                                               |
| `src/components/explorer/git/git-panel.tsx`               | Git workbench (~1218 lines)                                        |
| `src/hooks/use-editor.tsx`                                | CodeMirror 6 + AI completion hook (~1303 lines)                    |
| `src/lib/unsaved-registry.ts`                             | Unsaved editor tracking + localStorage draft persistence           |
| `src/lib/path-utils.ts`                                   | Cross-platform path utilities (Windows drive letter support)       |
| `src/index.css`                                           | Tailwind v4 + shadcn + theme tokens + Geist font + KaTeX           |
| `src-tauri/src/lib.rs`                                    | Rust library root — module declarations + `run()`                  |
| `src-tauri/src/app.rs`                                    | App setup — plugins, managed state, 40+ command registration       |
| `src-tauri/src/services/ai.rs`                            | AI completion cache + dedup + dispatch                             |
| `src-tauri/src/providers/mod.rs`                          | `CompletionProvider` trait definition + static provider singletons |
| `src-tauri/src/prompt/mod.rs`                             | Prompt template manager with XDG fallback                          |
| `src-tauri/tauri.conf.json`                               | Tauri v2 window/build/bundle config                                |
| `src/assets/models.json`                                  | AI model catalogue (18 models across 4 providers)                  |

## Runtime/Tooling Preferences

| Tool                         | Choice                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| Package manager              | **Bun** (`bun.lock`, `bun run` for all scripts)                    |
| Frontend build               | Vite 7                                                             |
| Desktop framework            | Tauri v2                                                           |
| Rust edition                 | 2021                                                               |
| CSS                          | Tailwind CSS v4 (no PostCSS config — uses `@import "tailwindcss"`) |
| Font                         | Geist (Vercel)                                                     |
| Math rendering               | KaTeX                                                              |
| Markdown syntax highlighting | Shiki                                                              |
| UI component library         | shadcn/ui style on `@base-ui/react` (Radix v2 successor)           |
| Icons                        | Lucide                                                             |
| Linting                      | ESLint 10 flat config                                              |
| Formatting                   | Prettier (tabs, single quotes)                                     |
| Commit convention            | Conventional Commits                                               |
| Code quality                 | Husky + commitlint + lint-staged                                   |

## Testing & QA

### Frontend tests (Vitest)

- **Framework**: Vitest 4, `happy-dom` DOM environment, `@testing-library/react` 16, `@testing-library/user-event` 14, `@testing-library/jest-dom` 6.
- **Setup**: `src/__tests__/setup.ts` polyfills browser APIs (ResizeObserver, IntersectionObserver, matchMedia) and mocks `@tauri-apps/api/core` (Channel, invoke) so tests run without Tauri.
- **Test location**: `src/__tests__/*.test.{ts,tsx}`.
- **Types of tests**:
  - **Pure function tests** (`path-utils.test.ts`, `git-utils.test.ts`, `editor-utils.test.ts`): Test helper functions by replicating implementations locally. No component rendering.
  - **Component tests** (`git-tab-commit.test.tsx`, `file-explorer-sidebar.test.tsx`, `workspace-browser.test.tsx`, `toast.test.tsx`): Render components with mocked Tauri invoke and provider wrappers. Use `@testing-library/react` (render, waitFor, screen).
- **Running**: `bun run test` or `vitest`.

### Rust tests

- **Integration tests**: `src-tauri/tests/git_integration.rs` uses `tempfile` + real `git2` + subprocess `git` CLI. Tests init/add/commit/status/log/branch/merge/conflict detection.
- **Rust unit tests**: Inline in provider/service modules with mock HTTP responses.
- **Running**: `cargo test` from `src-tauri/`.

### Build verification

- `bun run build` runs `tsc && vite build` — TypeScript errors fail the build.
- No dedicated E2E tests exist.
