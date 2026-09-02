/**
 * Assemble frame + front end + rear end into one world-space side view.
 * Coordinates: +x forward, +y up, mm. Rear contact is translated onto y = 0;
 * both tires are then seated on the ground for the road simulation.
 */

import { computeFrontEnd, type FrontEndInputs, type FrontEndResults, type SuspensionType } from './frontEndGeometry';
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

	if (design?.frontEnd) {
		frontData = design.frontEnd as Record<string, unknown>;
		frontTire = tireFrom(frontData.tireDesignation, '120/70ZR17');
		try {
			frontResults = computeFrontEnd(frontInputsFromDesign(frontData, rakeFallback), frontTire);
			if (frontAnchor) {
				frontOx = frontAnchor.x - frontResults.steeringColumnCenter.x;
				frontOy = frontAnchor.y - frontResults.steeringColumnCenter.y;
			} else {
				frontOx = envelopeWb - frontResults.contactPatch.x;
				frontOy = 0 - frontResults.contactPatch.y;
			}
		} catch {
			frontResults = undefined;
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

	let frontContact = frontResults ? add(frontResults.contactPatch, frontOx, frontOy) : { x: envelopeWb, y: 0 };
	let rearContact = rearResults ? add(rearResults.contactPatch, rearOx, rearOy) : { x: 0, y: 0 };
	let frontAxle = frontResults ? add(frontResults.axleCenter, frontOx, frontOy) : { x: envelopeWb, y: frontTire.outerRadiusMm };
	let rearAxle = rearResults ? add(rearResults.axleCenter, rearOx, rearOy) : { x: 0, y: rearTire.outerRadiusMm };

	// Seat the rear contact on the ground, then put both tires on the road.
	const vShift = -rearContact.y;
	if (vShift !== 0) {
		for (const n of nodes) n.y += vShift;
		frontOx += 0;
		frontOy += vShift;
		rearOx += 0;
		rearOy += vShift;
		frontContact = { x: frontContact.x, y: frontContact.y + vShift };
		rearContact = { x: rearContact.x, y: rearContact.y + vShift };
		frontAxle = { x: frontAxle.x, y: frontAxle.y + vShift };
		rearAxle = { x: rearAxle.x, y: rearAxle.y + vShift };
	}

	frontContact = { x: frontAxle.x, y: 0 };
	rearContact = { x: rearAxle.x, y: 0 };
	frontAxle = { x: frontAxle.x, y: frontTire.outerRadiusMm };
	rearAxle = { x: rearAxle.x, y: rearTire.outerRadiusMm };

	const wheelbaseMm = Math.max(200, Math.abs(frontContact.x - rearContact.x));
	const rearX = Math.min(frontContact.x, rearContact.x);
	const frontX = rearX + wheelbaseMm;
	const cogX = rearX + wheelbaseMm * (1 - vehicle.cogPositionPct / 100);
	const cog: Pt = { x: cogX, y: vehicle.cogHeightMm };

	const bike: AssembledBike = {
		hasFrame: nodes.length > 0 && members.length > 0,
		hasFront: !!frontResults,
		hasRear: !!rearResults,
		wheelbaseMm,
		frontTire,
		rearTire,
		frontAxle: { x: frontX, y: frontTire.outerRadiusMm },
		rearAxle: { x: rearX, y: rearTire.outerRadiusMm },
		frontContact: { x: frontX, y: 0 },
		rearContact: { x: rearX, y: 0 },
		cog: { x: cogX, y: vehicle.cogHeightMm },
		nodes,
		members,
		nodeById,
	};

	// If contacts were not ordered (front x < rear x), keep assembled axle x as-is.
	if (frontContact.x >= rearContact.x) {
		bike.frontAxle = { x: frontContact.x, y: frontTire.outerRadiusMm };
		bike.rearAxle = { x: rearContact.x, y: rearTire.outerRadiusMm };
		bike.frontContact = { x: frontContact.x, y: 0 };
		bike.rearContact = { x: rearContact.x, y: 0 };
		bike.cog = cog;
	}

	if (frontResults && frontData) {
		bike.front = {
			results: frontResults,
			data: frontData,
			ox: frontOx,
			oy: frontOy,
			rakeDeg: num(frontData.rakeAngleDeg, rakeFallback),
			forkOffsetMm: num(frontData.forkOffsetMm, 40),
			scHeightMm: num(frontData.steeringColumnHeightMm, 200),
			tubeDiaMm: forkTubeDiaMm(frontData.forkTubeSize),
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
