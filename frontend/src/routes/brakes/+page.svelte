<script lang="ts">
	import {
		computeBraking,
		defaultFrontBrake,
		defaultRearBrake,
		defaultVehicleParams,
		type BrakeParams,
		type VehicleParams,
		type BrakingResults,
	} from '$lib/braking';
	import {
		saveVehicleDesign,
		loadVehicleDesign,
		getLastFileName,
		type VehicleDesign,
	} from '$lib/vehicleStore';
	import { browser } from '$app/environment';

	// ── Unit conversion helpers ──
	const MM_PER_INCH = 25.4;
	const KG_PER_LB = 0.453592;
	const N_PER_LBF = 4.44822;
	const KPH_PER_MPH = 1.60934;

	function mmToIn(mm: number): number { return mm / MM_PER_INCH; }
	function inToMm(inch: number): number { return inch * MM_PER_INCH; }
	function kgToLb(kg: number): number { return kg / KG_PER_LB; }
	function lbToKg(lb: number): number { return lb * KG_PER_LB; }
	function nToLbf(n: number): number { return n / N_PER_LBF; }
	function lbfToN(lbf: number): number { return lbf * N_PER_LBF; }
	function kphToMph(kph: number): number { return kph / KPH_PER_MPH; }
	function mphToKph(mph: number): number { return mph * KPH_PER_MPH; }

	// ── Vehicle Save/Load ──
	let vehicleName = $state(browser ? getLastFileName() : 'my_bike');

	function handleSave() {
		const design: VehicleDesign = {
			name: vehicleName,
			version: 1,
			savedAt: new Date().toISOString(),
			brakes: {
				frontBrake: { ...frontBrake },
				rearBrake: { ...rearBrake },
				vehicle: { ...vehicle },
			},
		};
		saveVehicleDesign(design);
	}

	async function handleLoad() {
		const design = await loadVehicleDesign();
		if (!design) return;
		vehicleName = design.name;
		if (design.brakes) {
			frontBrake = { ...defaultFrontBrake(), ...design.brakes.frontBrake } as BrakeParams;
			rearBrake = { ...defaultRearBrake(), ...design.brakes.rearBrake } as BrakeParams;
			vehicle = { ...defaultVehicleParams(), ...design.brakes.vehicle } as VehicleParams;
		}
	}

	// ── Brake Parameters ──
	let frontBrake = $state<BrakeParams>(defaultFrontBrake());
	let rearBrake = $state<BrakeParams>(defaultRearBrake());
	let vehicle = $state<VehicleParams>(defaultVehicleParams());

	// ── Control Inputs ──
	let frontLeverForceN = $state(150);
	let rearPedalForceN = $state(80);
	let linked = $state(false);
	let linkRatio = $state(0.7);
	let initialSpeedKph = $state(100);

	// ── Real-time simulation state ──
	let results = $state<BrakingResults | null>(null);
	let simRunning = $state(false);
	let simPaused = $state(false);
	let simSpeedMs = $state(0);
	let simDistanceM = $state(0);
	let simTimeS = $state(0);
	let simDecelG = $state(0);
	let simPitchDeg = $state(0);
	let simFrontSlip = $state(false);
	let simRearSlip = $state(false);
	let simFrontLoad = $state(0);
	let simRearLoad = $state(0);
	let lastTimestamp: number | null = null;
	let animationId: number | null = null;

	// Wheel rotation angle (degrees) — accumulated from rolling
	let frontWheelAngleDeg = $state(0);
	let rearWheelAngleDeg = $state(0);

	// Road offset for motion markers
	let roadOffset = $state(0);

	// Pitch animation — eases toward target instead of snapping
	let simPitchTarget = $state(0);  // target pitch from physics
	let simPitchVel = $state(0);     // angular velocity for smooth transition

	// Brake mode: 'both' | 'front' | 'rear'
	let brakeMode = $state<'both' | 'front' | 'rear'>('both');

	// Whether brakes have been applied during this sim run
	let brakesApplied = $state(false);

	// Braking-phase metrics (from brake application to stop)
	let peakDecelG = $state(0);
	let brakingDistanceM = $state(0);
	let brakingTimeS = $state(0);

	// ── Thermal load calculation ──
	// KE = 0.5 * m * v², distributed by braking force ratio per rotor
	let frontRotorKJ = $derived.by(() => {
		if (!results) return 0;
		const totalForce = results.frontBrakeForceN + results.rearBrakeForceN;
		if (totalForce <= 0) return 0;
		const ke = 0.5 * vehicle.totalMassKg * (initialSpeedKph / 3.6) ** 2;
		const frontShare = results.frontBrakeForceN / totalForce;
		const rotors = frontBrake.dualSided ? 2 : 1;
		return (ke * frontShare / rotors) / 1000; // kJ per rotor
	});
	let rearRotorKJ = $derived.by(() => {
		if (!results) return 0;
		const totalForce = results.frontBrakeForceN + results.rearBrakeForceN;
		if (totalForce <= 0) return 0;
		const ke = 0.5 * vehicle.totalMassKg * (initialSpeedKph / 3.6) ** 2;
		const rearShare = results.rearBrakeForceN / totalForce;
		const rotors = rearBrake.dualSided ? 2 : 1;
		return (ke * rearShare / rotors) / 1000; // kJ per rotor
	});

	// ── LLM Feedback ──
	let feedbackLoading = $state(false);
	let feedbackText = $state('');
	let feedbackVisible = $state(false);

	async function requestFeedback() {
		if (!browser) return;
		const apiKey = localStorage.getItem('openai_api_key') || '';
		const model = localStorage.getItem('openai_model') || 'gpt-4o';
		if (!apiKey) {
			feedbackText = 'No API key configured. Go to Settings to enter your OpenAI API key.';
			feedbackVisible = true;
			return;
		}

		const snapshot = {
			vehicle,
			frontBrake,
			rearBrake,
			brakeMode,
			frontLeverForceN,
			rearPedalForceN,
			initialSpeedKph,
			linked,
			linkRatio,
			results,
			peakDecelG,
			brakingDistanceM,
			brakingTimeS,
			frontRotorKJ,
			rearRotorKJ,
		};

		const prompt = `You are an expert motorcycle dynamics engineer. Analyze this braking system configuration for a recumbent motorcycle prototype and provide concise feedback on:
1. Whether the deceleration and stopping distance are realistic
2. Brake balance (front vs rear contribution)
3. Thermal concerns (energy per rotor)
4. Tire grip assumptions — are they realistic for the intended use?
5. Any safety concerns or recommendations

Vehicle & brake parameters:\n${JSON.stringify(snapshot, null, 2)}`;

		feedbackLoading = true;
		feedbackVisible = true;
		feedbackText = 'Requesting analysis...';

		try {
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [{ role: 'user', content: prompt }],
					max_tokens: 1000,
				}),
			});
			if (!res.ok) {
				const err = await res.text();
				feedbackText = `API error (${res.status}): ${err}`;
			} else {
				const data = await res.json();
				feedbackText = data.choices?.[0]?.message?.content || 'No response received.';
			}
		} catch (e: unknown) {
			feedbackText = `Request failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			feedbackLoading = false;
		}
	}

	// ── Computed static results ──
	$effect(() => {
		const effectiveFront = (brakeMode === 'rear') ? 0 : frontLeverForceN;
		const effectiveRear = (brakeMode === 'front') ? 0 : rearPedalForceN;
		results = computeBraking({
			frontBrake,
			rearBrake,
			vehicle,
			frontLeverForceN: effectiveFront,
			rearPedalForceN: effectiveRear,
			linked,
			linkRatio,
		});
	});

	// ── Real-time simulation loop ──
	const G_CONST = 9.81;

	function startSimulation() {
		simSpeedMs = initialSpeedKph / 3.6;
		simDistanceM = 0;
		simTimeS = 0;
		simDecelG = 0;
		simPitchDeg = 0;
		simPitchTarget = 0;
		simPitchVel = 0;
		simFrontSlip = false;
		simRearSlip = false;
		frontWheelAngleDeg = 0;
		rearWheelAngleDeg = 0;
		roadOffset = 0;
		lastTimestamp = null;
		simRunning = true;
		simPaused = false;
		brakesApplied = false;
		animationId = requestAnimationFrame(tick);
	}

	function applyBrakes() {
		if (!simRunning) return;
		brakesApplied = true;
		peakDecelG = 0;
		brakingDistanceM = 0;
		brakingTimeS = 0;
	}

	function tick(timestamp: number) {
		if (!simRunning || simPaused) return;

		if (lastTimestamp === null) {
			lastTimestamp = timestamp;
			animationId = requestAnimationFrame(tick);
			return;
		}

		const dt = (timestamp - lastTimestamp) / 1000; // real seconds
		lastTimestamp = timestamp;

		if (simSpeedMs <= 0.01) {
			simSpeedMs = 0;
			// Keep animating until pitch settles back to 0
			simPitchTarget = 0;
			const pitchSettleThreshold = 0.05;
			if (Math.abs(simPitchDeg) < pitchSettleThreshold && Math.abs(simPitchVel) < pitchSettleThreshold) {
				simPitchDeg = 0;
				simPitchVel = 0;
				simRunning = false;
				return;
			}
			// Still settling — animate pitch only
			const pitchStiffness = 12;
			const pitchDamping = 6;
			const pitchError = simPitchTarget - simPitchDeg;
			simPitchVel += (pitchStiffness * pitchError - pitchDamping * simPitchVel) * dt;
			simPitchDeg += simPitchVel * dt;
			animationId = requestAnimationFrame(tick);
			return;
		}

		let decel = 0;

		if (brakesApplied) {
			// Compute braking forces with current brake mode
			const effectiveFront = (brakeMode === 'rear') ? 0 : frontLeverForceN;
			const effectiveRear = (brakeMode === 'front') ? 0 : rearPedalForceN;
			const r = computeBraking({
				frontBrake, rearBrake, vehicle,
				frontLeverForceN: effectiveFront,
				rearPedalForceN: effectiveRear,
				linked, linkRatio,
			});

			// Limit deceleration by tire grip
			const totalWeight = vehicle.totalMassKg * G_CONST;
			const wt = (vehicle.totalMassKg * r.decelerationMs2 * vehicle.cogHeightMm) / vehicle.wheelbaseMm;
			const frontLoad = totalWeight * (1 - vehicle.cogPositionPct / 100) + wt;
			const rearLoad = Math.max(0, totalWeight * (vehicle.cogPositionPct / 100) - wt);

			const maxFront = frontLoad * vehicle.frontTireGrip;
			const maxRear = rearLoad * vehicle.rearTireGrip;
			const effFrontForce = Math.min(r.frontBrakeForceN, maxFront);
			const effRearForce = Math.min(r.rearBrakeForceN, maxRear);
			decel = (effFrontForce + effRearForce) / vehicle.totalMassKg;

			simDecelG = decel / G_CONST;
			simFrontSlip = r.frontBrakeForceN > maxFront;
			simRearSlip = r.rearBrakeForceN > maxRear;
			simFrontLoad = frontLoad;
			simRearLoad = rearLoad;

			// Target pitch angle (physics says it should be here)
			simPitchTarget = Math.atan2(wt, totalWeight) * (180 / Math.PI);
		} else {
			// Cruising — no brakes, no decel
			simDecelG = 0;
			simFrontSlip = false;
			simRearSlip = false;
			simPitchTarget = 0;
		}

		// Animate pitch with spring-damper (inertia)
		const pitchStiffness = 12;  // how quickly it responds (rad/s²-ish)
		const pitchDamping = 6;     // damping to prevent oscillation
		const pitchError = simPitchTarget - simPitchDeg;
		simPitchVel += (pitchStiffness * pitchError - pitchDamping * simPitchVel) * dt;
		simPitchDeg += simPitchVel * dt;

		// Integrate
		simSpeedMs = Math.max(0, simSpeedMs - decel * dt);
		const distStep = simSpeedMs * dt;
		simDistanceM += distStep;
		simTimeS += dt;

		// Track braking-phase metrics
		if (brakesApplied) {
			brakingDistanceM += distStep;
			brakingTimeS += dt;
			if (simDecelG > peakDecelG) peakDecelG = simDecelG;
		}

		// Wheel rotation: distance / radius → radians → degrees
		// Negative because wheels roll clockwise (top moves backward) for forward travel
		const frontRadM = vehicle.frontTireRadiusMm / 1000;
		const rearRadM = vehicle.rearTireRadiusMm / 1000;
		frontWheelAngleDeg -= (distStep / frontRadM) * (180 / Math.PI);
		rearWheelAngleDeg -= (distStep / rearRadM) * (180 / Math.PI);

		// Road offset for motion markers — negate so markers scroll right (ground moves right relative to rightward-traveling bike's visual)
		roadOffset = (roadOffset - distStep * scale * 1000) % roadMarkerSpacing;
		if (roadOffset < 0) roadOffset += roadMarkerSpacing;

		animationId = requestAnimationFrame(tick);
	}

	function pauseSimulation() {
		simPaused = !simPaused;
		if (!simPaused) {
			lastTimestamp = null;
			animationId = requestAnimationFrame(tick);
		}
	}

	function resetSimulation() {
		simRunning = false;
		simPaused = false;
		brakesApplied = false;
		simSpeedMs = 0;
		simDistanceM = 0;
		simTimeS = 0;
		simDecelG = 0;
		simPitchDeg = 0;
		simPitchTarget = 0;
		simPitchVel = 0;
		peakDecelG = 0;
		brakingDistanceM = 0;
		brakingTimeS = 0;
		frontWheelAngleDeg = 0;
		rearWheelAngleDeg = 0;
		roadOffset = 0;
		if (animationId) cancelAnimationFrame(animationId);
	}

	// ── SVG auto-scaling ──
	// Vehicle extent in mm: from front contact patch to rear contact patch = wheelbase
	// Height: max of (tire radius, cog height) + margin
	const svgWidth = 800;
	const svgHeight = 450;
	const spokeCount = 8;
	const roadMarkerSpacing = 40;

	// Auto-scale: vehicle should fill ~80% of the canvas width
	let vehicleWidthMm = $derived(vehicle.wheelbaseMm + vehicle.frontTireRadiusMm + vehicle.rearTireRadiusMm);
	let vehicleHeightMm = $derived(Math.max(vehicle.cogHeightMm + 100, vehicle.frontTireRadiusMm * 2, vehicle.rearTireRadiusMm * 2));
	let scale = $derived(Math.min(
		(svgWidth * 0.8) / vehicleWidthMm,
		(svgHeight * 0.7) / vehicleHeightMm,
	));
	let groundY = $derived(svgHeight - 40);

	function mmToPx(mm: number): number { return mm * scale; }

	// Derived positions — center the bike horizontally
	let bikeWidthPx = $derived(mmToPx(vehicle.wheelbaseMm));
	let frontWheelX = $derived((svgWidth - bikeWidthPx) / 2);
	let rearWheelX = $derived(frontWheelX + bikeWidthPx);
	let frontWheelR = $derived(mmToPx(vehicle.frontTireRadiusMm));
	let rearWheelR = $derived(mmToPx(vehicle.rearTireRadiusMm));
	let frontDiscR = $derived(mmToPx(frontBrake.discDiameterMm / 2));
	let rearDiscR = $derived(mmToPx(rearBrake.discDiameterMm / 2));
	let cogX = $derived(frontWheelX + mmToPx(vehicle.wheelbaseMm * (1 - vehicle.cogPositionPct / 100)));
	let cogY = $derived(groundY - mmToPx(vehicle.cogHeightMm));

	// Generate spoke path data for a wheel
	function spokeLines(cx: number, cy: number, r: number, angleDeg: number): string[] {
		const lines: string[] = [];
		for (let i = 0; i < spokeCount; i++) {
			const a = ((angleDeg + i * (360 / spokeCount)) * Math.PI) / 180;
			const x2 = cx + Math.cos(a) * r * 0.85;
			const y2 = cy + Math.sin(a) * r * 0.85;
			lines.push(`M${cx},${cy} L${x2},${y2}`);
		}
		return lines;
	}

	// Road markers
	function getRoadMarkers(): number[] {
		const markers: number[] = [];
		for (let x = -roadMarkerSpacing; x < svgWidth + roadMarkerSpacing; x += roadMarkerSpacing) {
			markers.push(x - roadOffset);
		}
		return markers;
	}

	let roadMarkers = $derived(getRoadMarkers());
</script>

<div class="space-y-4">
	<!-- Header row: title + description + vehicle save/load -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
		<h2 class="text-2xl font-bold whitespace-nowrap">Braking System</h2>
		<p class="text-gray-400 text-sm">
			Define brake parameters, simulate real-time braking dynamics with weight transfer and tire grip limits.
		</p>
		<div class="ml-auto flex items-center gap-2">
			<input type="text" bind:value={vehicleName}
				class="w-36 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 focus:border-orange-500 focus:outline-none"
				placeholder="vehicle name" />
			<button onclick={handleSave}
				class="px-3 py-1 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors">
				Save
			</button>
			<button onclick={handleLoad}
				class="px-3 py-1 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors">
				Load
			</button>
		</div>
	</div>

	<div class="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
		<!-- LEFT: Diagram + Simulation -->
		<div class="space-y-4">
			<!-- Side-view schematic -->
			<section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide">Side View — Braking Dynamics</h3>
					<button onclick={requestFeedback} disabled={feedbackLoading}
						class="px-3 py-1 text-xs font-medium rounded bg-indigo-700 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50">
						{feedbackLoading ? '⏳ Analyzing...' : '💡 Feedback'}
					</button>
				</div>
				<svg viewBox="0 0 {svgWidth} {svgHeight}" class="w-full h-auto bg-gray-950 rounded-lg border border-gray-800">
					<defs>
						<marker id="arrowGreen" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
							<path d="M0,0 L6,3 L0,6 Z" fill="#22c55e" />
						</marker>
						<marker id="dimTick" markerWidth="1" markerHeight="6" refX="0.5" refY="3" orient="auto">
							<line x1="0.5" y1="0" x2="0.5" y2="6" stroke="#555" stroke-width="1" />
						</marker>
					</defs>

					<!-- Road surface -->
					<line x1="0" y1={groundY} x2={svgWidth} y2={groundY} stroke="#666" stroke-width="1.5" />
					<!-- Road motion markers (scroll left during braking) -->
					{#each roadMarkers as mx}
						<line x1={mx} y1={groundY + 2} x2={mx} y2={groundY + 12}
							stroke="#444" stroke-width="2" />
					{/each}

					<!-- WHEELS — stay on ground, not affected by pitch -->
					<!-- FRONT WHEEL -->
					<circle cx={frontWheelX} cy={groundY - frontWheelR} r={frontWheelR}
						fill="none" stroke="#aaa" stroke-width="2.5" />
					<circle cx={frontWheelX} cy={groundY - frontWheelR} r={frontWheelR - 5}
						fill="none" stroke="#555" stroke-width="5" opacity="0.3" />
					{#each spokeLines(frontWheelX, groundY - frontWheelR, frontWheelR, frontWheelAngleDeg) as d}
						<path {d} stroke="#777" stroke-width="1.5" fill="none" />
					{/each}
					<circle cx={frontWheelX} cy={groundY - frontWheelR} r="4" fill="#f97316" />
					<!-- Front disc rotor -->
					<circle cx={frontWheelX} cy={groundY - frontWheelR} r={frontDiscR}
						fill="none" stroke="#ef4444" stroke-width="2.5" opacity="0.8" />
					<rect x={frontWheelX + frontDiscR - 6} y={groundY - frontWheelR - 8}
						width="12" height="16" rx="2" fill="#ef4444" opacity="0.6" />

					<!-- REAR WHEEL -->
					<circle cx={rearWheelX} cy={groundY - rearWheelR} r={rearWheelR}
						fill="none" stroke="#aaa" stroke-width="2.5" />
					<circle cx={rearWheelX} cy={groundY - rearWheelR} r={rearWheelR - 5}
						fill="none" stroke="#555" stroke-width="5" opacity="0.3" />
					{#each spokeLines(rearWheelX, groundY - rearWheelR, rearWheelR, rearWheelAngleDeg) as d}
						<path {d} stroke="#777" stroke-width="1.5" fill="none" />
					{/each}
					<circle cx={rearWheelX} cy={groundY - rearWheelR} r="4" fill="#f97316" />
					<!-- Rear disc rotor -->
					<circle cx={rearWheelX} cy={groundY - rearWheelR} r={rearDiscR}
						fill="none" stroke="#ef4444" stroke-width="2" opacity="0.8" />
					<rect x={rearWheelX + rearDiscR - 5} y={groundY - rearWheelR - 6}
						width="10" height="12" rx="2" fill="#ef4444" opacity="0.5" />

					<!-- CHASSIS — pitches around midpoint between axles at axle height -->
					<g transform="rotate({-simPitchDeg}, {(frontWheelX + rearWheelX) / 2}, {groundY - (frontWheelR + rearWheelR) / 2})">
						<!-- FRAME (triangle) -->
						<polygon
							points="{frontWheelX},{groundY - frontWheelR - 20} {rearWheelX},{groundY - rearWheelR - 10} {cogX},{cogY - 20}"
							fill="none" stroke="#6b7280" stroke-width="2" />

						<!-- Swingarm -->
						<line x1={cogX + 30} y1={groundY - mmToPx(vehicle.cogHeightMm * 0.5)}
							x2={rearWheelX} y2={groundY - rearWheelR}
							stroke="#6b7280" stroke-width="3" />

						<!-- Fork -->
						<line x1={frontWheelX} y1={groundY - frontWheelR}
							x2={frontWheelX + 15} y2={groundY - frontWheelR - 80}
							stroke="#6b7280" stroke-width="3" />
						<line x1={frontWheelX + 15} y1={groundY - frontWheelR - 80}
							x2={cogX - 20} y2={cogY - 10}
							stroke="#6b7280" stroke-width="2" />

						<!-- CoG marker -->
						<circle cx={cogX} cy={cogY} r="6" fill="#f97316" opacity="0.8" />
						<text x={cogX + 10} y={cogY - 5} fill="#f97316" font-size="10">CoG</text>

						<!-- Weight transfer arrow -->
						{#if results && results.weightTransferN > 50}
							<line x1={cogX} y1={cogY + 10} x2={frontWheelX + 20} y2={groundY - frontWheelR - 30}
								stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowGreen)" opacity="0.7" />
						{/if}
					</g>

					<!-- Wheelbase dimension (not pitched) -->
					<line x1={frontWheelX} y1={groundY + 20} x2={rearWheelX} y2={groundY + 20}
						stroke="#555" stroke-width="0.5" marker-start="url(#dimTick)" marker-end="url(#dimTick)" />
					<text x={(frontWheelX + rearWheelX) / 2} y={groundY + 35}
						fill="#888" font-size="9" text-anchor="middle">
						WB: {vehicle.wheelbaseMm}mm ({mmToIn(vehicle.wheelbaseMm).toFixed(1)}")
					</text>

					<!-- Disc labels (not pitched) -->
					<text x={frontWheelX} y={groundY - frontWheelR - frontDiscR - 12}
						fill="#ef4444" font-size="9" text-anchor="middle">
						Ø{frontBrake.discDiameterMm} / {frontBrake.numberOfPots}-pot
					</text>
					<text x={rearWheelX} y={groundY - rearWheelR - rearDiscR - 12}
						fill="#ef4444" font-size="9" text-anchor="middle">
						Ø{rearBrake.discDiameterMm} / {rearBrake.numberOfPots}-pot
					</text>

					<!-- Thermal load per rotor (above wheels) -->
					{#if results && (results.frontBrakeForceN + results.rearBrakeForceN) > 0}
						<title>Peak thermal energy absorbed per rotor during a full stop from {initialSpeedKph} km/h</title>
						<text x={frontWheelX} y={groundY - frontWheelR * 2 - 22}
							fill="#fbbf24" font-size="9" text-anchor="middle" class="cursor-help">
							{frontBrake.dualSided ? `L: ${frontRotorKJ.toFixed(0)} kJ  R: ${frontRotorKJ.toFixed(0)} kJ` : `Rotor: ${frontRotorKJ.toFixed(0)} kJ`}
						</text>
						<text x={rearWheelX} y={groundY - rearWheelR * 2 - 22}
							fill="#fbbf24" font-size="9" text-anchor="middle" class="cursor-help">
							{rearBrake.dualSided ? `L: ${rearRotorKJ.toFixed(0)} kJ  R: ${rearRotorKJ.toFixed(0)} kJ` : `Rotor: ${rearRotorKJ.toFixed(0)} kJ`}
						</text>
					{/if}

					<!-- HUD overlay -->
					{#if simRunning || simTimeS > 0}
						<rect x="8" y="8" width="250" height={simFrontSlip || simRearSlip ? 105 : 85} rx="4" fill="#000" opacity="0.6" />
						<text x="15" y="26" fill="#e5e7eb" font-size="12" font-family="monospace">
							Speed: {(simSpeedMs * 3.6).toFixed(1)} km/h ({(simSpeedMs * 2.237).toFixed(1)} mph)
						</text>
						<text x="15" y="43" fill="#e5e7eb" font-size="12" font-family="monospace">
							Peak Decel: {peakDecelG.toFixed(2)} G
						</text>
						<text x="15" y="60" fill="#e5e7eb" font-size="12" font-family="monospace">
							Stop Dist: {brakingDistanceM.toFixed(1)} m ({(brakingDistanceM * 3.281).toFixed(1)} ft)
						</text>
						<text x="15" y="77" fill="#e5e7eb" font-size="12" font-family="monospace">
							Brake Time: {brakingTimeS.toFixed(2)} s
						</text>
						{#if simFrontSlip}
							<text x="15" y="96" fill="#ef4444" font-size="11" font-weight="bold">⚠ FRONT LOCKUP</text>
						{/if}
						{#if simRearSlip}
							<text x="15" y={simFrontSlip ? 110 : 96} fill="#ef4444" font-size="11" font-weight="bold">⚠ REAR LOCKUP</text>
						{/if}
					{/if}
				</svg>
			</section>

			<!-- Simulation controls — single compact row -->
			<section class="rounded-xl border border-gray-800 bg-gray-900 p-3">
				<div class="flex flex-wrap items-center gap-2">
					<!-- Speed input -->
					<label class="text-xs text-gray-400">
						<input type="number" bind:value={initialSpeedKph} min="10" max="300" step="5"
							class="w-14 rounded bg-gray-800 border border-gray-700 px-1.5 py-1 text-xs text-gray-100" />
						<span class="text-[10px] text-gray-500">km/h</span>
					</label>

					<!-- Transport controls -->
					<button onclick={startSimulation}
						class="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium transition-colors">
						▶ Start
					</button>
					<button onclick={pauseSimulation} disabled={!simRunning}
						class="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors disabled:opacity-40">
						{simPaused ? '▶ Resume' : '⏸ Pause'}
					</button>
					<button onclick={resetSimulation}
						class="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors">
						⏹ Reset
					</button>

					<span class="border-l border-gray-700 h-6"></span>

					<!-- Brake mode selection -->
					<button onclick={() => { brakeMode = 'front'; }}
						class="px-2 py-1 rounded text-xs font-medium transition-colors
						{brakeMode === 'front' ? 'bg-gray-600 text-white ring-1 ring-gray-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
						Front
					</button>
					<button onclick={() => { brakeMode = 'rear'; }}
						class="px-2 py-1 rounded text-xs font-medium transition-colors
						{brakeMode === 'rear' ? 'bg-gray-600 text-white ring-1 ring-gray-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
						Rear
					</button>
					<button onclick={() => { brakeMode = 'both'; }}
						class="px-2 py-1 rounded text-xs font-medium transition-colors
						{brakeMode === 'both' ? 'bg-gray-600 text-white ring-1 ring-gray-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
						Both
					</button>

					<span class="border-l border-gray-700 h-6"></span>

					<!-- APPLY BRAKES button -->
					<button onclick={applyBrakes} disabled={!simRunning || brakesApplied}
						class="px-4 py-1.5 rounded text-xs font-bold transition-colors
						{brakesApplied ? 'bg-red-900 text-red-300 ring-1 ring-red-500' : 'bg-red-700 hover:bg-red-600 text-white'}
						disabled:opacity-40">
						{brakesApplied ? '🛑 Braking' : '🛑 Apply Brakes'}
					</button>

					<!-- Linked option -->
					<label class="flex items-center gap-1 text-xs text-gray-400 ml-2">
						<input type="checkbox" bind:checked={linked}
							class="rounded border-gray-600 bg-gray-800 w-3 h-3" />
						Linked
					</label>
					{#if linked}
						<input type="number" bind:value={linkRatio} min="0" max="1" step="0.05"
							class="w-12 rounded bg-gray-800 border border-gray-700 px-1 py-0.5 text-xs text-gray-100" />
					{/if}
				</div>

				<!-- Lever force sliders -->
				<div class="flex gap-4 mt-2">
					<label class="text-xs text-gray-400" class:opacity-40={brakeMode === 'rear'}>
						Front (N):
						<input type="range" bind:value={frontLeverForceN} min="0" max="400" step="5"
							class="ml-1 w-24 align-middle" disabled={brakeMode === 'rear'} />
						<span class="ml-1 text-gray-200 font-mono text-[10px]">{frontLeverForceN}</span>
					</label>
					<label class="text-xs text-gray-400" class:opacity-40={brakeMode === 'front'}>
						Rear (N):
						<input type="range" bind:value={rearPedalForceN} min="0" max="300" step="5"
							class="ml-1 w-24 align-middle" disabled={brakeMode === 'front'} />
						<span class="ml-1 text-gray-200 font-mono text-[10px]">{rearPedalForceN}</span>
					</label>
				</div>
			</section>

			<!-- Results readout -->
			{#if results}
				<section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
					<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Braking Results</h3>
					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Deceleration</div>
							<div class="text-lg font-bold text-orange-400">{results.decelerationG.toFixed(2)} G</div>
							<div class="text-gray-500 text-xs">{results.decelerationMs2.toFixed(1)} m/s²</div>
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Stopping (100→0)</div>
							<div class="text-lg font-bold text-orange-400">{results.stoppingDistanceM.toFixed(1)} m</div>
							<div class="text-gray-500 text-xs">{(results.stoppingDistanceM * 3.281).toFixed(0)} ft / {results.stoppingTimeS.toFixed(2)} s</div>
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Weight Transfer</div>
							<div class="text-lg font-bold text-green-400">{results.weightTransferN.toFixed(0)} N</div>
							<div class="text-gray-500 text-xs">{nToLbf(results.weightTransferN).toFixed(1)} lbf → Front</div>
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Axle Loads</div>
							<div class="text-xs text-gray-300">F: {results.frontAxleLoadN.toFixed(0)} N ({nToLbf(results.frontAxleLoadN).toFixed(0)} lbf)</div>
							<div class="text-xs text-gray-300">R: {results.rearAxleLoadN.toFixed(0)} N ({nToLbf(results.rearAxleLoadN).toFixed(0)} lbf)</div>
							{#if results.frontLockup}<span class="text-xs text-red-400 font-bold">⚠ Front lockup</span>{/if}
							{#if results.rearLockup}<span class="text-xs text-red-400 font-bold">⚠ Rear lockup</span>{/if}
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Front Torque</div>
							<div class="text-lg font-bold text-gray-200">{results.frontBrakeTorqueNm.toFixed(1)} Nm</div>
							<div class="text-gray-500 text-xs">{(results.frontBrakeTorqueNm * 0.7376).toFixed(1)} ft·lbf</div>
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Rear Torque</div>
							<div class="text-lg font-bold text-gray-200">{results.rearBrakeTorqueNm.toFixed(1)} Nm</div>
							<div class="text-gray-500 text-xs">{(results.rearBrakeTorqueNm * 0.7376).toFixed(1)} ft·lbf</div>
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Front Patch Force</div>
							<div class="text-lg font-bold text-gray-200">{results.frontBrakeForceN.toFixed(0)} N</div>
							<div class="text-gray-500 text-xs">{nToLbf(results.frontBrakeForceN).toFixed(0)} lbf</div>
						</div>
						<div class="bg-gray-800/50 rounded p-3">
							<div class="text-gray-500 text-xs">Rear Patch Force</div>
							<div class="text-lg font-bold text-gray-200">{results.rearBrakeForceN.toFixed(0)} N</div>
							<div class="text-gray-500 text-xs">{nToLbf(results.rearBrakeForceN).toFixed(0)} lbf</div>
						</div>
					</div>
				</section>
			{/if}
		</div>

		<!-- RIGHT: Parameter inputs (dual metric / US columns) -->
		<div class="space-y-4">
			<!-- Column header -->
			<div class="grid grid-cols-[1fr_80px_80px] gap-1 px-4 text-[10px] font-semibold text-gray-500 uppercase">
				<span></span>
				<span class="text-center">Metric</span>
				<span class="text-center">US/Imp</span>
			</div>

			<!-- Vehicle params -->
			<section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
				<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Vehicle Parameters</h3>
				<div class="grid grid-cols-1 gap-2 text-sm">
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Wheelbase</span>
						<input type="number" value={vehicle.wheelbaseMm} oninput={(e) => { vehicle.wheelbaseMm = +e.currentTarget.value; }} step="10"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(vehicle.wheelbaseMm).toFixed(2)} oninput={(e) => { vehicle.wheelbaseMm = inToMm(+e.currentTarget.value); }} step="0.1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">CoG height</span>
						<input type="number" value={vehicle.cogHeightMm} oninput={(e) => { vehicle.cogHeightMm = +e.currentTarget.value; }} step="10"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(vehicle.cogHeightMm).toFixed(2)} oninput={(e) => { vehicle.cogHeightMm = inToMm(+e.currentTarget.value); }} step="0.1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">CoG pos (% front)</span>
						<input type="number" value={vehicle.cogPositionPct} oninput={(e) => { vehicle.cogPositionPct = +e.currentTarget.value; }} min="20" max="80" step="1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Total mass</span>
						<input type="number" value={vehicle.totalMassKg} oninput={(e) => { vehicle.totalMassKg = +e.currentTarget.value; }} step="5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+kgToLb(vehicle.totalMassKg).toFixed(1)} oninput={(e) => { vehicle.totalMassKg = lbToKg(+e.currentTarget.value); }} step="1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Front tire R</span>
						<input type="number" value={vehicle.frontTireRadiusMm} oninput={(e) => { vehicle.frontTireRadiusMm = +e.currentTarget.value; }} step="5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(vehicle.frontTireRadiusMm).toFixed(2)} oninput={(e) => { vehicle.frontTireRadiusMm = inToMm(+e.currentTarget.value); }} step="0.1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Rear tire R</span>
						<input type="number" value={vehicle.rearTireRadiusMm} oninput={(e) => { vehicle.rearTireRadiusMm = +e.currentTarget.value; }} step="5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(vehicle.rearTireRadiusMm).toFixed(2)} oninput={(e) => { vehicle.rearTireRadiusMm = inToMm(+e.currentTarget.value); }} step="0.1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs cursor-help" title="Tire coefficient of friction (grip).&#10;Typical values:&#10;• Street touring tire: 0.7–0.9&#10;• Sport street tire: 0.9–1.1&#10;• Track-day DOT tire: 1.1–1.3&#10;• Full race slick (warm): 1.3–1.6&#10;• Wet conditions: 0.4–0.6">Front tire μ ⓘ</span>
						<input type="number" value={vehicle.frontTireGrip} onchange={(e) => { vehicle.frontTireGrip = +e.currentTarget.value; }} min="0.3" max="2" step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs cursor-help" title="Tire coefficient of friction (grip).&#10;Typical values:&#10;• Street touring tire: 0.7–0.9&#10;• Sport street tire: 0.9–1.1&#10;• Track-day DOT tire: 1.1–1.3&#10;• Full race slick (warm): 1.3–1.6&#10;• Wet conditions: 0.4–0.6">Rear tire μ ⓘ</span>
						<input type="number" value={vehicle.rearTireGrip} onchange={(e) => { vehicle.rearTireGrip = +e.currentTarget.value; }} min="0.3" max="2" step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
				</div>
			</section>

			<!-- Front Brake -->
			<section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
				<h3 class="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">Front Brake</h3>
				<div class="grid grid-cols-1 gap-2 text-sm">
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Disc Ø</span>
						<input type="number" value={frontBrake.discDiameterMm} oninput={(e) => { frontBrake.discDiameterMm = +e.currentTarget.value; }} step="10"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(frontBrake.discDiameterMm).toFixed(2)} oninput={(e) => { frontBrake.discDiameterMm = inToMm(+e.currentTarget.value); }} step="0.1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Pots</span>
						<input type="number" value={frontBrake.numberOfPots} oninput={(e) => { frontBrake.numberOfPots = +e.currentTarget.value; }} min="1" max="8" step="1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Piston Ø</span>
						<input type="number" value={frontBrake.pistonDiameterMm} oninput={(e) => { frontBrake.pistonDiameterMm = +e.currentTarget.value; }} step="1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(frontBrake.pistonDiameterMm).toFixed(3)} oninput={(e) => { frontBrake.pistonDiameterMm = inToMm(+e.currentTarget.value); }} step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Pad μ</span>
						<input type="number" value={frontBrake.padCoefficientOfFriction} oninput={(e) => { frontBrake.padCoefficientOfFriction = +e.currentTarget.value; }} min="0.1" max="0.8" step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Master cyl Ø</span>
						<input type="number" value={frontBrake.masterCylinderDiaMm} oninput={(e) => { frontBrake.masterCylinderDiaMm = +e.currentTarget.value; }} step="0.5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(frontBrake.masterCylinderDiaMm).toFixed(3)} oninput={(e) => { frontBrake.masterCylinderDiaMm = inToMm(+e.currentTarget.value); }} step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Lever ratio</span>
						<input type="number" value={frontBrake.leverRatio} oninput={(e) => { frontBrake.leverRatio = +e.currentTarget.value; }} min="1" max="10" step="0.5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_160px] gap-1 items-center text-gray-400 mt-1">
						<span class="text-xs">Dual-sided</span>
						<label class="flex items-center gap-2 text-xs">
							<input type="checkbox" bind:checked={frontBrake.dualSided}
								class="rounded border-gray-600 bg-gray-800 w-3.5 h-3.5" />
							<span class="text-gray-400">{frontBrake.dualSided ? 'Both sides' : 'Single side'}</span>
						</label>
					</div>
				</div>
			</section>

			<!-- Rear Brake -->
			<section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
				<h3 class="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">Rear Brake</h3>
				<div class="grid grid-cols-1 gap-2 text-sm">
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Disc Ø</span>
						<input type="number" value={rearBrake.discDiameterMm} oninput={(e) => { rearBrake.discDiameterMm = +e.currentTarget.value; }} step="10"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(rearBrake.discDiameterMm).toFixed(2)} oninput={(e) => { rearBrake.discDiameterMm = inToMm(+e.currentTarget.value); }} step="0.1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Pots</span>
						<input type="number" value={rearBrake.numberOfPots} oninput={(e) => { rearBrake.numberOfPots = +e.currentTarget.value; }} min="1" max="6" step="1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Piston Ø</span>
						<input type="number" value={rearBrake.pistonDiameterMm} oninput={(e) => { rearBrake.pistonDiameterMm = +e.currentTarget.value; }} step="1"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(rearBrake.pistonDiameterMm).toFixed(3)} oninput={(e) => { rearBrake.pistonDiameterMm = inToMm(+e.currentTarget.value); }} step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Pad μ</span>
						<input type="number" value={rearBrake.padCoefficientOfFriction} oninput={(e) => { rearBrake.padCoefficientOfFriction = +e.currentTarget.value; }} min="0.1" max="0.8" step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Master cyl Ø</span>
						<input type="number" value={rearBrake.masterCylinderDiaMm} oninput={(e) => { rearBrake.masterCylinderDiaMm = +e.currentTarget.value; }} step="0.5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<input type="number" value={+mmToIn(rearBrake.masterCylinderDiaMm).toFixed(3)} oninput={(e) => { rearBrake.masterCylinderDiaMm = inToMm(+e.currentTarget.value); }} step="0.01"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
					</div>
					<div class="grid grid-cols-[1fr_80px_80px] gap-1 items-center text-gray-400">
						<span class="text-xs">Lever ratio</span>
						<input type="number" value={rearBrake.leverRatio} oninput={(e) => { rearBrake.leverRatio = +e.currentTarget.value; }} min="1" max="10" step="0.5"
							class="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 text-right text-xs" />
						<span class="text-center text-[10px] text-gray-600">—</span>
					</div>
					<div class="grid grid-cols-[1fr_160px] gap-1 items-center text-gray-400 mt-1">
						<span class="text-xs">Dual-sided</span>
						<label class="flex items-center gap-2 text-xs">
							<input type="checkbox" bind:checked={rearBrake.dualSided}
								class="rounded border-gray-600 bg-gray-800 w-3.5 h-3.5" />
							<span class="text-gray-400">{rearBrake.dualSided ? 'Both sides' : 'Single side'}</span>
						</label>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>

<!-- Feedback Popup -->
{#if feedbackVisible}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onclick={() => { feedbackVisible = false; }}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl"
			onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between px-5 py-3 border-b border-gray-700">
				<h3 class="text-sm font-semibold text-indigo-300 uppercase tracking-wide">AI Braking Analysis</h3>
				<button onclick={() => { feedbackVisible = false; }}
					class="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
			</div>
			<div class="p-5 overflow-y-auto text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
				{feedbackText}
			</div>
		</div>
	</div>
{/if}
