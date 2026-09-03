/**
 * Drawable front-end geometry in the Front End tab's local coordinates
 * (contact-patch origin, +x forward, +y up, mm). Shared so the Brakes
 * scene can draw the same fork / link / shock as the design tool.
 */

import type { FrontEndResults } from './frontEndGeometry';

export interface Pt {
	x: number;
	y: number;
}

export interface FrontEndVisualParams {
	results: FrontEndResults;
	steeringColumnLengthMm: number;
	forkOffsetMm: number;
	forkLengthMm: number;
	suspensionType: string;
	forkTravelMm: number;
	compressionPct: number;
	spindleOffsetMm: number;
	spindleHeightMm: number;
	stanchionDiaMm: number;
	sliderDiaMm: number;
	invertedForks: boolean;
	suspensionOffsetMm: number;
	suspensionHeightMm: number;
	suspUpperMountHeightMm: number;
	suspUpperMountOffsetMm: number;
	linkLengthMm: number;
	linkOffsetMm: number;
}

export interface LineSeg {
	p1: Pt;
	p2: Pt;
}

export interface FrontEndVisual {
	isLink: boolean;
	saLine: LineSeg;
	forkOffsetLine: LineSeg;
	scCorners: Pt[];
	topTtCorners: Pt[];
	bottomTtCorners: Pt[];
	stanchionCorners: Pt[];
	sliderCorners: Pt[];
	solidForkCorners: Pt[];
	forkCapCenter: Pt;
	forkCapR: number;
	forkCapLines: { topLeft: Pt; topRight: Pt; botLeft: Pt; botRight: Pt };
	spindle: Pt;
	spindleInnerR: number;
	spindleOuterR: number;
	suspMount: Pt;
	suspUpperMount: Pt;
	shockUpperCorners: Pt[];
	shockLowerCorners: Pt[];
	shockCenter: LineSeg;
	tangents: LineSeg[];
	upperTangent: LineSeg;
	upperTtTangent: LineSeg | null;
	scCenter: Pt;
}

