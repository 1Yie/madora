import { useEffect, useRef } from 'react';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 3-lobed triangular orbit: radius pulses 3× per revolution for a Reuleaux-like path */
function getPoint(progress: number) {
	const t = progress * Math.PI * 2;
	const r = 17 + 7 * Math.cos(3 * t);
	return {
		x: 27 + r * Math.cos(t),
		y: 27 + r * Math.sin(t),
	};
}

function getParticle(
	index: number,
	count: number,
	progress: number,
	trailSpan: number
) {
	const tailOffset = index / (count - 1);
	const p = getPoint(progress - tailOffset * trailSpan);
	const fade = Math.pow(1 - tailOffset, 0.6);
	return {
		x: p.x.toFixed(2),
		y: p.y.toFixed(2),
		opacity: (0.2 + fade * 0.8).toFixed(3),
	};
}

function getRotation(time: number, rotationDuration: number) {
	return -((time % rotationDuration) / rotationDuration) * 360;
}

type Props = {
	className?: string;
};

export function MathCurveLoader({ className }: Props) {
	const svgRef = useRef<SVGSVGElement>(null);

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		// Three groups, one per dot. Each group = 1 large circle + short trail.
		const groups: SVGGElement[] = [];
		const dots: SVGCircleElement[][] = [];
		const TRAIL_LENGTH = 4;
		const BASE_RADIUS = 3;

		for (let d = 0; d < 3; d++) {
			const group = document.createElementNS(SVG_NS, 'g');
			svg.appendChild(group);
			groups.push(group);

			const particles: SVGCircleElement[] = [];
			for (let i = 0; i < TRAIL_LENGTH; i++) {
				const circle = document.createElementNS(SVG_NS, 'circle');
				circle.setAttribute('fill', 'currentColor');
				const size =
					i === 0 ? BASE_RADIUS : BASE_RADIUS * (1 - i / (TRAIL_LENGTH * 2));
				circle.setAttribute('r', String(size));
				group.appendChild(circle);
				particles.push(circle);
			}
			dots.push(particles);
		}

		const DURATION_MS = 3000;
		const ROTATION_DURATION_MS = 18000;
		const startedAt = performance.now();
		let animationId = 0;

		function render(time: number) {
			const elapsed = time - startedAt;
			const rotation = getRotation(elapsed, ROTATION_DURATION_MS);
			const progress = (elapsed % DURATION_MS) / DURATION_MS;

			for (let d = 0; d < 3; d++) {
				const phase = d / 3;
				const dotProgress = (progress + phase) % 1;
				const dotRotation = rotation;
				const trailParticles = dots[d];

				groups[d].setAttribute('transform', `rotate(${dotRotation} 27 27)`);

				for (let i = 0; i < TRAIL_LENGTH; i++) {
					const p = getParticle(i, TRAIL_LENGTH, dotProgress, 0.06);
					const node = trailParticles[i];
					node.setAttribute('cx', p.x);
					node.setAttribute('cy', p.y);
					node.setAttribute('opacity', p.opacity);
				}
			}

			animationId = requestAnimationFrame(render);
		}

		animationId = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationId);
			for (const g of groups) {
				svg.removeChild(g);
			}
		};
	}, []);

	return (
		<svg
			ref={svgRef}
			viewBox="0 0 54 54"
			fill="none"
			aria-hidden="true"
			className={className}
		/>
	);
}
