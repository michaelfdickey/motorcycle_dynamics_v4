<script lang="ts">
	import type { FrontEndResults } from '$lib/frontEndGeometry';
	import type { TireDimensions } from '$lib/tire';

	let { results, tire, steeringColumnLengthMm, forkOffsetMm, forkLengthMm, suspensionType, forkTravelMm, compressionPct, spindleOffsetMm, spindleHeightMm, stanchionDiaMm, sliderDiaMm, invertedForks }: { results: FrontEndResults; tire: TireDimensions; steeringColumnLengthMm: number; forkOffsetMm: number; forkLengthMm: number; suspensionType: string; forkTravelMm: number; compressionPct: number; spindleOffsetMm: number; spindleHeightMm: number; stanchionDiaMm: number; sliderDiaMm: number; invertedForks: boolean } = $props();

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
		const bl = { x: bc.x + ttMinPerp * saPerp.x, y: bc.y + ttMinPerp * saPerp.y };
		const br = { x: bc.x + ttMaxPerp * saPerp.x, y: bc.y + ttMaxPerp * saPerp.y };
		const tr = { x: br.x + ttThickness * saDir.x, y: br.y + ttThickness * saDir.y };
		const tl = { x: bl.x + ttThickness * saDir.x, y: bl.y + ttThickness * saDir.y };
		return [bl, br, tr, tl];
	});

	// SC bottom edge midpoint (on SA)
	const scBottomMid = $derived({
		x: scCx - (scLength / 2) * saDir.x,
		y: scCy - (scLength / 2) * saDir.y,
	});

	// Bottom TT: top edge sits flush with SC bottom (with gap), extends downward
	const btTopCenter = $derived({
		x: scBottomMid.x - ttGap * saDir.x,
		y: scBottomMid.y - ttGap * saDir.y,
	});

	// 4 corners of bottom triple tree
	const bottomTtCorners = $derived.by(() => {
		const tc = btTopCenter;
		// Top-left
		const tl = { x: tc.x + ttMinPerp * saPerp.x, y: tc.y + ttMinPerp * saPerp.y };
		// Top-right
		const tr = { x: tc.x + ttMaxPerp * saPerp.x, y: tc.y + ttMaxPerp * saPerp.y };
		// Bottom-right (down along -saDir by thickness)
		const br = { x: tr.x - ttThickness * saDir.x, y: tr.y - ttThickness * saDir.y };
		// Bottom-left
		const bl = { x: tl.x - ttThickness * saDir.x, y: tl.y - ttThickness * saDir.y };
		return [tl, tr, br, bl];
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

	// --- Telescopic fork tubes (stanchion + slider) ---
	// Approach 1: Total length + travel.
	// Stanchion (narrow, upper): fixed to the triple trees, its length is determined
	// by the triple tree spacing. It must span from above upper TT to below lower TT.
	// Slider (wide, lower): slides over the stanchion. At full extension, overlap = forkTravelMm.
	// Compression reduces the effective fork length and increases the overlap.

	// Key positions along SA (parameter t from scCenter)
	const lowerTtOuterT = $derived(-(scLength / 2 + ttGap + ttThickness));
	const upperTtOuterT = $derived(scLength / 2 + ttGap + ttThickness);

	// Stanchion top: protrudes above upper TT by ttThickness
	const stanchionTopT = $derived(upperTtOuterT + ttThickness);

	// Minimum overlap between stanchion and slider at full extension (real forks: 80-100mm)
	const minOverlapMm = 80;
	const halfOverlap = minOverlapMm / 2;

	// Stanchion length: spans from stanchionTop down past lower TT + travel + half overlap
	const stanchionLen = $derived(stanchionTopT - lowerTtOuterT + forkTravelMm + halfOverlap);
	const stanchionBottomT = $derived(stanchionTopT - stanchionLen);

	// Compression amount in mm
	const compressionMm = $derived(forkTravelMm * compressionPct / 100);

	// Effective fork length at current compression
	const effectiveForkLen = $derived(forkLengthMm - compressionMm);

	// Slider bottom: determined by effective fork length from stanchion top
	const sliderBottomT = $derived(stanchionTopT - effectiveForkLen);

	// Slider length: base length + half overlap so both tubes contribute to engagement
	const sliderLen = $derived(forkLengthMm - stanchionLen + minOverlapMm);
	const sliderTopT = $derived(sliderBottomT + sliderLen);

	// Widths: use actual tube diameters; inverted (USD) swaps which is upper vs lower
	const upperTubeWidth = $derived(invertedForks ? sliderDiaMm : stanchionDiaMm);
	const lowerTubeWidth = $derived(invertedForks ? stanchionDiaMm : sliderDiaMm);

	// Helper to get a point on the fork offset line at parameter t
	function forkPoint(t: number): { x: number; y: number } {
		return {
			x: scCx + t * saDir.x + forkOffsetSigned * saPerp.x,
			y: scCy + t * saDir.y + forkOffsetSigned * saPerp.y,
		};
	}

	// Stanchion polygon corners (upper tube)
	const stanchionCorners = $derived.by(() => {
		const top = forkPoint(stanchionTopT);
		const bot = forkPoint(stanchionBottomT);
		const hw = upperTubeWidth / 2;
		return [
			{ x: top.x + hw * saPerp.x, y: top.y + hw * saPerp.y },
			{ x: top.x - hw * saPerp.x, y: top.y - hw * saPerp.y },
			{ x: bot.x - hw * saPerp.x, y: bot.y - hw * saPerp.y },
			{ x: bot.x + hw * saPerp.x, y: bot.y + hw * saPerp.y },
		];
	});

	// Slider polygon corners (lower tube)
	const sliderCorners = $derived.by(() => {
		const top = forkPoint(sliderTopT);
		const bot = forkPoint(sliderBottomT);
		const hw = lowerTubeWidth / 2;
		return [
			{ x: top.x + hw * saPerp.x, y: top.y + hw * saPerp.y },
			{ x: top.x - hw * saPerp.x, y: top.y - hw * saPerp.y },
			{ x: bot.x - hw * saPerp.x, y: bot.y - hw * saPerp.y },
			{ x: bot.x + hw * saPerp.x, y: bot.y + hw * saPerp.y },
		];
	});

	// Solid fork for link types (single rectangle, full fork length)
	const solidForkBottomT = $derived(stanchionTopT - forkLengthMm);
	const solidForkCorners = $derived.by(() => {
		const top = forkPoint(stanchionTopT);
		const bot = forkPoint(solidForkBottomT);
		const hw = upperTubeWidth / 2;
		return [
			{ x: top.x + hw * saPerp.x, y: top.y + hw * saPerp.y },
			{ x: top.x - hw * saPerp.x, y: top.y - hw * saPerp.y },
			{ x: bot.x - hw * saPerp.x, y: bot.y - hw * saPerp.y },
			{ x: bot.x + hw * saPerp.x, y: bot.y + hw * saPerp.y },
		];
	});

	// --- Spindle mount ---
	// Inner radius 1" (25.4mm), outer radius 2" (50.8mm) drawing units
	const spindleInnerR = 25.4;  // 1 inch
	const spindleOuterR = 50.8;  // 2 inches

	// Fork bottom T depends on suspension type
	const forkBottomForSpindle = $derived(
		suspensionType === 'telescopic' ? sliderBottomT : solidForkBottomT
	);

	// Default spindle center: on the fork offset line, 1" (25.4mm) below fork bottom
	// so the outer 2" circle just touches the fork bottom.
	// Then apply user offsets: spindleHeightMm along SA, spindleOffsetMm along saPerp.
	const spindleCenter = $derived.by(() => {
		const baseT = forkBottomForSpindle - spindleOuterR;
		const base = forkPoint(baseT + spindleHeightMm);
		return {
			x: base.x + spindleOffsetMm * saPerp.x,
			y: base.y + spindleOffsetMm * saPerp.y,
		};
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
	<!-- Steering axis (dashed yellow) -->
	<line
		x1={saLineBottom.x}
		y1={sy(saLineBottom.y)}
		x2={saLineTop.x}
		y2={sy(saLineTop.y)}
		stroke="#facc15"
		stroke-width={swThin}
		stroke-dasharray="{sw * 8} {sw * 4}"
	/>

	<!-- Fork tubes -->
	{#if suspensionType === 'telescopic'}
		<!-- Telescopic fork: slider (wider, bottom layer) -->
		<polygon
			points={polyPoints(sliderCorners)}
			fill="#2d3748"
			stroke="#6b7280"
			stroke-width={swThin}
		/>

		<!-- Telescopic fork: stanchion (narrower) -->
		<polygon
			points={polyPoints(stanchionCorners)}
			fill="#4a5568"
			stroke="#9ca3af"
			stroke-width={swThin}
		/>
	{:else}
		<!-- Solid fork leg for link types -->
		<polygon
			points={polyPoints(solidForkCorners)}
			fill="#4a5568"
			stroke="#9ca3af"
			stroke-width={swThin}
		/>
	{/if}

	<!-- Fork offset line (dashed blue) - on top of fork tubes -->
	<line
		x1={forkLineBottom.x}
		y1={sy(forkLineBottom.y)}
		x2={forkLineTop.x}
		y2={sy(forkLineTop.y)}
		stroke="#3b82f6"
		stroke-width={swThin}
		stroke-dasharray="{sw * 8} {sw * 4}"
	/>

	<!-- Steering column polygon (on top of fork, under triple trees) -->
	<polygon
		points={polyPoints(scCorners)}
		fill="#4b5563"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>

	<!-- Top triple tree polygon (on top of fork) -->
	<polygon
		points={polyPoints(topTtCorners)}
		fill="#374151"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>

	<!-- Bottom triple tree polygon (on top of fork) -->
	<polygon
		points={polyPoints(bottomTtCorners)}
		fill="#374151"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>

	<!-- Spindle mount: outer ring (2" radius) -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={spindleOuterR}
		fill="none"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>
	<!-- Spindle mount: inner ring (1" radius) -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={spindleInnerR}
		fill="none"
		stroke="#d1d5db"
		stroke-width={swThin}
	/>
	<!-- Spindle mount: center dot -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={sw * 1.5}
		fill="#d1d5db"
	/>

	<!-- Center dot (orange) -->
	<circle
		cx={scCx}
		cy={sy(scCy)}
		r={sw * 2}
		fill="#f97316"
	/>
</svg>
