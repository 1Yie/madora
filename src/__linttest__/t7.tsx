import { useRef, useState } from 'react';

declare function useWorkspace(): {
	reorderTabs: (a: number, b: number) => void;
};
declare function TooltipTrigger(props: {
	render: React.ReactElement;
}): React.ReactElement;

export function T7() {
	const { reorderTabs } = useWorkspace();
	const dragSessionRef = useRef<null | {
		active: boolean;
		startIndex: number;
		pointerId: number;
	}>(null);
	const suppressClickRef = useRef(false);
	const dragOverIndexRef = useRef<number | null>(null);
	const [, setDragTabId] = useState<string | null>(null);
	const [, setDragOverIndex] = useState<number | null>(null);
	const tabs = [1, 2, 3];

	const handlePointerMove = (e: React.PointerEvent) => {
		const session = dragSessionRef.current;
		if (!session || session.pointerId !== e.pointerId) return;
		if (!session.active) {
			session.active = true;
			document.body.style.userSelect = 'none';
			setDragTabId('x');
		}
		dragOverIndexRef.current = 1;
		setDragOverIndex(1);
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
		<div>
			{tabs.map((tab) => (
				<TooltipTrigger
					key={tab}
					render={
						<button
							onPointerMove={handlePointerMove}
							onPointerUp={handlePointerEnd}
							onPointerCancel={handlePointerEnd}
						/>
					}
				/>
			))}
		</div>
	);
}
