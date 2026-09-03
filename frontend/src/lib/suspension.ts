/**
 * Suspension selection, spring/damper setup, and sag/frequency calculations.
 *
 * Geometry (rake, travel, leverage, mounts) is inherited from the Front End
 * and Rear End tabs. This module owns the hardware and tune: springs, oil,
 * clickers, preload, sag targets, and the resulting wheel rates.
 */

export type SpringKind = 'coil_linear' | 'coil_progressive' | 'coil_dual_rate' | 'air';

export type FrontDamperArch = 'damper_rod' | 'cartridge' | 'closed_cartridge' | 'electronic';
export type RearDamperArch = 'emulsion' | 'ifp' | 'piggyback' | 'remote_reservoir' | 'electronic';
export type DamperArch = FrontDamperArch | RearDamperArch;

export type OilWeight = '2.5' | '5' | '7.5' | '10' | '15' | '20';

export type SagPose = 'extend' | 'static' | 'rider' | 'bump';

export type TunePreset = 'street' | 'sport' | 'track' | 'adventure' | 'cruiser';

export interface EndSuspension {
	springKind: SpringKind;
	damperArch: DamperArch;
	unitCount: number;
	rateNPerMm: number;
	rate2NPerMm: number;
	crossoverMm: number;
	preloadMm: number;
	threadPitchMm: number;
	airPressureBar: number;
	airCanVolumeCc: number;
	oilWeight: OilWeight;
	oilLevelMm: number;
	clickRange: number;
	compressionClicks: number;
	reboundClicks: number;
	hscClicks: number;
	hsrClicks: number;
	nitrogenBar: number;
	includeAirAssist: boolean;
	targetRiderSagPct: number;
	targetStaticSagPct: number;
}

export interface SuspensionDesign {
	bikeMassKg: number;
	riderMassKg: number;
	cargoMassKg: number;
	frontWeightPct: number;
	unsprungFrontKg: number;
	unsprungRearKg: number;
	showPose: SagPose;
	front: EndSuspension;
	rear: EndSuspension;
}

export interface EndGeometry {
	/** Wheel travel (vertical) if known; otherwise unit travel. */
	wheelTravelMm: number;
	/** Stroke of the spring/damper unit (fork or shock). */
	unitTravelMm: number;
	/** Wheel travel / unit travel. Telescopic along-fork = 1. */
	leverage: number;
	/** Steering-axis rake from vertical, degrees. Front only. */
	rakeDeg: number;
	/** Stanchion OD, mm. Used for fork air-chamber estimate. */
	stanchionDiaMm: number;
	/** True when this end has no spring (hardtail). */
	solid: boolean;
	/** Telescopic fork (two legs, oil level, air assist). */
	telescopic: boolean;
}

export interface EndResults {
	sprungKg: number;
	staticSprungKg: number;
	loadAtUnitN: number;
	staticLoadAtUnitN: number;
	wheelRateNPerMm: number;
	unitRateNPerMm: number;
	riderSagMm: number;
	riderSagPct: number;
	staticSagMm: number;
	staticSagPct: number;
	preloadToTargetMm: number;
	recommendedRateNPerMm: number;
	naturalFreqHz: number;
	compressionDampingNsPerM: number;
	reboundDampingNsPerM: number;
	compressionZeta: number;
	reboundZeta: number;
	forceAtSagN: number;
	forceAtBottomN: number;
	bottomOut: boolean;
	sagStatus: 'soft' | 'ok' | 'stiff';
	freqStatus: 'low' | 'ok' | 'high';
}

export interface CurvePt {
	x: number;
	f: number;
}

export interface StepPt {
	t: number;
	x: number;
}

const G = 9.81;
const N_PER_MM_PER_KG_MM = 9.80665;
const LB_IN_PER_N_MM = 5.710147;
const PSI_PER_BAR = 14.5038;
const LB_PER_KG = 2.20462262;

