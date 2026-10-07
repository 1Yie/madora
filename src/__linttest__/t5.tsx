import { useRef, useState } from 'react';
export function T5() {
	const dragSessionRef = useRef<null | {
		active: boolean;
		startIndex: number;
		pointerId: number;
	}>(null);
	const suppressClickRef = useRef(false);
	const dragOverIndexRef = useRef<number | null>(null);
	const [, setDragTabId] = useState<string | null>(null);
	const [, setDragOverIndex] = useState<number | null>(null);
	const reorderTabs = (a: number, b: number) => {
		void a;
		void b;
	};
	const handlePointerEnd = (e: React.PointerEvent) => {
		const session = dragSessionRef.current;
		if (!session || session.pointerId !== e.pointerId) return;
		dragSessionRef.current = null;
		if (session.active) {
			suppressClickRef.current = true;
			document.body.style.userSelect = '';
			const from = session.startIndex;
			const insertAt = dragOverIndexRef.current;
			if (insertAt !== null && insertAt !== from && insertAt !== from + 1) {
				const to = from < insertAt ? insertAt - 1 : insertAt;
				reorderTabs(from, to);
			}
		}
		setDragTabId(null);
		setDragOverIndex(null);
		dragOverIndexRef.current = null;
	};
	return (
		<button onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd} />
	);
}
