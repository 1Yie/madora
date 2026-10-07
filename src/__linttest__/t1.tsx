export function T1() {
	const f = () => {
		document.body.style.userSelect = '';
	};
	return <button onPointerUp={f} />;
}
