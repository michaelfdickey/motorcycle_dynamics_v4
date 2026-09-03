/**
 * Assemble frame + front end + rear end into one world-space side view.
 * Coordinates: +x forward, +y up, mm.
 *
 * Modules stay rigid (frame, front end, rear end). After they are joined at
 * the anchors, the whole assembly is rotated and translated so both tires
 * sit on y = 0 — the bike pitches until the floating wheel lands.
 */

import { computeFrontEnd, type FrontEndInputs, type FrontEndResults, type SuspensionType } from './frontEndGeometry';
import { buildFrontEndVisual, visualParamsFromDesign, type FrontEndVisual } from './frontEndVisual';
import { computeRearEnd, type RearEndInputs, type RearEndResults, type RearSuspensionType, type ShockAction } from './rearEndGeometry';
import { parseTireDesignation, computeTireDimensions, type TireDimensions } from './tire';
import type { VehicleDesign } from './vehicleStore';
import type { VehicleParams } from './braking';

export interface Pt {
	x: number;
	y: number;
}

export interface FrameNode {
	id: string;
	x: number;
	y: number;
	type: string;
	label: string;
}

export interface FrameMember {
	startId: string;
	endId: string;
	diameter: number;
	label: string;
}

/** Rigid pose that seats both tires on the ground. */
export interface GroundSit {
	pivot: Pt;
	theta: number;
	shift: Pt;
}

export const identitySit: GroundSit = { pivot: { x: 0, y: 0 }, theta: 0, shift: { x: 0, y: 0 } };

export function applySit(sit: GroundSit | undefined, p: Pt): Pt {
	if (!sit) return p;
	let x = p.x;
	let y = p.y;
	if (sit.theta !== 0) {
		const c = Math.cos(sit.theta);
		const s = Math.sin(sit.theta);
		const dx = p.x - sit.pivot.x;
		const dy = p.y - sit.pivot.y;
		x = sit.pivot.x + dx * c - dy * s;
		y = sit.pivot.y + dx * s + dy * c;
	}
	return { x: x + sit.shift.x, y: y + sit.shift.y };
}

export function undoSit(sit: GroundSit | undefined, p: Pt): Pt {
	if (!sit) return p;
	const q = { x: p.x - sit.shift.x, y: p.y - sit.shift.y };
	if (sit.theta === 0) return q;
	const c = Math.cos(-sit.theta);
	const s = Math.sin(-sit.theta);
	const dx = q.x - sit.pivot.x;
	const dy = q.y - sit.pivot.y;
	return { x: sit.pivot.x + dx * c - dy * s, y: sit.pivot.y + dx * s + dy * c };
}

/** Rotate/translate a rigid assembly so both tires sit on y = 0. */
export function computeGroundSit(frontAxle: Pt, rearAxle: Pt, Rf: number, Rr: number): GroundSit {
	const axleDx = frontAxle.x - rearAxle.x;
	const axleDy = frontAxle.y - rearAxle.y;
	const axleDist = Math.hypot(axleDx, axleDy);
	const sit: GroundSit = { pivot: { x: rearAxle.x, y: rearAxle.y }, theta: 0, shift: { x: 0, y: 0 } };
	if (axleDist > 1) {
		const rise = Math.max(-axleDist + 0.5, Math.min(axleDist - 0.5, Rf - Rr));
		const span = Math.sqrt(Math.max(0, axleDist * axleDist - rise * rise));
		const dir = axleDx >= 0 ? 1 : -1;
		const desired = Math.atan2(rise, dir * span);
		const current = Math.atan2(axleDy, axleDx);
		sit.theta = desired - current;
	}
	const rearAfter = applySit({ ...sit, shift: { x: 0, y: 0 } }, rearAxle);
	sit.shift = { x: 0, y: Rr - rearAfter.y };
	return sit;
}

