<script lang="ts">
	import { parseTireDesignation, computeTireDimensions } from '$lib/tire';
	import {
		computeRearEnd,
		type RearSuspensionType,
		type ShockAction,
		type RearEndInputs,
	} from '$lib/rearEndGeometry';
	import RearEndDiagram from '$lib/components/RearEndDiagram.svelte';
	import LengthSlider from '$lib/components/LengthSlider.svelte';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import {
		saveVehicleDesign,
		loadVehicleDesign,
		listVehicles,
		deleteVehicleDesign,
		getLastFileName,
		type VehicleDesign,
	} from '$lib/vehicleStore';

	const STORAGE_PREFIX = 'motorcycle_rearEnd_';

	type DesignState = {
		tireDesignation: string;
		shockAction: ShockAction;
		swingarmLengthMm: number;
		pivotHeightMm: number;
		shockEyeToEyeMm: number;
		shockStrokeMm: number;
		compressionPct: number;
		shockLowerFromAxleMm: number;
		shockUpperForwardMm: number;
		shockUpperHeightMm: number;
		triangleApexForwardMm: number;
		triangleApexHeightMm: number;
		rockerPivotForwardMm: number;
		rockerPivotHeightMm: number;
		rockerLengthMm: number;
		dogboneOnArmMm: number;
		dogboneLengthMm: number;
		countershaftForwardMm: number;
		countershaftHeightOffPivotMm: number;
		rearSprocketRadiusMm: number;
		frontSprocketRadiusMm: number;
		swingarmSectionMm: number;
	};

	function storageKey(type: RearSuspensionType): string {
		return STORAGE_PREFIX + type;
	}
	function loadDesign(type: RearSuspensionType): DesignState | null {
		if (!browser) return null;
		try {
			const raw = localStorage.getItem(storageKey(type));
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	}
	function saveDesign(type: RearSuspensionType, state: DesignState): void {
		if (!browser) return;
		localStorage.setItem(storageKey(type), JSON.stringify(state));
	}

	let viewSide = $state<'right' | 'left'>('right');
	let suspensionType = $state<RearSuspensionType>('twin_shock');
	let shockAction = $state<ShockAction>('compression');
	let tireDesignation = $state('150/80B16');
	let swingarmLengthMm = $state(520);
	let pivotHeightMm = $state(340);
	let shockEyeToEyeMm = $state(330);
	let shockStrokeMm = $state(70);
	let compressionPct = $state(20);
	let shockLowerFromAxleMm = $state(90);
	let shockUpperForwardMm = $state(40);
	let shockUpperHeightMm = $state(620);
	let triangleApexForwardMm = $state(120);
	let triangleApexHeightMm = $state(220);
	let rockerPivotForwardMm = $state(30);
	let rockerPivotHeightMm = $state(480);
	let rockerLengthMm = $state(90);
	let dogboneOnArmMm = $state(180);
	let dogboneLengthMm = $state(160);
	let countershaftForwardMm = $state(-20);
	let countershaftHeightOffPivotMm = $state(-10);
	let rearSprocketRadiusMm = $state(110);
	let frontSprocketRadiusMm = $state(38);
	let swingarmSectionMm = $state(42);

	function currentDesignState(): DesignState {
		return {
			tireDesignation, shockAction, swingarmLengthMm, pivotHeightMm,
			shockEyeToEyeMm, shockStrokeMm, compressionPct, shockLowerFromAxleMm,
			shockUpperForwardMm, shockUpperHeightMm, triangleApexForwardMm, triangleApexHeightMm,
			rockerPivotForwardMm, rockerPivotHeightMm, rockerLengthMm, dogboneOnArmMm,
			dogboneLengthMm, countershaftForwardMm, countershaftHeightOffPivotMm,
			rearSprocketRadiusMm, frontSprocketRadiusMm, swingarmSectionMm,
		};
	}

	function applyDesignState(s: DesignState): void {
		tireDesignation = s.tireDesignation ?? tireDesignation;
		shockAction = s.shockAction ?? shockAction;
		swingarmLengthMm = s.swingarmLengthMm ?? swingarmLengthMm;
		pivotHeightMm = s.pivotHeightMm ?? pivotHeightMm;
		shockEyeToEyeMm = s.shockEyeToEyeMm ?? shockEyeToEyeMm;
		shockStrokeMm = s.shockStrokeMm ?? shockStrokeMm;
		compressionPct = s.compressionPct ?? compressionPct;
		shockLowerFromAxleMm = s.shockLowerFromAxleMm ?? shockLowerFromAxleMm;
		shockUpperForwardMm = s.shockUpperForwardMm ?? shockUpperForwardMm;
		shockUpperHeightMm = s.shockUpperHeightMm ?? shockUpperHeightMm;
		triangleApexForwardMm = s.triangleApexForwardMm ?? triangleApexForwardMm;
		triangleApexHeightMm = s.triangleApexHeightMm ?? triangleApexHeightMm;
		rockerPivotForwardMm = s.rockerPivotForwardMm ?? rockerPivotForwardMm;
		rockerPivotHeightMm = s.rockerPivotHeightMm ?? rockerPivotHeightMm;
		rockerLengthMm = s.rockerLengthMm ?? rockerLengthMm;
		dogboneOnArmMm = s.dogboneOnArmMm ?? dogboneOnArmMm;
		dogboneLengthMm = s.dogboneLengthMm ?? dogboneLengthMm;
		countershaftForwardMm = s.countershaftForwardMm ?? countershaftForwardMm;
		countershaftHeightOffPivotMm = s.countershaftHeightOffPivotMm ?? countershaftHeightOffPivotMm;
		rearSprocketRadiusMm = s.rearSprocketRadiusMm ?? rearSprocketRadiusMm;
		frontSprocketRadiusMm = s.frontSprocketRadiusMm ?? frontSprocketRadiusMm;
		swingarmSectionMm = s.swingarmSectionMm ?? swingarmSectionMm;
	}

	let vehicleName = $state(browser ? getLastFileName() : 'my_bike');
	let savedVehicles = $state<{ name: string }[]>([]);
	let saveStatus = $state<'' | 'saving' | 'saved' | 'error'>('');
	let loadModalVisible = $state(false);

	async function refreshVehicleList() {
		savedVehicles = await listVehicles();
	}
	if (browser) refreshVehicleList();

	async function handleSave() {
		if (!vehicleName.trim()) return;
		saveStatus = 'saving';
		const existing = await loadVehicleDesign(vehicleName.trim());
		const design: VehicleDesign = {
			...(existing || {}),
			name: vehicleName.trim(),
			version: (existing?.version || 0) + 1,
			savedAt: new Date().toISOString(),
			rearEnd: {
				suspensionType,
				...currentDesignState(),
			},
		};
		const ok = await saveVehicleDesign(design);
		saveStatus = ok ? 'saved' : 'error';
		if (ok) await refreshVehicleList();
		setTimeout(() => { saveStatus = ''; }, 1500);
	}

	async function handleLoad() {
		await refreshVehicleList();
		loadModalVisible = true;
	}

	async function handleLoadSelect(name: string) {
		const design = await loadVehicleDesign(name);
		if (!design) return;
		vehicleName = design.name;
		if (design.rearEnd) {
			const re = design.rearEnd as DesignState & { suspensionType?: RearSuspensionType };
			if (re.suspensionType) suspensionType = re.suspensionType;
			applyDesignState(re);
		}
		loadModalVisible = false;
	}

	async function handleDeleteVehicle(name: string) {
		const ok = await deleteVehicleDesign(name);
		if (ok) savedVehicles = savedVehicles.filter((v) => v.name !== name);
	}

	const MM_PER_IN = 25.4;
	function mmToIn(mm: number): number { return mm / MM_PER_IN; }

	const suspensionTypes: { value: RearSuspensionType; label: string; note: string }[] = [
		{ value: 'hardtail', label: 'Hardtail', note: 'Rigid frame rail. No pivot or shock. Chopper, speedway, CX-style mule.' },
		{ value: 'twin_shock', label: 'Twin-shock swingarm', note: 'Classic swinging fork. Shocks sit near the axle and meet the seat rail (low-to-mid frame mounts).' },
		{ value: 'cantilever', label: 'Triangulated cantilever', note: 'Vincent / Yamaha monoshock style. Triangulated arm, shock to a high frame mount.' },
		{ value: 'softail', label: 'Softail (under frame)', note: 'Hardtail look. Shock hidden under the frame; often expansion (lengthens on bump).' },
		{ value: 'linkage', label: 'Linkage monoshock', note: 'Pro-Link / Uni-Trak / Full Floater family. Dogbone + rocker drive a single shock.' },
	];

	type BikePreset = 'hardtail' | 'cruiser' | 'sport' | 'dualsport' | 'softail';
	let activePreset = $state<BikePreset | null>(null);
	const bikePresets: { value: BikePreset; label: string; type: RearSuspensionType; action: ShockAction; L: number; pivotH: number; eye: number; stroke: number }[] = [
		{ value: 'hardtail', label: 'Hardtail', type: 'hardtail', action: 'compression', L: 480, pivotH: 360, eye: 0, stroke: 0 },
		{ value: 'cruiser', label: 'Cruiser twin-shock', type: 'twin_shock', action: 'compression', L: 540, pivotH: 330, eye: 340, stroke: 65 },
		{ value: 'sport', label: 'Sport linkage', type: 'linkage', action: 'compression', L: 500, pivotH: 350, eye: 310, stroke: 65 },
		{ value: 'dualsport', label: 'Dual sport', type: 'twin_shock', action: 'compression', L: 560, pivotH: 370, eye: 380, stroke: 110 },
		{ value: 'softail', label: 'Softail', type: 'softail', action: 'expansion', L: 510, pivotH: 340, eye: 280, stroke: 55 },
	];

	function applyPreset(preset: BikePreset) {
		if (activePreset === preset) { activePreset = null; return; }
		activePreset = preset;
		const p = bikePresets.find((b) => b.value === preset)!;
		suspensionType = p.type;
		shockAction = p.action;
		swingarmLengthMm = p.L;
		pivotHeightMm = p.pivotH;
		shockEyeToEyeMm = p.eye || shockEyeToEyeMm;
		shockStrokeMm = p.stroke;
		if (p.type === 'cantilever') {
			shockUpperHeightMm = 640;
			shockUpperForwardMm = 80;
			triangleApexHeightMm = 240;
		}
		if (p.type === 'softail') {
			shockUpperHeightMm = 180;
			shockUpperForwardMm = 160;
			triangleApexHeightMm = 80;
			triangleApexForwardMm = 90;
		}
		if (p.type === 'twin_shock') {
			shockUpperHeightMm = 600;
			shockUpperForwardMm = 20;
			shockLowerFromAxleMm = 80;
		}
		if (p.type === 'linkage') {
			shockUpperHeightMm = 520;
			shockUpperForwardMm = 40;
			rockerPivotHeightMm = 500;
		}
	}

	let prevType = $state<RearSuspensionType | null>(null);
	let initialized = $state(false);

	$effect(() => {
		if (!browser || initialized) return;
		const lastType = localStorage.getItem(STORAGE_PREFIX + 'lastType') as RearSuspensionType | null;
		if (lastType && suspensionTypes.some((t) => t.value === lastType)) suspensionType = lastType;
		const saved = loadDesign(suspensionType);
		if (saved) applyDesignState(saved);
		prevType = suspensionType;
		initialized = true;
		void (async () => {
			const name = getLastFileName();
			if (!name) return;
			const design = await loadVehicleDesign(name);
			if (design?.rearEnd) {
				const re = design.rearEnd as DesignState & { suspensionType?: RearSuspensionType };
				if (re.suspensionType) suspensionType = re.suspensionType;
				applyDesignState(re);
			}
		})();
	});

	$effect(() => {
		if (!initialized) return;
		const current = suspensionType;
		untrack(() => {
			if (prevType !== null && prevType !== current) {
				saveDesign(prevType, currentDesignState());
				const saved = loadDesign(current);
				if (saved) applyDesignState(saved);
			}
			prevType = current;
			if (browser) localStorage.setItem(STORAGE_PREFIX + 'lastType', current);
		});
	});

	$effect(() => {
		if (!initialized) return;
		saveDesign(suspensionType, currentDesignState());
	});

	const tireParams = $derived(parseTireDesignation(tireDesignation));
	const tireDims = $derived(tireParams ? computeTireDimensions(tireParams) : null);

	const inputs = $derived<RearEndInputs>({
		suspensionType,
		shockAction,
		swingarmLengthMm,
		pivotHeightMm,
		shockEyeToEyeMm,
		shockStrokeMm,
		compressionPct,
		shockLowerFromAxleMm,
		shockUpperForwardMm,
		shockUpperHeightMm,
		triangleApexForwardMm,
		triangleApexHeightMm,
		rockerPivotForwardMm,
		rockerPivotHeightMm,
		rockerLengthMm,
		dogboneOnArmMm,
		dogboneLengthMm,
		countershaftForwardMm,
		countershaftHeightOffPivotMm,
		rearSprocketRadiusMm,
		frontSprocketRadiusMm,
	});

	const results = $derived(tireDims ? computeRearEnd(inputs, tireDims) : null);
	const typeNote = $derived(suspensionTypes.find((t) => t.value === suspensionType)?.note ?? '');
	const hasShock = $derived(suspensionType !== 'hardtail');
	const hasTriangle = $derived(suspensionType === 'cantilever' || suspensionType === 'softail');
	const hasLinkage = $derived(suspensionType === 'linkage');
	let showLeverageChart = $state(false);
</script>

<div class="flex flex-col min-h-0 flex-1 gap-2">
	<div class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-gray-950 pb-1">
		<h2 class="text-2xl font-bold whitespace-nowrap">Rear End Geometry</h2>
		<div class="ml-auto flex items-center gap-2">
			<input
				type="text"
				bind:value={vehicleName}
				list="vehicle-list-re"
				class="w-36 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 focus:border-orange-500 focus:outline-none"
				placeholder="vehicle name"
			/>
			<datalist id="vehicle-list-re">
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

	<div class="flex-1 min-h-0 grid grid-cols-[minmax(300px,24rem)_minmax(0,1fr)] gap-4">
		<div class="min-h-0 overflow-y-auto pr-1 space-y-4">
			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Suspension Type</h3>
				<select bind:value={suspensionType} class="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500">
					{#each suspensionTypes as st}
						<option value={st.value}>{st.label}</option>
					{/each}
				</select>
				<p class="text-xs text-gray-500 leading-relaxed">{typeNote}</p>
				{#if hasShock}
					<div class="flex gap-3 pt-1">
						<label class="flex items-center gap-1.5 text-xs text-gray-400">
							<input type="radio" bind:group={shockAction} value="compression" class="accent-orange-500" />
							Compression
						</label>
						<label class="flex items-center gap-1.5 text-xs text-gray-400">
							<input type="radio" bind:group={shockAction} value="expansion" class="accent-orange-500" />
							Expansion
						</label>
					</div>
					<p class="text-[11px] text-gray-600">
						{shockAction === 'compression'
							? 'Wheel up shortens the shock (twin-shock, cantilever, most linkage).'
							: 'Wheel up lengthens the shock (classic under-frame Softail).'}
					</p>
				{/if}
			</div>

			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Tire / Wheel</h3>
				<label class="block">
					<span class="text-xs text-gray-500">Tire designation (e.g. 150/80B16)</span>
					<input type="text" bind:value={tireDesignation} class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500" />
				</label>
				{#if tireParams && tireDims}
					<div class="grid grid-cols-2 gap-2 text-xs text-gray-400">
						<div>Width: <span class="text-gray-200">{tireDims.widthMm} mm</span></div>
						<div>Section: <span class="text-gray-200">{tireDims.sectionHeightMm.toFixed(1)} mm</span></div>
						<div>Rim dia: <span class="text-gray-200">{tireDims.rimDiameterMm.toFixed(1)} mm</span></div>
						<div>Outer dia: <span class="text-gray-200">{tireDims.outerDiameterMm.toFixed(1)} mm</span></div>
					</div>
				{:else}
					<p class="text-xs text-red-400">Invalid tire designation. Use format like 150/80B16</p>
				{/if}
			</div>

			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Geometry Parameters</h3>
				<div class="flex flex-wrap gap-x-4 gap-y-1">
					{#each bikePresets as bp}
						<label class="flex items-center gap-1.5">
							<input type="checkbox" checked={activePreset === bp.value} onchange={() => applyPreset(bp.value)} class="accent-orange-500" />
							<span class="text-xs text-gray-400">{bp.label}</span>
						</label>
					{/each}
				</div>

				<LengthSlider label={suspensionType === 'hardtail' ? 'Frame rail length (pivot to axle)' : 'Swingarm length (pivot to axle)'} bind:value={swingarmLengthMm} min={280} max={800} />
				<LengthSlider label={suspensionType === 'hardtail' ? 'Rail height at front joint (from ground)' : 'Pivot height (from ground)'} bind:value={pivotHeightMm} min={150} max={600} />

				{#if hasShock}
					<div class="flex items-center gap-3 pt-2">
						<div class="flex-1 border-t border-gray-700"></div>
						<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Shock</span>
						<div class="flex-1 border-t border-gray-700"></div>
					</div>
					<LengthSlider label="Eye-to-eye length" bind:value={shockEyeToEyeMm} min={180} max={500} />
					<LengthSlider label="Shock stroke" bind:value={shockStrokeMm} min={20} max={180} />
					<label class="block">
						<span class="text-xs text-gray-500">Travel used (%)</span>
						<div class="flex items-center gap-2 mt-1">
							<input type="range" min="0" max="100" step="1" bind:value={compressionPct} class="flex-1 accent-orange-500" />
							<input type="number" bind:value={compressionPct} class="w-[4.25rem] rounded-md bg-gray-800 border border-gray-700 px-1.5 py-1 text-sm text-right font-mono" />
							<span class="text-[10px] text-gray-500 w-5">%</span>
						</div>
					</label>
					<LengthSlider label="Lower mount from axle (along arm)" bind:value={shockLowerFromAxleMm} min={0} max={400} />
					<LengthSlider label="Upper mount forward of pivot" bind:value={shockUpperForwardMm} min={-200} max={400} />
					<LengthSlider label="Upper mount height (from ground)" bind:value={shockUpperHeightMm} min={80} max={900} />
				{/if}

				{#if hasTriangle}
					<div class="flex items-center gap-3 pt-2">
						<div class="flex-1 border-t border-gray-700"></div>
						<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Triangle</span>
						<div class="flex-1 border-t border-gray-700"></div>
					</div>
					<LengthSlider label="Apex forward of axle" bind:value={triangleApexForwardMm} min={20} max={400} />
					<LengthSlider label="Apex height above axle" bind:value={triangleApexHeightMm} min={20} max={400} />
				{/if}

				{#if hasLinkage}
					<div class="flex items-center gap-3 pt-2">
						<div class="flex-1 border-t border-gray-700"></div>
						<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Linkage</span>
						<div class="flex-1 border-t border-gray-700"></div>
					</div>
					<LengthSlider label="Rocker pivot forward of swingarm pivot" bind:value={rockerPivotForwardMm} min={-80} max={200} />
					<LengthSlider label="Rocker pivot height" bind:value={rockerPivotHeightMm} min={200} max={700} />
					<LengthSlider label="Rocker length" bind:value={rockerLengthMm} min={40} max={180} />
					<LengthSlider label="Dogbone on arm (from axle)" bind:value={dogboneOnArmMm} min={40} max={400} />
					<LengthSlider label="Dogbone length" bind:value={dogboneLengthMm} min={60} max={320} />
				{/if}

				<div class="flex items-center gap-3 pt-2">
					<div class="flex-1 border-t border-gray-700"></div>
					<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Driveline</span>
					<div class="flex-1 border-t border-gray-700"></div>
				</div>
				<LengthSlider label="Countershaft forward of pivot" bind:value={countershaftForwardMm} min={-120} max={80} />
				<LengthSlider label="Countershaft height vs pivot" bind:value={countershaftHeightOffPivotMm} min={-80} max={80} />
				<LengthSlider label="Swingarm section" bind:value={swingarmSectionMm} min={16} max={80} />
			</div>
		</div>

		<div class="min-h-0 flex flex-col gap-3">
			<div class="shrink-0 flex items-center gap-2">
				<select bind:value={viewSide} class="rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200">
					<option value="right">Right side view</option>
					<option value="left">Left side view</option>
				</select>
				<span class="text-[10px] text-gray-600">Shift+wheel zoom. Drag to pan. Floating view stays where you leave it.</span>
			</div>
			<div class="flex-1 min-h-0 rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
				{#if results && tireDims}
					<RearEndDiagram
						{results}
						tire={tireDims}
						{suspensionType}
						{shockAction}
						{swingarmSectionMm}
						{viewSide}
					/>
				{:else}
					<div class="flex h-full items-center justify-center text-sm text-gray-500">Enter a valid tire designation to draw.</div>
				{/if}
			</div>

			{#if results && tireDims}
				<div class="shrink-0 overflow-y-auto max-h-[30vh] rounded-lg border border-gray-800 bg-gray-900 p-4">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Calculated Results</h3>
						<button type="button" class="text-xs {showLeverageChart ? 'text-orange-400' : 'text-gray-500'}" onclick={() => showLeverageChart = !showLeverageChart}>
							Leverage
						</button>
					</div>
					<div class="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
						<div class="text-gray-400">Swingarm angle</div>
						<div class="text-gray-100 font-mono text-right">{results.swingarmAngleDeg.toFixed(1)}&deg;</div>
						<div class="text-gray-400">Axle height</div>
						<div class="text-gray-100 font-mono text-right">{results.axleCenter.y.toFixed(1)} mm ({mmToIn(results.axleCenter.y).toFixed(2)}")</div>
						<div class="text-gray-400">Pivot height</div>
						<div class="text-gray-100 font-mono text-right">{results.pivot.y.toFixed(1)} mm ({mmToIn(results.pivot.y).toFixed(2)}")</div>
						<div class="text-gray-400">Pivot to axle (horiz.)</div>
						<div class="text-gray-100 font-mono text-right">{results.pivot.x.toFixed(1)} mm ({mmToIn(results.pivot.x).toFixed(2)}")</div>
						{#if hasShock}
							<div class="text-gray-400">Shock length</div>
							<div class="text-gray-100 font-mono text-right">{results.shockLengthMm.toFixed(1)} mm ({mmToIn(results.shockLengthMm).toFixed(2)}")</div>
							<div class="text-gray-400">Stroke used</div>
							<div class="text-gray-100 font-mono text-right">{results.shockStrokeUsedMm.toFixed(1)} mm</div>
							<div class="text-gray-400">Wheel travel (this pose)</div>
							<div class="text-gray-100 font-mono text-right">{results.wheelTravelMm.toFixed(1)} mm ({mmToIn(results.wheelTravelMm).toFixed(2)}")</div>
							<div class="text-gray-400">Full wheel travel</div>
							<div class="text-gray-100 font-mono text-right">{results.wheelTravelFullMm.toFixed(1)} mm ({mmToIn(results.wheelTravelFullMm).toFixed(2)}")</div>
							<div class="text-gray-400 group relative">
								Leverage ratio
								<span class="invisible group-hover:visible absolute left-0 top-full mt-1 z-20 w-56 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 shadow-lg">
									Wheel travel per shock travel at this pose. &gt;1 means the wheel moves more than the shock (rising-rate toward 1 is typical of linkage).
								</span>
							</div>
							<div class="text-gray-100 font-mono text-right">{results.leverageRatio.toFixed(2)}</div>
							<div class="text-gray-400">Leverage @ ~30% sag</div>
							<div class="text-orange-300 font-mono text-right">{results.leverageAtSag.toFixed(2)}</div>
						{/if}
					</div>
					{#if showLeverageChart && hasShock}
						<p class="mt-3 text-xs text-gray-400 leading-relaxed">
							At this pose the wheel moves {results.leverageRatio.toFixed(2)} mm for each mm of shock travel.
							Twin-shock layouts sit near 1. Cantilever and linkage change the ratio through the stroke.
							Expansion softails invert the motion: bump lengthens the damper.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

{#if loadModalVisible}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onclick={() => loadModalVisible = false} role="presentation">
		<div class="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()} role="dialog">
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
