/**
 * Rear-end geometry for a 2D motorcycle side view.
 *
 * Types:
 *   hardtail     — rigid frame rail, no pivot
 *   twin_shock   — swinging fork, shocks near the axle (low/seat-rail mounts)
 *   cantilever   — triangulated arm, shock to a high frame mount
 *   softail      — hardtail look, shock(s) under the frame
 *   linkage      — swingarm + dogbone + rocker driving the shock
 *
 * Shock action:
 *   compression  — wheel up shortens the shock (typical twin-shock / Pro-Link / cantilever)
 *   expansion    — wheel up lengthens the shock (classic Harley Softail)
 *
 * Coordinates: contact patch at origin, +x forward, +y up. Lengths in mm.
 */

import type { TireDimensions } from './tire';

export type RearSuspensionType =
	| 'hardtail'
	| 'twin_shock'
	| 'cantilever'
	| 'softail'
	| 'linkage';

export type ShockAction = 'compression' | 'expansion';

export interface Point {
	x: number;
	y: number;
}

export interface RearEndInputs {
	suspensionType: RearSuspensionType;
	shockAction: ShockAction;
	swingarmLengthMm: number;
	pivotHeightMm: number;
	shockEyeToEyeMm: number;
	shockStrokeMm: number;
	compressionPct: number;
	/** Distance from axle toward pivot along the arm to the lower shock eye. */
	shockLowerFromAxleMm: number;
	/** Upper shock eye: forward of the pivot (mm). Positive = toward the front. */
	shockUpperForwardMm: number;
	/** Upper shock eye height above ground at the design (0% travel) pose. */
	shockUpperHeightMm: number;
	/** Triangle apex: forward of axle toward pivot (cantilever / softail). */
	triangleApexForwardMm: number;
	/** Triangle apex height above the axle. */
	triangleApexHeightMm: number;
	/** Linkage rocker pivot, forward of swingarm pivot. */
	rockerPivotForwardMm: number;
	rockerPivotHeightMm: number;
	rockerLengthMm: number;
	/** Dogbone attach on swingarm, from axle toward pivot. */
	dogboneOnArmMm: number;
	dogboneLengthMm: number;
	/** Countershaft (front sprocket) relative to swingarm pivot. */
	countershaftForwardMm: number;
	countershaftHeightOffPivotMm: number;
	rearSprocketRadiusMm: number;
	frontSprocketRadiusMm: number;
}

export interface RearEndResults {
	contactPatch: Point;
	axleCenter: Point;
	pivot: Point;
	swingarmAngleDeg: number;
	shockLower: Point;
	shockUpper: Point;
	shockLengthMm: number;
	shockStrokeUsedMm: number;
	wheelTravelMm: number;
	leverageRatio: number;
	apex?: Point;
	frameRailFront: Point;
	frameRailRear: Point;
	rockerPivot?: Point;
	rockerShock?: Point;
	rockerDogbone?: Point;
	dogboneArm?: Point;
	countershaft: Point;
	chainUpper: { p1: Point; p2: Point };
	chainLower: { p1: Point; p2: Point };
	axleArc: Point[];
	wheelTravelFullMm: number;
	leverageAtSag: number;
}

const MM = (v: number) => (Number.isFinite(v) ? v : 0);

