/**
 * Braking system physics calculations.
 *
 * Models disc brake force generation, weight transfer during braking,
 * and combined front/rear braking dynamics.
 */

export interface PistonGroup {
	count: number;               // number of pistons at this diameter
	diameterMm: number;          // piston bore diameter
}

export interface BrakeParams {
	discDiameterMm: number;      // rotor diameter
	discThicknessMm: number;     // rotor thickness
	pistons: PistonGroup[];      // caliper piston groups (supports mixed sizes)
	padCoefficientOfFriction: number; // mu of brake pad material
	padAreaMm2: number;          // contact area per pad
	masterCylinderDiaMm: number; // master cylinder bore diameter
	leverRatio: number;          // mechanical advantage of lever/pedal
	dualSided: boolean;          // true = calipers on both sides of disc
	/** Caliper position around the rotor. 0° = top of the disc (12 o'clock); positive is clockwise in the right-side view (90° = front of the wheel). */
	caliperAngleDeg: number;
}

/** Total piston area across all groups */
export function totalPistonArea(pistons: PistonGroup[]): number {
	return pistons.reduce((sum, g) => sum + g.count * Math.PI * (g.diameterMm / 2) ** 2, 0);
}

/** Total pot count across all groups */
export function totalPotCount(pistons: PistonGroup[]): number {
	return pistons.reduce((sum, g) => sum + g.count, 0);
}

/** Migrate legacy BrakeParams that used numberOfPots/pistonDiameterMm */
export function migrateBrakeParams(raw: any): BrakeParams {
	let next: BrakeParams;
	if (raw.pistons) {
		next = raw as BrakeParams;
	} else {
		const count = raw.numberOfPots ?? 2;
		const dia = raw.pistonDiameterMm ?? 30;
		const { numberOfPots, pistonDiameterMm, ...rest } = raw;
		next = { ...rest, pistons: [{ count, diameterMm: dia }] } as BrakeParams;
	}
	if (typeof next.caliperAngleDeg !== 'number' || !Number.isFinite(next.caliperAngleDeg)) {
		next = { ...next, caliperAngleDeg: 90 };
	}
	return next;
}

export interface VehicleParams {
	wheelbaseMm: number;
	cogHeightMm: number;        // center of gravity height
	cogPositionPct: number;     // % from front axle (0-100)
	totalMassKg: number;        // rider + bike
	frontTireRadiusMm: number;
	rearTireRadiusMm: number;
	frontTireGrip: number;      // mu of front tire
	rearTireGrip: number;       // mu of rear tire
}

export interface BrakingInputs {
	frontBrake: BrakeParams;
	rearBrake: BrakeParams;
	vehicle: VehicleParams;
	frontLeverForceN: number;   // hand force on front brake lever
	rearPedalForceN: number;    // foot force on rear brake pedal
	linked: boolean;            // linked braking system
	linkRatio: number;          // front:rear ratio when linked (0-1, 1=all front)
	/** Optional experimental body forces (thrusters, later aero). */
	experimentalForwardN?: number;
	experimentalFrontLoadN?: number;
	experimentalRearLoadN?: number;
}

export interface BrakingResults {
	// Per-brake
	frontClampingForceN: number;
	rearClampingForceN: number;
	frontBrakeTorqueNm: number;
	rearBrakeTorqueNm: number;
	frontBrakeForceN: number;   // force at tire contact patch
	rearBrakeForceN: number;

	// Vehicle dynamics
	decelerationG: number;
	decelerationMs2: number;
	weightTransferN: number;    // additional load on front due to braking
	frontAxleLoadN: number;
	rearAxleLoadN: number;
	frontLockup: boolean;       // front tire exceeds grip
	rearLockup: boolean;        // rear tire exceeds grip

	// Stopping
	stoppingDistanceM: number;  // from given speed
	stoppingTimeS: number;

	/** Net experimental long force, +forward. Rearward thrust increases deceleration. */
	experimentalForwardN: number;
}

export interface BrakeSimFrame {
	timeS: number;
	speedMs: number;
	distanceM: number;
	decelerationG: number;
	pitchAngleDeg: number;
	frontLoadN: number;
	rearLoadN: number;
	frontSlip: boolean;
	rearSlip: boolean;
}

const G = 9.81;

/** Calculate clamping force from hydraulic brake system */
function clampingForce(brake: BrakeParams, inputForceN: number): number {
	// Hydraulic ratio: total piston area / master cylinder area
	const totalPiston = totalPistonArea(brake.pistons);
	const masterArea = Math.PI * (brake.masterCylinderDiaMm / 2) ** 2;
	const hydraulicRatio = totalPiston / masterArea;
	// Total clamping force = lever force * lever ratio * hydraulic ratio
	return inputForceN * brake.leverRatio * hydraulicRatio;
}

