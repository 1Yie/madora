export function T2() {
	const f = () => {
		document.body.style.userSelect = '';
	};
	return <button onPointerUp={f} onPointerCancel={f} />;
}