export function nPerMmToKgMm(n: number): number {
	return n / N_PER_MM_PER_KG_MM;
}
export function kgMmToNPerMm(kg: number): number {
	return kg * N_PER_MM_PER_KG_MM;
}
export function nPerMmToLbIn(n: number): number {
	return n * LB_IN_PER_N_MM;
}
export function lbInToNPerMm(lb: number): number {
	return lb / LB_IN_PER_N_MM;
}
export function barToPsi(bar: number): number {
	return bar * PSI_PER_BAR;
}
export function psiToBar(psi: number): number {
	return psi / PSI_PER_BAR;
}
export function kgToLb(kg: number): number {
	return kg * LB_PER_KG;
}
export function lbToKg(lb: number): number {
	return lb / LB_PER_KG;
}

export const frontSpringCatalog: { label: string; nPerMm: number }[] = [
	{ label: '0.65 kg/mm', nPerMm: kgMmToNPerMm(0.65) },
	{ label: '0.70 kg/mm', nPerMm: kgMmToNPerMm(0.7) },
	{ label: '0.75 kg/mm', nPerMm: kgMmToNPerMm(0.75) },
	{ label: '0.80 kg/mm', nPerMm: kgMmToNPerMm(0.8) },
	{ label: '0.85 kg/mm', nPerMm: kgMmToNPerMm(0.85) },
	{ label: '0.90 kg/mm', nPerMm: kgMmToNPerMm(0.9) },
	{ label: '0.95 kg/mm', nPerMm: kgMmToNPerMm(0.95) },
	{ label: '1.00 kg/mm', nPerMm: kgMmToNPerMm(1.0) },
	{ label: '1.05 kg/mm', nPerMm: kgMmToNPerMm(1.05) },
	{ label: '1.10 kg/mm', nPerMm: kgMmToNPerMm(1.1) },
	{ label: '1.20 kg/mm', nPerMm: kgMmToNPerMm(1.2) },
	{ label: '1.30 kg/mm', nPerMm: kgMmToNPerMm(1.3) },
];

export const rearMonoCatalog: { label: string; nPerMm: number }[] = [
	{ label: '8 kg/mm', nPerMm: kgMmToNPerMm(8) },
	{ label: '9 kg/mm', nPerMm: kgMmToNPerMm(9) },
	{ label: '10 kg/mm', nPerMm: kgMmToNPerMm(10) },
	{ label: '11 kg/mm', nPerMm: kgMmToNPerMm(11) },
	{ label: '12 kg/mm', nPerMm: kgMmToNPerMm(12) },
	{ label: '14 kg/mm', nPerMm: kgMmToNPerMm(14) },
	{ label: '16 kg/mm', nPerMm: kgMmToNPerMm(16) },
	{ label: '18 kg/mm', nPerMm: kgMmToNPerMm(18) },
	{ label: '20 kg/mm', nPerMm: kgMmToNPerMm(20) },
	{ label: '22 kg/mm', nPerMm: kgMmToNPerMm(22) },
	{ label: '25 kg/mm', nPerMm: kgMmToNPerMm(25) },
];

export const rearTwinCatalog: { label: string; nPerMm: number }[] = [
	{ label: '1.6 kg/mm', nPerMm: kgMmToNPerMm(1.6) },
	{ label: '1.8 kg/mm', nPerMm: kgMmToNPerMm(1.8) },
	{ label: '2.0 kg/mm', nPerMm: kgMmToNPerMm(2.0) },
	{ label: '2.2 kg/mm', nPerMm: kgMmToNPerMm(2.2) },
	{ label: '2.5 kg/mm', nPerMm: kgMmToNPerMm(2.5) },
	{ label: '2.8 kg/mm', nPerMm: kgMmToNPerMm(2.8) },
	{ label: '3.0 kg/mm', nPerMm: kgMmToNPerMm(3.0) },
	{ label: '3.5 kg/mm', nPerMm: kgMmToNPerMm(3.5) },
	{ label: '4.0 kg/mm', nPerMm: kgMmToNPerMm(4.0) },
];

