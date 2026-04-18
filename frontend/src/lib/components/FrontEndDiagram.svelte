<script lang="ts">
	import type { FrontEndResults } from '$lib/frontEndGeometry';
	import type { TireDimensions } from '$lib/tire';

	let { results, tire, steeringColumnLengthMm, forkOffsetMm, forkLengthMm, suspensionType, forkTravelMm, compressionPct, spindleOffsetMm, spindleHeightMm, stanchionDiaMm, sliderDiaMm, invertedForks, suspensionOffsetMm, suspensionHeightMm, suspUpperMountHeightMm }: { results: FrontEndResults; tire: TireDimensions; steeringColumnLengthMm: number; forkOffsetMm: number; forkLengthMm: number; suspensionType: string; forkTravelMm: number; compressionPct: number; spindleOffsetMm: number; spindleHeightMm: number; stanchionDiaMm: number; sliderDiaMm: number; invertedForks: boolean; suspensionOffsetMm: number; suspensionHeightMm: number; suspUpperMountHeightMm: number } = $props();

	// Flip y for SVG
	function sy(y: number): number { return -y; }

	// Bounding box
	const bounds = $derived.by(() => {
		const pad = 100;
		const scHalf = steeringColumnLengthMm / 2 + 80;
		const cx = results.steeringColumnCenter.x;
		const cy = results.steeringColumnCenter.y;
		const tireR = tire.outerRadiusMm;
		// Expand bounds to always include the full wheel
		const minX = Math.min(cx - scHalf, spindleCx - tireR) - pad;
		const maxX = Math.max(cx + scHalf, spindleCx + tireR) + pad;
		const minY = Math.min(-pad, spindleCy - tireR - pad);
		const maxY = Math.max(cy + scHalf, spindleCy + tireR) + pad;
		return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
	});

	const baseViewBox = $derived(
		`${bounds.minX} ${-bounds.maxY} ${bounds.width} ${bounds.height}`
	);

	// --- Pan & zoom state ---
	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);
	let isPanning = $state(false);
	let panStartX = $state(0);
	let panStartY = $state(0);
	let panStartPanX = $state(0);
	let panStartPanY = $state(0);
	let svgEl: SVGSVGElement | undefined = $state();

	const viewBox = $derived.by(() => {
		const w = bounds.width / zoom;
		const h = bounds.height / zoom;
		const cx = bounds.minX + bounds.width / 2 - panX;
		const cy = -bounds.maxY + bounds.height / 2 - panY;
		return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
	});

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		isPanning = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		panStartPanX = panX;
		panStartPanY = panY;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isPanning || !svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const scaleX = bounds.width / (rect.width * zoom);
		const scaleY = bounds.height / (rect.height * zoom);
		panX = panStartPanX + (e.clientX - panStartX) * scaleX;
		panY = panStartPanY + (e.clientY - panStartY) * scaleY;
	}

	function onPointerUp() {
		isPanning = false;
	}

	function onWheel(e: WheelEvent) {
		if (!e.shiftKey) return;
		e.preventDefault();
		// macOS swaps deltaY to deltaX when shift is held
		const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
		const factor = delta < 0 ? 1.1 : 1 / 1.1;
		zoom = Math.max(0.1, Math.min(20, zoom * factor));
	}

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
	// Inner: 1" OD (12.7mm radius), Outer: 2" OD (25.4mm radius)
	const spindleInnerR = 12.7;   // 1" diameter = 0.5" radius
	const spindleOuterR = 25.4;   // 2" diameter = 1" radius

	// Fork bottom T depends on suspension type
	const forkBottomForSpindle = $derived(
		suspensionType === 'telescopic' ? sliderBottomT : solidForkBottomT
	);

	// Default spindle center: on the fork offset line, 1" (25.4mm) below fork bottom
	// so the outer 2" circle just touches the fork bottom.
	// Then apply user offsets: spindleHeightMm along SA, spindleOffsetMm along saPerp.
	// For link types, this is the "rest" position before compression rotation.
	const spindleCenterRest = $derived.by(() => {
		const baseT = forkBottomForSpindle - spindleOuterR;
		const base = forkPoint(baseT + spindleHeightMm);
		return {
			x: base.x + spindleOffsetMm * saPerp.x,
			y: base.y + spindleOffsetMm * saPerp.y,
		};
	});

	// --- Suspension mount (lower) - rest position ---
	const suspMountCenterRest = $derived.by(() => {
		const baseT = forkBottomForSpindle - spindleOuterR + suspensionHeightMm;
		const base = forkPoint(baseT);
		return {
			x: base.x + suspensionOffsetMm * saPerp.x,
			y: base.y + suspensionOffsetMm * saPerp.y,
		};
	});

	// --- Link compression rotation (leading/trailing link only) ---
	// The link arm pivots around the fork cap center.
	// compressionPct drives rotation: 0% = rest, 100% = max rotation.
	// Max rotation angle is determined by shock travel geometry.

	// Helper: rotate point around a pivot by angle (radians)
	function rotateAround(
		pt: { x: number; y: number },
		pivot: { x: number; y: number },
		angle: number,
	): { x: number; y: number } {
		const dx = pt.x - pivot.x;
		const dy = pt.y - pivot.y;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		return {
			x: pivot.x + dx * cos - dy * sin,
			y: pivot.y + dx * sin + dy * cos,
		};
	}

	// For link types: compute max rotation from shock travel.
	// The shock connects suspUpperMountCenter (fixed) to suspMountCenterRest (on link).
	// When the shock shortens by forkTravelMm, the lower mount swings.
	// We solve for the rotation angle that shortens the shock by the right amount.
	const linkRotationAngle = $derived.by(() => {
		if (suspensionType === 'telescopic') return 0;
		const pivot = forkCapCenter;
		const upperFixed = suspUpperMountCenter;
		const lowerRest = suspMountCenterRest;

		// Distance from pivot to lower mount (arm radius)
		const armDx = lowerRest.x - pivot.x;
		const armDy = lowerRest.y - pivot.y;
		const armLen = Math.sqrt(armDx * armDx + armDy * armDy);
		if (armLen < 1) return 0;

		// Shock length at rest
		const shockRestLen = Math.sqrt(
			(upperFixed.x - lowerRest.x) ** 2 + (upperFixed.y - lowerRest.y) ** 2
		);

		// Target shock length at current compression
		const targetShockLen = shockRestLen - forkTravelMm * compressionPct / 100;
		if (targetShockLen < 1) return 0;

		// Solve for angle: lower mount on a circle of radius armLen around pivot,
		// find angle where distance to upperFixed = targetShockLen.
		// Use binary search for robustness.
		const restAngle = Math.atan2(armDy, armDx);

		// Determine search direction: leading link rotates forward (positive angle = CCW),
		// trailing link rotates backward
		const searchDir = suspensionType === 'leading_link' ? 1 : -1;

		let lo = 0, hi = Math.PI / 2; // max 90 degrees
		for (let i = 0; i < 30; i++) {
			const mid = (lo + hi) / 2;
			const testAngle = restAngle + searchDir * mid;
			const px = pivot.x + armLen * Math.cos(testAngle);
			const py = pivot.y + armLen * Math.sin(testAngle);
			const dist = Math.sqrt((upperFixed.x - px) ** 2 + (upperFixed.y - py) ** 2);
			if (dist > targetShockLen) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		return searchDir * (lo + hi) / 2;
	});

	// Final positions: rotated for link types, unchanged for telescopic
	const spindleCenter = $derived.by(() => {
		if (suspensionType === 'telescopic') return spindleCenterRest;
		return rotateAround(spindleCenterRest, forkCapCenter, linkRotationAngle);
	});

	const suspMountCenter = $derived.by(() => {
		if (suspensionType === 'telescopic') return suspMountCenterRest;
		return rotateAround(suspMountCenterRest, forkCapCenter, linkRotationAngle);
	});

	// Shorthand for spindle center coords (used in bounds before SVG)
	const spindleCx = $derived(spindleCenter.x);
	const spindleCy = $derived(spindleCenter.y);

	// --- Suspension upper mount ---
	// Same sizing: 1" ID (12.7mm r), 2" OD (25.4mm r)
	// Position: starts at bottom of bottom triple tree, offset along fork axis by suspUpperMountHeightMm,
	// and perpendicular by suspensionOffsetMm (same as lower mount)
	const suspUpperMountCenter = $derived.by(() => {
		const baseT = lowerTtOuterT + suspUpperMountHeightMm;
		const base = forkPoint(baseT);
		return {
			x: base.x + suspensionOffsetMm * saPerp.x,
			y: base.y + suspensionOffsetMm * saPerp.y,
		};
	});

	// Tangent line on upper mount perpendicular to fork axis
	// Front edge of circle (away from TTs, toward ground), extends to the fork tube
	const suspUpperTangentLine = $derived.by(() => {
		const c = suspUpperMountCenter;
		const r = spindleOuterR;
		// Tangent point at front of circle (-saDir = away from TTs)
		const tx = c.x - r * saDir.x;
		const ty = c.y - r * saDir.y;
		// Fork center at the same position along SA
		const baseT = lowerTtOuterT + suspUpperMountHeightMm - r;
		const forkCenter = forkPoint(baseT);
		// Fork edge closest to the mount (half tube width along saPerp toward mount)
		const hw = upperTubeWidth / 2;
		const sign = suspensionOffsetMm >= 0 ? 1 : -1;
		const forkEdgeX = forkCenter.x + sign * hw * saPerp.x;
		const forkEdgeY = forkCenter.y + sign * hw * saPerp.y;
		return {
			x1: tx,
			y1: ty,
			x2: forkEdgeX,
			y2: forkEdgeY,
		};
	});

	// Tangent line from upper mount circle to the closest corner of the bottom TT
	const suspUpperTtTangentLine = $derived.by(() => {
		const c = suspUpperMountCenter;
		const r = spindleOuterR;
		// Find the closest bottom TT corner
		let closest = bottomTtCorners[0];
		let minDist = Infinity;
		for (const corner of bottomTtCorners) {
			const dx = corner.x - c.x;
			const dy = corner.y - c.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < minDist) {
				minDist = dist;
				closest = corner;
			}
		}
		const d = minDist;
		if (d <= r) return null; // corner inside circle
		// Proper tangent point: angle from center-to-corner line, offset by acos(r/d)
		const ux = (closest.x - c.x) / d;
		const uy = (closest.y - c.y) / d;
		const cosTheta = r / d;
		const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
		// Two tangent points; pick the one on the TT side (toward fork)
		// Rotate unit vector by -theta for the tangent point closest to the fork
		const tx1 = c.x + r * (ux * cosTheta + uy * sinTheta);
		const ty1 = c.y + r * (uy * cosTheta - ux * sinTheta);
		const tx2 = c.x + r * (ux * cosTheta - uy * sinTheta);
		const ty2 = c.y + r * (uy * cosTheta + ux * sinTheta);
		// Pick whichever tangent point is farther from the fork axis
		const forkBase = forkPoint(lowerTtOuterT);
		const d1 = (tx1 - forkBase.x) ** 2 + (ty1 - forkBase.y) ** 2;
		const d2 = (tx2 - forkBase.x) ** 2 + (ty2 - forkBase.y) ** 2;
		const tx = d1 > d2 ? tx1 : tx2;
		const ty = d1 > d2 ? ty1 : ty2;
		return { x1: tx, y1: ty, x2: closest.x, y2: closest.y };
	});

	// --- Shock absorber body (upper wider rectangle + lower narrower rectangle) ---
	// Direction from upper mount to lower mount
	const shockDir = $derived.by(() => {
		const dx = suspMountCenter.x - suspUpperMountCenter.x;
		const dy = suspMountCenter.y - suspUpperMountCenter.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 0.1) return { ux: 0, uy: -1, px: 1, py: 0, len };
		return { ux: dx / len, uy: dy / len, px: -dy / len, py: dx / len, len };
	});

	// Shock body: upper (wider) rectangle from upper mount outward
	const shockUpperHW = 18; // half-width of upper shock body
	const shockLowerHW = 10; // half-width of lower shock shaft
	const shockUpperLen = $derived(shockDir.len * 0.45); // upper body is ~45% of total
	const shockLowerLen = $derived(shockDir.len * 0.55); // lower shaft is ~55%

	const shockUpperCorners = $derived.by(() => {
		const s = shockDir;
		const c = suspUpperMountCenter;
		// Start at upper mount center, extend toward lower mount
		const t0x = c.x, t0y = c.y;
		const t1x = c.x + shockUpperLen * s.ux, t1y = c.y + shockUpperLen * s.uy;
		return [
			{ x: t0x + shockUpperHW * s.px, y: t0y + shockUpperHW * s.py },
			{ x: t0x - shockUpperHW * s.px, y: t0y - shockUpperHW * s.py },
			{ x: t1x - shockUpperHW * s.px, y: t1y - shockUpperHW * s.py },
			{ x: t1x + shockUpperHW * s.px, y: t1y + shockUpperHW * s.py },
		];
	});

	const shockLowerCorners = $derived.by(() => {
		const s = shockDir;
		const c = suspMountCenter;
		// Start at lower mount center, extend toward upper mount
		const t0x = c.x, t0y = c.y;
		const t1x = c.x - shockLowerLen * s.ux, t1y = c.y - shockLowerLen * s.uy;
		return [
			{ x: t0x + shockLowerHW * s.px, y: t0y + shockLowerHW * s.py },
			{ x: t0x - shockLowerHW * s.px, y: t0y - shockLowerHW * s.py },
			{ x: t1x - shockLowerHW * s.px, y: t1y - shockLowerHW * s.py },
			{ x: t1x + shockLowerHW * s.px, y: t1y + shockLowerHW * s.py },
		];
	});

	// --- Fork end cap ---
	// 2" OD circle (25.4mm radius) centered 1" (25.4mm) below fork bottom on fork offset line
	const forkCapR = 25.4; // 2" OD = 1" radius
	const forkCapCenter = $derived.by(() => {
		const t = forkBottomForSpindle - 25.4;
		return forkPoint(t);
	});

	// Fork bottom edge points (where lower tube meets cap parallel lines)
	const forkBottomWidth = $derived(
		suspensionType === 'telescopic' ? lowerTubeWidth : upperTubeWidth
	);
	const forkBottomCenter = $derived(forkPoint(forkBottomForSpindle));

	// Parallel lines from fork bottom edges to cap circle tangent points
	// The fork edges are at +/- halfWidth along saPerp from forkBottomCenter
	// The cap circle tangent points are at +/- forkCapR along saPerp from forkCapCenter
	const forkCapLines = $derived.by(() => {
		const hw = forkBottomWidth / 2;
		const topLeft = {
			x: forkBottomCenter.x + hw * saPerp.x,
			y: forkBottomCenter.y + hw * saPerp.y,
		};
		const topRight = {
			x: forkBottomCenter.x - hw * saPerp.x,
			y: forkBottomCenter.y - hw * saPerp.y,
		};
		const botLeft = {
			x: forkCapCenter.x + forkCapR * saPerp.x,
			y: forkCapCenter.y + forkCapR * saPerp.y,
		};
		const botRight = {
			x: forkCapCenter.x - forkCapR * saPerp.x,
			y: forkCapCenter.y - forkCapR * saPerp.y,
		};
		return { topLeft, topRight, botLeft, botRight };
	});

	// --- External tangent line helper ---
	// Computes external tangent touch points between two circles of given radii
	function externalTangents(
		c1: { x: number; y: number }, r1: number,
		c2: { x: number; y: number }, r2: number,
	): { top1: { x: number; y: number }; bot1: { x: number; y: number }; top2: { x: number; y: number }; bot2: { x: number; y: number } } | null {
		const dx = c2.x - c1.x;
		const dy = c2.y - c1.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 0.01) return null;
		const ux = dx / dist;
		const uy = dy / dist;
		const px = uy;
		const py = -ux;
		const sinTheta = (r1 - r2) / dist;
		const cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));
		return {
			top1: { x: c1.x + r1 * (px * cosTheta + ux * sinTheta), y: c1.y + r1 * (py * cosTheta + uy * sinTheta) },
			bot1: { x: c1.x - r1 * (px * cosTheta - ux * sinTheta), y: c1.y - r1 * (py * cosTheta - uy * sinTheta) },
			top2: { x: c2.x + r2 * (px * cosTheta + ux * sinTheta), y: c2.y + r2 * (py * cosTheta + uy * sinTheta) },
			bot2: { x: c2.x - r2 * (px * cosTheta - ux * sinTheta), y: c2.y - r2 * (py * cosTheta - uy * sinTheta) },
		};
	}

	// Tangent lines: fork cap → spindle (outer circles)
	const tangentCapSpindle = $derived(externalTangents(forkCapCenter, forkCapR, spindleCenter, spindleOuterR));

	// Tangent lines: fork cap → suspension mount (only for link types)
	const tangentCapSusp = $derived(
		suspensionType !== 'telescopic'
			? externalTangents(forkCapCenter, forkCapR, suspMountCenter, spindleOuterR)
			: null
	);

	// Tangent lines: spindle → suspension mount (only for link types)
	const tangentSpindleSusp = $derived(
		suspensionType !== 'telescopic'
			? externalTangents(spindleCenter, spindleOuterR, suspMountCenter, spindleOuterR)
			: null
	);

	// --- Filter out interior tangent lines ---
	// A tangent line is "interior" if it passes through another circle or crosses another tangent line.

	// Check if a line segment's midpoint is within radius of a circle center
	function segmentIntersectsCircle(
		p1: { x: number; y: number }, p2: { x: number; y: number },
		c: { x: number; y: number }, r: number,
	): boolean {
		// Closest point on segment to circle center
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const lenSq = dx * dx + dy * dy;
		if (lenSq < 0.01) return false;
		const t = Math.max(0, Math.min(1, ((c.x - p1.x) * dx + (c.y - p1.y) * dy) / lenSq));
		const closestX = p1.x + t * dx;
		const closestY = p1.y + t * dy;
		const distSq = (closestX - c.x) ** 2 + (closestY - c.y) ** 2;
		return distSq < r * r;
	}

	// Check if two line segments intersect (excluding shared endpoints)
	function segmentsIntersect(
		a1: { x: number; y: number }, a2: { x: number; y: number },
		b1: { x: number; y: number }, b2: { x: number; y: number },
	): boolean {
		const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
		const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
		const cross = d1x * d2y - d1y * d2x;
		if (Math.abs(cross) < 1e-9) return false;
		const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
		const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
		return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
	}

	// Collect all circles and all candidate tangent line pairs, then filter
	type TangentPair = { top: { p1: { x: number; y: number }; p2: { x: number; y: number } }; bot: { p1: { x: number; y: number }; p2: { x: number; y: number } } };

	const filteredTangentLines = $derived.by(() => {
		// All circles to check against (center + radius)
		// Indices: 0=forkCap, 1=spindle, 2=suspMount(lower)
		const circles: { c: { x: number; y: number }; r: number }[] = [
			{ c: forkCapCenter, r: forkCapR },
			{ c: spindleCenter, r: spindleOuterR },
		];
		if (suspensionType !== 'telescopic') {
			circles.push({ c: suspMountCenter, r: spindleOuterR });
		}

		// All candidate tangent segments
		const candidates: { p1: { x: number; y: number }; p2: { x: number; y: number }; skipCircles: number[] }[] = [];

		if (tangentCapSpindle) {
			candidates.push({ p1: tangentCapSpindle.top1, p2: tangentCapSpindle.top2, skipCircles: [0, 1] });
			candidates.push({ p1: tangentCapSpindle.bot1, p2: tangentCapSpindle.bot2, skipCircles: [0, 1] });
		}
		if (tangentCapSusp) {
			candidates.push({ p1: tangentCapSusp.top1, p2: tangentCapSusp.top2, skipCircles: [0, 2] });
			candidates.push({ p1: tangentCapSusp.bot1, p2: tangentCapSusp.bot2, skipCircles: [0, 2] });
		}
		if (tangentSpindleSusp) {
			candidates.push({ p1: tangentSpindleSusp.top1, p2: tangentSpindleSusp.top2, skipCircles: [1, 2] });
			candidates.push({ p1: tangentSpindleSusp.bot1, p2: tangentSpindleSusp.bot2, skipCircles: [1, 2] });
		}

		// Filter: remove if segment intersects a circle it's not tangent to,
		// or if it intersects another surviving segment
		const surviving: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

		for (const cand of candidates) {
			let dominated = false;

			// Check against circles it's not tangent to
			for (let i = 0; i < circles.length; i++) {
				if (cand.skipCircles.includes(i)) continue;
				if (segmentIntersectsCircle(cand.p1, cand.p2, circles[i].c, circles[i].r)) {
					dominated = true;
					break;
				}
			}

			if (!dominated) {
				surviving.push({ p1: cand.p1, p2: cand.p2 });
			}
		}

		// Second pass: remove if any surviving segment crosses another
		const final: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
		for (let i = 0; i < surviving.length; i++) {
			let crosses = false;
			for (let j = 0; j < surviving.length; j++) {
				if (i === j) continue;
				if (segmentsIntersect(surviving[i].p1, surviving[i].p2, surviving[j].p1, surviving[j].p2)) {
					crosses = true;
					break;
				}
			}
			if (!crosses) {
				final.push(surviving[i]);
			}
		}

		return final;
	});

	function polyPoints(corners: { x: number; y: number }[]): string {
		return corners.map(c => `${c.x},${sy(c.y)}`).join(' ');
	}

	// --- Trail measurement ---
	// Ground Y is bottom of tire
	const groundY = $derived(spindleCenter.y - tire.outerRadiusMm);

	// Contact patch: directly below spindle center on ground
	const contactPatchX = $derived(spindleCenter.x);

	// Steering axis ground intersection: compute directly from SA line and ground level
	// SA line passes through scCenter along saDir direction. Find t where y = groundY:
	// scCy + t * saDir.y = groundY  =>  t = (groundY - scCy) / saDir.y
	const saGroundX = $derived.by(() => {
		if (Math.abs(saDir.y) < 1e-9) return scCx; // vertical SA edge case
		const t = (groundY - scCy) / saDir.y;
		return scCx + t * saDir.x;
	});

	// Trail: actual measured distance between contact patch and SA ground intersection
	const trailMm = $derived(Math.abs(saGroundX - contactPatchX));
	const trailIn = $derived(trailMm / 25.4);

	// Crosshair size
	const crossSize = $derived(sw * 6);

	// Dimension line Y position (below ground)
	const dimY = $derived(groundY - crossSize * 2.5);