/** Calculate brake torque from clamping force */
function brakeTorque(brake: BrakeParams, clampForceN: number): number {
	const effectiveRadiusM = (brake.discDiameterMm / 2 * 0.8) / 1000; // effective friction radius ~80% of outer
	// Each disc has two pad faces. dualSided = a disc on each side of the wheel.
	const discs = brake.dualSided ? 2 : 1;
	const facesPerDisc = 2;
	return clampForceN * brake.padCoefficientOfFriction * discs * facesPerDisc * effectiveRadiusM;
}

/** Calculate braking force at tire contact patch */
function brakeForceAtPatch(torqueNm: number, tireRadiusMm: number): number {
	return torqueNm / (tireRadiusMm / 1000);
}

/** Static weight distribution */
function staticAxleLoads(vehicle: VehicleParams): { frontN: number; rearN: number } {
	const totalWeightN = vehicle.totalMassKg * G;
	const rearPct = vehicle.cogPositionPct / 100;
	const frontPct = 1 - rearPct;
	return {
		frontN: totalWeightN * frontPct,
		rearN: totalWeightN * rearPct,
	};
}

/** Weight transfer under braking */
function weightTransfer(vehicle: VehicleParams, decelerationMs2: number): number {
	return (vehicle.totalMassKg * decelerationMs2 * vehicle.cogHeightMm) / vehicle.wheelbaseMm;
}

/** Compute full braking results for a given set of inputs */
export function computeBraking(inputs: BrakingInputs): BrakingResults {
	const { frontBrake, rearBrake, vehicle } = inputs;

	let frontInputForce = inputs.frontLeverForceN;
	let rearInputForce = inputs.rearPedalForceN;

	if (inputs.linked) {
		const totalForce = frontInputForce + rearInputForce;
		frontInputForce = totalForce * inputs.linkRatio;
		rearInputForce = totalForce * (1 - inputs.linkRatio);
	}

	const frontClamp = clampingForce(frontBrake, frontInputForce);
	const rearClamp = clampingForce(rearBrake, rearInputForce);

	const frontTorque = brakeTorque(frontBrake, frontClamp);
	const rearTorque = brakeTorque(rearBrake, rearClamp);

	const frontForceCmd = brakeForceAtPatch(frontTorque, vehicle.frontTireRadiusMm);
	const rearForceCmd = brakeForceAtPatch(rearTorque, vehicle.rearTireRadiusMm);

	const limited = solveGripLimited(vehicle, frontForceCmd, rearForceCmd);

	const expF = inputs.experimentalForwardN ?? 0;
	const m = Math.max(40, vehicle.totalMassKg);
	const a = limited.decelerationMs2 - expF / m;
	const v0 = 100 / 3.6;
	const stoppingTimeS = a > 0.05 ? v0 / a : Infinity;
	const stoppingDistanceM = a > 0.05 ? (v0 * v0) / (2 * a) : Infinity;

	return {
		frontClampingForceN: frontClamp,
		rearClampingForceN: rearClamp,
		frontBrakeTorqueNm: frontTorque,
		rearBrakeTorqueNm: rearTorque,
		frontBrakeForceN: frontForceCmd,
		rearBrakeForceN: rearForceCmd,
		decelerationG: a / G,
		decelerationMs2: a,
		weightTransferN: limited.weightTransferN,
		frontAxleLoadN: limited.frontAxleLoadN + (inputs.experimentalFrontLoadN ?? 0),
		rearAxleLoadN: limited.rearAxleLoadN + (inputs.experimentalRearLoadN ?? 0),
		frontLockup: limited.frontLockup,
		rearLockup: limited.rearLockup,
		stoppingDistanceM,
		stoppingTimeS,
		experimentalForwardN: expF,
	};
}

/**
 * Iterate load transfer with tire-limited patch forces.
 * Long wheelbase / low CoG keeps rear load up, so more of the commanded
 * rear force can actually be used before lock.
 */
