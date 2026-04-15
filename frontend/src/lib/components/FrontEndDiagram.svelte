<script lang="ts">
	import type { FrontEndResults } from '$lib/frontEndGeometry';
	import type { TireDimensions } from '$lib/tire';

	let { results, tire, steeringColumnLengthMm, forkOffsetMm }: { results: FrontEndResults; tire: TireDimensions; steeringColumnLengthMm: number; forkOffsetMm: number } = $props();

	// Flip y for SVG
	function sy(y: number): number { return -y; }

	// Bounding box
	const bounds = $derived.by(() => {
		const pad = 100;
		const scHalf = steeringColumnLengthMm / 2 + 80;
		const cx = results.steeringColumnCenter.x;
		const cy = results.steeringColumnCenter.y;
		const minX = cx - scHalf - pad;
		const maxX = cx + scHalf + pad;
		const minY = -pad;
		const maxY = cy + scHalf + pad;
		return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
	});

	const viewBox = $derived(
		`${bounds.minX} ${-bounds.maxY} ${bounds.width} ${bounds.height}`
	);

	// Scale-independent sizes
	const sw = $derived(bounds.width / 300);
	const swThin = $derived(sw * 0.6);

	// --- Steering column geometry (polygon approach) ---
	const scLength = $derived(steeringColumnLengthMm);
	const scWidth = $derived(50);
	const scCx = $derived(results.steeringColumnCenter.x);
	const scCy = $derived(results.steeringColumnCenter.y);

	// SA direction unit vector (geometry coords, pointing up along axis)
	const saDir = $derived.by(() => {
		const dx = results.steeringAxisTop.x - results.steeringAxisGround.x;
		const dy = results.steeringAxisTop.y - results.steeringAxisGround.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		return { x: dx / len, y: dy / len };
	});

	// Perpendicular to SA (90° clockwise from saDir)
	const saPerp = $derived({ x: saDir.y, y: -saDir.x });

	// 4 corners of steering column
	const scCorners = $derived.by(() => {
		const hL = scLength / 2;
		const hW = scWidth / 2;
		return [
			{ x: scCx + hL * saDir.x + hW * saPerp.x, y: scCy + hL * saDir.y + hW * saPerp.y },
			{ x: scCx + hL * saDir.x - hW * saPerp.x, y: scCy + hL * saDir.y - hW * saPerp.y },
			{ x: scCx - hL * saDir.x - hW * saPerp.x, y: scCy - hL * saDir.y - hW * saPerp.y },
			{ x: scCx - hL * saDir.x + hW * saPerp.x, y: scCy - hL * saDir.y + hW * saPerp.y },
		];
	});

	// SA line endpoints: from ground intersection down to scWidth past SC top
	const saLineBottom = $derived({
		x: results.steeringAxisGround.x,
		y: results.steeringAxisGround.y,
	});
	const saLineTop = $derived({
		x: scCx + (scLength / 2 + scWidth) * saDir.x,
		y: scCy + (scLength / 2 + scWidth) * saDir.y,
	});

	// --- Top triple tree (polygon) ---
	// Thickness: half the SC width, along SA direction
	const ttThickness = $derived(scWidth / 2);
	// Small gap between SC top edge and TT bottom edge (in SA direction)
	const ttGap = $derived(3);
	// Fork offset: use the raw input value directly (independent of rake)
	const forkOffsetSigned = $derived(forkOffsetMm);
	// TT must span from min to max of: {-scWidth/2, +scWidth/2, forkOffset - scWidth/2, forkOffset + scWidth/2}
	// This handles both positive and negative fork offsets
	const ttMinPerp = $derived(Math.min(-scWidth / 2, forkOffsetSigned - scWidth / 2));
	const ttMaxPerp = $derived(Math.max(scWidth / 2, forkOffsetSigned + scWidth / 2));

	// SC top edge midpoint (on SA)
	const scTopMid = $derived({
		x: scCx + (scLength / 2) * saDir.x,
		y: scCy + (scLength / 2) * saDir.y,
	});

	// TT bottom edge center (on SA, gap above SC top)
	const ttBottomCenter = $derived({
		x: scTopMid.x + ttGap * saDir.x,
		y: scTopMid.y + ttGap * saDir.y,
	});

	// 4 corners of top triple tree
	const topTtCorners = $derived.by(() => {
		const bc = ttBottomCenter;
		// Bottom-left (min perp direction)
		const bl = { x: bc.x + ttMinPerp * saPerp.x, y: bc.y + ttMinPerp * saPerp.y };
		// Bottom-right (max perp direction)
		const br = { x: bc.x + ttMaxPerp * saPerp.x, y: bc.y + ttMaxPerp * saPerp.y };
		// Top-right (up along SA by thickness)
		const tr = { x: br.x + ttThickness * saDir.x, y: br.y + ttThickness * saDir.y };
		// Top-left
		const tl = { x: bl.x + ttThickness * saDir.x, y: bl.y + ttThickness * saDir.y };
		return [bl, br, tr, tl];
	});

	// Fork offset line endpoints: parallel to SA, shifted by forkOffsetSigned along saPerp
	const forkLineBottom = $derived({
		x: saLineBottom.x + forkOffsetSigned * saPerp.x,
		y: saLineBottom.y + forkOffsetSigned * saPerp.y,
	});
	const forkLineTop = $derived({
		x: saLineTop.x + forkOffsetSigned * saPerp.x,
		y: saLineTop.y + forkOffsetSigned * saPerp.y,
	});

	function polyPoints(corners: { x: number; y: number }[]): string {
		return corners.map(c => `${c.x},${sy(c.y)}`).join(' ');
	}
</script>

<svg
	viewBox={viewBox}
	class="w-full h-full"
	xmlns="http://www.w3.org/2000/svg"
>
	<!-- Steering axis (dashed yellow) - extends through SC and protrudes past top -->
	<line
		x1={saLineBottom.x}
		y1={sy(saLineBottom.y)}
		x2={saLineTop.x}
		y2={sy(saLineTop.y)}
		stroke="#facc15"
		stroke-width={swThin}
		stroke-dasharray="{sw * 8} {sw * 4}"
	/>

	<!-- Fork offset line (dashed blue) - parallel to SA, offset by fork offset distance -->
	<line
		x1={forkLineBottom.x}
		y1={sy(forkLineBottom.y)}
		x2={forkLineTop.x}
		y2={sy(forkLineTop.y)}
		stroke="#3b82f6"
		stroke-width={swThin}
		stroke-dasharray="{sw * 8} {sw * 4}"
	/>

	<!-- Steering column polygon -->
	<polygon
		points={polyPoints(scCorners)}
		fill="#4b5563"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>

	<!-- Top triple tree polygon -->
	<polygon
		points={polyPoints(topTtCorners)}
		fill="#374151"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>

	<!-- Center dot (orange) -->
	<circle
		cx={scCx}
		cy={sy(scCy)}
		r={sw * 2}
		fill="#f97316"
	/>
</svg>
