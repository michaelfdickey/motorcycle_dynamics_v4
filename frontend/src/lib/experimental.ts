/**
 * Experimental vehicle components.
 *
 * Catalog (create tree):
 *   Force → Passive | Active → airfoil | air brake | thruster
 *   System → active suspension | dynamic fuel transfer
 *
 * First implemented device: an active vector thruster anchored at a wheel axle.
 * 0° is straight up; positive is clockwise in the right-side view (90° = forward).
 */

import type { VehicleParams } from './braking';

export type ComponentKind = 'force' | 'system';
export type ForceMode = 'passive' | 'active';
export type ForceType = 'thruster' | 'airfoil' | 'air_brake';
export type SystemType = 'active_suspension' | 'fuel_transfer';
export type AnchorPoint = 'front_axle' | 'rear_axle' | 'cog';

export interface ExperimentalComponent {
	id: string;
	name: string;
	enabled: boolean;
	kind: ComponentKind;
	forceMode?: ForceMode;
	forceType?: ForceType;
	systemType?: SystemType;
	anchor: AnchorPoint;
	/** Newtons. Thruster magnitude. */
	thrustN: number;
	/**
	 * Thrust direction. 0° = up (vertical axis through the attachment).
	 * Positive is clockwise in the right-side view: 90° forward, 180° down, 270° rearward.
	 */
	directionDeg: number;
	/** Airfoil / air-brake placeholders */
	areaM2: number;
	cl: number;
	cd: number;
}

export interface ForceResolution {
	/** +X is forward along the wheelbase. */
	forwardN: number;
	/** +Y is up. */
	upN: number;
	/** Additive axle loads (positive = more normal load). */
	dFrontN: number;
	dRearN: number;
}

export const FORCE_TYPES: { id: ForceType; label: string; mode: ForceMode; implemented: boolean; blurb: string }[] = [
	{ id: 'thruster', label: 'Vector thruster', mode: 'active', implemented: true, blurb: 'A pointed force at an anchor. Magnitude and direction are set by you — braking assist, launch, or downforce.' },
	{ id: 'airfoil', label: 'Airfoil (downforce)', mode: 'passive', implemented: false, blurb: 'Speed-squared aero force. Coming next.' },
	{ id: 'airfoil', label: 'Active airfoil', mode: 'active', implemented: false, blurb: 'Deployable wing. Coming next.' },
	{ id: 'air_brake', label: 'Air brake', mode: 'active', implemented: false, blurb: 'Panels that extend in an emergency stop. Coming next.' },
];

export const SYSTEM_TYPES: { id: SystemType; label: string; implemented: boolean; blurb: string }[] = [
	{ id: 'active_suspension', label: 'Active suspension', implemented: false, blurb: 'Actuators that set ride height or damping during a manoeuvre. Coming next.' },
	{ id: 'fuel_transfer', label: 'Dynamic fuel transfer', implemented: false, blurb: 'Pump fuel between tanks to hold CoG. Coming next.' },
];

export function newId(prefix: string): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function defaultThruster(anchor: AnchorPoint = 'rear_axle'): ExperimentalComponent {
	return {
		id: newId('thr'),
		name: anchor === 'front_axle' ? 'Front thruster' : 'Rear thruster',
		enabled: true,
		kind: 'force',
		forceMode: 'active',
		forceType: 'thruster',
		anchor,
		thrustN: 800,
		directionDeg: 270,
		areaM2: 0,
		cl: 0,
		cd: 0,
	};
}

export function emptyComponent(kind: ComponentKind): ExperimentalComponent {
	return {
		id: newId(kind === 'force' ? 'f' : 's'),
		name: kind === 'force' ? 'Force' : 'System',
		enabled: true,
		kind,
		anchor: 'rear_axle',
		thrustN: 0,
		directionDeg: 90,
		areaM2: 0.4,
		cl: 0.8,
		cd: 0.6,
	};
}

export function migrateExperimental(raw: unknown): ExperimentalComponent[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((item, i) => {
		const r = (item ?? {}) as Record<string, unknown>;
		const kind: ComponentKind = r.kind === 'system' ? 'system' : 'force';
		const anchor: AnchorPoint =
			r.anchor === 'front_axle' || r.anchor === 'cog' ? r.anchor : 'rear_axle';
		return {
			id: typeof r.id === 'string' ? r.id : newId('exp'),
			name: typeof r.name === 'string' && r.name.trim() ? r.name : `Device ${i + 1}`,
			enabled: r.enabled !== false,
			kind,
			forceMode: r.forceMode === 'passive' ? 'passive' : 'active',
			forceType: r.forceType === 'airfoil' || r.forceType === 'air_brake' ? r.forceType : 'thruster',
			systemType: r.systemType === 'fuel_transfer' ? 'fuel_transfer' : 'active_suspension',
			anchor,
			thrustN: num(r.thrustN, 800),
			directionDeg: num(r.directionDeg, 270),
			areaM2: num(r.areaM2, 0),
			cl: num(r.cl, 0),
			cd: num(r.cd, 0),
		};
	});
}

function num(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Unit thrust direction in vehicle axes: +X forward, +Y up. 0° = up, clockwise. */
export function thrustDirection(directionDeg: number): { x: number; y: number } {
	const a = (directionDeg * Math.PI) / 180;
	return { x: Math.sin(a), y: Math.cos(a) };
}

/**
 * Resolve enabled force devices into a net body force and axle-load deltas.
 * Thruster at an axle: Fx/Fy applied at that axle. Moment about CoG is
 * balanced by a pair of normal-load changes so ΣFy and ΣM close.
 */
export function resolveExperimentalForces(
	components: ExperimentalComponent[],
	vehicle: VehicleParams,
): ForceResolution {
	let forwardN = 0;
	let upN = 0;
	let dFrontN = 0;
	let dRearN = 0;
	const L = Math.max(0.4, vehicle.wheelbaseMm / 1000);
	const h = Math.max(0.05, vehicle.cogHeightMm / 1000);
	const p = Math.min(0.85, Math.max(0.15, vehicle.cogPositionPct / 100));
	const xFront = p * L;
	const xRear = -(1 - p) * L;

	for (const c of components) {
		if (!c.enabled) continue;
		if (c.kind !== 'force' || c.forceType !== 'thruster') continue;
		const T = Math.max(0, c.thrustN);
		if (T < 1e-6) continue;
		const dir = thrustDirection(c.directionDeg);
		const Fx = T * dir.x;
		const Fy = T * dir.y;
		forwardN += Fx;
		upN += Fy;

		const rTire = ((c.anchor === 'front_axle' ? vehicle.frontTireRadiusMm : vehicle.rearTireRadiusMm) / 1000);
		let x = 0;
		let y = -h;
		if (c.anchor === 'front_axle') {
			x = xFront;
			y = rTire - h;
		} else if (c.anchor === 'rear_axle') {
			x = xRear;
			y = rTire - h;
		}
		const tau = x * Fy - y * Fx;
		const sumN = -Fy;
		dFrontN += sumN * (1 - p) - tau / L;
		dRearN += sumN * p + tau / L;
	}

	return { forwardN, upN, dFrontN, dRearN };
}

export function cloneComponent(c: ExperimentalComponent): ExperimentalComponent {
	return { ...c };
}