function n(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function rotateAround(pt: Pt, pivot: Pt, angle: number): Pt {
	const dx = pt.x - pivot.x;
	const dy = pt.y - pivot.y;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

function externalTangents(
	c1: Pt, r1: number,
	c2: Pt, r2: number,
): { top1: Pt; bot1: Pt; top2: Pt; bot2: Pt } | null {
	const dx = c2.x - c1.x;
	const dy = c2.y - c1.y;
	const dist = Math.hypot(dx, dy);
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

function segmentIntersectsCircle(p1: Pt, p2: Pt, c: Pt, r: number): boolean {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq < 0.01) return false;
	const t = Math.max(0, Math.min(1, ((c.x - p1.x) * dx + (c.y - p1.y) * dy) / lenSq));
	const closestX = p1.x + t * dx;
	const closestY = p1.y + t * dy;
	return (closestX - c.x) ** 2 + (closestY - c.y) ** 2 < r * r;
}

function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
	const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
	const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
	const cross = d1x * d2y - d1y * d2x;
	if (Math.abs(cross) < 1e-9) return false;
	const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
	const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
	return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

export function buildFrontEndVisual(p: FrontEndVisualParams): FrontEndVisual {
	const scLength = Math.max(10, p.steeringColumnLengthMm);
	const scWidth = 50;
	const scCx = p.results.steeringColumnCenter.x;
	const scCy = p.results.steeringColumnCenter.y;
	const isLink = p.suspensionType === 'leading_link' || p.suspensionType === 'trailing_link';

	const dx0 = p.results.steeringAxisTop.x - p.results.steeringAxisGround.x;
	const dy0 = p.results.steeringAxisTop.y - p.results.steeringAxisGround.y;
	const saLen = Math.hypot(dx0, dy0) || 1;
	const saDir = { x: dx0 / saLen, y: dy0 / saLen };
	const saPerp = { x: saDir.y, y: -saDir.x };

	const forkOffsetSigned = p.forkOffsetMm;
	function forkPoint(t: number): Pt {
		return {
			x: scCx + t * saDir.x + forkOffsetSigned * saPerp.x,
			y: scCy + t * saDir.y + forkOffsetSigned * saPerp.y,
		};
	}

	const hL = scLength / 2;
	const hW = scWidth / 2;
	const scCorners: Pt[] = [
		{ x: scCx + hL * saDir.x + hW * saPerp.x, y: scCy + hL * saDir.y + hW * saPerp.y },
		{ x: scCx + hL * saDir.x - hW * saPerp.x, y: scCy + hL * saDir.y - hW * saPerp.y },
		{ x: scCx - hL * saDir.x - hW * saPerp.x, y: scCy - hL * saDir.y - hW * saPerp.y },
		{ x: scCx - hL * saDir.x + hW * saPerp.x, y: scCy - hL * saDir.y + hW * saPerp.y },
	];

	const saLine: LineSeg = {
		p1: { x: p.results.steeringAxisGround.x, y: p.results.steeringAxisGround.y },
		p2: { x: scCx + (hL + scWidth) * saDir.x, y: scCy + (hL + scWidth) * saDir.y },
	};

	const ttThickness = scWidth / 2;
	const ttGap = 3;
	const ttMinPerp = Math.min(-scWidth / 2, forkOffsetSigned - scWidth / 2);
	const ttMaxPerp = Math.max(scWidth / 2, forkOffsetSigned + scWidth / 2);

	const scTopMid = { x: scCx + hL * saDir.x, y: scCy + hL * saDir.y };
	const ttBottomCenter = { x: scTopMid.x + ttGap * saDir.x, y: scTopMid.y + ttGap * saDir.y };
	const bl = { x: ttBottomCenter.x + ttMinPerp * saPerp.x, y: ttBottomCenter.y + ttMinPerp * saPerp.y };
	const br = { x: ttBottomCenter.x + ttMaxPerp * saPerp.x, y: ttBottomCenter.y + ttMaxPerp * saPerp.y };
	const topTtCorners: Pt[] = [
		bl, br,
		{ x: br.x + ttThickness * saDir.x, y: br.y + ttThickness * saDir.y },
		{ x: bl.x + ttThickness * saDir.x, y: bl.y + ttThickness * saDir.y },
	];

	const scBottomMid = { x: scCx - hL * saDir.x, y: scCy - hL * saDir.y };
	const btTopCenter = { x: scBottomMid.x - ttGap * saDir.x, y: scBottomMid.y - ttGap * saDir.y };
	const ttl = { x: btTopCenter.x + ttMinPerp * saPerp.x, y: btTopCenter.y + ttMinPerp * saPerp.y };
	const ttr = { x: btTopCenter.x + ttMaxPerp * saPerp.x, y: btTopCenter.y + ttMaxPerp * saPerp.y };
	const bottomTtCorners: Pt[] = [
		ttl, ttr,
		{ x: ttr.x - ttThickness * saDir.x, y: ttr.y - ttThickness * saDir.y },
		{ x: ttl.x - ttThickness * saDir.x, y: ttl.y - ttThickness * saDir.y },
	];

	const lowerTtOuterT = -(scLength / 2 + ttGap + ttThickness);
	const upperTtOuterT = scLength / 2 + ttGap + ttThickness;
	const stanchionTopT = upperTtOuterT + ttThickness;
	const minOverlapMm = 80;
	const halfOverlap = minOverlapMm / 2;
	const compressionMm = p.forkTravelMm * p.compressionPct / 100;
	const effectiveForkLen = p.forkLengthMm - compressionMm;
	const stanchionLen = stanchionTopT - lowerTtOuterT + p.forkTravelMm + halfOverlap;
	const stanchionBottomT = stanchionTopT - stanchionLen;
	const sliderBottomT = stanchionTopT - effectiveForkLen;
	const sliderLen = p.forkLengthMm - stanchionLen + minOverlapMm;
	const sliderTopT = sliderBottomT + sliderLen;
	const upperTubeWidth = p.invertedForks ? p.sliderDiaMm : p.stanchionDiaMm;
	const lowerTubeWidth = p.invertedForks ? p.stanchionDiaMm : p.sliderDiaMm;

	function tubeCorners(topT: number, botT: number, width: number): Pt[] {
		const top = forkPoint(topT);
		const bot = forkPoint(botT);
		const hw = width / 2;
		return [
			{ x: top.x + hw * saPerp.x, y: top.y + hw * saPerp.y },
			{ x: top.x - hw * saPerp.x, y: top.y - hw * saPerp.y },
			{ x: bot.x - hw * saPerp.x, y: bot.y - hw * saPerp.y },
			{ x: bot.x + hw * saPerp.x, y: bot.y + hw * saPerp.y },
		];
	}

	const stanchionCorners = tubeCorners(stanchionTopT, stanchionBottomT, upperTubeWidth);
	const sliderCorners = tubeCorners(sliderTopT, sliderBottomT, lowerTubeWidth);
	const solidForkBottomT = stanchionTopT - p.forkLengthMm;
	const solidForkCorners = tubeCorners(stanchionTopT, solidForkBottomT, upperTubeWidth);

	const forkBottomForSpindle = p.suspensionType === 'telescopic' ? sliderBottomT : solidForkBottomT;
	const spindleInnerR = 12.7;
	const spindleOuterR = 25.4;
	const forkCapR = 25.4;
	const forkCapCenter = forkPoint(forkBottomForSpindle - 25.4);
	const forkBottomCenter = forkPoint(forkBottomForSpindle);
	const forkBottomWidth = p.suspensionType === 'telescopic' ? lowerTubeWidth : upperTubeWidth;
	const hwCap = forkBottomWidth / 2;
	const forkCapLines = {
		topLeft: { x: forkBottomCenter.x + hwCap * saPerp.x, y: forkBottomCenter.y + hwCap * saPerp.y },
		topRight: { x: forkBottomCenter.x - hwCap * saPerp.x, y: forkBottomCenter.y - hwCap * saPerp.y },
		botLeft: { x: forkCapCenter.x + forkCapR * saPerp.x, y: forkCapCenter.y + forkCapR * saPerp.y },
		botRight: { x: forkCapCenter.x - forkCapR * saPerp.x, y: forkCapCenter.y - forkCapR * saPerp.y },
	};

	let spindleRest: Pt;
	if (isLink) {
		const linkDir = p.suspensionType === 'leading_link' ? 1 : -1;
		spindleRest = {
			x: forkCapCenter.x + linkDir * p.linkLengthMm * saPerp.x + p.linkOffsetMm * (-saDir.x) + p.spindleOffsetMm * saPerp.x + p.spindleHeightMm * (-saDir.x),
			y: forkCapCenter.y + linkDir * p.linkLengthMm * saPerp.y + p.linkOffsetMm * (-saDir.y) + p.spindleOffsetMm * saPerp.y + p.spindleHeightMm * (-saDir.y),
		};
	} else {
		const base = forkPoint(forkBottomForSpindle - spindleOuterR + p.spindleHeightMm);
		spindleRest = { x: base.x + p.spindleOffsetMm * saPerp.x, y: base.y + p.spindleOffsetMm * saPerp.y };
	}

	const suspBase = forkPoint(forkBottomForSpindle - spindleOuterR + p.suspensionHeightMm);
	const suspMountRest: Pt = {
		x: suspBase.x + p.suspensionOffsetMm * saPerp.x,
		y: suspBase.y + p.suspensionOffsetMm * saPerp.y,
	};

	const upperBase = forkPoint(lowerTtOuterT + p.suspUpperMountHeightMm);
	const perpOffset = p.suspUpperMountOffsetMm !== 0 ? p.suspUpperMountOffsetMm : p.suspensionOffsetMm;
	const suspUpperMount: Pt = {
		x: upperBase.x + perpOffset * saPerp.x,
		y: upperBase.y + perpOffset * saPerp.y,
	};

	let linkRot = 0;
	if (isLink) {
		const armDx = suspMountRest.x - forkCapCenter.x;
		const armDy = suspMountRest.y - forkCapCenter.y;
		const armLen = Math.hypot(armDx, armDy);
		if (armLen >= 1) {
			const shockRestLen = Math.hypot(suspUpperMount.x - suspMountRest.x, suspUpperMount.y - suspMountRest.y);
			const targetShockLen = shockRestLen - p.forkTravelMm * p.compressionPct / 100;
			if (targetShockLen >= 1) {
				const restAngle = Math.atan2(armDy, armDx);
				const testDelta = 0.01;
				const distPos = Math.hypot(
					suspUpperMount.x - (forkCapCenter.x + armLen * Math.cos(restAngle + testDelta)),
					suspUpperMount.y - (forkCapCenter.y + armLen * Math.sin(restAngle + testDelta)),
				);
				const distNeg = Math.hypot(
					suspUpperMount.x - (forkCapCenter.x + armLen * Math.cos(restAngle - testDelta)),
					suspUpperMount.y - (forkCapCenter.y + armLen * Math.sin(restAngle - testDelta)),
				);
				const searchDir = distPos < distNeg ? 1 : -1;
				let lo = 0, hi = Math.PI / 2;
				for (let i = 0; i < 30; i++) {
					const mid = (lo + hi) / 2;
					const testAngle = restAngle + searchDir * mid;
					const dist = Math.hypot(
						suspUpperMount.x - (forkCapCenter.x + armLen * Math.cos(testAngle)),
						suspUpperMount.y - (forkCapCenter.y + armLen * Math.sin(testAngle)),
					);
					if (dist > targetShockLen) lo = mid;
					else hi = mid;
				}
				linkRot = searchDir * (lo + hi) / 2;
			}
		}
	}

	const spindle = isLink ? rotateAround(spindleRest, forkCapCenter, linkRot) : spindleRest;
	const suspMount = isLink ? rotateAround(suspMountRest, forkCapCenter, linkRot) : suspMountRest;

	const sdx = suspMount.x - suspUpperMount.x;
	const sdy = suspMount.y - suspUpperMount.y;
	const slen = Math.hypot(sdx, sdy);
	const shockDir = slen < 0.1
		? { ux: 0, uy: -1, px: 1, py: 0, len: slen }
		: { ux: sdx / slen, uy: sdy / slen, px: -sdy / slen, py: sdx / slen, len: slen };
	const shockUpperHW = 18;
	const shockLowerHW = 10;
	const shockUpperLen = shockDir.len * 0.45;
	const shockLowerLen = shockDir.len * 0.55;
	const shockUpperCorners: Pt[] = [
		{ x: suspUpperMount.x + shockUpperHW * shockDir.px, y: suspUpperMount.y + shockUpperHW * shockDir.py },
		{ x: suspUpperMount.x - shockUpperHW * shockDir.px, y: suspUpperMount.y - shockUpperHW * shockDir.py },
		{ x: suspUpperMount.x + shockUpperLen * shockDir.ux - shockUpperHW * shockDir.px, y: suspUpperMount.y + shockUpperLen * shockDir.uy - shockUpperHW * shockDir.py },
		{ x: suspUpperMount.x + shockUpperLen * shockDir.ux + shockUpperHW * shockDir.px, y: suspUpperMount.y + shockUpperLen * shockDir.uy + shockUpperHW * shockDir.py },
	];
	const shockLowerCorners: Pt[] = [
		{ x: suspMount.x + shockLowerHW * shockDir.px, y: suspMount.y + shockLowerHW * shockDir.py },
		{ x: suspMount.x - shockLowerHW * shockDir.px, y: suspMount.y - shockLowerHW * shockDir.py },
		{ x: suspMount.x - shockLowerLen * shockDir.ux - shockLowerHW * shockDir.px, y: suspMount.y - shockLowerLen * shockDir.uy - shockLowerHW * shockDir.py },
		{ x: suspMount.x - shockLowerLen * shockDir.ux + shockLowerHW * shockDir.px, y: suspMount.y - shockLowerLen * shockDir.uy + shockLowerHW * shockDir.py },
	];

	const tx = suspUpperMount.x - spindleOuterR * saDir.x;
	const ty = suspUpperMount.y - spindleOuterR * saDir.y;
	const forkCenter = forkPoint(lowerTtOuterT + p.suspUpperMountHeightMm - spindleOuterR);
	const sign = perpOffset >= 0 ? 1 : -1;
	const upperTangent: LineSeg = {
		p1: { x: tx, y: ty },
		p2: {
			x: forkCenter.x + sign * (upperTubeWidth / 2) * saPerp.x,
			y: forkCenter.y + sign * (upperTubeWidth / 2) * saPerp.y,
		},
	};

	let closest = bottomTtCorners[0];
	let minDist = Infinity;
	for (const corner of bottomTtCorners) {
		const d = Math.hypot(corner.x - suspUpperMount.x, corner.y - suspUpperMount.y);
		if (d < minDist) { minDist = d; closest = corner; }
	}
	let upperTtTangent: LineSeg | null = null;
	if (minDist > spindleOuterR) {
		const ux = (closest.x - suspUpperMount.x) / minDist;
		const uy = (closest.y - suspUpperMount.y) / minDist;
		const cosTheta = spindleOuterR / minDist;
		const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
		const t1 = {
			x: suspUpperMount.x + spindleOuterR * (ux * cosTheta + uy * sinTheta),
			y: suspUpperMount.y + spindleOuterR * (uy * cosTheta - ux * sinTheta),
		};
		const t2 = {
			x: suspUpperMount.x + spindleOuterR * (ux * cosTheta - uy * sinTheta),
			y: suspUpperMount.y + spindleOuterR * (uy * cosTheta + ux * sinTheta),
		};
		const forkBase = forkPoint(lowerTtOuterT);
		const d1 = (t1.x - forkBase.x) ** 2 + (t1.y - forkBase.y) ** 2;
		const d2 = (t2.x - forkBase.x) ** 2 + (t2.y - forkBase.y) ** 2;
		const pick = d1 > d2 ? t1 : t2;
		upperTtTangent = { p1: pick, p2: closest };
	}

	const tangentCapSpindle = externalTangents(forkCapCenter, forkCapR, spindle, spindleOuterR);
	const tangentCapSusp = isLink ? externalTangents(forkCapCenter, forkCapR, suspMount, spindleOuterR) : null;
	const tangentSpindleSusp = isLink ? externalTangents(spindle, spindleOuterR, suspMount, spindleOuterR) : null;

	const circles: { c: Pt; r: number }[] = [
		{ c: forkCapCenter, r: forkCapR },
		{ c: spindle, r: spindleOuterR },
	];
	if (isLink) circles.push({ c: suspMount, r: spindleOuterR });

	const candidates: { p1: Pt; p2: Pt; skip: number[] }[] = [];
	if (tangentCapSpindle) {
		candidates.push({ p1: tangentCapSpindle.top1, p2: tangentCapSpindle.top2, skip: [0, 1] });
		candidates.push({ p1: tangentCapSpindle.bot1, p2: tangentCapSpindle.bot2, skip: [0, 1] });
	}
	if (tangentCapSusp) {
		candidates.push({ p1: tangentCapSusp.top1, p2: tangentCapSusp.top2, skip: [0, 2] });
		candidates.push({ p1: tangentCapSusp.bot1, p2: tangentCapSusp.bot2, skip: [0, 2] });
	}
	if (tangentSpindleSusp) {
		candidates.push({ p1: tangentSpindleSusp.top1, p2: tangentSpindleSusp.top2, skip: [1, 2] });
		candidates.push({ p1: tangentSpindleSusp.bot1, p2: tangentSpindleSusp.bot2, skip: [1, 2] });
	}

	const surviving: LineSeg[] = [];
	for (const cand of candidates) {
		let dominated = false;
		for (let i = 0; i < circles.length; i++) {
			if (cand.skip.includes(i)) continue;
			if (segmentIntersectsCircle(cand.p1, cand.p2, circles[i].c, circles[i].r)) {
				dominated = true;
				break;
			}
		}
		if (!dominated) surviving.push({ p1: cand.p1, p2: cand.p2 });
	}
	const tangents: LineSeg[] = [];
	for (let i = 0; i < surviving.length; i++) {
		let crosses = false;
		for (let j = 0; j < surviving.length; j++) {
			if (i === j) continue;
			if (segmentsIntersect(surviving[i].p1, surviving[i].p2, surviving[j].p1, surviving[j].p2)) {
				crosses = true;
				break;
			}
		}
		if (!crosses) tangents.push(surviving[i]);
	}

	const forkOffsetLine: LineSeg = {
		p1: { x: saLine.p1.x + forkOffsetSigned * saPerp.x, y: saLine.p1.y + forkOffsetSigned * saPerp.y },
		p2: { x: saLine.p2.x + forkOffsetSigned * saPerp.x, y: saLine.p2.y + forkOffsetSigned * saPerp.y },
	};

	return {
		isLink,
		saLine,
		forkOffsetLine,
		scCorners,
		topTtCorners,
		bottomTtCorners,
		stanchionCorners,
		sliderCorners,
		solidForkCorners,
		forkCapCenter,
		forkCapR,
		forkCapLines,
		spindle,
		spindleInnerR,
		spindleOuterR,
		suspMount,
		suspUpperMount,
		shockUpperCorners,
		shockLowerCorners,
		shockCenter: { p1: suspUpperMount, p2: suspMount },
		tangents,
		upperTangent,
		upperTtTangent,
		scCenter: { x: scCx, y: scCy },
	};
}

export function visualParamsFromDesign(data: Record<string, unknown>, results: FrontEndResults): FrontEndVisualParams {
	const tube = String(data.forkTubeSize ?? '41/54');
	const parts = tube.split('/');
	return {
		results,
		steeringColumnLengthMm: n(data.steeringColumnLengthIn, 8) * 25.4,
		forkOffsetMm: n(data.forkOffsetMm, 40),
		forkLengthMm: n(data.forkLengthMm, 600),
		suspensionType: typeof data.suspensionType === 'string' ? data.suspensionType : 'telescopic',
		forkTravelMm: n(data.forkTravelMm, 120),
		compressionPct: n(data.compressionPct, 0),
		spindleOffsetMm: n(data.spindleOffsetMm, 0),
		spindleHeightMm: n(data.spindleHeightMm, 0),
		stanchionDiaMm: Number(parts[0]) || 41,
		sliderDiaMm: Number(parts[1]) || 54,
		invertedForks: data.invertedForks === true,
		suspensionOffsetMm: n(data.suspensionOffsetMm, 0),
		suspensionHeightMm: n(data.suspensionHeightMm, 50),
		suspUpperMountHeightMm: n(data.suspUpperMountHeightMm, 0),
		suspUpperMountOffsetMm: n(data.suspUpperMountOffsetMm, 0),
		linkLengthMm: n(data.linkLengthMm, 200),
		linkOffsetMm: n(data.linkOffsetMm, 0),
	};
}