function dist(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function rotateAround(p: Point, origin: Point, ang: number): Point {
	const c = Math.cos(ang);
	const s = Math.sin(ang);
	const dx = p.x - origin.x;
	const dy = p.y - origin.y;
	return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

function designPivotX(L: number, pivotHeight: number, axleY: number): number {
	const dy = pivotHeight - axleY;
	const inner = L * L - dy * dy;
	return Math.sqrt(Math.max(25, inner));
}

function armPointFromAxle(axle: Point, pivot: Point, fromAxleMm: number): Point {
	const L = dist(axle, pivot);
	const t = L > 1 ? clamp(fromAxleMm / L, 0, 1) : 0;
	return lerp(axle, pivot, t);
}

function chainTangents(
	cs: Point,
	rCs: number,
	axle: Point,
	rRear: number,
): { upper: { p1: Point; p2: Point }; lower: { p1: Point; p2: Point } } {
	const dx = axle.x - cs.x;
	const dy = axle.y - cs.y;
	const d = Math.hypot(dx, dy) || 1;
	const ux = dx / d;
	const uy = dy / d;
	const px = -uy;
	const py = ux;
	const r1 = Math.max(8, rCs);
	const r2 = Math.max(12, rRear);
	return {
		upper: {
			p1: { x: cs.x + px * r1, y: cs.y + py * r1 },
			p2: { x: axle.x + px * r2, y: axle.y + py * r2 },
		},
		lower: {
			p1: { x: cs.x - px * r1, y: cs.y - py * r1 },
			p2: { x: axle.x - px * r2, y: axle.y - py * r2 },
		},
	};
}

interface FramePose {
	pivot: Point;
	axle: Point;
	shockLower: Point;
	shockUpper: Point;
	apex?: Point;
	rockerPivot?: Point;
	rockerShock?: Point;
	rockerDogbone?: Point;
	dogboneArm?: Point;
}

function poseAtRotation(inputs: RearEndInputs, axleY: number, rotRad: number): FramePose {
	const L = Math.max(50, MM(inputs.swingarmLengthMm));
	const pivot0: Point = {
		x: designPivotX(L, inputs.pivotHeightMm, axleY),
		y: inputs.pivotHeightMm,
	};
	const axle0: Point = { x: 0, y: axleY };
	const axle = rotateAround(axle0, pivot0, rotRad);
	const pivot = pivot0;

	const lower0 = armPointFromAxle(axle0, pivot0, inputs.shockLowerFromAxleMm);
	const shockLower = rotateAround(lower0, pivot0, rotRad);

	const shockUpper0: Point = {
		x: pivot0.x + MM(inputs.shockUpperForwardMm),
		y: MM(inputs.shockUpperHeightMm),
	};
	const shockUpper = shockUpper0;

	let apex: Point | undefined;
	if (inputs.suspensionType === 'cantilever' || inputs.suspensionType === 'softail') {
		const apex0: Point = {
			x: axle0.x + MM(inputs.triangleApexForwardMm),
			y: axle0.y + MM(inputs.triangleApexHeightMm),
		};
		apex = rotateAround(apex0, pivot0, rotRad);
	}

	let rockerPivot: Point | undefined;
	let rockerShock: Point | undefined;
	let rockerDogbone: Point | undefined;
	let dogboneArm: Point | undefined;

	if (inputs.suspensionType === 'linkage') {
		rockerPivot = {
			x: pivot0.x + MM(inputs.rockerPivotForwardMm),
			y: MM(inputs.rockerPivotHeightMm),
		};
		const armAtt0 = armPointFromAxle(axle0, pivot0, inputs.dogboneOnArmMm);
		dogboneArm = rotateAround(armAtt0, pivot0, rotRad);
		const solved = solveRocker(rockerPivot, dogboneArm, inputs.dogboneLengthMm, inputs.rockerLengthMm);
		rockerDogbone = solved.dogbone;
		rockerShock = solved.shock;
	}

	return {
		pivot,
		axle,
		shockLower,
		shockUpper,
		apex,
		rockerPivot,
		rockerShock,
		rockerDogbone,
		dogboneArm,
	};
}

function solveRocker(
	rp: Point,
	armPt: Point,
	dogboneLen: number,
	rockerLen: number,
): { dogbone: Point; shock: Point } {
	const Lr = Math.max(20, rockerLen);
	const Ld = Math.max(20, dogboneLen);
	const d = dist(rp, armPt);
	const dClamped = clamp(d, 1, Lr + Ld - 1);
	const a = (Lr * Lr - Ld * Ld + dClamped * dClamped) / (2 * dClamped);
	const h2 = Math.max(0, Lr * Lr - a * a);
	const h = Math.sqrt(h2);
	const ux = (armPt.x - rp.x) / dClamped;
	const uy = (armPt.y - rp.y) / dClamped;
	const px = -uy;
	const py = ux;
	const dogbone: Point = {
		x: rp.x + a * ux + h * px,
		y: rp.y + a * uy + h * py,
	};
	const shock: Point = {
		x: rp.x - (dogbone.x - rp.x),
		y: rp.y - (dogbone.y - rp.y),
	};
	return { dogbone, shock };
}

function shockEnds(inputs: RearEndInputs, pose: FramePose): { a: Point; b: Point } {
	if (inputs.suspensionType === 'cantilever' && pose.apex) {
		return { a: pose.apex, b: pose.shockUpper };
	}
	if (inputs.suspensionType === 'softail' && pose.apex) {
		return { a: pose.apex, b: pose.shockUpper };
	}
	if (inputs.suspensionType === 'linkage' && pose.rockerShock) {
		return { a: pose.rockerShock, b: pose.shockUpper };
	}
	return { a: pose.shockLower, b: pose.shockUpper };
}

function shockLenAt(inputs: RearEndInputs, axleY: number, rot: number): number {
	const pose = poseAtRotation(inputs, axleY, rot);
	const { a, b } = shockEnds(inputs, pose);
	return dist(a, b);
}

function pinToGround(pose: FramePose, axleY: number): FramePose {
	const dx = -pose.axle.x;
	const dy = axleY - pose.axle.y;
	const t = (p?: Point) => (p ? { x: p.x + dx, y: p.y + dy } : undefined);
	return {
		pivot: { x: pose.pivot.x + dx, y: pose.pivot.y + dy },
		axle: { x: 0, y: axleY },
		shockLower: { x: pose.shockLower.x + dx, y: pose.shockLower.y + dy },
		shockUpper: { x: pose.shockUpper.x + dx, y: pose.shockUpper.y + dy },
		apex: t(pose.apex),
		rockerPivot: t(pose.rockerPivot),
		rockerShock: t(pose.rockerShock),
		rockerDogbone: t(pose.rockerDogbone),
		dogboneArm: t(pose.dogboneArm),
	};
}

function solveRotationForShockLength(
	inputs: RearEndInputs,
	axleY: number,
	targetLen: number,
): number {
	let bestRot = 0;
	let bestErr = Infinity;
	const samples = 36;
	for (let i = 0; i <= samples; i++) {
		const rot = -0.65 + (1.3 * i) / samples;
		const err = Math.abs(shockLenAt(inputs, axleY, rot) - targetLen);
		if (err < bestErr) {
			bestErr = err;
			bestRot = rot;
		}
	}
	let lo = bestRot - 0.08;
	let hi = bestRot + 0.08;
	for (let i = 0; i < 18; i++) {
		const mid = (lo + hi) / 2;
		const len = shockLenAt(inputs, axleY, mid);
		const lenLo = shockLenAt(inputs, axleY, lo);
		const rising = shockLenAt(inputs, axleY, hi) >= lenLo;
		if ((rising && len < targetLen) || (!rising && len > targetLen)) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

export function computeRearEnd(inputs: RearEndInputs, tire: TireDimensions): RearEndResults {
	const axleY = tire.outerRadiusMm;
	const contactPatch: Point = { x: 0, y: 0 };
	const L = Math.max(50, MM(inputs.swingarmLengthMm));
	const stroke = Math.max(0, MM(inputs.shockStrokeMm));
	const eye = Math.max(stroke + 20, MM(inputs.shockEyeToEyeMm));
	const pct = clamp(MM(inputs.compressionPct), 0, 100) / 100;

	if (inputs.suspensionType === 'hardtail') {
		const pivot: Point = {
			x: designPivotX(L, inputs.pivotHeightMm, axleY),
			y: inputs.pivotHeightMm,
		};
		const axle: Point = { x: 0, y: axleY };
		const cs: Point = {
			x: pivot.x + MM(inputs.countershaftForwardMm),
			y: pivot.y + MM(inputs.countershaftHeightOffPivotMm),
		};
		const chain = chainTangents(cs, inputs.frontSprocketRadiusMm, axle, inputs.rearSprocketRadiusMm);
		const ang = Math.atan2(pivot.y - axle.y, pivot.x - axle.x) * 180 / Math.PI;
		return {
			contactPatch,
			axleCenter: axle,
			pivot,
			swingarmAngleDeg: ang,
			shockLower: axle,
			shockUpper: axle,
			shockLengthMm: 0,
			shockStrokeUsedMm: 0,
			wheelTravelMm: 0,
			leverageRatio: 0,
			frameRailFront: pivot,
			frameRailRear: { x: axle.x, y: axle.y },
			countershaft: cs,
			chainUpper: chain.upper,
			chainLower: chain.lower,
			axleArc: [],
			wheelTravelFullMm: 0,
			leverageAtSag: 0,
		};
	}

	const restLen = eye;
	const used = stroke * pct;
	const targetLen =
		inputs.shockAction === 'compression' ? restLen - used : restLen - stroke + used;

	const rot = solveRotationForShockLength(inputs, axleY, targetLen);
	const raw = poseAtRotation(inputs, axleY, rot);
	const pose = pinToGround(raw, axleY);
	const ends = shockEnds(inputs, pose);
	const shockLengthMm = dist(ends.a, ends.b);

	const rot0 = solveRotationForShockLength(
		inputs,
		axleY,
		inputs.shockAction === 'compression' ? restLen : restLen - stroke,
	);
	const rot1 = solveRotationForShockLength(
		inputs,
		axleY,
		inputs.shockAction === 'compression' ? restLen - stroke : restLen,
	);
	const p0 = pinToGround(poseAtRotation(inputs, axleY, rot0), axleY);
	const p1 = pinToGround(poseAtRotation(inputs, axleY, rot1), axleY);
	const wheelTravelFullMm = Math.abs(p1.pivot.y - p0.pivot.y);
	const wheelTravelMm = Math.abs(pose.pivot.y - p0.pivot.y);

	const eps = 0.004;
	const a = shockLenAt(inputs, axleY, rot - eps);
	const b = shockLenAt(inputs, axleY, rot + eps);
	const pLo = pinToGround(poseAtRotation(inputs, axleY, rot - eps), axleY);
	const pHi = pinToGround(poseAtRotation(inputs, axleY, rot + eps), axleY);
	const dWheel = Math.abs(pHi.pivot.y - pLo.pivot.y);
	const dShock = Math.abs(b - a);
	const leverageRatio = dShock > 0.05 ? dWheel / dShock : 1;

	const rotSag = solveRotationForShockLength(
		inputs,
		axleY,
		inputs.shockAction === 'compression' ? restLen - stroke * 0.3 : restLen - stroke * 0.7,
	);
	const sagA = shockLenAt(inputs, axleY, rotSag - eps);
	const sagB = shockLenAt(inputs, axleY, rotSag + eps);
	const sagLo = pinToGround(poseAtRotation(inputs, axleY, rotSag - eps), axleY);
	const sagHi = pinToGround(poseAtRotation(inputs, axleY, rotSag + eps), axleY);
	const leverageAtSag =
		Math.abs(sagB - sagA) > 0.05 ? Math.abs(sagHi.pivot.y - sagLo.pivot.y) / Math.abs(sagB - sagA) : leverageRatio;

	const travelArc: Point[] = [];
	const steps = 18;
	const pinDx = pose.pivot.x - raw.pivot.x;
	const pinDy = pose.pivot.y - raw.pivot.y;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const r = rot0 + (rot1 - rot0) * t;
		const pr = poseAtRotation(inputs, axleY, r);
		travelArc.push({ x: pr.axle.x + pinDx, y: pr.axle.y + pinDy });
	}

	const cs: Point = {
		x: pose.pivot.x + MM(inputs.countershaftForwardMm),
		y: pose.pivot.y + MM(inputs.countershaftHeightOffPivotMm),
	};
	const chain = chainTangents(cs, inputs.frontSprocketRadiusMm, pose.axle, inputs.rearSprocketRadiusMm);
	const ang = Math.atan2(pose.pivot.y - pose.axle.y, pose.pivot.x - pose.axle.x) * 180 / Math.PI;

	return {
		contactPatch,
		axleCenter: pose.axle,
		pivot: pose.pivot,
		swingarmAngleDeg: ang,
		shockLower: ends.a,
		shockUpper: ends.b,
		shockLengthMm,
		shockStrokeUsedMm: used,
		wheelTravelMm,
		leverageRatio,
		apex: pose.apex,
		frameRailFront: pose.pivot,
		frameRailRear: pose.axle,
		rockerPivot: pose.rockerPivot,
		rockerShock: pose.rockerShock,
		rockerDogbone: pose.rockerDogbone,
		dogboneArm: pose.dogboneArm,
		countershaft: cs,
		chainUpper: chain.upper,
		chainLower: chain.lower,
		axleArc: travelArc,
		wheelTravelFullMm,
		leverageAtSag,
	};
}
