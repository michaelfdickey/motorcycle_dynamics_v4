<script lang="ts">
	import type { FrontEndResults } from '$lib/frontEndGeometry';
	import type { TireDimensions } from '$lib/tire';

	let { results, tire }: { results: FrontEndResults; tire: TireDimensions } = $props();

	// SVG coordinate system: we need to flip y (SVG y goes down, our geometry y goes up).
	// We'll set up a viewBox that maps our geometry with a transform.

	// Determine bounding box from all points, with padding.
	const allPoints = $derived.by(() => {
		const pts = [
			results.contactPatch,
			results.axleCenter,
			results.steeringAxisGround,
			results.steeringAxisTop,
			results.forkTop,
			results.forkBottom,
		];
		if (results.linkPivot) pts.push(results.linkPivot);
		if (results.linkEnd) pts.push(results.linkEnd);
		return pts;
	});

	const bounds = $derived.by(() => {
		const xs = allPoints.map((p) => p.x);
		const ys = allPoints.map((p) => p.y);
		// Include wheel edges
		xs.push(results.axleCenter.x - tire.outerRadiusMm);
		xs.push(results.axleCenter.x + tire.outerRadiusMm);
		ys.push(0); // ground
		ys.push(results.axleCenter.y + tire.outerRadiusMm);

		const pad = 60;
		const minX = Math.min(...xs) - pad;
		const maxX = Math.max(...xs) + pad;
		const minY = Math.min(...ys) - pad;
		const maxY = Math.max(...ys) + pad;
		return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
	});

	// Transform from geometry coords to SVG coords: flip y
	// SVG viewBox: (minX, -(maxY), width, height)
	const viewBox = $derived(
		`${bounds.minX} ${-bounds.maxY} ${bounds.width} ${bounds.height}`
	);

	// Helper: convert geometry point to SVG point (flip y)
	function sy(y: number): number {
		return -y;
	}

	// Scale-independent stroke width (aim for ~2px visual at default size)
	const sw = $derived(bounds.width / 300);
	const swThin = $derived(sw * 0.6);
	const swThick = $derived(sw * 1.5);
	const hingeRadius = $derived(sw * 3);
	const fontSize = $derived(bounds.width / 25);

	// Steering column rectangle dimensions
	const scW = $derived(sw * 12);
	const scH = $derived(sw * 8);
	const scCx = $derived(results.forkTop.x);
	const scCy = $derived(results.forkTop.y);
	const rakeRad = $derived(
		Math.atan2(
			results.steeringAxisTop.x - results.steeringAxisGround.x,
			results.steeringAxisTop.y - results.steeringAxisGround.y
		)
	);

	// Trail dimension line y position
	const dimY = $derived(sy(-bounds.height * 0.06));
</script>

<svg
	viewBox={viewBox}
	class="w-full h-full"
	xmlns="http://www.w3.org/2000/svg"
>
	<!-- Ground line -->
	<line
		x1={bounds.minX}
		y1={sy(0)}
		x2={bounds.maxX}
		y2={sy(0)}
		stroke="#6b7280"
		stroke-width={sw}
	/>

	<!-- Steering axis (dashed) -->
	<line
		x1={results.steeringAxisGround.x}
		y1={sy(results.steeringAxisGround.y)}
		x2={results.steeringAxisTop.x}
		y2={sy(results.steeringAxisTop.y)}
		stroke="#facc15"
		stroke-width={swThin}
		stroke-dasharray="{sw * 3} {sw * 2}"
	/>

	<!-- Fork tube / slider -->
	<line
		x1={results.forkBottom.x}
		y1={sy(results.forkBottom.y)}
		x2={results.forkTop.x}
		y2={sy(results.forkTop.y)}
		stroke="#e5e7eb"
		stroke-width={swThick}
	/>

	<!-- Steering column rectangle at top of fork -->
	<rect
		x={-scW / 2}
		y={-scH / 2}
		width={scW}
		height={scH}
		fill="#4b5563"
		stroke="#9ca3af"
		stroke-width={swThin}
		transform="translate({scCx},{sy(scCy)}) rotate({(rakeRad * 180) / Math.PI})"
	/>

	<!-- Link arms (for leading/trailing link) -->
	{#if results.linkPivot && results.linkEnd}
		<!-- Link arm -->
		<line
			x1={results.linkPivot.x}
			y1={sy(results.linkPivot.y)}
			x2={results.linkEnd.x}
			y2={sy(results.linkEnd.y)}
			stroke="#e5e7eb"
			stroke-width={swThick}
		/>
		<!-- Link pivot hinge -->
		<circle
			cx={results.linkPivot.x}
			cy={sy(results.linkPivot.y)}
			r={hingeRadius}
			fill="#1f2937"
			stroke="#f97316"
			stroke-width={swThin}
		/>
		<!-- Link end / axle hinge -->
		<circle
			cx={results.linkEnd.x}
			cy={sy(results.linkEnd.y)}
			r={hingeRadius}
			fill="#1f2937"
			stroke="#f97316"
			stroke-width={swThin}
		/>
	{/if}

	<!-- Outer tire circle -->
	<circle
		cx={results.axleCenter.x}
		cy={sy(results.axleCenter.y)}
		r={tire.outerRadiusMm}
		fill="none"
		stroke="#9ca3af"
		stroke-width={swThick}
	/>

	<!-- Rim circle (inner) -->
	<circle
		cx={results.axleCenter.x}
		cy={sy(results.axleCenter.y)}
		r={tire.rimRadiusMm}
		fill="none"
		stroke="#6b7280"
		stroke-width={sw}
	/>

	<!-- Axle dot -->
	<circle
		cx={results.axleCenter.x}
		cy={sy(results.axleCenter.y)}
		r={sw * 1.5}
		fill="#f97316"
	/>

	<!-- Contact patch marker -->
	<circle
		cx={results.contactPatch.x}
		cy={sy(results.contactPatch.y)}
		r={sw * 1.2}
		fill="#ef4444"
	/>

	<!-- Trail dimension line -->
	<line
		x1={results.contactPatch.x}
		y1={dimY}
		x2={results.steeringAxisGround.x}
		y2={dimY}
		stroke="#60a5fa"
		stroke-width={swThin}
		marker-start="url(#arrowLeft)"
		marker-end="url(#arrowRight)"
	/>
	<text
		x={(results.contactPatch.x + results.steeringAxisGround.x) / 2}
		y={dimY - sw * 2}
		text-anchor="middle"
		fill="#60a5fa"
		font-size={fontSize * 0.7}
	>
		Trail: {results.trailMm.toFixed(1)} mm
	</text>

	<!-- SA ground point marker -->
	<line
		x1={results.steeringAxisGround.x}
		y1={sy(0) - sw * 3}
		x2={results.steeringAxisGround.x}
		y2={sy(0) + sw * 3}
		stroke="#facc15"
		stroke-width={swThin}
	/>

	<!-- Arrow markers -->
	<defs>
		<marker id="arrowLeft" markerWidth="6" markerHeight="4" refX="0" refY="2" orient="auto">
			<path d="M6,0 L0,2 L6,4" fill="none" stroke="#60a5fa" stroke-width="1" />
		</marker>
		<marker id="arrowRight" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
			<path d="M0,0 L6,2 L0,4" fill="none" stroke="#60a5fa" stroke-width="1" />
		</marker>
	</defs>
</svg>