export const oilWeights: { value: OilWeight; label: string; cSt: number }[] = [
	{ value: '2.5', label: '2.5 wt', cSt: 10 },
	{ value: '5', label: '5 wt', cSt: 18 },
	{ value: '7.5', label: '7.5 wt', cSt: 28 },
	{ value: '10', label: '10 wt', cSt: 40 },
	{ value: '15', label: '15 wt', cSt: 65 },
	{ value: '20', label: '20 wt', cSt: 90 },
];

export const springKinds: { value: SpringKind; label: string; note: string }[] = [
	{ value: 'coil_linear', label: 'Linear coil', note: 'Constant rate. Street and most sport bikes.' },
	{ value: 'coil_progressive', label: 'Progressive coil', note: 'Rate rises with stroke. Cruiser / OEM comfort springs.' },
	{ value: 'coil_dual_rate', label: 'Dual-rate coil', note: 'Soft first rate, stiffer after a crossover gap.' },
	{ value: 'air', label: 'Air spring', note: 'Pressure and can volume set the rate. USD air forks, air shocks.' },
];

export const frontDamperArchs: { value: FrontDamperArch; label: string; note: string }[] = [
	{ value: 'damper_rod', label: 'Damper rod', note: 'Orifice rod. Oil weight and level are the main tune.' },
	{ value: 'cartridge', label: 'Cartridge', note: 'Shim stack + clickers. Typical modern conventional / USD.' },
	{ value: 'closed_cartridge', label: 'Closed cartridge', note: 'Pressurized cartridge. Separate high/low-speed circuits.' },
	{ value: 'electronic', label: 'Electronic', note: 'Solenoid or stepper valves. Clickers become a baseline map.' },
];

export const rearDamperArchs: { value: RearDamperArch; label: string; note: string }[] = [
	{ value: 'emulsion', label: 'Emulsion', note: 'Oil and gas mixed. Simple, fades on long descents.' },
	{ value: 'ifp', label: 'IFP (internal floating piston)', note: 'Separated gas. Common monoshock body.' },
	{ value: 'piggyback', label: 'Piggyback reservoir', note: 'More oil, high/low-speed compression. Sport / MX.' },
	{ value: 'remote_reservoir', label: 'Remote reservoir', note: 'Hose-connected can. Packaging for linkage / softail.' },
	{ value: 'electronic', label: 'Electronic', note: 'Semi-active or electronically clicked damping.' },
];

export const tunePresets: {
	value: TunePreset;
	label: string;
	frontSag: number;
	rearSag: number;
	frontOil: OilWeight;
	rearOil: OilWeight;
	compOut: number;
	rebOut: number;
}[] = [
	{ value: 'street', label: 'Street', frontSag: 30, rearSag: 28, frontOil: '10', rearOil: '10', compOut: 12, rebOut: 10 },
	{ value: 'sport', label: 'Sport', frontSag: 28, rearSag: 25, frontOil: '7.5', rearOil: '10', compOut: 10, rebOut: 8 },
	{ value: 'track', label: 'Track', frontSag: 25, rearSag: 23, frontOil: '5', rearOil: '7.5', compOut: 7, rebOut: 6 },
	{ value: 'adventure', label: 'Adventure', frontSag: 32, rearSag: 30, frontOil: '10', rearOil: '15', compOut: 14, rebOut: 12 },
	{ value: 'cruiser', label: 'Cruiser', frontSag: 30, rearSag: 32, frontOil: '15', rearOil: '15', compOut: 14, rebOut: 12 },
];

export function defaultFrontEnd(): EndSuspension {
	return {
		springKind: 'coil_linear',
		damperArch: 'cartridge',
		unitCount: 2,
		rateNPerMm: kgMmToNPerMm(0.95),
		rate2NPerMm: kgMmToNPerMm(0.25),
		crossoverMm: 40,
		preloadMm: 8,
		threadPitchMm: 1.5,
		airPressureBar: 9,
		airCanVolumeCc: 180,
		oilWeight: '10',
		oilLevelMm: 120,
		clickRange: 20,
		compressionClicks: 12,
		reboundClicks: 10,
		hscClicks: 10,
		hsrClicks: 10,
		nitrogenBar: 10,
		includeAirAssist: true,
		targetRiderSagPct: 30,
		targetStaticSagPct: 8,
	};
}

