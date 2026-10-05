/**
 * Platform detection without plugin-os.
 *
 * WKWebView on macOS always includes "Macintosh" in the UA string,
 * and `navigator.platform` returns "MacIntel" on Intel Macs.
 * This is reliable inside Tauri's WebView.
 */
const ua = navigator.userAgent;
const platform = navigator.platform ?? '';

export const isMac = /Macintosh|Mac OS X/.test(ua) || /^Mac/.test(platform);
export const isWindows = /Windows/.test(ua) || /^Win/.test(platform);
export const isLinux = !isMac && !isWindows;

/**
 * Frameless window controls (minimize / maximize / close) on Windows & Linux.
 * Every button has the same fixed width so its hover fill is identical, and the
 * tab strip reserves exactly `WINDOW_CONTROLS_WIDTH` so hover never bleeds over
 * the tabs.
 */
export const WINDOW_BUTTON_WIDTH = 46;
export const WINDOW_CONTROLS_WIDTH = WINDOW_BUTTON_WIDTH * 3;