export function solveGripLimited(
	vehicle: VehicleParams,
	frontForceCmdN: number,
	rearForceCmdN: number,
): {
	decelerationMs2: number;
	weightTransferN: number;
	frontAxleLoadN: number;
	rearAxleLoadN: number;
	frontUsedN: number;
	rearUsedN: number;
	frontLockup: boolean;
	rearLockup: boolean;
} {
	const m = Math.max(40, vehicle.totalMassKg);
	const L = Math.max(800, vehicle.wheelbaseMm);
	const h = Math.max(50, vehicle.cogHeightMm);
	const staticLoads = staticAxleLoads(vehicle);
	let a = 0;
	let Nf = staticLoads.frontN;
	let Nr = staticLoads.rearN;
	let Ff = 0;
	let Fr = 0;
	for (let i = 0; i < 12; i++) {
		const wt = (m * a * h) / L;
		Nf = staticLoads.frontN + wt;
		Nr = Math.max(0, staticLoads.rearN - wt);
		Ff = Math.min(Math.max(0, frontForceCmdN), Math.max(0, Nf) * vehicle.frontTireGrip);
		Fr = Math.min(Math.max(0, rearForceCmdN), Math.max(0, Nr) * vehicle.rearTireGrip);
		a = (Ff + Fr) / m;
	}
	const wt = (m * a * h) / L;
	Nf = staticLoads.frontN + wt;
	Nr = Math.max(0, staticLoads.rearN - wt);
	const FmaxF = Math.max(0, Nf) * vehicle.frontTireGrip;
	const FmaxR = Math.max(0, Nr) * vehicle.rearTireGrip;
	return {
		decelerationMs2: a,
		weightTransferN: wt,
		frontAxleLoadN: Nf,
		rearAxleLoadN: Nr,
		frontUsedN: Math.min(Math.max(0, frontForceCmdN), FmaxF),
		rearUsedN: Math.min(Math.max(0, rearForceCmdN), FmaxR),
		frontLockup: frontForceCmdN > FmaxF * 1.02 && frontForceCmdN > 30,
		rearLockup: rearForceCmdN > FmaxR * 1.02 && rearForceCmdN > 30,
	};
}

/** Run a time-stepping braking simulation */
export function simulateBraking(
	inputs: BrakingInputs,
	initialSpeedKph: number,
	dt: number = 0.01,
): BrakeSimFrame[] {
	const frames: BrakeSimFrame[] = [];
	let speed = initialSpeedKph / 3.6; // m/s
	let distance = 0;
	let time = 0;

	const { vehicle } = inputs;

	while (speed > 0.01 && time < 30) {
		// Recalculate with current weight transfer
		const results = computeBraking(inputs);

		// Limit deceleration by available grip
		const staticLoads = staticAxleLoads(vehicle);
		const wt = weightTransfer(vehicle, results.decelerationMs2);
		const frontLoad = staticLoads.frontN + wt;
		const rearLoad = Math.max(0, staticLoads.rearN - wt);

		const maxFrontBrake = frontLoad * vehicle.frontTireGrip;
		const maxRearBrake = rearLoad * vehicle.rearTireGrip;

		const effectiveFrontForce = Math.min(results.frontBrakeForceN, maxFrontBrake);
		const effectiveRearForce = Math.min(results.rearBrakeForceN, maxRearBrake);
		const totalForce = effectiveFrontForce + effectiveRearForce;
		const decel = totalForce / vehicle.totalMassKg;

		// Pitch angle approximation (small angle)
		const pitchRad = Math.atan2(wt, vehicle.totalMassKg * G);
		const pitchDeg = pitchRad * (180 / Math.PI);

		frames.push({
			timeS: time,
			speedMs: speed,
			distanceM: distance,
			decelerationG: decel / G,
			pitchAngleDeg: pitchDeg,
			frontLoadN: frontLoad,
			rearLoadN: rearLoad,
			frontSlip: results.frontBrakeForceN > maxFrontBrake,
			rearSlip: results.rearBrakeForceN > maxRearBrake,
		});

		speed -= decel * dt;
		if (speed < 0) speed = 0;
		distance += speed * dt;
		time += dt;
	}

	// Final frame
	frames.push({
		timeS: time,
		speedMs: 0,
		distanceM: distance,
		decelerationG: 0,
		pitchAngleDeg: 0,
		frontLoadN: staticAxleLoads(vehicle).frontN,
		rearLoadN: staticAxleLoads(vehicle).rearN,
		frontSlip: false,
		rearSlip: false,
	});

	return frames;
}

/** Default front brake params (sportbike) */
export function defaultFrontBrake(): BrakeParams {
	return {
		discDiameterMm: 320,
		discThicknessMm: 5,
		pistons: [{ count: 4, diameterMm: 30 }],
		padCoefficientOfFriction: 0.45,
		padAreaMm2: 2400,
		masterCylinderDiaMm: 16,
		leverRatio: 4,
		dualSided: true,
		caliperAngleDeg: 90,
	};
}

