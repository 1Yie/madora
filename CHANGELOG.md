## [0.3.10](https://github.com/1Yie/madora/compare/v0.3.7...v0.3.10) (2026-06-23)

### Features

- **update:** check GitHub releases on startup and in settings ([7e74b1b](https://github.com/1Yie/madora/commit/7e74b1b72f38145c7ed4dcb674b2f6fde3e912f2))

## [0.3.9](https://github.com/1Yie/madora/compare/v0.3.7...v0.3.9) (2026-06-22)

### Bug Fixes

- correct setup, theme, and workspace state ([a2fff58](https://github.com/1Yie/madora/commit/a2fff581a4d97305ad9c974200f0bba4a14476b8))
- **workspace:** sync deleted files and ime completions ([f5716d7](https://github.com/1Yie/madora/commit/f5716d79d6678bb0dbf689cb2e89de283b662dc5))

### Features

- **ai:** expand provider support and remove CLI flow ([dcaf137](https://github.com/1Yie/madora/commit/dcaf137dd060d5b3fad9b4cbdc2bd27abd1b3057))
- **i18n:** localize system settings and app chrome ([55dfd1a](https://github.com/1Yie/madora/commit/55dfd1a5d421fa023ca7f16b70ab4741a34e4f97))
- **workspace:** refresh explorer, git, and webdav flows ([a134a4f](https://github.com/1Yie/madora/commit/a134a4f4bd4343cf0dee2295ef7b8381d48b16ed))

## [0.3.8](https://github.com/1Yie/madora/compare/v0.3.7...v0.3.8) (2026-06-22)

### Bug Fixes

- **cli:** rebuild cross-platform install and packaging ([b7b7850](https://github.com/1Yie/madora/commit/b7b7850431f1675318f9f85572ea9d76f20746f8))
- correct setup, theme, and workspace state ([a2fff58](https://github.com/1Yie/madora/commit/a2fff581a4d97305ad9c974200f0bba4a14476b8))
- **workspace:** sync deleted files and ime completions ([f5716d7](https://github.com/1Yie/madora/commit/f5716d79d6678bb0dbf689cb2e89de283b662dc5))

## [0.3.7](https://github.com/1Yie/madora/compare/v0.3.6...v0.3.7) (2026-06-11)

### Features

- **webdav:** add WebDAV sync backend, settings, and file explorer integration ([5038047](https://github.com/1Yie/madora/commit/50380476f97e4eeb5143e337541fb28e03aa184f))

## [0.3.6](https://github.com/1Yie/madora/compare/v0.3.5...v0.3.6) (2026-06-10)

### Bug Fixes

- **cli:** show human-readable output in interactive mode ([00134ce](https://github.com/1Yie/madora/commit/00134ce7f7e0fad14ddbf5c2fa7809b83d077b14))
- **preview:** sync preview content when navigating to already-open file ([c2fe948](https://github.com/1Yie/madora/commit/c2fe94860f8dcd0df2c60dd1f3fdbb1f1cb861f6))
- **tabs:** preserve external workspace file tabs after tree operations ([89c773b](https://github.com/1Yie/madora/commit/89c773b4e6b2b2494b1889c2b92fc46ce21cc36d))

### Features

- **tab-bar:** distinguish non-workspace files in tab labels ([9df89a8](https://github.com/1Yie/madora/commit/9df89a8a730dfb001353dd864b4f8684f54279ad))

## [0.3.5](https://github.com/1Yie/madora/compare/v0.3.4...v0.3.5) (2026-06-09)

### Bug Fixes

- prevent syncTabNodesWithTree from marking subdirectory files as missing ([0a19faf](https://github.com/1Yie/madora/commit/0a19fafed8c83ed3502dbdb7b2bbf201dcb5bba2))
- **test:** make path_traversal_attempt_fails cross-platform with tempdir ([4eee0ce](https://github.com/1Yie/madora/commit/4eee0cecea135fea7cd34ac2e8bd1758e95684b5))
- **test:** replace hardcoded /tmp path with tempdir for cross-platform compat ([55e3356](https://github.com/1Yie/madora/commit/55e3356b452b04893f1974d41551eb8910c4825a))
- **test:** replace remaining /tmp hardcoded paths with tempdir in state tests ([1fc49a8](https://github.com/1Yie/madora/commit/1fc49a8613c337b7ac655dd1955fbd584d9e80cb))
- **tree:** merge chevron rotation effects to fix expand animation ([439491f](https://github.com/1Yie/madora/commit/439491fd48d2e32b58a0c076a62b0d8e0d9b3ef2))
- **tree:** move guide lines behind selection with relative z-10 on content ([a0591fb](https://github.com/1Yie/madora/commit/a0591fb946ab1debb477d775b04e6db65d1083e4))
- **tree:** set guide lines behind selection with z-0 ([bd8fe05](https://github.com/1Yie/madora/commit/bd8fe0506d83173d54e148c163b91e64bf38d59f))

### Features

- **tree:** add indentation guide lines to file tree ([71abe44](https://github.com/1Yie/madora/commit/71abe44c8e5abefa1d5ad9be21b61ffa1ff6f43f))

## [0.3.4](https://github.com/1Yie/madora/compare/v0.3.3...v0.3.4) (2026-06-09)

### Bug Fixes

- hide editor status bar items in preview mode ([95db4d6](https://github.com/1Yie/madora/commit/95db4d6822ab10b6ec479dd32d822ace01bc44f6))
- prevent scroll-jank during AI streaming when user scrolls ([a9fbdcf](https://github.com/1Yie/madora/commit/a9fbdcf542359a3df9943d407b30bea47b616a49))
- reset settings dialog scroll position on section change ([bd97f20](https://github.com/1Yie/madora/commit/bd97f205e9388277465f1613abb01082e45e75f5))

### Features

- disable indented code block parsing and add visible tab/space indentation ([9f74e89](https://github.com/1Yie/madora/commit/9f74e8991e7c0d55c3e60c22a2ed39d165d5b83a))

## [0.3.3](https://github.com/1Yie/madora/compare/v0.3.2...v0.3.3) (2026-06-09)

### Bug Fixes

- **build:** replace node -e script in beforeBuildCommand with shell commands ([7ef0e43](https://github.com/1Yie/madora/commit/7ef0e434a81be7ca0790dcbc2b95c5400aeb163e))
- **build:** resolve OpenSSL vendored build failure on Windows MSVC ([71d9f92](https://github.com/1Yie/madora/commit/71d9f9297b50fd34603708ff7faacf776dee5aa4))
- **build:** use cross-platform node script for beforeBuildCommand ([b24f2f6](https://github.com/1Yie/madora/commit/b24f2f613229ca4f75cec3e2f1ebd8b9a6f34163))
- **build:** vendor openssl-sys for cross-compilation support ([5158ba5](https://github.com/1Yie/madora/commit/5158ba582f0790c43ce2711a050c99be09371edc))

### Features

- **explorer:** add drag-and-drop tab reordering with cross-platform consistent drag preview ([ab88d1a](https://github.com/1Yie/madora/commit/ab88d1afc23ada6f7e3c07477fc72435eeeba16b))

## [0.3.2](https://github.com/1Yie/madora/compare/v0.3.1...v0.3.2) (2026-06-08)

### Bug Fixes

- bake AUTH_SERVER_URL at compile time for CI builds ([0b901e0](https://github.com/1Yie/madora/commit/0b901e09ae93a00a8e516803299017d10f54c984))
- bake AUTH_SERVER_URL at compile time for CI builds ([9dcf317](https://github.com/1Yie/madora/commit/9dcf317f38faf0bcf87e608e98a224ed24ebf3c5))
- bake AUTH_SERVER_URL at compile time via build.rs ([9bf2b23](https://github.com/1Yie/madora/commit/9bf2b2372df9f7cadf1e292d04d9790923fa056f))
- load .env from exe directory for packaged builds ([594989c](https://github.com/1Yie/madora/commit/594989ca48cc0dd7b94a8098021f7e4c839c9508))
- load AUTH_SERVER_URL from runtime .env instead of build-time embedding ([05a4ad4](https://github.com/1Yie/madora/commit/05a4ad4b5dc1c4b762b4740dc21b3e313072e8be))
- remove flaky require_api_key test, test cache directly ([a3a271e](https://github.com/1Yie/madora/commit/a3a271ebf21076bfe0ba64d9fe95250b18cedc5d))
- remove non-existent .env resource from tauri config ([7717e74](https://github.com/1Yie/madora/commit/7717e7434adfeae528a93697142bc0d6fee56685))

### Features

- **editor:** add tab unsaved indicator and async image resolution ([5c321d3](https://github.com/1Yie/madora/commit/5c321d34e98f09f3e7d54a802104431c691f4e9b))
- embed AUTH_SERVER_URL at build time with dotenv fallback ([6fc67fc](https://github.com/1Yie/madora/commit/6fc67fceb93ed6fc851b8810fb152796fbc35547))
- **explorer:** persist workspace state through Rust backend ([9ed84df](https://github.com/1Yie/madora/commit/9ed84dff303f504d1390e02f59007fecab3df02c))
- **explorer:** support external file import via drag-drop and clipboard ([28a1ae5](https://github.com/1Yie/madora/commit/28a1ae585fc807409f6726e06a2675df92012f0d))
- **system:** add CLI binary management in settings ([d270d1f](https://github.com/1Yie/madora/commit/d270d1f2efa774c4d724359955095e2e51f8b00a))

## [0.3.1](https://github.com/1Yie/madora/compare/v0.3.0...v0.3.1) (2026-06-05)

### Bug Fixes

- **explorer:** animate tree arrow only on user click via inline style ([670c5d1](https://github.com/1Yie/madora/commit/670c5d1fdd6e25f40cd22ae35c658f9631aba86d))
- **explorer:** expand ancestors before scrolling to current file ([b565307](https://github.com/1Yie/madora/commit/b565307eae42c0a8ec68e1e74b738927662b02dd))

### Features

- **explorer:** add tab-based file browsing with typed invoke wrappers ([b8d59b7](https://github.com/1Yie/madora/commit/b8d59b75d134fa28d88f075b08f04304c91c6981))
- **explorer:** add tooltips to sidebar toolbar and file path ([b2d5bd0](https://github.com/1Yie/madora/commit/b2d5bd0a2ad4e0b8d6eaa586880ce9ad45836012))
- **explorer:** restructure sidebar header with bookmarks and action toolbar ([1ea3192](https://github.com/1Yie/madora/commit/1ea3192ae45d6a407f62b67931825545e3750478))
- extract invoke wrappers, fix sort toggle, add image resolution ([3464d13](https://github.com/1Yie/madora/commit/3464d137513fd955d4f01ee8878ed6844d16dc2f))

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
