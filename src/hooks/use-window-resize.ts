import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

type ResizeDirection =
	| 'North'
	| 'South'
	| 'East'
	| 'West'
	| 'NorthEast'
	| 'NorthWest'
	| 'SouthEast'
	| 'SouthWest';

const EDGE_SIZE = 4;

const CURSOR_MAP: Record<ResizeDirection, string> = {
	North: 'n-resize',
	South: 's-resize',
	East: 'e-resize',
	West: 'w-resize',
	NorthEast: 'ne-resize',
	NorthWest: 'nw-resize',
	SouthEast: 'se-resize',
	SouthWest: 'sw-resize',
};

function getResizeDirection(
	e: MouseEvent,
	width: number,
	height: number
): ResizeDirection | null {
	const { clientX: x, clientY: y } = e;
	const edge = EDGE_SIZE;

	const top = y < edge;
	const bottom = y > height - edge;
	const left = x < edge;
	const right = x > width - edge;

	if (top && left) return 'NorthWest';
	if (top && right) return 'NorthEast';
	if (bottom && left) return 'SouthWest';
	if (bottom && right) return 'SouthEast';
	if (top) return 'North';
	if (bottom) return 'South';
	if (left) return 'West';
	if (right) return 'East';
	return null;
}

export function useWindowResize() {
	useEffect(() => {
		const win = getCurrentWindow();

		const handleScrollbarMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest('[data-slot="scroll-area-scrollbar"]')) {
				document.body.setAttribute('data-scrollbar-dragging', '');
			}
		};

		const handleMouseUp = () => {
			document.body.removeAttribute('data-scrollbar-dragging');
		};

		const handleMouseMove = (e: MouseEvent) => {
			if (document.body.hasAttribute('data-scrollbar-dragging')) {
				document.body.style.cursor = '';
				return;
			}
			const elements = document.elementsFromPoint(e.clientX, e.clientY);
			const overScrollbar = elements.some(
				(el) => el.closest('[data-slot="scroll-area-scrollbar"]') !== null
			);
			if (overScrollbar) {
				document.body.style.cursor = '';
				return;
			}
			const dir = getResizeDirection(e, window.innerWidth, window.innerHeight);
			document.body.style.cursor = dir ? CURSOR_MAP[dir] : '';
		};

		const handleMouseDown = async (e: MouseEvent) => {
			if (e.button !== 0) return;
			if (document.body.hasAttribute('data-scrollbar-dragging')) return;
			const target = e.target as HTMLElement;
			if (target.closest('[data-slot="scroll-area-scrollbar"]')) return;
			const dir = getResizeDirection(e, window.innerWidth, window.innerHeight);
			if (!dir) return;
			e.preventDefault();
			e.stopPropagation();
			await win.startResizeDragging(dir as never);
		};

		window.addEventListener('mousedown', handleScrollbarMouseDown, true);
		window.addEventListener('mousedown', handleMouseDown, true);
		window.addEventListener('mouseup', handleMouseUp, true);
		window.addEventListener('mousemove', handleMouseMove);

		return () => {
			window.removeEventListener('mousedown', handleScrollbarMouseDown, true);
			window.removeEventListener('mousedown', handleMouseDown, true);
			window.removeEventListener('mouseup', handleMouseUp, true);
			window.removeEventListener('mousemove', handleMouseMove);
			document.body.style.cursor = '';
			document.body.removeAttribute('data-scrollbar-dragging');
		};
	}, []);
}