</script>

<svg
	bind:this={svgEl}
	viewBox={viewBox}
	class="w-full h-full"
	class:cursor-grabbing={isPanning}
	class:cursor-grab={!isPanning}
	xmlns="http://www.w3.org/2000/svg"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointerleave={onPointerUp}
	onwheel={onWheel}
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

	<!-- Fork end cap: parallel lines from fork bottom to cap circle -->
	<line
		x1={forkCapLines.topLeft.x}
		y1={sy(forkCapLines.topLeft.y)}
		x2={forkCapLines.botLeft.x}
		y2={sy(forkCapLines.botLeft.y)}
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	<line
		x1={forkCapLines.topRight.x}
		y1={sy(forkCapLines.topRight.y)}
		x2={forkCapLines.botRight.x}
		y2={sy(forkCapLines.botRight.y)}
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>

	<!-- Fork end cap circle (1" OD) -->
	<circle
		cx={forkCapCenter.x}
		cy={sy(forkCapCenter.y)}
		r={forkCapR}
		fill="none"
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>

	<!-- Filtered tangent lines (only outer hull, no interior lines) -->
	{#each filteredTangentLines as seg}
		<line
			x1={seg.p1.x}
			y1={sy(seg.p1.y)}
			x2={seg.p2.x}
			y2={sy(seg.p2.y)}
			stroke="#c4b5d4"
			stroke-width={swThin}
		/>
	{/each}

	<!-- Spindle mount: 2" OD circle (25.4mm radius) -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={spindleOuterR}
		fill="none"
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	<!-- Spindle mount: 1" OD circle (12.7mm radius) -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={spindleInnerR}
		fill="none"
		stroke="#d8cce5"
		stroke-width={swThin}
	/>
	<!-- Spindle mount: center dot -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={sw * 1.5}
		fill="#d8cce5"
	/>

	{#if suspensionType !== 'telescopic'}
	<!-- Shock absorber: center dotted line connecting upper and lower mounts -->
	<line
		x1={suspUpperMountCenter.x}
		y1={sy(suspUpperMountCenter.y)}
		x2={suspMountCenter.x}
		y2={sy(suspMountCenter.y)}
		stroke="#fdba74"
		stroke-width={swThin}
		stroke-dasharray="4,4"
	/>
	<!-- Shock absorber: upper body (wider rectangle) -->
	<polygon
		points={polyPoints(shockUpperCorners)}
		fill="none"
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	<!-- Shock absorber: lower shaft (narrower rectangle) -->
	<polygon
		points={polyPoints(shockLowerCorners)}
		fill="none"
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>

	<!-- Suspension mount: outer ring (2" OD = 25.4mm radius) -->
	<circle
		cx={suspMountCenter.x}
		cy={sy(suspMountCenter.y)}
		r={spindleOuterR}
		fill="none"
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	<!-- Suspension mount: inner ring (1" OD = 12.7mm radius) -->
	<circle
		cx={suspMountCenter.x}
		cy={sy(suspMountCenter.y)}
		r={spindleInnerR}
		fill="none"
		stroke="#d8cce5"
		stroke-width={swThin}
	/>
	<!-- Suspension mount: center dot -->
	<circle
		cx={suspMountCenter.x}
		cy={sy(suspMountCenter.y)}
		r={sw * 1.5}
		fill="#d8cce5"
	/>

	<!-- Suspension upper mount: outer ring (2" OD = 25.4mm radius) -->
	<circle
		cx={suspUpperMountCenter.x}
		cy={sy(suspUpperMountCenter.y)}
		r={spindleOuterR}
		fill="none"
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	<!-- Suspension upper mount: inner ring (1" OD = 12.7mm radius) -->
	<circle
		cx={suspUpperMountCenter.x}
		cy={sy(suspUpperMountCenter.y)}
		r={spindleInnerR}
		fill="none"
		stroke="#d8cce5"
		stroke-width={swThin}
	/>
	<!-- Suspension upper mount: center dot -->
	<circle
		cx={suspUpperMountCenter.x}
		cy={sy(suspUpperMountCenter.y)}
		r={sw * 1.5}
		fill="#d8cce5"
	/>
	<!-- Suspension upper mount: tangent line perpendicular to fork -->
	<line
		x1={suspUpperTangentLine.x1}
		y1={sy(suspUpperTangentLine.y1)}
		x2={suspUpperTangentLine.x2}
		y2={sy(suspUpperTangentLine.y2)}
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	<!-- Suspension upper mount: tangent line to closest bottom TT corner -->
	{#if suspUpperTtTangentLine}
	<line
		x1={suspUpperTtTangentLine.x1}
		y1={sy(suspUpperTtTangentLine.y1)}
		x2={suspUpperTtTangentLine.x2}
		y2={sy(suspUpperTtTangentLine.y2)}
		stroke="#c4b5d4"
		stroke-width={swThin}
	/>
	{/if}
	{/if}

	<!-- Center dot (orange) -->
	<circle
		cx={scCx}
		cy={sy(scCy)}
		r={sw * 2}
		fill="#f97316"
	/>

	<!-- Tire: outer circle -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={tire.outerRadiusMm}
		fill="none"
		stroke="#6b7280"
		stroke-width={sw}
	/>

	<!-- Rim: inner circle -->
	<circle
		cx={spindleCenter.x}
		cy={sy(spindleCenter.y)}
		r={tire.rimRadiusMm}
		fill="none"
		stroke="#9ca3af"
		stroke-width={swThin}
	/>

	<!-- Ground line: horizontal, tangent to tire bottom -->
	<line
		x1={bounds.minX}
		y1={sy(groundY)}
		x2={bounds.maxX}
		y2={sy(groundY)}
		stroke="#a3a3a3"
		stroke-width={sw}
	/>

	<!-- Contact patch crosshair (green) -->
	<line
		x1={contactPatchX - crossSize}
		y1={sy(groundY)}
		x2={contactPatchX + crossSize}
		y2={sy(groundY)}
		stroke="#22c55e"
		stroke-width={swThin}
	/>
	<line
		x1={contactPatchX}
		y1={sy(groundY - crossSize)}
		x2={contactPatchX}
		y2={sy(groundY + crossSize)}
		stroke="#22c55e"
		stroke-width={swThin}
	/>

	<!-- Steering axis ground intersection crosshair (red) -->
	<line
		x1={saGroundX - crossSize}
		y1={sy(groundY)}
		x2={saGroundX + crossSize}
		y2={sy(groundY)}
		stroke="#ef4444"
		stroke-width={swThin}
	/>
	<line
		x1={saGroundX}
		y1={sy(groundY - crossSize)}
		x2={saGroundX}
		y2={sy(groundY + crossSize)}
		stroke="#ef4444"
		stroke-width={swThin}
	/>

	<!-- Trail dimension line -->
	<!-- Horizontal line between the two points -->
	<line
		x1={contactPatchX}
		y1={sy(dimY)}
		x2={saGroundX}
		y2={sy(dimY)}
		stroke="#fbbf24"
		stroke-width={swThin}
	/>
	<!-- Left tick -->
	<line
		x1={contactPatchX}
		y1={sy(dimY - sw * 2)}
		x2={contactPatchX}
		y2={sy(dimY + sw * 2)}
		stroke="#fbbf24"
		stroke-width={swThin}
	/>
	<!-- Right tick -->
	<line
		x1={saGroundX}
		y1={sy(dimY - sw * 2)}
		x2={saGroundX}
		y2={sy(dimY + sw * 2)}
		stroke="#fbbf24"
		stroke-width={swThin}
	/>
	<!-- Trail label -->
	<text
		x={(contactPatchX + saGroundX) / 2}
		y={sy(dimY + sw * 3)}
		text-anchor="middle"
		fill="#fbbf24"
		font-size={sw * 4}
	>
		{trailMm.toFixed(1)} mm ({trailIn.toFixed(2)}")
	</text>
</svg>