export function defaultRearEnd(): EndSuspension {
	return {
		springKind: 'coil_linear',
		damperArch: 'piggyback',
		unitCount: 1,
		rateNPerMm: kgMmToNPerMm(12),
		rate2NPerMm: kgMmToNPerMm(4),
		crossoverMm: 25,
		preloadMm: 6,
		threadPitchMm: 1.5,
		airPressureBar: 10,
		airCanVolumeCc: 220,
		oilWeight: '10',
		oilLevelMm: 0,
		clickRange: 20,
		compressionClicks: 12,
		reboundClicks: 10,
		hscClicks: 10,
		hsrClicks: 10,
		nitrogenBar: 12,
		includeAirAssist: false,
		targetRiderSagPct: 28,
		targetStaticSagPct: 8,
	};
}

export function defaultSuspensionDesign(): SuspensionDesign {
	return {
		bikeMassKg: 190,
		riderMassKg: 80,
		cargoMassKg: 0,
		frontWeightPct: 52,
		unsprungFrontKg: 16,
		unsprungRearKg: 20,
		showPose: 'rider',
		front: defaultFrontEnd(),
		rear: defaultRearEnd(),
	};
}

export function defaultUnitCount(end: 'front' | 'rear', type: string): number {
	if (end === 'front') return type === 'telescopic' ? 2 : 1;
	if (type === 'twin_shock') return 2;
	if (type === 'hardtail') return 0;
	return 1;
}

export function defaultRateForType(end: 'front' | 'rear', type: string): number {
	if (end === 'front') return type === 'telescopic' ? kgMmToNPerMm(0.95) : kgMmToNPerMm(9);
	if (type === 'twin_shock') return kgMmToNPerMm(2.2);
	if (type === 'hardtail') return 0;
	return kgMmToNPerMm(12);
}

export function catalogFor(end: 'front' | 'rear', type: string, unitCount: number): { label: string; nPerMm: number }[] {
	if (end === 'front' && type === 'telescopic') return frontSpringCatalog;
	if (end === 'front') return rearMonoCatalog;
	if (type === 'twin_shock' || unitCount >= 2) return rearTwinCatalog;
	return rearMonoCatalog;
}

export function matchCatalog(rate: number, catalog: { label: string; nPerMm: number }[]): string {
	let best = 'custom';
	let bestD = Infinity;
	for (const c of catalog) {
		const d = Math.abs(c.nPerMm - rate);
		if (d < bestD && d < 0.15) {
			bestD = d;
			best = String(c.nPerMm);
		}
	}
	return best;
}

function oilCSt(w: OilWeight): number {
	return oilWeights.find((o) => o.value === w)?.cSt ?? 40;
}

function archFactor(arch: DamperArch): number {
	switch (arch) {
		case 'damper_rod': return 0.7;
		case 'cartridge': return 1.0;
		case 'closed_cartridge': return 1.15;
		case 'emulsion': return 0.8;
		case 'ifp': return 1.0;
		case 'piggyback': return 1.2;
		case 'remote_reservoir': return 1.25;
		case 'electronic': return 1.1;
		default: return 1;
	}
}

