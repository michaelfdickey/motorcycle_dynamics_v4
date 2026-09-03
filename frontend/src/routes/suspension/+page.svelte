<script lang="ts">
	import { browser } from '$app/environment';
	import { parseTireDesignation, computeTireDimensions, type TireDimensions } from '$lib/tire';
	import { computeFrontEnd, type SuspensionType } from '$lib/frontEndGeometry';
	import { computeRearEnd, type RearSuspensionType, type ShockAction } from '$lib/rearEndGeometry';
	import { frontInputsFromDesign, rearInputsFromDesign } from '$lib/bikeAssembly';
	import FrontEndDiagram from '$lib/components/FrontEndDiagram.svelte';
	import RearEndDiagram from '$lib/components/RearEndDiagram.svelte';
	import SuspensionTunePanel from '$lib/components/SuspensionTunePanel.svelte';
	import ParamSlider from '$lib/components/ParamSlider.svelte';
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
		type SuspensionDesign,
		type EndGeometry,
		type TunePreset,
		type SagPose,
		defaultSuspensionDesign,
		defaultUnitCount,
		defaultRateForType,
		mergeDesign,
		computeEnd,
		poseCompressionPct,
		applyTunePreset,
		frontTypeLabel,
		rearTypeLabel,
		tunePresets,
		kgToLb,
		lbToKg,
	} from '$lib/suspension';

	const SESSION_KEY = 'mototelos_suspension_session';
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
	let design = $state<SuspensionDesign>(defaultSuspensionDesign());
	let tunePreset = $state<TunePreset | null>(null);

	let viewSide = $state<'right' | 'left'>((browser && getViewUi('suspension')?.viewSide) || 'right');
	let unitSystem = $state<'metric' | 'us'>((browser && getViewUi('suspension')?.unitSystem) || 'metric');

	$effect(() => {
		if (!browser) return;
		setViewUi('suspension', { viewSide, unitSystem });
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

	function seedMassFromBrakes(v: VehicleDesign, into: SuspensionDesign) {
		const veh = v.brakes?.vehicle as Record<string, unknown> | undefined;
		if (!veh) return;
		const total = num(veh.totalMassKg, 0);
		if (total > 40 && into.bikeMassKg === defaultSuspensionDesign().bikeMassKg) {
			into.riderMassKg = Math.min(120, Math.max(50, into.riderMassKg));
			into.bikeMassKg = Math.max(40, total - into.riderMassKg);
		}
		if (typeof veh.cogPositionPct === 'number') {
			into.frontWeightPct = clamp(100 - veh.cogPositionPct, 25, 75);
		}
	}

	function clamp(v: number, lo: number, hi: number): number {
		return Math.min(hi, Math.max(lo, v));
	}

	function syncHardwareToGeometry(
		d: SuspensionDesign,
		front: Record<string, unknown> | null,
		rear: Record<string, unknown> | null,
		firstTime: boolean,
	) {
		if (front) {
			const t = str(front.suspensionType, 'telescopic');
			const telescopic = t === 'telescopic';
			if (!d.front.unitCount) d.front.unitCount = defaultUnitCount('front', t);
			if (firstTime) {
				d.front.unitCount = defaultUnitCount('front', t);
				d.front.rateNPerMm = defaultRateForType('front', t);
				d.front.damperArch = telescopic ? 'cartridge' : 'piggyback';
				d.front.includeAirAssist = telescopic;
			}
		}
		if (rear) {
			const t = str(rear.suspensionType, 'twin_shock');
			if (t === 'hardtail') {
				d.rear.unitCount = 0;
			} else if (!d.rear.unitCount) {
				d.rear.unitCount = defaultUnitCount('rear', t);
			}
			if (firstTime && t !== 'hardtail') {
				d.rear.unitCount = defaultUnitCount('rear', t);
				d.rear.rateNPerMm = defaultRateForType('rear', t);
				d.rear.damperArch = t === 'twin_shock' ? 'emulsion' : 'piggyback';
			}
		}
	}

	function applyVehicle(v: VehicleDesign, hadSession = false) {
		loadedDesign = v;
		vehicleName = v.name;
		const geo = geometryFromVehicle(v);
		if (v.suspension) {
			const next = mergeDesign(v.suspension);
			syncHardwareToGeometry(next, geo.front, geo.rear, false);
			design = next;
			return;
		}
		if (!hadSession) {
			const next = defaultSuspensionDesign();
			seedMassFromBrakes(v, next);
			syncHardwareToGeometry(next, geo.front, geo.rear, true);
			design = next;
			return;
		}
		seedMassFromBrakes(v, design);
		syncHardwareToGeometry(design, geo.front, geo.rear, false);
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
			suspension: { ...design, front: { ...design.front }, rear: { ...design.rear } },
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
		let hadSession = false;
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (raw) {
				design = mergeDesign(JSON.parse(raw));
				hadSession = true;
			}
		} catch { /* ignore */ }
		void (async () => {
			const name = getLastFileName();
			let v = name ? await loadVehicleDesign(name) : null;
			if (!v) {
				const list = await listVehicles();
				if (list[0]) v = await loadVehicleDesign(list[0].name);
			}
			if (v) {
				applyVehicle(v, hadSession);
				return;
			}
			const geo = geometryFromVehicle(null);
			syncHardwareToGeometry(design, geo.front, geo.rear, true);
			if (geo.front || geo.rear) {
				loadedDesign = {
					name: name || vehicleName,
					version: 0,
					savedAt: '',
					frontEnd: geo.front ?? undefined,
					rearEnd: geo.rear ?? undefined,
				};
			}
		})();
	});

	$effect(() => {
		if (!browser || !initialized) return;
		const snap = { ...design, front: { ...design.front }, rear: { ...design.rear } };
		localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
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
		try {
			return computeFrontEnd(frontInputsFromDesign(frontRec), frontTire);
		} catch {
			return null;
		}
	});

	const totalMassKg = $derived(design.bikeMassKg + design.riderMassKg + design.cargoMassKg);
	const frontSprung = $derived(Math.max(8, totalMassKg * (design.frontWeightPct / 100) - design.unsprungFrontKg));
	const rearSprung = $derived(Math.max(8, totalMassKg * (1 - design.frontWeightPct / 100) - design.unsprungRearKg));
	const frontStaticSprung = $derived(Math.max(5, design.bikeMassKg * (design.frontWeightPct / 100) - design.unsprungFrontKg));
	const rearStaticSprung = $derived(Math.max(5, design.bikeMassKg * (1 - design.frontWeightPct / 100) - design.unsprungRearKg));

	const forkTravelMm = $derived(num(frontRec?.forkTravelMm, 120));
	const shockStrokeMm = $derived(num(rearRec?.shockStrokeMm, 70));

	const frontGeo = $derived.by((): EndGeometry => {
		const rake = num(frontRec?.rakeAngleDeg, 27);
		const telescopic = frontType === 'telescopic';
		const tube = str(frontRec?.forkTubeSize, '41/54');
		const stanchion = Number(tube.split('/')[0]) || 41;
		return {
			wheelTravelMm: telescopic ? forkTravelMm * Math.cos((rake * Math.PI) / 180) : forkTravelMm,
			unitTravelMm: Math.max(10, forkTravelMm),
			leverage: 1,
			rakeDeg: rake,
			stanchionDiaMm: stanchion,
			solid: false,
			telescopic,
		};
	});

	const rearGeo = $derived.by((): EndGeometry => {
		const solid = rearType === 'hardtail';
		const stroke = Math.max(1, shockStrokeMm);
		const lev = rearGeomForPose(design.rear.targetRiderSagPct)?.leverageRatio ?? 1;
		const wheel = rearGeomForPose(design.rear.targetRiderSagPct)?.wheelTravelFullMm ?? stroke;
		return {
			wheelTravelMm: solid ? 0 : Math.max(1, wheel),
			unitTravelMm: solid ? 1 : stroke,
			leverage: solid ? 1 : Math.max(0.2, lev),
			rakeDeg: 0,
			stanchionDiaMm: 40,
			solid,
			telescopic: false,
		};
	});

	function rearGeomForPose(pct: number) {
		if (!rearRec || !rearTire) return null;
		try {
			return computeRearEnd({ ...rearInputsFromDesign(rearRec), compressionPct: pct }, rearTire);
		} catch {
			return null;
		}
	}

	const frontResults = $derived(computeEnd(design.front, frontGeo, frontSprung, frontStaticSprung, true));
	const rearResults = $derived(computeEnd(design.rear, rearGeo, rearSprung, rearStaticSprung, false));

	const frontPosePct = $derived(poseCompressionPct(frontResults, design.showPose));
	const rearPosePct = $derived(rearGeo.solid ? 0 : poseCompressionPct(rearResults, design.showPose));

	const rearGeomResults = $derived(rearGeomForPose(rearPosePct));

	const stanchionDiaMm = $derived(Number(str(frontRec?.forkTubeSize, '41/54').split('/')[0]) || 41);
	const sliderDiaMm = $derived(Number(str(frontRec?.forkTubeSize, '41/54').split('/')[1]) || 54);
	const steeringColumnLengthMm = $derived(num(frontRec?.steeringColumnLengthIn, 8) * 25.4);
	const shockBodyDiaMm = $derived(
		design.rear.damperArch === 'piggyback' ? 58 : design.rear.damperArch === 'remote_reservoir' ? 52 : 48,
	);

	const poses: { value: SagPose; label: string }[] = [
		{ value: 'extend', label: 'Full extend' },
		{ value: 'static', label: 'Static sag' },
		{ value: 'rider', label: 'Rider sag' },
		{ value: 'bump', label: 'Full bump' },
	];

	function onPreset(p: TunePreset) {
		if (tunePreset === p) {
			tunePreset = null;
			return;
		}
		tunePreset = p;
		applyTunePreset(design, p);
	}
