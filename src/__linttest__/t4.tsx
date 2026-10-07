export function T4() {
	const f = () => {
		document.body.style.userSelect = '';
	};
	const g = () => {
		document.body.style.cursor = '';
	};
	return <button onPointerUp={f} onClick={g} />;
}
