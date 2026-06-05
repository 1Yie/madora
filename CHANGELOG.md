# [0.3.0](https://github.com/1Yie/madora/compare/v0.2.4...v0.3.0) (2026-06-05)

### Bug Fixes

- **app:** use Tauri 2.x PlatformWebview API for Windows WebView2 config ([d02a1b6](https://github.com/1Yie/madora/commit/d02a1b6ac0eccc74291a74c84cdb9655713f5eaf))
- **app:** wrap WebView2 COM calls in unsafe blocks ([b298613](https://github.com/1Yie/madora/commit/b298613a14cf0451cf45607aefacf470a07dcabd))
- **app:** wrap WebView2 COM calls in unsafe blocks ([b1aea84](https://github.com/1Yie/madora/commit/b1aea84624334d753ae0b6ab58182062e7deb8e7))

### Features

- add license activation system with env-based auth URL ([b60fe39](https://github.com/1Yie/madora/commit/b60fe39af7a1e05a31f7401d346155c26814a27a))

### Code Refactoring

- remove ScrollArea component in favor of plain divs ([2af8911](https://github.com/1Yie/madora/commit/2af8911acc8f94ecb28e344550b8df9c94e2e22e))

## [0.2.4](https://github.com/1Yie/madora/compare/v0.2.3...v0.2.4) (2026-05-29)

### Bug Fixes

- **workspace-browser:** prevent duplicate reload when selecting current file ([90f05d7](https://github.com/1Yie/madora/commit/90f05d72d7fbdf33d222f79ad94244f2d157bc83))

### Features

- **explorer:** add .mdx file extension support ([7bb2373](https://github.com/1Yie/madora/commit/7bb237308da52b4246d2a9b07772d815a25827eb))
- **file-explorer:** enhance document creation with extension validation ([2c6b8a5](https://github.com/1Yie/madora/commit/2c6b8a5398431636012abee7e6feb0aef6c308e6))

### Performance Improvements

- **scroll-area:** add will-change-transform for smoother scrolling ([04bfa60](https://github.com/1Yie/madora/commit/04bfa605ef558e654d83125d6b154058e20db6eb))

## [0.2.3](https://github.com/1Yie/madora/compare/v0.2.2...v0.2.3) (2026-05-28)

### Features

- add single instance plugin and improve git service structure ([8498a9c](https://github.com/1Yie/madora/commit/8498a9c2ab3abc091e0cbde7ac2b8d348219a0cd))

## [0.2.2](https://github.com/1Yie/madora/compare/v0.2.1...v0.2.2) (2026-05-28)

### Bug Fixes

- **ai-settings:** update anthropic default model ([71d05c4](https://github.com/1Yie/madora/commit/71d05c4cca6e481d45b27cd23bb03389904e6d0c))
- **git:** resolve Windows test failures from CRLF and short-name paths ([4368bd9](https://github.com/1Yie/madora/commit/4368bd9d5b4fc218513f0a0e9c76704d5554152a))

### Features

- **app:** integrate setup wizard and update window config ([320e977](https://github.com/1Yie/madora/commit/320e97730b82507a20fef0193c0baabca9a33755))
- **editor-settings:** add MiniMax, MiMo models and SSL toggle ([8d130b0](https://github.com/1Yie/madora/commit/8d130b00fff4ec0c193b9058955183e60ea9506d))
- **providers:** add MiniMax and MiMo Rust backends ([04c4c3f](https://github.com/1Yie/madora/commit/04c4c3fa75bff3c16e65610847e9170c4f0e40fa))
- **setup-wizard:** add skip button, improve select displays, and resolve type issues ([1ac9a5f](https://github.com/1Yie/madora/commit/1ac9a5f46b9a610c31a103c837e79087ee6f2e07))
- **toast:** render code-block style error descriptions ([af3e880](https://github.com/1Yie/madora/commit/af3e880d6bca0640161e455d78174b24c9d900fe))

## [0.2.1](https://github.com/1Yie/madora/compare/v0.2.0...v0.2.1) (2026-05-27)

### Code Refactoring

- **git:** split monolithic git module into layered service architecture ([f30a737](https://github.com/1Yie/madora/commit/f30a73719c8500f912b645c6946a5cdf371cec41))

### Features

- **settings:** add app logo to about page ([dda85e4](https://github.com/1Yie/madora/commit/dda85e42884a21d24f349a9ab9555bc44c9d2487))

### BREAKING CHANGES

- **git:** git credentials migrated from file to keyring.
  Legacy git_credentials.json is auto-migrated and removed on first
  load after upgrade.

# [0.2.0](https://github.com/1Yie/madora/compare/v0.1.9...v0.2.0) (2026-05-27)

### Features

- **editor:** integrate streaming completion into CodeMirror ([b1ba2fa](https://github.com/1Yie/madora/commit/b1ba2facfa109e8ee464b56e42e61b3f6eed6069))
- **providers:** add streaming FIM completion with SSE support ([e4c4f37](https://github.com/1Yie/madora/commit/e4c4f3779ff4a44bb4826aab5f789f25180e92a4))

## [0.1.9](https://github.com/1Yie/madora/compare/v0.1.8...v0.1.9) (2026-05-27)

### Bug Fixes

- suppress dead_code warning and fix test path ([4bc93d1](https://github.com/1Yie/madora/commit/4bc93d1a561f209633a65aa2d7904df2a48ae3d0))

### Features

- **ai:** add custom provider protocol and enhance settings UI ([2ff0953](https://github.com/1Yie/madora/commit/2ff095381909cc6329d5ed10a7d80500acd2d06e))
- **workspace:** add copy and paste support for workspace files ([34955ab](https://github.com/1Yie/madora/commit/34955abcd1e3403d19b4588fa4699f28bf85d183))

## [0.1.8](https://github.com/1Yie/madora/compare/v0.1.7...v0.1.8) (2026-05-26)

### Features

- unify completion to FIM-only, fix git conflict UX, optimize perf ([d19417f](https://github.com/1Yie/madora/commit/d19417f882031ac403b8df34031b517c835ac09c))

## [0.1.7](https://github.com/1Yie/madora/compare/v0.1.6...v0.1.7) (2026-05-14)

## [0.1.6](https://github.com/1Yie/madora/compare/v0.1.5...v0.1.6) (2026-05-12)

### Features

- migrate AI API key to system keyring storage ([728dc67](https://github.com/1Yie/madora/commit/728dc67b1c683b120cbe1a0b523508973453b624))

## [0.1.5](https://github.com/1Yie/madora/compare/v0.1.4...v0.1.5) (2026-05-11)

### Features

- add file encoding detection and unsaved changes guard ([fbad195](https://github.com/1Yie/madora/commit/fbad1956cd2762b764f9f53fc1ac163f58743c1d))

## [0.1.4](https://github.com/1Yie/madora/compare/v0.1.3...v0.1.4) (2026-05-10)

### Features

- add custom CSS for markdown preview and git commit/fetch commands ([b3c5f1d](https://github.com/1Yie/madora/commit/b3c5f1d198fec327e9d38e6a9f3c1f59b6312ea2))
- **git:** migrate credential storage to Tauri backend ([6e89a4d](https://github.com/1Yie/madora/commit/6e89a4d5e39b90df3c55b545630c0c76ed5efd69))
- **markdown:** add math formula rendering and prose theme overhaul ([466f2ad](https://github.com/1Yie/madora/commit/466f2adaa2208d2954576779ef655d5af26435ad))

## [0.1.3](https://github.com/1Yie/madora/compare/v0.1.2...v0.1.3) (2026-05-08)

### Features

- add git integration, hidden file toggle, and markdown preview mode ([6aa0c4c](https://github.com/1Yie/madora/commit/6aa0c4c3abeb56a370612acc56f5209c4b2203ad))
- **ai:** enhance AI provider and editor integration ([922f19f](https://github.com/1Yie/madora/commit/922f19f5bd2c4632d57ee1b09a3767d07b2e47d6))

## [0.1.2](https://github.com/1Yie/madora/compare/v0.1.1...v0.1.2) (2026-05-08)

### Bug Fixes

- restore last-opened markdown on startup and fix theme/preset selection ([21dc985](https://github.com/1Yie/madora/commit/21dc985ad229c0ffa2cf645117556df916fbc8bb))

### Features

- 优化 API && Tab 补全方式 ([3bde310](https://github.com/1Yie/madora/commit/3bde3107318981cc42359d06f8ed13dec07a1aee))
- improve AI integration and editor experience ([b932030](https://github.com/1Yie/madora/commit/b93203013b544190b968c9504e8e4deb668173eb))

## [0.1.1](https://github.com/1Yie/madora/compare/v0.1.0...v0.1.1) (2026-05-07)

### Bug Fixes

- 分辨率渲染问题 ([260b737](https://github.com/1Yie/madora/commit/260b737a6b5a066371a8e0ff4e91a56d53cdd34c))

### Features

- 创建文件夹 & 优化文件加载 ([60a82fd](https://github.com/1Yie/madora/commit/60a82fdb1951ef8e309e9ea831931c3c92578e23))
- 调整圆角 ([23638c0](https://github.com/1Yie/madora/commit/23638c0a5f0c6863c147b1f10a0c58910583cbc1))
- 更新创建文件夹 ([f7160d5](https://github.com/1Yie/madora/commit/f7160d50b8823d53f56a796c4bc30ac1ec97fc5d))
- 去除图标 ([dbbf3f8](https://github.com/1Yie/madora/commit/dbbf3f8d78dd185b6f822f7ecf43cf62f130de5d))
- 优化 UI ([2e39c84](https://github.com/1Yie/madora/commit/2e39c840898e81b25ddcd29342978e83371d9554))
- 优化 UI ([34722e5](https://github.com/1Yie/madora/commit/34722e53e9a32166b5bf25be79628d23728e69f2))
- 优化错误提示 ([e1d1ccc](https://github.com/1Yie/madora/commit/e1d1cccdc90b6d17001be297d4ba9503ebe89d93))

# [0.1.0](https://github.com/1Yie/madora/compare/c5bd059d2feac3544b1ab8e3999ac93e4b28258b...v0.1.0) (2026-05-06)

### Features

- 优化 ai 补全 ([336ec94](https://github.com/1Yie/madora/commit/336ec94e04e1bb1016245be7bd40b79fa9db69c3))
- 增加文件移动/删除/重命名 ([d4bb5a1](https://github.com/1Yie/madora/commit/d4bb5a1e6070ab20753506b3f1e5b77d43b8e770))
- action ([6eecf41](https://github.com/1Yie/madora/commit/6eecf41d9008650d1635fc404d4d7d4f004be215))
- action ([9501ddb](https://github.com/1Yie/madora/commit/9501ddb87d63f7071edb4de760885354e8c64024))
- init ([acb6567](https://github.com/1Yie/madora/commit/acb6567805149d15b60ab99e8e32aaf2d37b3dd4))
- init ([3a66443](https://github.com/1Yie/madora/commit/3a664438f442c45e0fd2faa0af0fa6ba4c4ddc7d))
- init ([2e6fb5b](https://github.com/1Yie/madora/commit/2e6fb5b33c719fa3ec6c2c79de72b70ce011135a))
- init ([c5bd059](https://github.com/1Yie/madora/commit/c5bd059d2feac3544b1ab8e3999ac93e4b28258b))