</script>

<div class="flex flex-col min-h-0 flex-1 gap-2">
	<div class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-gray-950">
		<h2 class="text-2xl font-bold whitespace-nowrap">Suspension</h2>
		<p class="text-xs text-gray-500 hidden md:block max-w-xl">
			Geometry is locked from the Front End and Rear End tabs. Springs, dampers, oil, sag, and preload are set here.
		</p>
		<div class="ml-auto flex items-center gap-2">
			<input
				type="text"
				bind:value={vehicleName}
				list="vehicle-list-sus"
				class="w-36 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 focus:border-orange-500 focus:outline-none"
				placeholder="vehicle name"
			/>
			<datalist id="vehicle-list-sus">
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

	<!-- Locked front / rear diagrams: always visible, never part of the scroller -->
	<div class="shrink-0 sticky top-0 z-20 bg-gray-950 pb-1 space-y-2">
		<div class="flex flex-wrap items-center gap-2">
			<select bind:value={viewSide} class="rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200">
				<option value="right">Right side view</option>
				<option value="left">Left side view</option>
			</select>
			<button type="button" class="px-2 py-1 text-xs rounded {unitSystem === 'metric' ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500'}" onclick={() => unitSystem = 'metric'}>mm</button>
			<button type="button" class="px-2 py-1 text-xs rounded {unitSystem === 'us' ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500'}" onclick={() => unitSystem = 'us'}>in</button>
			<div class="flex items-center gap-1 ml-2">
				{#each poses as p}
					<button
						type="button"
						class="px-2 py-1 text-xs rounded {design.showPose === p.value ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500 hover:text-gray-300'}"
						onclick={() => design.showPose = p.value}
					>
						{p.label}
					</button>
				{/each}
			</div>
			<span class="text-[10px] text-gray-600 ml-auto">Diagrams stay put. Shift+wheel zoom. Variables scroll below.</span>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[min(40vh,26rem)] min-h-[16rem] max-lg:h-[36rem]">
			<div class="min-h-0 flex flex-col rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
				<div class="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900">
					<div class="text-xs font-semibold text-gray-300">Front · {frontTypeLabel(frontType)}</div>
					<div class="text-[10px] text-gray-500 font-mono">
						{forkTravelMm.toFixed(0)} mm travel · {num(frontRec?.rakeAngleDeg, 0).toFixed(1)}° rake · sag {frontResults.riderSagPct.toFixed(0)}%
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
							compressionPct={frontPosePct}
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
							persistKey="suspensionFront"
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
						{#if rearGeo.solid}
							rigid
						{:else}
							{shockStrokeMm.toFixed(0)} mm stroke · lev {rearGeo.leverage.toFixed(2)} · sag {rearResults.riderSagPct.toFixed(0)}%
						{/if}
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
							persistKey="suspensionRear"
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

	<!-- Scrollable variables: front column under front, rear column under rear -->
	<div class="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 pb-6">
		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Vehicle / rider</h3>
				<div class="flex flex-wrap gap-x-3 gap-y-1">
					{#each tunePresets as p}
						<label class="flex items-center gap-1.5">
							<input type="checkbox" checked={tunePreset === p.value} onchange={() => onPreset(p.value)} class="accent-orange-500" />
							<span class="text-xs text-gray-400">{p.label}</span>
						</label>
					{/each}
				</div>
			</div>
			<p class="text-[11px] text-gray-600">
				Presets set sag targets, oil, and clickers. Springs stay yours until you hit “use recommended” on each end.
				Total mass {totalMassKg.toFixed(0)} kg ({kgToLb(totalMassKg).toFixed(0)} lb) · front {design.frontWeightPct.toFixed(0)}% / rear {(100 - design.frontWeightPct).toFixed(0)}%.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
				<ParamSlider label="Bike mass (no rider)" bind:value={design.bikeMassKg} min={60} max={800} step={1} decimals={1} unit="kg" secondary={{ unit: 'lb', to: kgToLb, from: lbToKg, step: 1, decimals: 0 }} />
				<ParamSlider label="Rider mass" bind:value={design.riderMassKg} min={40} max={180} step={1} decimals={1} unit="kg" secondary={{ unit: 'lb', to: kgToLb, from: lbToKg, step: 1, decimals: 0 }} />
				<ParamSlider label="Cargo / passenger" bind:value={design.cargoMassKg} min={0} max={200} step={1} decimals={1} unit="kg" secondary={{ unit: 'lb', to: kgToLb, from: lbToKg, step: 1, decimals: 0 }} />
				<ParamSlider label="Static front weight" bind:value={design.frontWeightPct} min={30} max={70} step={0.5} decimals={1} unit="%" hint="From CoG. Brakes tab stores the same split as 100 − cog%." />
				<ParamSlider label="Unsprung front" bind:value={design.unsprungFrontKg} min={8} max={40} step={0.5} decimals={1} unit="kg" secondary={{ unit: 'lb', to: kgToLb, from: lbToKg, step: 0.5, decimals: 1 }} />
				<ParamSlider label="Unsprung rear" bind:value={design.unsprungRearKg} min={8} max={45} step={0.5} decimals={1} unit="kg" secondary={{ unit: 'lb', to: kgToLb, from: lbToKg, step: 0.5, decimals: 1 }} />
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<SuspensionTunePanel
				title="Front"
				end="front"
				type={frontType}
				config={design.front}
				geo={frontGeo}
				results={frontResults}
				isFront={true}
			/>
			<SuspensionTunePanel
				title="Rear"
				end="rear"
				type={rearType}
				config={design.rear}
				geo={rearGeo}
				results={rearResults}
				isFront={false}
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
