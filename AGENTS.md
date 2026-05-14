# AGENTS.md

See [CLAUDE.md](CLAUDE.md) for general working style and change discipline. This file only captures repo-specific facts that are easy to miss.

## Commands

- Prefer `bun` for JS/TS commands. Tauri shells out to `bun run dev` and `bun run build` from [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json).
- Main frontend validation is `bun run build`. It runs `tsc && vite build`.
- Run the desktop shell with `bun run tauri dev` from the repo root when the task touches Tauri integration or window behavior.
- For Rust-only validation, run `cargo check` from `src-tauri/`.
- There is no dedicated lint or test script yet.

## Project Shape

- [src/](src/) is the React 19 + Vite + TypeScript frontend.
- [src/main.tsx](src/main.tsx) mounts [src/App.tsx](src/App.tsx), which renders the custom title bar and router.
- [src/router/index.tsx](src/router/index.tsx) uses `createHashRouter`; do not switch the app to browser-history routing.
- [src/components/ui/](src/components/ui/) contains shadcn/radix-nova style primitives. Prefer composing app features around them instead of rewriting them.
- [src/components/system/](src/components/system/) contains app-specific desktop chrome such as the custom title bar.
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs) registers Tauri commands and Linux-specific runtime environment tweaks.

## Frontend Conventions

- Use the `@/` alias for imports from [src/](src/).
- TypeScript is strict and treats unused locals or parameters as build errors.
- The Vite dev server is pinned to port `1420` with strict port checking, and HMR uses `1421`.
- [vite.config.ts](vite.config.ts) ignores `src-tauri/**`, so Rust changes need Tauri-side validation, not just the Vite dev server.

## Tauri Notes

- If you edit [src/components/system/top-bar.tsx](src/components/system/top-bar.tsx), keep `data-tauri-drag-region` and the `@tauri-apps/api/window` behavior intact.
- Current Rust commands are `greet`, `read_file_content`, and `scan_project`. Add new commands in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) and register them in `tauri::generate_handler!`.

## References

- [README.md](README.md) covers the template-level setup.
- [CLAUDE.md](CLAUDE.md) defines the expected change discipline for coding agents.