function clickOpen(clicks: number, range: number): number {
	const r = Math.max(1, range);
	const c = Math.min(r, Math.max(0, clicks));
	return 0.28 + 0.72 * (1 - c / r);
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

function airSpringForceN(cfg: EndSuspension, strokeMm: number): number {
	const P0 = cfg.airPressureBar * 1e5;
	const V0 = Math.max(20, cfg.airCanVolumeCc) * 1e-6;
	const boreM = 0.036;
	const A = Math.PI * (boreM / 2) ** 2;
	const x = Math.max(0, strokeMm) / 1000;
	const V = Math.max(V0 * 0.18, V0 - A * x);
	const n = 1.3;
	return cfg.unitCount * P0 * (Math.pow(V0 / V, n) - 1) * A;
}

function forkAirAssistN(cfg: EndSuspension, geo: EndGeometry, strokeMm: number): number {
	if (!cfg.includeAirAssist || !geo.telescopic) return 0;
	const inner = Math.max(12, geo.stanchionDiaMm * 0.45);
	const A = Math.PI * (inner / 2) ** 2;
	const V0 = A * Math.max(25, cfg.oilLevelMm);
	const V = Math.max(V0 * 0.2, V0 - A * Math.max(0, strokeMm));
	const P0 = 1e5;
	const A_m2 = A * 1e-6;
	return cfg.unitCount * P0 * (V0 / V - 1) * A_m2;
}

/** Total spring force of all units at a given unit stroke (N). */
export function springForceN(cfg: EndSuspension, geo: EndGeometry, strokeMm: number): number {
	if (geo.solid) return 0;
	const n = Math.max(1, cfg.unitCount);
	const x = Math.max(0, strokeMm);
	if (cfg.springKind === 'air') return airSpringForceN(cfg, x);
	const preload = Math.max(0, cfg.preloadMm);
	if (cfg.springKind === 'coil_dual_rate') {
		const x1 = Math.min(x, Math.max(0, cfg.crossoverMm));
		const x2 = Math.max(0, x - Math.max(0, cfg.crossoverMm));
		const k1 = cfg.rateNPerMm;
		const k2 = cfg.rateNPerMm + Math.max(0, cfg.rate2NPerMm);
		return n * (k1 * (preload + x1) + k2 * x2) + forkAirAssistN(cfg, geo, x);
	}
	if (cfg.springKind === 'coil_progressive') {
		const k = cfg.rateNPerMm;
		const p = Math.max(0, cfg.rate2NPerMm) / 80;
		return n * (k * (preload + x) + p * x * x) + forkAirAssistN(cfg, geo, x);
	}
	return n * cfg.rateNPerMm * (preload + x) + forkAirAssistN(cfg, geo, x);
}

function tangentRateNPerMm(cfg: EndSuspension, geo: EndGeometry, strokeMm: number): number {
	const dx = 1;
	return Math.max(0.05, (springForceN(cfg, geo, strokeMm + dx) - springForceN(cfg, geo, strokeMm)) / dx);
}

function solveStrokeForForce(cfg: EndSuspension, geo: EndGeometry, loadN: number): number {
	const travel = Math.max(1, geo.unitTravelMm);
	if (loadN <= springForceN(cfg, geo, 0)) return 0;
	if (loadN >= springForceN(cfg, geo, travel)) return travel;
	let lo = 0;
	let hi = travel;
	for (let i = 0; i < 28; i++) {
		const mid = (lo + hi) / 2;
		if (springForceN(cfg, geo, mid) < loadN) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

function loadAlongUnitN(sprungKg: number, geo: EndGeometry): number {
	const rake = (geo.rakeDeg * Math.PI) / 180;
	const along = geo.telescopic ? Math.cos(rake) : 1;
	const L = Math.max(0.15, geo.leverage);
	return Math.max(0, sprungKg) * G * along * L;
}

export function poseCompressionPct(results: EndResults, pose: SagPose): number {
	if (pose === 'extend') return 0;
	if (pose === 'static') return clamp(results.staticSagPct, 0, 100);
	if (pose === 'bump') return 100;
	return clamp(results.riderSagPct, 0, 100);
}

export function computeEnd(
	cfg: EndSuspension,
	geo: EndGeometry,
	sprungKg: number,
	staticSprungKg: number,
	isFront: boolean,
): EndResults {
	const travel = Math.max(1, geo.unitTravelMm);
	if (geo.solid) {
		return {
			sprungKg, staticSprungKg,
			loadAtUnitN: 0, staticLoadAtUnitN: 0,
			wheelRateNPerMm: 0, unitRateNPerMm: 0,
			riderSagMm: 0, riderSagPct: 0, staticSagMm: 0, staticSagPct: 0,
			preloadToTargetMm: 0, recommendedRateNPerMm: 0,
			naturalFreqHz: 0,
			compressionDampingNsPerM: 0, reboundDampingNsPerM: 0,
			compressionZeta: 0, reboundZeta: 0,
			forceAtSagN: 0, forceAtBottomN: 0,
			bottomOut: false, sagStatus: 'ok', freqStatus: 'ok',
		};
	}

	const load = loadAlongUnitN(sprungKg, geo);
	const staticLoad = loadAlongUnitN(staticSprungKg, geo);
	const riderSagMm = solveStrokeForForce(cfg, geo, load);
	const staticSagMm = solveStrokeForForce(cfg, geo, staticLoad);
	const riderSagPct = (riderSagMm / travel) * 100;
	const staticSagPct = (staticSagMm / travel) * 100;
	const unitRate = tangentRateNPerMm(cfg, geo, riderSagMm);
	const L = Math.max(0.15, geo.leverage);
	const wheelRate = unitRate / (L * L);
	const n = Math.max(1, cfg.unitCount);
	const targetStroke = travel * (cfg.targetRiderSagPct / 100);
	const recommendedRateNPerMm = clamp(load / (n * Math.max(4, targetStroke + cfg.preloadMm)), 0.4, 400);
	const preloadToTargetMm = unitRate > 0.05 ? load / (n * Math.max(0.2, cfg.rateNPerMm)) - targetStroke : cfg.preloadMm;

	const m = Math.max(5, sprungKg);
	const kSi = wheelRate * 1000;
	const naturalFreqHz = (1 / (2 * Math.PI)) * Math.sqrt(Math.max(1, kSi) / m);

	const visc = oilCSt(cfg.oilWeight) / 40;
	const arch = archFactor(cfg.damperArch);
	const cc = 2 * Math.sqrt(kSi * m);
	const lsComp = clickOpen(cfg.compressionClicks, cfg.clickRange);
	const lsReb = clickOpen(cfg.reboundClicks, cfg.clickRange);
	const hsComp = clickOpen(cfg.hscClicks, cfg.clickRange);
	const hsReb = clickOpen(cfg.hsrClicks, cfg.clickRange);
	const compressionDampingNsPerM = cc * (0.18 + 0.35 * visc * arch * (0.65 * lsComp + 0.35 * hsComp));
	const reboundDampingNsPerM = cc * (0.32 + 0.55 * visc * arch * (0.7 * lsReb + 0.3 * hsReb));
	const compressionZeta = cc > 1 ? compressionDampingNsPerM / cc : 0;
	const reboundZeta = cc > 1 ? reboundDampingNsPerM / cc : 0;

	const lo = isFront ? 26 : 24;
	const hi = isFront ? 34 : 33;
	const sagStatus: EndResults['sagStatus'] =
		riderSagPct < lo - 4 ? 'stiff' : riderSagPct > hi + 4 ? 'soft' : 'ok';
	const fLo = isFront ? 1.6 : 1.8;
	const fHi = isFront ? 2.4 : 2.6;
	const freqStatus: EndResults['freqStatus'] =
		naturalFreqHz < fLo ? 'low' : naturalFreqHz > fHi ? 'high' : 'ok';

	return {
		sprungKg,
		staticSprungKg,
		loadAtUnitN: load,
		staticLoadAtUnitN: staticLoad,
		wheelRateNPerMm: wheelRate,
		unitRateNPerMm: unitRate,
		riderSagMm,
		riderSagPct,
		staticSagMm,
		staticSagPct,
		preloadToTargetMm: clamp(preloadToTargetMm, 0, 40),
		recommendedRateNPerMm,
		naturalFreqHz,
		compressionDampingNsPerM,
		reboundDampingNsPerM,
		compressionZeta,
		reboundZeta,
		forceAtSagN: springForceN(cfg, geo, riderSagMm),
		forceAtBottomN: springForceN(cfg, geo, travel),
		bottomOut: riderSagMm >= travel - 0.5,
		sagStatus,
		freqStatus,
	};
}

export function forceCurve(cfg: EndSuspension, geo: EndGeometry, steps = 48): CurvePt[] {
	const travel = Math.max(1, geo.unitTravelMm);
	const pts: CurvePt[] = [];
	for (let i = 0; i <= steps; i++) {
		const x = (i / steps) * travel;
		pts.push({ x, f: springForceN(cfg, geo, x) });
	}
	return pts;
}

/** 1-DOF release from a bump on top of rider sag. Displacement is unit stroke in mm. */
export function stepResponse(
	cfg: EndSuspension,
	geo: EndGeometry,
	results: EndResults,
	bumpMm = 40,
	seconds = 1.6,
): StepPt[] {
	if (geo.solid) return [{ t: 0, x: 0 }];
	const m = Math.max(5, results.sprungKg);
	const cComp = Math.max(20, results.compressionDampingNsPerM);
	const cReb = Math.max(20, results.reboundDampingNsPerM);
	const travel = Math.max(1, geo.unitTravelMm);
	const eq = results.riderSagMm;
	let x = clamp(eq + bumpMm, 0, travel) / 1000;
	let v = 0;
	const dt = 0.002;
	const n = Math.max(2, Math.round(seconds / dt));
	const out: StepPt[] = [];
	const eqM = eq / 1000;
	function acc(xm: number, vm: number): number {
		const strokeMm = clamp(xm * 1000, 0, travel);
		const F = springForceN(cfg, geo, strokeMm) - results.loadAtUnitN;
		const c = vm < 0 ? cReb : cComp;
		return (-F - c * vm) / m;
	}
	for (let i = 0; i <= n; i++) {
		if (i % 4 === 0) out.push({ t: i * dt, x: x * 1000 - eq });
		const k1x = v;
		const k1v = acc(x, v);
		const k2x = v + 0.5 * dt * k1v;
		const k2v = acc(x + 0.5 * dt * k1x, v + 0.5 * dt * k1v);
		const k3x = v + 0.5 * dt * k2v;
		const k3v = acc(x + 0.5 * dt * k2x, v + 0.5 * dt * k2v);
		const k4x = v + dt * k3v;
		const k4v = acc(x + dt * k3x, v + dt * k3v);
		x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
		v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
		if (x < 0) { x = 0; v = 0; }
		if (x > travel / 1000) { x = travel / 1000; v = Math.min(0, v); }
		if (Math.abs(x - eqM) < 0.0002 && Math.abs(v) < 0.02 && i > 80) {
			out.push({ t: i * dt, x: 0 });
			break;
		}
	}
	return out;
}

export function applyTunePreset(design: SuspensionDesign, preset: TunePreset): void {
	const p = tunePresets.find((t) => t.value === preset);
	if (!p) return;
	design.front.targetRiderSagPct = p.frontSag;
	design.rear.targetRiderSagPct = p.rearSag;
	design.front.oilWeight = p.frontOil;
	design.rear.oilWeight = p.rearOil;
	design.front.compressionClicks = p.compOut;
	design.rear.compressionClicks = p.compOut;
	design.front.reboundClicks = p.rebOut;
	design.rear.reboundClicks = p.rebOut;
	design.front.hscClicks = p.compOut;
	design.rear.hscClicks = p.compOut;
	design.front.hsrClicks = p.rebOut;
	design.rear.hsrClicks = p.rebOut;
}

export function applyRecommendedRate(cfg: EndSuspension, recommendedNPerMm: number, catalog: { nPerMm: number }[]): void {
	let best = recommendedNPerMm;
	let bestD = Infinity;
	for (const c of catalog) {
		const d = Math.abs(c.nPerMm - recommendedNPerMm);
		if (d < bestD) {
			bestD = d;
			best = c.nPerMm;
		}
	}
	cfg.rateNPerMm = best;
}

export function mergeEnd(raw: unknown, fallback: EndSuspension): EndSuspension {
	if (!raw || typeof raw !== 'object') return { ...fallback };
	const r = raw as Record<string, unknown>;
	const num = (k: keyof EndSuspension, d: number) =>
		typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? (r[k] as number) : d;
	const str = <T extends string>(k: string, d: T, allow: T[]): T =>
		typeof r[k] === 'string' && (allow as string[]).includes(r[k] as string) ? (r[k] as T) : d;
	return {
		springKind: str('springKind', fallback.springKind, ['coil_linear', 'coil_progressive', 'coil_dual_rate', 'air']),
		damperArch: str('damperArch', fallback.damperArch, [
			'damper_rod', 'cartridge', 'closed_cartridge', 'electronic',
			'emulsion', 'ifp', 'piggyback', 'remote_reservoir',
		]),
		unitCount: num('unitCount', fallback.unitCount),
		rateNPerMm: num('rateNPerMm', fallback.rateNPerMm),
		rate2NPerMm: num('rate2NPerMm', fallback.rate2NPerMm),
		crossoverMm: num('crossoverMm', fallback.crossoverMm),
		preloadMm: num('preloadMm', fallback.preloadMm),
		threadPitchMm: num('threadPitchMm', fallback.threadPitchMm),
		airPressureBar: num('airPressureBar', fallback.airPressureBar),
		airCanVolumeCc: num('airCanVolumeCc', fallback.airCanVolumeCc),
		oilWeight: str('oilWeight', fallback.oilWeight, ['2.5', '5', '7.5', '10', '15', '20']),
		oilLevelMm: num('oilLevelMm', fallback.oilLevelMm),
		clickRange: num('clickRange', fallback.clickRange),
		compressionClicks: num('compressionClicks', fallback.compressionClicks),
		reboundClicks: num('reboundClicks', fallback.reboundClicks),
		hscClicks: num('hscClicks', fallback.hscClicks),
		hsrClicks: num('hsrClicks', fallback.hsrClicks),
		nitrogenBar: num('nitrogenBar', fallback.nitrogenBar),
		includeAirAssist: typeof r.includeAirAssist === 'boolean' ? r.includeAirAssist : fallback.includeAirAssist,
		targetRiderSagPct: num('targetRiderSagPct', fallback.targetRiderSagPct),
		targetStaticSagPct: num('targetStaticSagPct', fallback.targetStaticSagPct),
	};
}

export function mergeDesign(raw: unknown): SuspensionDesign {
	const d = defaultSuspensionDesign();
	if (!raw || typeof raw !== 'object') return d;
	const r = raw as Record<string, unknown>;
	const num = (k: string, fb: number) =>
		typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? (r[k] as number) : fb;
	d.bikeMassKg = num('bikeMassKg', d.bikeMassKg);
	d.riderMassKg = num('riderMassKg', d.riderMassKg);
	d.cargoMassKg = num('cargoMassKg', d.cargoMassKg);
	d.frontWeightPct = num('frontWeightPct', d.frontWeightPct);
	d.unsprungFrontKg = num('unsprungFrontKg', d.unsprungFrontKg);
	d.unsprungRearKg = num('unsprungRearKg', d.unsprungRearKg);
	if (r.showPose === 'extend' || r.showPose === 'static' || r.showPose === 'rider' || r.showPose === 'bump') {
		d.showPose = r.showPose;
	}
	d.front = mergeEnd(r.front, d.front);
	d.rear = mergeEnd(r.rear, d.rear);
	return d;
}

export function frontTypeLabel(type: string): string {
	switch (type) {
		case 'telescopic': return 'Telescopic fork';
		case 'leading_link': return 'Leading link';
		case 'trailing_link': return 'Trailing link';
		default: return type;
	}
}

export function rearTypeLabel(type: string): string {
	switch (type) {
		case 'hardtail': return 'Hardtail (no rear spring)';
		case 'twin_shock': return 'Twin-shock swingarm';
		case 'cantilever': return 'Triangulated cantilever';
		case 'softail': return 'Softail';
		case 'linkage': return 'Linkage monoshock';
		default: return type;
	}
}

export function hasHighSpeed(arch: DamperArch): boolean {
	return arch === 'closed_cartridge' || arch === 'piggyback' || arch === 'remote_reservoir' || arch === 'electronic';
}
