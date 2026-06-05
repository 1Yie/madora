import { useEffect } from 'react';
import { startResizeDragging } from '@/invoke/window';

type ResizeDirection =
	| 'North'
	| 'South'
	| 'East'
	| 'West'
	| 'NorthEast'
	| 'NorthWest'
	| 'SouthEast'
	| 'SouthWest';

const EDGE_SIZE = 6;

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
		const handleMouseMove = (e: MouseEvent) => {
			const dir = getResizeDirection(e, window.innerWidth, window.innerHeight);
			document.body.style.cursor = dir ? CURSOR_MAP[dir] : '';
		};

		const handleMouseDown = async (e: MouseEvent) => {
			if (e.button !== 0) return;
			const dir = getResizeDirection(e, window.innerWidth, window.innerHeight);
			if (!dir) return;
			e.preventDefault();
			e.stopPropagation();
			await startResizeDragging(dir);
		};

		window.addEventListener('mousedown', handleMouseDown, true);
		window.addEventListener('mousemove', handleMouseMove);

		return () => {
			window.removeEventListener('mousedown', handleMouseDown, true);
			window.removeEventListener('mousemove', handleMouseMove);
			document.body.style.cursor = '';
		};
	}, []);
}
