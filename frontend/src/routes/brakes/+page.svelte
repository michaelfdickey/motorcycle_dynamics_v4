<script lang="ts">
	import { browser } from '$app/environment';
	import { parseTireDesignation, computeTireDimensions, type TireDimensions } from '$lib/tire';
	import { computeFrontEnd, type SuspensionType } from '$lib/frontEndGeometry';
	import { computeRearEnd, type RearSuspensionType, type ShockAction } from '$lib/rearEndGeometry';
	import { frontInputsFromDesign, rearInputsFromDesign } from '$lib/bikeAssembly';
	import FrontEndDiagram from '$lib/components/FrontEndDiagram.svelte';
	import RearEndDiagram from '$lib/components/RearEndDiagram.svelte';
	import BrakeTunePanel from '$lib/components/BrakeTunePanel.svelte';
	import { getViewUi, setViewUi } from '$lib/viewCamera';
	import {
		saveVehicleDesign,
		loadVehicleDesign,
		listVehicles,
		deleteVehicleDesign,
		getLastFileName,
		type VehicleDesign,
	} from '$lib/vehicleStore';
	import {
		computeBraking,
		defaultFrontBrake,
		defaultRearBrake,
		defaultVehicleParams,
		migrateBrakeParams,
		totalPotCount,
		type BrakeParams,
		type VehicleParams,
	} from '$lib/braking';
	import { frontTypeLabel, rearTypeLabel } from '$lib/suspension';

	const SESSION_KEY = 'mototelos_brakes_session';
	const FRONT_LS_PREFIX = 'mototelos_frontEnd_';
	const REAR_LS_PREFIX = 'motorcycle_rearEnd_';

	function num(v: unknown, fallback: number): number {
		return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
	}
	function str(v: unknown, fallback: string): string {
		return typeof v === 'string' && v.trim() ? v : fallback;
	}
	function bool(v: unknown, fallback: boolean): boolean {
		return typeof v === 'boolean' ? v : fallback;
	}
	function tireFrom(raw: unknown, fallback: string): TireDimensions | null {
		const s = str(raw, fallback);
		const parsed = parseTireDesignation(s);
		return parsed ? computeTireDimensions(parsed) : null;
	}
	function readLocalRecord(prefix: string): Record<string, unknown> | null {
		if (!browser) return null;
		try {
			const last = localStorage.getItem(prefix + 'lastType');
			const key = last ? prefix + last : null;
			const raw = (key && localStorage.getItem(key)) || localStorage.getItem(prefix + (prefix.includes('front') ? 'telescopic' : 'twin_shock'));
			return raw ? JSON.parse(raw) as Record<string, unknown> : null;
		} catch {
			return null;
		}
	}

	let vehicleName = $state(browser ? getLastFileName() : 'my_bike');
	let savedVehicles = $state<{ name: string }[]>([]);
	let saveStatus = $state<'' | 'saving' | 'saved' | 'error'>('');
	let loadModalVisible = $state(false);
	let loadedDesign = $state<VehicleDesign | null>(null);
	let frontBrake = $state<BrakeParams>(defaultFrontBrake());
	let rearBrake = $state<BrakeParams>(defaultRearBrake());
	let vehicle = $state<VehicleParams>(defaultVehicleParams());

	let viewSide = $state<'right' | 'left'>((browser && getViewUi('brakes')?.viewSide) || 'right');
	let unitSystem = $state<'metric' | 'us'>((browser && getViewUi('brakes')?.unitSystem) || 'metric');

	$effect(() => {
		if (!browser) return;
		setViewUi('brakes', { viewSide, unitSystem });
	});

	async function refreshVehicleList() {
		savedVehicles = await listVehicles();
	}
	if (browser) refreshVehicleList();

	function geometryFromVehicle(v: VehicleDesign | null): { front: Record<string, unknown> | null; rear: Record<string, unknown> | null } {
		const front = (v?.frontEnd as Record<string, unknown> | undefined) ?? readLocalRecord(FRONT_LS_PREFIX);
		const rear = (v?.rearEnd as Record<string, unknown> | undefined) ?? readLocalRecord(REAR_LS_PREFIX);
		return { front: front ?? null, rear: rear ?? null };
	}

	function applyVehicle(v: VehicleDesign) {
		loadedDesign = v;
		vehicleName = v.name;
		if (v.brakes) {
			frontBrake = migrateBrakeParams({ ...defaultFrontBrake(), ...v.brakes.frontBrake });
			rearBrake = migrateBrakeParams({ ...defaultRearBrake(), ...v.brakes.rearBrake });
			if (v.brakes.vehicle) vehicle = { ...defaultVehicleParams(), ...v.brakes.vehicle } as VehicleParams;
		}
	}

	async function handleSave() {
		if (!vehicleName.trim()) return;
		saveStatus = 'saving';
		const existing = await loadVehicleDesign(vehicleName.trim());
		const payload: VehicleDesign = {
			...(existing || loadedDesign || {}),
			name: vehicleName.trim(),
			version: ((existing?.version || loadedDesign?.version || 0) as number) + 1,
			savedAt: new Date().toISOString(),
			brakes: {
				frontBrake: { ...frontBrake, pistons: frontBrake.pistons.map((p) => ({ ...p })) },
				rearBrake: { ...rearBrake, pistons: rearBrake.pistons.map((p) => ({ ...p })) },
				vehicle: { ...((existing || loadedDesign)?.brakes?.vehicle ?? {}), ...vehicle },
			},
		};
		const ok = await saveVehicleDesign(payload);
		saveStatus = ok ? 'saved' : 'error';
		if (ok) {
			loadedDesign = payload;
			await refreshVehicleList();
		}
		setTimeout(() => { saveStatus = ''; }, 1500);
	}

	async function handleLoad() {
		await refreshVehicleList();
		loadModalVisible = true;
	}

	async function handleLoadSelect(name: string) {
		const v = await loadVehicleDesign(name);
		if (!v) return;
		applyVehicle(v);
		loadModalVisible = false;
	}

	async function handleDeleteVehicle(name: string) {
		const ok = await deleteVehicleDesign(name);
		if (ok) savedVehicles = savedVehicles.filter((x) => x.name !== name);
	}

	let initialized = $state(false);
	$effect(() => {
		if (!browser || initialized) return;
		initialized = true;
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (raw) {
				const s = JSON.parse(raw);
				if (s.frontBrake) frontBrake = migrateBrakeParams({ ...defaultFrontBrake(), ...s.frontBrake });
				if (s.rearBrake) rearBrake = migrateBrakeParams({ ...defaultRearBrake(), ...s.rearBrake });
				if (s.vehicle) vehicle = { ...defaultVehicleParams(), ...s.vehicle };
				if (s.vehicleName) vehicleName = s.vehicleName;
				if (s.viewSide) viewSide = s.viewSide;
			}
		} catch { /* ignore */ }
		void (async () => {
			const name = getLastFileName();
			let v = name ? await loadVehicleDesign(name) : null;
			if (!v) {
				const list = await listVehicles();
				if (list[0]) v = await loadVehicleDesign(list[0].name);
			}
			if (v) applyVehicle(v);
		})();
	});

	$effect(() => {
		if (!browser || !initialized) return;
		let prev: Record<string, unknown> = {};
		try { prev = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { /* ignore */ }
		localStorage.setItem(SESSION_KEY, JSON.stringify({
			...prev,
			frontBrake: { ...frontBrake, pistons: frontBrake.pistons.map((p) => ({ ...p })) },
			rearBrake: { ...rearBrake, pistons: rearBrake.pistons.map((p) => ({ ...p })) },
			vehicle,
			vehicleName,
			viewSide,
		}));
	});

	const geoRecs = $derived(geometryFromVehicle(loadedDesign));
	const frontRec = $derived(geoRecs.front);
	const rearRec = $derived(geoRecs.rear);
	const frontType = $derived(str(frontRec?.suspensionType, 'telescopic') as SuspensionType);
	const rearType = $derived(str(rearRec?.suspensionType, 'twin_shock') as RearSuspensionType);
	const rearAction = $derived(str(rearRec?.shockAction, 'compression') as ShockAction);
	const frontTire = $derived(frontRec ? tireFrom(frontRec.tireDesignation, '120/70ZR17') : null);
	const rearTire = $derived(rearRec ? tireFrom(rearRec.tireDesignation, '150/80B16') : null);

	const frontGeomResults = $derived.by(() => {
		if (!frontRec || !frontTire) return null;
		try { return computeFrontEnd(frontInputsFromDesign(frontRec), frontTire); }
		catch { return null; }
	});
	const rearGeomResults = $derived.by(() => {
		if (!rearRec || !rearTire) return null;
		try { return computeRearEnd(rearInputsFromDesign(rearRec), rearTire); }
		catch { return null; }
	});

	const forkTravelMm = $derived(num(frontRec?.forkTravelMm, 120));
	const stanchionDiaMm = $derived(Number(str(frontRec?.forkTubeSize, '41/54').split('/')[0]) || 41);
	const sliderDiaMm = $derived(Number(str(frontRec?.forkTubeSize, '41/54').split('/')[1]) || 54);
	const steeringColumnLengthMm = $derived(num(frontRec?.steeringColumnLengthIn, 8) * 25.4);
	const shockBodyDiaMm = $derived(48);

	const preview = $derived(computeBraking({
		frontBrake,
		rearBrake,
		vehicle: {
			...vehicle,
			frontTireRadiusMm: frontTire?.outerRadiusMm ?? vehicle.frontTireRadiusMm,
			rearTireRadiusMm: rearTire?.outerRadiusMm ?? vehicle.rearTireRadiusMm,
		},
		frontLeverForceN: 150,
		rearPedalForceN: 80,
		linked: false,
		linkRatio: 0.7,
	}));
</script>

<div class="flex flex-col min-h-0 flex-1 gap-2">
	<div class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-gray-950">
		<h2 class="text-2xl font-bold whitespace-nowrap">Brakes</h2>
		<p class="text-xs text-gray-500 hidden md:block max-w-xl">
			Geometry is locked from the Front End and Rear End tabs. Set discs, calipers, pads, and hydraulics here. Run it on Simulation.
		</p>
		<div class="ml-auto flex items-center gap-2">
			<input
				type="text"
				bind:value={vehicleName}
				list="vehicle-list-brakes"
				class="w-36 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 focus:border-orange-500 focus:outline-none"
				placeholder="vehicle name"
			/>
			<datalist id="vehicle-list-brakes">
				{#each savedVehicles as v}
					<option value={v.name}></option>
				{/each}
			</datalist>
			<button onclick={handleSave} class="px-3 py-1 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors">
				{saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? 'OK' : 'Save'}
			</button>
			<button onclick={handleLoad} class="px-3 py-1 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors">
				Load
			</button>
		</div>
	</div>

	<div class="shrink-0 sticky top-0 z-20 bg-gray-950 pb-1 space-y-2">
		<div class="flex flex-wrap items-center gap-2">
			<select bind:value={viewSide} class="rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200">
				<option value="right">Right side view</option>
				<option value="left">Left side view</option>
			</select>
			<button type="button" class="px-2 py-1 text-xs rounded {unitSystem === 'metric' ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500'}" onclick={() => unitSystem = 'metric'}>mm</button>
			<button type="button" class="px-2 py-1 text-xs rounded {unitSystem === 'us' ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500'}" onclick={() => unitSystem = 'us'}>in</button>
			<div class="ml-auto flex items-center gap-3 text-[10px] text-gray-500 font-mono">
				<span>{preview.decelerationG.toFixed(2)} G @ 150/80 N</span>
				<span>{preview.stoppingDistanceM.toFixed(1)} m from 100 km/h</span>
				{#if preview.frontLockup}<span class="text-red-400">front lock</span>{/if}
				{#if preview.rearLockup}<span class="text-red-400">rear lock</span>{/if}
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[min(40vh,26rem)] min-h-[16rem] max-lg:h-[36rem]">
			<div class="min-h-0 flex flex-col rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
				<div class="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900">
					<div class="text-xs font-semibold text-gray-300">Front · {frontTypeLabel(frontType)}</div>
					<div class="text-[10px] text-gray-500 font-mono">
						Ø{Math.round(frontBrake.discDiameterMm)} · {totalPotCount(frontBrake.pistons)}-pot{frontBrake.dualSided ? ' dual' : ''}
					</div>
				</div>
				<div class="flex-1 min-h-0">
					{#if frontGeomResults && frontTire && frontRec}
						<FrontEndDiagram
							results={frontGeomResults}
							tire={frontTire}
							{steeringColumnLengthMm}
							forkOffsetMm={num(frontRec.forkOffsetMm, 35)}
							forkLengthMm={num(frontRec.forkLengthMm, 500)}
							suspensionType={frontType}
							{forkTravelMm}
							compressionPct={num(frontRec.compressionPct, 0)}
							spindleOffsetMm={num(frontRec.spindleOffsetMm, 0)}
							spindleHeightMm={num(frontRec.spindleHeightMm, 0)}
							{stanchionDiaMm}
							{sliderDiaMm}
							invertedForks={bool(frontRec.invertedForks, false)}
							suspensionOffsetMm={num(frontRec.suspensionOffsetMm, 0)}
							suspensionHeightMm={num(frontRec.suspensionHeightMm, 50)}
							suspUpperMountHeightMm={num(frontRec.suspUpperMountHeightMm, 0)}
							suspUpperMountOffsetMm={num(frontRec.suspUpperMountOffsetMm, 0)}
							linkLengthMm={num(frontRec.linkLengthMm, 200)}
							linkOffsetMm={num(frontRec.linkOffsetMm, 0)}
							{viewSide}
							{unitSystem}
							persistKey="brakesFront"
							brakeDiscDiameterMm={frontBrake.discDiameterMm}
							brakeDualSided={frontBrake.dualSided}
							brakePotCount={totalPotCount(frontBrake.pistons)}
						/>
					{:else}
						<div class="h-full flex flex-col items-center justify-center gap-2 text-sm text-gray-500 px-4 text-center">
							<p>No front-end geometry loaded.</p>
							<a href="/front-end" class="text-orange-400 hover:text-orange-300">Design the front end →</a>
						</div>
					{/if}
				</div>
			</div>

			<div class="min-h-0 flex flex-col rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
				<div class="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900">
					<div class="text-xs font-semibold text-gray-300">Rear · {rearTypeLabel(rearType)}</div>
					<div class="text-[10px] text-gray-500 font-mono">
						Ø{Math.round(rearBrake.discDiameterMm)} · {totalPotCount(rearBrake.pistons)}-pot{rearBrake.dualSided ? ' dual' : ''}
					</div>
				</div>
				<div class="flex-1 min-h-0">
					{#if rearGeomResults && rearTire && rearRec}
						<RearEndDiagram
							results={rearGeomResults}
							tire={rearTire}
							suspensionType={rearType}
							shockAction={rearAction}
							swingarmSectionMm={num(rearRec.swingarmSectionMm, 42)}
							{shockBodyDiaMm}
							{viewSide}
							{unitSystem}
							persistKey="brakesRear"
							brakeDiscDiameterMm={rearBrake.discDiameterMm}
							brakeDualSided={rearBrake.dualSided}
							brakePotCount={totalPotCount(rearBrake.pistons)}
						/>
					{:else}
						<div class="h-full flex flex-col items-center justify-center gap-2 text-sm text-gray-500 px-4 text-center">
							<p>No rear-end geometry loaded.</p>
							<a href="/rear-end" class="text-orange-400 hover:text-orange-300">Design the rear end →</a>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<div class="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 pb-6">
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<BrakeTunePanel
				title="Front brake"
				bind:brake={frontBrake}
				tireRadiusMm={frontTire?.outerRadiusMm ?? vehicle.frontTireRadiusMm}
				rimRadiusMm={frontTire?.rimRadiusMm ?? 0}
				referenceForceN={150}
				inputLabel="lever"
			/>
			<BrakeTunePanel
				title="Rear brake"
				bind:brake={rearBrake}
				tireRadiusMm={rearTire?.outerRadiusMm ?? vehicle.rearTireRadiusMm}
				rimRadiusMm={rearTire?.rimRadiusMm ?? 0}
				referenceForceN={80}
				inputLabel="pedal"
			/>
		</div>
	</div>
</div>

{#if loadModalVisible}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onclick={() => loadModalVisible = false} role="presentation">
		<div class="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
			<div class="flex items-center justify-between px-5 py-3 border-b border-gray-700">
				<h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Load vehicle</h3>
				<button onclick={() => loadModalVisible = false} class="text-gray-400 hover:text-white">&times;</button>
			</div>
			<div class="p-3 max-h-72 overflow-y-auto">
				{#each savedVehicles as v}
					<div class="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded">
						<button class="flex-1 text-left text-sm text-gray-200" onclick={() => handleLoadSelect(v.name)}>{v.name}</button>
						<button class="text-xs text-red-400" onclick={() => handleDeleteVehicle(v.name)}>Delete</button>
					</div>
				{/each}
				{#if savedVehicles.length === 0}
					<p class="text-xs text-gray-500 px-2 py-4">No saved vehicles.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
