import { getCurrentWindow } from '@tauri-apps/api/window';

export type ResizeDirection =
	| 'East'
	| 'North'
	| 'NorthEast'
	| 'NorthWest'
	| 'South'
	| 'SouthEast'
	| 'SouthWest'
	| 'West';

export type CloseHandler = (event: {
	preventDefault: () => void;
}) => void | Promise<void>;

/** Minimizes the application window. */
export async function minimizeWindow(): Promise<void> {
	return getCurrentWindow().minimize();
}

/** Toggles the window between maximized and normal states. */
export async function toggleMaximizeWindow(): Promise<void> {
	return getCurrentWindow().toggleMaximize();
}

/** Destroys (closes) the application window. */
export async function destroyWindow(): Promise<void> {
	return getCurrentWindow().destroy();
}

/** Starts dragging the window border for resizing. */
export async function startResizeDragging(
	direction: ResizeDirection
): Promise<void> {
	return getCurrentWindow().startResizeDragging(direction);
}

/** Starts moving the whole window (like a native title-bar drag). */
export async function startWindowDragging(): Promise<void> {
	return getCurrentWindow().startDragging();
}

/** Listens for window close requests. Returns an unlisten function. */
export async function onCloseRequested(
	handler: CloseHandler
): Promise<() => void> {
	const unlisten = await getCurrentWindow().onCloseRequested((event) => {
		return handler(event);
	});
	return unlisten;
}
