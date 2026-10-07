import { useRef, useState } from 'react';
export function T3() {
	const ref = useRef<null | { active: boolean }>(null);
	const [s, setS] = useState(false);
	const f = (e: React.PointerEvent) => {
		const session = ref.current;
		if (!session || session.pointerId !== e.pointerId) return;
		ref.current = null;
		if (session.active) {
			document.body.style.userSelect = '';
			setS(true);
		}
	};
	return (
		<button onPointerUp={f} onPointerCancel={f}>
			{s ? 'a' : 'b'}
		</button>
	);
}