/** Default rear brake params (sportbike) */
export function defaultRearBrake(): BrakeParams {
	return {
		discDiameterMm: 220,
		discThicknessMm: 5,
		pistons: [{ count: 2, diameterMm: 34 }],
		padCoefficientOfFriction: 0.42,
		padAreaMm2: 1200,
		masterCylinderDiaMm: 14,
		leverRatio: 3.5,
		dualSided: false,
		caliperAngleDeg: 90,
	};
}

export type WheelGripState = 'rolling' | 'braking' | 'limit' | 'sliding' | 'locked';

export interface WheelStep {
	omega: number;
	slip: number;
	locked: boolean;
	state: WheelGripState;
	tireForceN: number;
	loadN: number;
}

export interface LongBrakingState {
	speedMs: number;
	frontOmega: number;
	rearOmega: number;
	decelMs2: number;
	frontLoadN: number;
	rearLoadN: number;
	frontSlip: number;
	rearSlip: number;
	frontLocked: boolean;
	rearLocked: boolean;
	frontState: WheelGripState;
	rearState: WheelGripState;
	frontTireForceN: number;
	rearTireForceN: number;
}

/** Rotating inertia of a wheel/tire/rotor assembly, kg·m². */
export function estimateWheelInertia(radiusMm: number, unsprungKg: number): number {
	const r = Math.max(0.12, radiusMm / 1000);
	const mRot = Math.max(5, unsprungKg * 0.6);
	return 0.45 * mRot * r * r;
}

/**
 * Simple longitudinal μ vs slip. Peak at ~15% slip, then drop to ~75% of
 * peak for a fully locked sliding tire (kinetic friction).
 */
export function muFromSlip(slip: number, muPeak: number): number {
	const s = Math.max(0, Math.min(1.2, slip));
	const sPeak = 0.15;
	const muLock = muPeak * 0.75;
	if (s <= 1e-4) return 0;
	if (s <= sPeak) {
		const x = s / sPeak;
		return muPeak * (2 * x - x * x);
	}
	const t = Math.min(1, (s - sPeak) / (1 - sPeak));
	return muPeak + (muLock - muPeak) * t;
}

export function classifyWheel(slip: number, omega: number, speedMs: number): WheelGripState {
	if (speedMs > 0.4 && omega < 0.35) return 'locked';
	if (slip >= 0.85) return 'locked';
	if (slip >= 0.35) return 'sliding';
	if (slip >= 0.12) return 'limit';
	if (slip >= 0.02) return 'braking';
	return 'rolling';
}

/**
 * One wheel. Commanded patch force F_cmd = T_brake / r.
 * If F_cmd ≤ μ N the tire holds: force = F_cmd, wheel stays near rolling.
 * Only if demand exceeds grip does ω drop and the wheel lock.
 * This avoids the s=0 / T_road=0 trap that locked every wheel on the first frame.
 */
export function stepWheel(opts: {
	omega: number;
	speedMs: number;
	radiusM: number;
	inertia: number;
	brakeTorqueNm: number;
	loadN: number;
	muPeak: number;
	dt: number;
}): WheelStep {
	const { speedMs, radiusM, inertia, brakeTorqueNm, loadN, muPeak, dt } = opts;
	let omega = opts.omega;
	const V = Math.max(0, speedMs);
	const r = Math.max(0.08, radiusM);
	const rolling = V / r;
	const I = Math.max(0.04, inertia);
	const N = Math.max(0, loadN);
	const Fpeak = N * muPeak;
	const Fslide = N * muPeak * 0.72;
	const Fcmd = Math.max(0, brakeTorqueNm) / r;

	if (brakeTorqueNm < 0.5) {
		omega += (rolling - omega) * Math.min(1, dt * 16);
		if (omega < 0) omega = 0;
		return {
			omega,
			slip: 0,
			locked: false,
			state: 'rolling',
			tireForceN: 0,
			loadN: N,
		};
	}

	if (V < 0.22) {
		const over = Fcmd > Fpeak * 1.02;
		return {
			omega: 0,
			slip: over ? 1 : 0,
			locked: over,
			state: over ? 'locked' : 'braking',
			tireForceN: Math.min(Fcmd, Fpeak),
			loadN: N,
		};
	}

	if (Fcmd <= Fpeak) {
		const sHold = Fpeak > 1 ? Math.min(0.12, 0.12 * (Fcmd / Fpeak)) : 0;
		const omegaTarget = rolling * (1 - sHold);
		omega += (omegaTarget - omega) * Math.min(1, dt * 22);
		if (omega < 0) omega = 0;
		return {
			omega,
			slip: sHold,
			locked: false,
			state: classifyWheel(sHold, omega, V),
			tireForceN: Fcmd,
			loadN: N,
		};
	}

	omega += ((Fslide * r - brakeTorqueNm) / I) * dt;
	if (omega < 0) omega = 0;
	const locked = omega < 0.45;
	if (locked) omega = 0;
	const slip = Math.min(1, Math.max(0.15, (V - omega * r) / V));
	return {
		omega,
		slip,
		locked,
		state: locked ? 'locked' : classifyWheel(slip, omega, V),
		tireForceN: Fslide,
		loadN: N,
	};
}

