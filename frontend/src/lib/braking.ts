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
	if (raw.pistons) return raw as BrakeParams;
	// Legacy format
	const count = raw.numberOfPots ?? 2;
	const dia = raw.pistonDiameterMm ?? 30;
	const { numberOfPots, pistonDiameterMm, ...rest } = raw;
	return { ...rest, pistons: [{ count, diameterMm: dia }] };
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
	// Torque = clamping force * mu * sides * effective radius
	const sides = brake.dualSided ? 2 : 1;
	return clampForceN * brake.padCoefficientOfFriction * sides * effectiveRadiusM;
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

	const frontForce = brakeForceAtPatch(frontTorque, vehicle.frontTireRadiusMm);
	const rearForce = brakeForceAtPatch(rearTorque, vehicle.rearTireRadiusMm);

	const totalBrakeForce = frontForce + rearForce;
	const decelerationMs2 = totalBrakeForce / vehicle.totalMassKg;
	const decelerationG = decelerationMs2 / G;

	const wt = weightTransfer(vehicle, decelerationMs2);
	const staticLoads = staticAxleLoads(vehicle);
	const frontAxleLoadN = staticLoads.frontN + wt;
	const rearAxleLoadN = staticLoads.rearN - wt;

	const frontMaxBrakeForce = frontAxleLoadN * vehicle.frontTireGrip;
	const rearMaxBrakeForce = Math.max(0, rearAxleLoadN) * vehicle.rearTireGrip;

	const frontLockup = frontForce > frontMaxBrakeForce;
	const rearLockup = rearForce > rearMaxBrakeForce;

	// Stopping from 100 km/h
	const v0 = 100 / 3.6; // m/s
	const effectiveDecel = Math.min(decelerationMs2, G * Math.max(vehicle.frontTireGrip, vehicle.rearTireGrip));
	const stoppingTimeS = effectiveDecel > 0 ? v0 / effectiveDecel : Infinity;
	const stoppingDistanceM = effectiveDecel > 0 ? (v0 * v0) / (2 * effectiveDecel) : Infinity;

	return {
		frontClampingForceN: frontClamp,
		rearClampingForceN: rearClamp,
		frontBrakeTorqueNm: frontTorque,
		rearBrakeTorqueNm: rearTorque,
		frontBrakeForceN: frontForce,
		rearBrakeForceN: rearForce,
		decelerationG,
		decelerationMs2,
		weightTransferN: wt,
		frontAxleLoadN,
		rearAxleLoadN,
		frontLockup,
		rearLockup,
		stoppingDistanceM,
		stoppingTimeS,
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