export interface AssembledBike {
	hasFrame: boolean;
	hasFront: boolean;
	hasRear: boolean;
	wheelbaseMm: number;
	frontTire: TireDimensions;
	rearTire: TireDimensions;
	frontAxle: Pt;
	rearAxle: Pt;
	frontContact: Pt;
	rearContact: Pt;
	cog: Pt;
	sit: GroundSit;
	nodes: FrameNode[];
	members: FrameMember[];
	nodeById: Record<string, FrameNode>;
	front?: {
		results: FrontEndResults;
		data: Record<string, unknown>;
		ox: number;
		oy: number;
		rakeDeg: number;
		forkOffsetMm: number;
		scHeightMm: number;
		tubeDiaMm: number;
		visual: FrontEndVisual;
	};
	rear?: {
		results: RearEndResults;
		data: Record<string, unknown>;
		ox: number;
		oy: number;
		suspensionType: RearSuspensionType;
		swingarmSectionMm: number;
	};
}

function num(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function add(p: Pt, ox: number, oy: number): Pt {
	return { x: p.x + ox, y: p.y + oy };
}

export function forkTubeDiaMm(size: unknown): number {
	const s = String(size ?? '');
	if (s.includes('54')) return 54;
	if (s.includes('49')) return 49;
	if (s.includes('46')) return 46;
	if (s.includes('43')) return 43;
	if (s.includes('41')) return 41;
	if (s.includes('37')) return 37;
	if (s.includes('35')) return 35;
	return 41;
}

function defaultTire(designation: string): TireDimensions {
	const parsed = parseTireDesignation(designation) ?? parseTireDesignation('120/70ZR17')!;
	return computeTireDimensions(parsed);
}

function tireFrom(raw: unknown, fallback: string): TireDimensions {
	const s = typeof raw === 'string' && raw.trim() ? raw : fallback;
	const parsed = parseTireDesignation(s);
	return parsed ? computeTireDimensions(parsed) : defaultTire(fallback);
}

export function frontInputsFromDesign(fe: Record<string, unknown>, rakeFallback = 27): FrontEndInputs {
	return {
		suspensionType: (typeof fe.suspensionType === 'string' ? fe.suspensionType : 'telescopic') as SuspensionType,
		rakeAngleDeg: num(fe.rakeAngleDeg, rakeFallback),
		forkOffsetMm: num(fe.forkOffsetMm, 40),
		linkLengthMm: num(fe.linkLengthMm, 200),
		linkOffsetMm: num(fe.linkOffsetMm, 0),
		steeringColumnHeightMm: num(fe.steeringColumnHeightMm, 200),
		forkLengthMm: num(fe.forkLengthMm, 600),
	};
}

export function rearInputsFromDesign(re: Record<string, unknown>): RearEndInputs {
	return {
		suspensionType: (typeof re.suspensionType === 'string' ? re.suspensionType : 'twin_shock') as RearSuspensionType,
		shockAction: (typeof re.shockAction === 'string' ? re.shockAction : 'compression') as ShockAction,
		swingarmLengthMm: num(re.swingarmLengthMm, 520),
		pivotHeightMm: num(re.pivotHeightMm, 340),
		shockEyeToEyeMm: num(re.shockEyeToEyeMm, 330),
		shockStrokeMm: num(re.shockStrokeMm, 70),
		compressionPct: num(re.compressionPct, 25),
		shockLowerFromAxleMm: num(re.shockLowerFromAxleMm, 90),
		shockUpperForwardMm: num(re.shockUpperForwardMm, 40),
		shockUpperHeightMm: num(re.shockUpperHeightMm, 620),
		triangleApexForwardMm: num(re.triangleApexForwardMm, 120),
		triangleApexHeightMm: num(re.triangleApexHeightMm, 220),
		rockerPivotForwardMm: num(re.rockerPivotForwardMm, 30),
		rockerPivotHeightMm: num(re.rockerPivotHeightMm, 480),
		rockerLengthMm: num(re.rockerLengthMm, 90),
		dogboneOnArmMm: num(re.dogboneOnArmMm, 180),
		dogboneLengthMm: num(re.dogboneLengthMm, 160),
		countershaftForwardMm: num(re.countershaftForwardMm, -20),
		countershaftHeightOffPivotMm: num(re.countershaftHeightOffPivotMm, -10),
		rearSprocketRadiusMm: num(re.rearSprocketRadiusMm, 110),
		frontSprocketRadiusMm: num(re.frontSprocketRadiusMm, 38),
	};
}

function findAnchor(nodes: FrameNode[], type: string): FrameNode | undefined {
	return nodes.find((n) => n.type === type);
}

export function assembleBike(design: VehicleDesign | null, vehicle: VehicleParams): AssembledBike {
	const frame = (design?.frame ?? {}) as Record<string, unknown>;
	const rawNodes = Array.isArray(frame.nodes) ? (frame.nodes as FrameNode[]) : [];
	const nodes: FrameNode[] = rawNodes.map((n) => ({
		id: String(n.id),
		x: num(n.x, 0),
		y: num(n.y, 0),
		type: String(n.type ?? 'generic'),
		label: String(n.label ?? ''),
	}));
	const members: FrameMember[] = Array.isArray(frame.members)
		? (frame.members as FrameMember[]).map((m) => ({
			startId: String(m.startId),
			endId: String(m.endId),
			diameter: num(m.diameter, 25.4),
			label: String(m.label ?? ''),
		}))
		: [];

	const envelopeWb = num(frame.wheelbaseMm, vehicle.wheelbaseMm);
	const envelopeFrontR = num(frame.frontWheelRadiusMm, vehicle.frontTireRadiusMm);
	const envelopeRearR = num(frame.rearWheelRadiusMm, vehicle.rearTireRadiusMm);
	const rakeFallback = num(frame.rakeAngleDeg, 27);

	const nodeById: Record<string, FrameNode> = {};
	for (const n of nodes) nodeById[n.id] = n;

	const frontAnchor = findAnchor(nodes, 'front_anchor');
	const rearAnchor = findAnchor(nodes, 'rear_anchor');

	let frontTire = defaultTire('120/70ZR17');
	frontTire = { ...frontTire, outerRadiusMm: envelopeFrontR, outerDiameterMm: envelopeFrontR * 2 };
	let rearTire = defaultTire('150/80B16');
	rearTire = { ...rearTire, outerRadiusMm: envelopeRearR, outerDiameterMm: envelopeRearR * 2 };

	let frontOx = envelopeWb;
	let frontOy = 0;
	let rearOx = 0;
	let rearOy = 0;
	let frontResults: FrontEndResults | undefined;
	let rearResults: RearEndResults | undefined;
	let frontData: Record<string, unknown> | undefined;
	let rearData: Record<string, unknown> | undefined;
	let frontVisual: FrontEndVisual | undefined;

	if (design?.frontEnd) {
		frontData = design.frontEnd as Record<string, unknown>;
		frontTire = tireFrom(frontData.tireDesignation, '120/70ZR17');
		try {
			frontResults = computeFrontEnd(frontInputsFromDesign(frontData, rakeFallback), frontTire);
			frontVisual = buildFrontEndVisual(visualParamsFromDesign(frontData, frontResults));
			if (frontAnchor) {
				frontOx = frontAnchor.x - frontResults.steeringColumnCenter.x;
				frontOy = frontAnchor.y - frontResults.steeringColumnCenter.y;
			} else {
				frontOx = envelopeWb - frontResults.contactPatch.x;
				frontOy = 0 - frontResults.contactPatch.y;
			}
		} catch {
			frontResults = undefined;
			frontVisual = undefined;
		}
	}

	if (design?.rearEnd) {
		rearData = design.rearEnd as Record<string, unknown>;
		rearTire = tireFrom(rearData.tireDesignation, '150/80B16');
		try {
			rearResults = computeRearEnd(rearInputsFromDesign(rearData), rearTire);
			if (rearAnchor) {
				rearOx = rearAnchor.x - rearResults.pivot.x;
				rearOy = rearAnchor.y - rearResults.pivot.y;
			} else {
				rearOx = 0 - rearResults.contactPatch.x;
				rearOy = 0 - rearResults.contactPatch.y;
			}
		} catch {
			rearResults = undefined;
		}
	}

	// Use the visual spindle (leading-link / trail offset) as the front axle,
	// not the simplified contact-patch axle from computeFrontEnd.
	let frontAxle = frontVisual
		? add(frontVisual.spindle, frontOx, frontOy)
		: frontResults
			? add(frontResults.axleCenter, frontOx, frontOy)
			: { x: envelopeWb, y: frontTire.outerRadiusMm };
	let rearAxle = rearResults ? add(rearResults.axleCenter, rearOx, rearOy) : { x: 0, y: rearTire.outerRadiusMm };
	let frontContact = { x: frontAxle.x, y: frontAxle.y - frontTire.outerRadiusMm };
	let rearContact = rearResults
		? add(rearResults.contactPatch, rearOx, rearOy)
		: { x: rearAxle.x, y: rearAxle.y - rearTire.outerRadiusMm };

	// Pitch the joined rigid assembly so both tires are tangent to y = 0.
	// Rotate about the rear axle until the axle-to-axle vector has the rise
	// that puts each hub at its tire radius, then drop onto the road.
	const Rf = frontTire.outerRadiusMm;
	const Rr = rearTire.outerRadiusMm;
	const sit = computeGroundSit(frontAxle, rearAxle, Rf, Rr);

	for (const n of nodes) {
		const p = applySit(sit, n);
		n.x = p.x;
		n.y = p.y;
	}
	frontAxle = applySit(sit, frontAxle);
	rearAxle = applySit(sit, rearAxle);
	frontContact = { x: frontAxle.x, y: frontAxle.y - Rf };
	rearContact = { x: rearAxle.x, y: rearAxle.y - Rr };

	const wheelbaseMm = Math.max(200, Math.abs(frontContact.x - rearContact.x));
	const rearX = Math.min(frontContact.x, rearContact.x);
	const cogX = rearX + wheelbaseMm * (1 - vehicle.cogPositionPct / 100);
	const cog: Pt = { x: cogX, y: vehicle.cogHeightMm };

	const bike: AssembledBike = {
		hasFrame: nodes.length > 0 && members.length > 0,
		hasFront: !!frontResults,
		hasRear: !!rearResults,
		wheelbaseMm,
		frontTire,
		rearTire,
		frontAxle,
		rearAxle,
		frontContact,
		rearContact,
		cog,
		sit,
		nodes,
		members,
		nodeById,
	};

	if (frontResults && frontData && frontVisual) {
		bike.front = {
			results: frontResults,
			data: frontData,
			ox: frontOx,
			oy: frontOy,
			rakeDeg: num(frontData.rakeAngleDeg, rakeFallback),
			forkOffsetMm: num(frontData.forkOffsetMm, 40),
			scHeightMm: num(frontData.steeringColumnHeightMm, 200),
			tubeDiaMm: forkTubeDiaMm(frontData.forkTubeSize),
			visual: frontVisual,
		};
	}
	if (rearResults && rearData) {
		bike.rear = {
			results: rearResults,
			data: rearData,
			ox: rearOx,
			oy: rearOy,
			suspensionType: (typeof rearData.suspensionType === 'string' ? rearData.suspensionType : 'twin_shock') as RearSuspensionType,
			swingarmSectionMm: num(rearData.swingarmSectionMm, 42),
		};
	}

	return bike;
}

export function applyAssemblyToVehicle(vehicle: VehicleParams, bike: AssembledBike): VehicleParams {
	return {
		...vehicle,
		wheelbaseMm: bike.wheelbaseMm,
		frontTireRadiusMm: bike.frontTire.outerRadiusMm,
		rearTireRadiusMm: bike.rearTire.outerRadiusMm,
	};
}