/** One physics step of vehicle + independent front/rear wheels. */
export function stepLongitudinalBraking(
	state: LongBrakingState,
	opts: {
		vehicle: VehicleParams;
		frontBrakeTorqueNm: number;
		rearBrakeTorqueNm: number;
		frontInertia: number;
		rearInertia: number;
		dt: number;
		/** +forward body force (thruster). Rearward is negative and adds deceleration. */
		externalForwardN?: number;
		extraFrontLoadN?: number;
		extraRearLoadN?: number;
	},
): LongBrakingState {
	const { vehicle, dt } = opts;
	const m = Math.max(40, vehicle.totalMassKg);
	const L = Math.max(800, vehicle.wheelbaseMm);
	const h = Math.max(50, vehicle.cogHeightMm);
	const staticLoads = staticAxleLoads(vehicle);
	const rF = vehicle.frontTireRadiusMm / 1000;
	const rR = vehicle.rearTireRadiusMm / 1000;
	const extF = opts.externalForwardN ?? 0;
	const extraF = opts.extraFrontLoadN ?? 0;
	const extraR = opts.extraRearLoadN ?? 0;

	let aTires = Math.max(0, state.decelMs2 + extF / m);
	let front!: WheelStep;
	let rear!: WheelStep;
	for (let k = 0; k < 3; k++) {
		const wt = (m * aTires * h) / L;
		const Nf = Math.max(40, staticLoads.frontN + wt + extraF);
		const Nr = Math.max(0, staticLoads.rearN - wt + extraR);
		front = stepWheel({
			omega: state.frontOmega, speedMs: state.speedMs, radiusM: rF,
			inertia: opts.frontInertia, brakeTorqueNm: opts.frontBrakeTorqueNm,
			loadN: Nf, muPeak: vehicle.frontTireGrip, dt,
		});
		rear = stepWheel({
			omega: state.rearOmega, speedMs: state.speedMs, radiusM: rR,
			inertia: opts.rearInertia, brakeTorqueNm: opts.rearBrakeTorqueNm,
			loadN: Nr, muPeak: vehicle.rearTireGrip, dt,
		});
		aTires = (front.tireForceN + rear.tireForceN) / m;
	}

	const a = aTires - extF / m;
	const wt = (m * aTires * h) / L;
	let speedMs = Math.max(0, state.speedMs - a * dt);
	let fOmega = front.omega;
	let rOmega = rear.omega;
	let fLocked = front.locked;
	let rLocked = rear.locked;
	const brakingHard = (opts.frontBrakeTorqueNm + opts.rearBrakeTorqueNm) > 1 && a > 0.2;
	if (speedMs < 0.15 && brakingHard) {
		speedMs = 0;
		fOmega = 0;
		rOmega = 0;
	}
	if (speedMs < 0.05 && a >= 0) {
		speedMs = 0;
		fOmega = 0;
		rOmega = 0;
		fLocked = false;
		rLocked = false;
	}
	const stopped = speedMs < 0.15 && a >= 0;
	return {
		speedMs,
		frontOmega: fOmega,
		rearOmega: rOmega,
		decelMs2: a,
		frontLoadN: Math.max(40, staticLoads.frontN + wt + extraF),
		rearLoadN: Math.max(0, staticLoads.rearN - wt + extraR),
		frontSlip: stopped ? 0 : front.slip,
		rearSlip: stopped ? 0 : rear.slip,
		frontLocked: fLocked && !stopped,
		rearLocked: rLocked && !stopped,
		frontState: stopped ? 'rolling' : front.state,
		rearState: stopped ? 'rolling' : rear.state,
		frontTireForceN: front.tireForceN,
		rearTireForceN: rear.tireForceN,
	};
}

/** Default vehicle params */
export function defaultVehicleParams(): VehicleParams {
	return {
		wheelbaseMm: 1400,
		cogHeightMm: 550,
		cogPositionPct: 48,  // 48% from front
		totalMassKg: 210,    // bike + rider
		frontTireRadiusMm: 310,
		rearTireRadiusMm: 315,
		frontTireGrip: 1.2,
		rearTireGrip: 1.1,
	};
}
