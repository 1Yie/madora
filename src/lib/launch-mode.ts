/**
 * Which kind of process this webview runs in.
 *
 * `full` is Madora started by hand: workspace, saved state, tray, sync.
 * `document` is Madora started to open a Markdown file, a one-off editor with
 * none of that, which ends with its window. The backend decides (see
 * `services/launch_mode.rs`); the answer is stored here once at startup, before
 * the first render, so everything else can read it synchronously.
 */
export type LaunchMode = 'full' | 'document';

let current: LaunchMode = 'full';

export function setLaunchMode(mode: LaunchMode) {
	current = mode;
}

/** Whether this is a one-off document window rather than the full app. */
export function isDocumentLaunch(): boolean {
	return current === 'document';
}
