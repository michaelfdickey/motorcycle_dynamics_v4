<script lang="ts">

	import { parseTireDesignation, computeTireDimensions } from '$lib/tire';

	import { computeFrontEnd, type SuspensionType, type FrontEndInputs } from '$lib/frontEndGeometry';

	import FrontEndDiagram from '$lib/components/FrontEndDiagram.svelte';

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



	// â”€â”€ Persistence helpers â”€â”€



	const STORAGE_PREFIX = 'mototelos_frontEnd_';



	type DesignState = {

		tireDesignation: string;

		rakeAngleDeg: number;

		forkOffsetMm: number;

		forkLengthMm: number;

		forkTravelMm: number;

		compressionPct: number;

		forkTubeSize: string;

		invertedForks: boolean;

		steeringColumnHeightMm: number;

		steeringColumnLengthIn: number;

		spindleOffsetMm: number;

		spindleHeightMm: number;

		suspensionOffsetMm: number;

		suspensionHeightMm: number;

		suspUpperMountHeightMm: number;

		suspUpperMountOffsetMm: number;

		linkLengthMm: number;

		linkOffsetMm: number;

	};



	function storageKey(type: SuspensionType): string {

		return STORAGE_PREFIX + type;

	}



	function loadDesign(type: SuspensionType): DesignState | null {

		if (!browser) return null;

		try {

			const raw = localStorage.getItem(storageKey(type));

			return raw ? JSON.parse(raw) : null;

		} catch { return null; }

	}



	function saveDesign(type: SuspensionType, state: DesignState): void {

		if (!browser) return;

		localStorage.setItem(storageKey(type), JSON.stringify(state));

	}



	function currentDesignState(): DesignState {

		return {

			tireDesignation, rakeAngleDeg, forkOffsetMm, forkLengthMm,

			forkTravelMm, compressionPct, forkTubeSize, invertedForks,

			steeringColumnHeightMm, steeringColumnLengthIn,

			spindleOffsetMm, spindleHeightMm,

			suspensionOffsetMm, suspensionHeightMm, suspUpperMountHeightMm,
			suspUpperMountOffsetMm,
			linkLengthMm, linkOffsetMm,

		};

	}



	function applyDesignState(s: DesignState): void {

		tireDesignation = s.tireDesignation;

		rakeAngleDeg = s.rakeAngleDeg;

		forkOffsetMm = s.forkOffsetMm;

		forkLengthMm = s.forkLengthMm;

		forkTravelMm = s.forkTravelMm;

		compressionPct = s.compressionPct;

		forkTubeSize = s.forkTubeSize;

		invertedForks = s.invertedForks;

		steeringColumnHeightMm = s.steeringColumnHeightMm;

		steeringColumnLengthIn = s.steeringColumnLengthIn;

		spindleOffsetMm = s.spindleOffsetMm;

		spindleHeightMm = s.spindleHeightMm;

		suspensionOffsetMm = s.suspensionOffsetMm;

		suspensionHeightMm = s.suspensionHeightMm;

		suspUpperMountHeightMm = s.suspUpperMountHeightMm ?? 0;

		suspUpperMountOffsetMm = s.suspUpperMountOffsetMm ?? 0;

		linkLengthMm = s.linkLengthMm;

		linkOffsetMm = s.linkOffsetMm;

	}



	// â”€â”€ Vehicle Save/Load â”€â”€

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

		// Load existing design to merge with (preserves brakes, etc.)

		const existing = await loadVehicleDesign(vehicleName.trim());

		const design: VehicleDesign = {

			...(existing || {}),

			name: vehicleName.trim(),

			version: 1,

			savedAt: new Date().toISOString(),

			frontEnd: {

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

		if (design.frontEnd) {

			const fe = design.frontEnd as DesignState & { suspensionType?: SuspensionType };

			if (fe.suspensionType) suspensionType = fe.suspensionType;

			applyDesignState({

				tireDesignation: fe.tireDesignation ?? tireDesignation,

				rakeAngleDeg: fe.rakeAngleDeg ?? rakeAngleDeg,

				forkOffsetMm: fe.forkOffsetMm ?? forkOffsetMm,

				forkLengthMm: fe.forkLengthMm ?? forkLengthMm,

				forkTravelMm: fe.forkTravelMm ?? forkTravelMm,

				compressionPct: fe.compressionPct ?? compressionPct,

				forkTubeSize: fe.forkTubeSize ?? forkTubeSize,

				invertedForks: fe.invertedForks ?? invertedForks,

				steeringColumnHeightMm: fe.steeringColumnHeightMm ?? steeringColumnHeightMm,

				steeringColumnLengthIn: fe.steeringColumnLengthIn ?? steeringColumnLengthIn,

				spindleOffsetMm: fe.spindleOffsetMm ?? spindleOffsetMm,

				spindleHeightMm: fe.spindleHeightMm ?? spindleHeightMm,

				suspensionOffsetMm: fe.suspensionOffsetMm ?? suspensionOffsetMm,

				suspensionHeightMm: fe.suspensionHeightMm ?? suspensionHeightMm,

				suspUpperMountHeightMm: fe.suspUpperMountHeightMm ?? suspUpperMountHeightMm,

				suspUpperMountOffsetMm: fe.suspUpperMountOffsetMm ?? suspUpperMountOffsetMm,

				linkLengthMm: fe.linkLengthMm ?? linkLengthMm,

				linkOffsetMm: fe.linkOffsetMm ?? linkOffsetMm,

			});

		}

		loadModalVisible = false;

	}



	async function handleDeleteVehicle(name: string) {

		const ok = await deleteVehicleDesign(name);

		if (ok) {

			savedVehicles = savedVehicles.filter(v => v.name !== name);

		}

	}



	// â”€â”€ Unit Conversion â”€â”€

	const MM_PER_IN = 25.4;

	function mmToIn(mm: number): number { return mm / MM_PER_IN; }

	function inToMm(inches: number): number { return inches * MM_PER_IN; }



	// â”€â”€ State â”€â”€



	let viewSide = $state<'right' | 'left'>('right');
	let unitSystem = $state<'metric' | 'us'>('metric');

	let suspensionType = $state<SuspensionType>('telescopic');

	let tireDesignation = $state('120/70ZR17');

	let rakeAngleDeg = $state(25);

	let forkOffsetMm = $state(35);

	let forkLengthMm = $state(500);

	let forkTravelMm = $state(120);

	let compressionPct = $state(0);

	let forkTubeSize = $state('41/54');

	let invertedForks = $state(false);

	let steeringColumnHeightMm = $state(150);

	let steeringColumnLengthIn = $state(8);

	let spindleOffsetMm = $state(0);

	let spindleHeightMm = $state(0);

	let suspensionOffsetMm = $state(0);

	let suspensionHeightMm = $state(50);

	let suspUpperMountHeightMm = $state(0);

	let suspUpperMountOffsetMm = $state(0);

	let linkLengthMm = $state(200);

	let linkOffsetMm = $state(0);



	const forkTubeSizes = [

		{ value: '33/46', label: 'Small - 33mm / 46mm (1.30" / 1.81")' },

		{ value: '37/50', label: 'Small - 37mm / 50mm (1.46" / 1.97")' },

		{ value: '41/54', label: 'Mid - 41mm / 54mm (1.61" / 2.13")' },

		{ value: '43/56', label: 'Mid - 43mm / 56mm (1.69" / 2.20")' },

		{ value: '43/58', label: 'Liter - 43mm / 58mm (1.69" / 2.28")' },

		{ value: '46/60', label: 'Liter - 46mm / 60mm (1.81" / 2.36")' },

		{ value: '48/62', label: 'USD - 48mm / 62mm (1.89" / 2.44")' },

		{ value: '50/65', label: 'USD - 50mm / 65mm (1.97" / 2.56")' },

	];



	const stanchionDiaMm = $derived(Number(forkTubeSize.split('/')[0]));

	const sliderDiaMm = $derived(Number(forkTubeSize.split('/')[1]));



	type BikePreset = 'sport' | 'touring' | 'dualsport' | 'offroad' | 'cruiser';

	let activePreset = $state<BikePreset | null>(null);



	const bikePresets: { value: BikePreset; label: string; offset: number; length: number; travel: number; rake: number; tubeSize: string; inverted: boolean }[] = [

		{ value: 'sport',    label: 'Sport Bike',  offset: 30,  length: 500, travel: 120, rake: 24,   tubeSize: '43/56', inverted: true },

		{ value: 'touring',  label: 'Touring',     offset: 35,  length: 580, travel: 130, rake: 27,   tubeSize: '43/56', inverted: false },

		{ value: 'dualsport', label: 'Dual Sport', offset: 40,  length: 650, travel: 200, rake: 27.5, tubeSize: '41/54', inverted: false },

		{ value: 'offroad',  label: 'Off Road',    offset: 22,  length: 750, travel: 300, rake: 27,   tubeSize: '48/62', inverted: true },

		{ value: 'cruiser',  label: 'Cruiser',     offset: 40,  length: 550, travel: 130, rake: 32,   tubeSize: '41/54', inverted: false },

	];



	function applyPreset(preset: BikePreset) {

		if (activePreset === preset) {

			activePreset = null;

			return;

		}

		activePreset = preset;

		const p = bikePresets.find(b => b.value === preset)!;

		forkOffsetMm = p.offset;

		forkLengthMm = p.length;

		forkTravelMm = p.travel;

		rakeAngleDeg = p.rake;

		forkTubeSize = p.tubeSize;

		invertedForks = p.inverted;

	}



	const suspensionTypes: { value: SuspensionType; label: string }[] = [

		{ value: 'telescopic', label: 'Telescopic Fork' },

		{ value: 'leading_link', label: 'Leading Link' },

		{ value: 'trailing_link', label: 'Trailing Link' },

	];



	// â”€â”€ Persistence: load on mount, save on change, swap on type switch â”€â”€



	let prevSuspType = $state<SuspensionType | null>(null);

	let initialized = $state(false);



	// Load saved state for the initial suspension type on mount

	$effect(() => {

		if (!browser || initialized) return;

		// Also load last-used suspension type

		const lastType = localStorage.getItem(STORAGE_PREFIX + 'lastType') as SuspensionType | null;

		if (lastType && ['telescopic', 'leading_link', 'trailing_link'].includes(lastType)) {

			suspensionType = lastType;

		}

		const saved = loadDesign(suspensionType);

		if (saved) applyDesignState(saved);

		prevSuspType = suspensionType;

		initialized = true;

	});



	// When suspension type changes, save old and load new

	$effect(() => {

		if (!initialized) return;

		const current = suspensionType; // track this

		untrack(() => {

			if (prevSuspType !== null && prevSuspType !== current) {

				// Save the design we're leaving

				saveDesign(prevSuspType, currentDesignState());

				// Load the design for the new type (if any)

				const saved = loadDesign(current);

				if (saved) applyDesignState(saved);

			}

			prevSuspType = current;

			if (browser) localStorage.setItem(STORAGE_PREFIX + 'lastType', current);

		});

	});



	// Auto-save current design on any parameter change (debounced via $effect)

	$effect(() => {

		if (!initialized) return;

		const state = currentDesignState();

		// Reading all fields above makes this effect track them

		saveDesign(suspensionType, state);

	});



	// â”€â”€ Derived â”€â”€



	const tireParams = $derived(parseTireDesignation(tireDesignation));

	const tireDims = $derived(tireParams ? computeTireDimensions(tireParams) : null);



	const inputs = $derived<FrontEndInputs>({

		suspensionType,

		rakeAngleDeg,

		forkOffsetMm,

		forkLengthMm,

		steeringColumnHeightMm,

		linkLengthMm,

		linkOffsetMm,

	});



	const steeringColumnLengthMm = $derived(steeringColumnLengthIn * 25.4);

	const results = $derived(tireDims ? computeFrontEnd(inputs, tireDims) : null);



	const isLinkType = $derived(

		suspensionType === 'leading_link' || suspensionType === 'trailing_link'

	);



	// --- Trail sweep across suspension travel (for min/max and chart) ---

	// Replicates the diagram's link rotation math to compute trail at each compression step



	const trailSweep = $derived.by(() => {

		if (!results || !tireDims) return null;



		const rakeRad = rakeAngleDeg * Math.PI / 180;

		const cosRake = Math.cos(rakeRad);

		const sinRake = Math.sin(rakeRad);



		// SA direction (pointing up along axis)

		const saDir = { x: -sinRake, y: cosRake };

		const saPerp = { x: saDir.y, y: -saDir.x };



		const scCenter = results.steeringColumnCenter;

		const scLength = steeringColumnLengthMm;

		const forkOffsetSigned = forkOffsetMm * (saPerp.x >= 0 ? 1 : -1);



		// Triple tree geometry

		const ttGap = 10;

		const ttThickness = 20;

		const lowerTtOuterT = -(scLength / 2 + ttGap + ttThickness);

		const stanchionTopT = scLength / 2 + ttGap + ttThickness + ttThickness;

		const solidForkBottomT = stanchionTopT - forkLengthMm;

		const forkBottomForSpindle = suspensionType === 'telescopic' ? solidForkBottomT : solidForkBottomT;



		// forkPoint helper

		function forkPoint(t: number) {

			return {

				x: scCenter.x + t * saDir.x + forkOffsetSigned * saPerp.x,

				y: scCenter.y + t * saDir.y + forkOffsetSigned * saPerp.y,

			};

		}



		const spindleOuterR = 25.4;



		// Fork cap center (pivot for link rotation)

		const forkCapCenter = forkPoint(forkBottomForSpindle - 25.4);



		// Rest spindle position

		const spindleBaseT = forkBottomForSpindle - spindleOuterR + spindleHeightMm;

		const spindleBase = forkPoint(spindleBaseT);

		const spindleRestX = spindleBase.x + spindleOffsetMm * saPerp.x;

		const spindleRestY = spindleBase.y + spindleOffsetMm * saPerp.y;



		// Rest lower susp mount position

		const suspBaseT = forkBottomForSpindle - spindleOuterR + suspensionHeightMm;

		const suspBase = forkPoint(suspBaseT);

		const suspRestX = suspBase.x + suspensionOffsetMm * saPerp.x;

		const suspRestY = suspBase.y + suspensionOffsetMm * saPerp.y;



		// Upper mount (fixed)

		const upperBaseT = lowerTtOuterT + suspUpperMountHeightMm;

		const upperBase = forkPoint(upperBaseT);

		const upperX = upperBase.x + suspensionOffsetMm * saPerp.x;

		const upperY = upperBase.y + suspensionOffsetMm * saPerp.y;



		// For telescopic, trail doesn't change with compression in this simplified model

		if (suspensionType === 'telescopic') {

			const trail = results.trailMm;

			return { min: trail, max: trail, data: [{ pct: 0, trail }, { pct: 100, trail }] };

		}



		// Sweep compression from 0 to 100

		const steps = 50;

		const data: { pct: number; trail: number }[] = [];

		let min = Infinity, max = -Infinity;



		for (let i = 0; i <= steps; i++) {

			const pct = (i / steps) * 100;



			// Compute rotation angle at this compression

			const armDx = suspRestX - forkCapCenter.x;

			const armDy = suspRestY - forkCapCenter.y;

			const armLen = Math.sqrt(armDx * armDx + armDy * armDy);

			if (armLen < 1) { data.push({ pct, trail: 0 }); continue; }



			const shockRestLen = Math.sqrt(

				(upperX - suspRestX) ** 2 + (upperY - suspRestY) ** 2

			);

			const targetShockLen = shockRestLen - forkTravelMm * pct / 100;

			if (targetShockLen < 1) { data.push({ pct, trail: 0 }); continue; }



			const restAngle = Math.atan2(armDy, armDx);



			// Determine rotation direction

			const testDelta = 0.01;

			const pxPos = forkCapCenter.x + armLen * Math.cos(restAngle + testDelta);

			const pyPos = forkCapCenter.y + armLen * Math.sin(restAngle + testDelta);

			const distPos = Math.sqrt((upperX - pxPos) ** 2 + (upperY - pyPos) ** 2);

			const pxNeg = forkCapCenter.x + armLen * Math.cos(restAngle - testDelta);

			const pyNeg = forkCapCenter.y + armLen * Math.sin(restAngle - testDelta);

			const distNeg = Math.sqrt((upperX - pxNeg) ** 2 + (upperY - pyNeg) ** 2);

			const searchDir = distPos < distNeg ? 1 : -1;



			let lo = 0, hi = Math.PI / 2;

			for (let j = 0; j < 30; j++) {

				const mid = (lo + hi) / 2;

				const testAngle = restAngle + searchDir * mid;

				const px = forkCapCenter.x + armLen * Math.cos(testAngle);

				const py = forkCapCenter.y + armLen * Math.sin(testAngle);

				const dist = Math.sqrt((upperX - px) ** 2 + (upperY - py) ** 2);

				if (dist > targetShockLen) lo = mid; else hi = mid;

			}

			const rotAngle = searchDir * (lo + hi) / 2;



			// Rotate spindle

			const sdx = spindleRestX - forkCapCenter.x;

			const sdy = spindleRestY - forkCapCenter.y;

			const cos = Math.cos(rotAngle);

			const sin = Math.sin(rotAngle);

			const spX = forkCapCenter.x + sdx * cos - sdy * sin;

			const spY = forkCapCenter.y + sdx * sin + sdy * cos;



			// Trail calculation: ground at bottom of tire, SA ground intersection

			const groundY = spY - tireDims.outerRadiusMm;

			const contactPatchX = spX;

			// SA ground intersection

			const tSA = Math.abs(saDir.y) > 1e-9 ? (groundY - scCenter.y) / saDir.y : 0;

			const saGroundX = scCenter.x + tSA * saDir.x;

			const trail = Math.abs(saGroundX - contactPatchX);



			data.push({ pct, trail });

			if (trail < min) min = trail;

			if (trail > max) max = trail;

		}



		return { min, max, data };

	});



	// Sag is ~30% compression - industry standard for rider weight at cruise

	const sagPct = 30;



	// Current trail at the active compression percentage

	const currentTrail = $derived.by(() => {

		if (!trailSweep) return results?.trailMm ?? 0;

		const idx = Math.round(compressionPct / 100 * (trailSweep.data.length - 1));

		return trailSweep.data[idx]?.trail ?? results?.trailMm ?? 0;

	});



	// Trail at sag (30% compression)

	const trailAtSag = $derived.by(() => {

		if (!trailSweep) return results?.trailMm ?? 0;

		const idx = Math.round(sagPct / 100 * (trailSweep.data.length - 1));

		return trailSweep.data[idx]?.trail ?? results?.trailMm ?? 0;

	});



	// Suspension length sweep

	const suspLengthSweep = $derived.by(() => {

		if (!results || !tireDims || !isLinkType) return null;



		const rakeRad = rakeAngleDeg * Math.PI / 180;

		const saDir = { x: -Math.sin(rakeRad), y: Math.cos(rakeRad) };

		const saPerp = { x: saDir.y, y: -saDir.x };

		const scCenter = results.steeringColumnCenter;

		const forkOffsetSigned = forkOffsetMm * (saPerp.x >= 0 ? 1 : -1);

		const ttGap = 10, ttThickness = 20;

		const lowerTtOuterT = -(steeringColumnLengthMm / 2 + ttGap + ttThickness);

		const stanchionTopT = steeringColumnLengthMm / 2 + ttGap + ttThickness + ttThickness;

		const solidForkBottomT = stanchionTopT - forkLengthMm;

		const spindleOuterR = 25.4;



		function forkPoint(t: number) {

			return {

				x: scCenter.x + t * saDir.x + forkOffsetSigned * saPerp.x,

				y: scCenter.y + t * saDir.y + forkOffsetSigned * saPerp.y,

			};

		}



		const suspBaseT = solidForkBottomT - spindleOuterR + suspensionHeightMm;

		const suspBase = forkPoint(suspBaseT);

		const suspRestX = suspBase.x + suspensionOffsetMm * saPerp.x;

		const suspRestY = suspBase.y + suspensionOffsetMm * saPerp.y;



		const upperBaseT = lowerTtOuterT + suspUpperMountHeightMm;

		const upperBase = forkPoint(upperBaseT);

		const upperX = upperBase.x + suspensionOffsetMm * saPerp.x;

		const upperY = upperBase.y + suspensionOffsetMm * saPerp.y;



		const restLen = Math.sqrt((upperX - suspRestX) ** 2 + (upperY - suspRestY) ** 2);

		const minLen = restLen - forkTravelMm;



		return { rest: restLen, min: minLen, max: restLen, travel: forkTravelMm };

	});



	let showTrailChart = $state(false);

</script>



<div class="space-y-6">

	<div class="flex flex-wrap items-center gap-x-4 gap-y-2">

		<h2 class="text-2xl font-bold whitespace-nowrap">Front End Geometry</h2>

		<div class="ml-auto flex items-center gap-2">

			<input type="text" bind:value={vehicleName}

				list="vehicle-list-fe"

				class="w-36 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 focus:border-orange-500 focus:outline-none"

				placeholder="vehicle name" />

			<datalist id="vehicle-list-fe">

				{#each savedVehicles as v}

					<option value={v.name}></option>

				{/each}

			</datalist>

			<button onclick={handleSave}

				class="px-3 py-1 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors">

				{saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? 'OK' : 'Save'}

			</button>

			<button onclick={handleLoad}

				class="px-3 py-1 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors">

				Load

			</button>

		</div>

	</div>



	<div class="grid gap-6" class:grid-cols-[minmax(280px,1fr)_2fr]={!showTrailChart} class:grid-cols-[minmax(260px,1fr)_2fr_2fr]={showTrailChart}>

		<!-- â”€â”€ Left column: Inputs â”€â”€ -->

		<div class="space-y-4">



			<!-- Suspension type -->

			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">

				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Suspension Type</h3>

				<select

					bind:value={suspensionType}

					class="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500"

				>

					{#each suspensionTypes as st}

						<option value={st.value}>{st.label}</option>

					{/each}

				</select>

			</div>



			<!-- Tire / Wheel -->

			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">

				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Tire / Wheel</h3>

				<label class="block">

					<span class="text-xs text-gray-500">Tire designation (e.g. 120/70ZR17)</span>

					<input

						type="text"

						bind:value={tireDesignation}

						class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500"

					/>

				</label>

				{#if tireParams && tireDims}

					<div class="grid grid-cols-2 gap-2 text-xs text-gray-400">

						<div>Width: <span class="text-gray-200">{tireDims.widthMm} mm ({mmToIn(tireDims.widthMm).toFixed(2)}")</span></div>

						<div>Section height: <span class="text-gray-200">{tireDims.sectionHeightMm.toFixed(1)} mm ({mmToIn(tireDims.sectionHeightMm).toFixed(2)}")</span></div>

						<div>Rim dia: <span class="text-gray-200">{tireDims.rimDiameterMm.toFixed(1)} mm ({mmToIn(tireDims.rimDiameterMm).toFixed(2)}")</span></div>

						<div>Outer dia: <span class="text-gray-200">{tireDims.outerDiameterMm.toFixed(1)} mm ({mmToIn(tireDims.outerDiameterMm).toFixed(2)}")</span></div>

					</div>

				{:else}

					<p class="text-xs text-red-400">Invalid tire designation. Use format like 120/70ZR17</p>

				{/if}

			</div>



			<!-- Geometry parameters -->

			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">

				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Geometry Parameters</h3>



				<label class="block">

					<span class="text-xs text-gray-500">Rake angle (deg from vertical)</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-10" max="60" step="0.5"

							bind:value={rakeAngleDeg}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="0.5" min="-10" max="60"

							bind:value={rakeAngleDeg}

							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/>

					</div>

				</label>



				<!-- Fork section divider -->

				<div class="flex items-center gap-3 pt-2">

					<div class="flex-1 border-t border-gray-700"></div>

					<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fork</span>

					<div class="flex-1 border-t border-gray-700"></div>

				</div>



				<!-- Bike preset checkboxes -->

				<div class="flex flex-wrap gap-x-4 gap-y-1">

					{#each bikePresets as bp}

						<label class="flex items-center gap-1.5">

							<input

								type="checkbox"

								checked={activePreset === bp.value}

								onchange={() => applyPreset(bp.value)}

								class="accent-orange-500"

							/>

							<span class="text-xs text-gray-400">{bp.label}</span>

						</label>

					{/each}

				</div>



				<div class="flex items-center gap-4">

					<label class="flex items-center gap-2">

						<input

							type="checkbox"

							bind:checked={invertedForks}

							class="accent-orange-500"

						/>

						<span class="text-xs text-gray-500">Inverted (USD)</span>

					</label>

				</div>



				<label class="block">

					<span class="text-xs text-gray-500">Fork Tube Size:</span>

					<select

						bind:value={forkTubeSize}

						class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500"

					>

						{#each forkTubeSizes as s}

							<option value={s.value}>{s.label}</option>

						{/each}

					</select>

				</label>



				<label class="block">

					<span class="text-xs text-gray-500">Fork offset</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-152" max="152" step="1"

							bind:value={forkOffsetMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="-152" max="152"

							bind:value={forkOffsetMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.05" min="-6" max="6"

							value={mmToIn(forkOffsetMm).toFixed(3)}

							oninput={(e) => { forkOffsetMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				<label class="block">

					<span class="text-xs text-gray-500">Fork length - fully extended</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="200" max="900" step="5"

							bind:value={forkLengthMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="100" max="1200"

							bind:value={forkLengthMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.1" min="4" max="48"

							value={mmToIn(forkLengthMm).toFixed(2)}

							oninput={(e) => { forkLengthMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				{#if suspensionType === 'telescopic'}

					<label class="block">

						<span class="text-xs text-gray-500">Fork travel</span>

						<div class="flex items-center gap-2 mt-1">

							<input

								type="range" min="50" max="300" step="5"

								bind:value={forkTravelMm}

								class="flex-1 accent-orange-500"

							/>

							<input

								type="number" step="1" min="20" max="400"

								bind:value={forkTravelMm}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">mm</span>

							<input

								type="number" step="0.1" min="0.5" max="16"

								value={mmToIn(forkTravelMm).toFixed(2)}

								oninput={(e) => { forkTravelMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">in</span>

						</div>

					</label>

				{/if}



				{#if isLinkType}

					<label class="block">

						<span class="text-xs text-gray-500">Shock travel</span>

						<div class="flex items-center gap-2 mt-1">

							<input

								type="range" min="20" max="200" step="5"

								bind:value={forkTravelMm}

								class="flex-1 accent-orange-500"

							/>

							<input

								type="number" step="1" min="10" max="300"

								bind:value={forkTravelMm}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">mm</span>

							<input

								type="number" step="0.1" min="0.5" max="12"

								value={mmToIn(forkTravelMm).toFixed(2)}

								oninput={(e) => { forkTravelMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">in</span>

						</div>

					</label>

				{/if}



					<label class="block">

						<span class="text-xs text-gray-500">Compression ({compressionPct}%)</span>

						<div class="flex items-center gap-2 mt-1">

							<input

								type="range" min="0" max="100" step="1"

								bind:value={compressionPct}

								class="flex-1 accent-orange-500"

							/>

							<input

								type="number" step="1" min="0" max="100"

								bind:value={compressionPct}

								class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/>

						</div>

					</label>



				<!-- Steering Column section divider -->

				<div class="flex items-center gap-3 pt-2">

					<div class="flex-1 border-t border-gray-700"></div>

					<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Steering Column</span>

					<div class="flex-1 border-t border-gray-700"></div>

				</div>



				<label class="block">

					<span class="text-xs text-gray-500">Steering column height</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="50" max="300" step="5"

							bind:value={steeringColumnHeightMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="50" max="500"

							bind:value={steeringColumnHeightMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.1" min="2" max="20"

							value={mmToIn(steeringColumnHeightMm).toFixed(2)}

							oninput={(e) => { steeringColumnHeightMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				<label class="block">

					<span class="text-xs text-gray-500">Steering column length</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="4" max="12" step="0.5"

							bind:value={steeringColumnLengthIn}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="100" max="305"

							value={Math.round(inToMm(steeringColumnLengthIn))}

							oninput={(e) => { steeringColumnLengthIn = Number((Number(e.currentTarget.value) / MM_PER_IN).toFixed(2)); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.5" min="4" max="12"

							bind:value={steeringColumnLengthIn}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				<!-- Spindle Mount / Link section divider -->

				<div class="flex items-center gap-3 pt-2">

					<div class="flex-1 border-t border-gray-700"></div>

					<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">{suspensionType === 'leading_link' ? 'Leading Link' : suspensionType === 'trailing_link' ? 'Trailing Link' : 'Spindle Mount'}</span>

					<div class="flex-1 border-t border-gray-700"></div>

				</div>



				<label class="block">

					<span class="text-xs text-gray-500">Spindle offset - perpendicular to fork</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-101.6" max="101.6" step="1"

							bind:value={spindleOffsetMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="-102" max="102"

							bind:value={spindleOffsetMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.05" min="-4" max="4"

							value={mmToIn(spindleOffsetMm).toFixed(3)}

							oninput={(e) => { spindleOffsetMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				<label class="block">

					<span class="text-xs text-gray-500">Spindle height offset - along fork axis</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-101.6" max="101.6" step="1"

							bind:value={spindleHeightMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="-102" max="102"

							bind:value={spindleHeightMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.05" min="-4" max="4"

							value={mmToIn(spindleHeightMm).toFixed(3)}

							oninput={(e) => { spindleHeightMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				{#if isLinkType}

				<label class="block">

					<span class="text-xs text-gray-500">Suspension offset - perpendicular to fork</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-150" max="150" step="1"

							bind:value={suspensionOffsetMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="-150" max="150"

							bind:value={suspensionOffsetMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.05" min="-6" max="6"

							value={mmToIn(suspensionOffsetMm).toFixed(3)}

							oninput={(e) => { suspensionOffsetMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				<label class="block">

					<span class="text-xs text-gray-500">Suspension height offset - along fork axis</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-101.6" max="101.6" step="1"

							bind:value={suspensionHeightMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="-102" max="102"

							bind:value={suspensionHeightMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.05" min="-4" max="4"

							value={mmToIn(suspensionHeightMm).toFixed(3)}

							oninput={(e) => { suspensionHeightMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>



				<!-- Suspension Upper Mount section divider -->

				<div class="flex items-center gap-2 pt-2">

					<div class="h-px flex-1 bg-gray-700"></div>

					<span class="text-[10px] text-gray-500 uppercase tracking-widest">Suspension Upper Mount</span>

					<div class="h-px flex-1 bg-gray-700"></div>

				</div>



				<label class="block">

					<span class="text-xs text-gray-500">Upper mount height offset - along fork axis from bottom TT</span>

					<div class="flex items-center gap-2 mt-1">

						<input

							type="range" min="-250" max="250" step="1"

							bind:value={suspUpperMountHeightMm}

							class="flex-1 accent-orange-500"

						/>

						<input

							type="number" step="1" min="-250" max="250"

							bind:value={suspUpperMountHeightMm}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">mm</span>

						<input

							type="number" step="0.1" min="-10" max="10"

							value={mmToIn(suspUpperMountHeightMm).toFixed(2)}

							oninput={(e) => { suspUpperMountHeightMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

						/><span class="text-[10px] text-gray-500">in</span>

					</div>

				</label>

				<label class="block">
					<span class="text-xs text-gray-500">Upper mount perpendicular offset - from steering axis</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="-150" max="150" step="1"
							bind:value={suspUpperMountOffsetMm}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="1" min="-150" max="150"
							bind:value={suspUpperMountOffsetMm}
							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/><span class="text-[10px] text-gray-500">mm</span>
						<input
							type="number" step="0.05" min="-6" max="6"
							value={mmToIn(suspUpperMountOffsetMm).toFixed(3)}
							oninput={(e) => { suspUpperMountOffsetMm = Math.round(inToMm(Number(e.currentTarget.value))); }}
							class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/><span class="text-[10px] text-gray-500">in</span>
					</div>
				</label>

				{/if}



				{#if isLinkType}

					<label class="block">

						<span class="text-xs text-gray-500">Link arm length</span>

						<div class="flex items-center gap-2 mt-1">

							<input

								type="range" min="50" max="400" step="5"

								bind:value={linkLengthMm}

								class="flex-1 accent-orange-500"

							/>

							<input

								type="number" step="1" min="20" max="600"

								bind:value={linkLengthMm}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">mm</span>

							<input

								type="number" step="0.1" min="1" max="24"

								value={mmToIn(linkLengthMm).toFixed(2)}

								oninput={(e) => { linkLengthMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">in</span>

						</div>

					</label>



					<label class="block">

						<span class="text-xs text-gray-500">Link offset from steering axis</span>

						<div class="flex items-center gap-2 mt-1">

							<input

								type="range" min="-50" max="50" step="1"

								bind:value={linkOffsetMm}

								class="flex-1 accent-orange-500"

							/>

							<input

								type="number" step="1" min="-100" max="100"

								bind:value={linkOffsetMm}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">mm</span>

							<input

								type="number" step="0.05" min="-4" max="4"

								value={mmToIn(linkOffsetMm).toFixed(3)}

								oninput={(e) => { linkOffsetMm = Math.round(inToMm(Number(e.currentTarget.value))); }}

								class="w-16 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"

							/><span class="text-[10px] text-gray-500">in</span>

						</div>

					</label>

				{/if}

			</div>

		</div>



		<!-- â”€â”€ Right column: Diagram + Results below â”€â”€ -->

		<div class="space-y-4">

		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4">

				<div class="flex items-center justify-between mb-3">

					<select

						bind:value={viewSide}

						class="text-sm font-semibold uppercase tracking-wide bg-gray-800 border border-gray-700 text-gray-400 rounded px-2 py-1 focus:outline-none focus:border-orange-500"

					>

						<option value="right">Right Side View</option>

						<option value="left">Left Side View</option>

					</select>
					<div class="flex items-center gap-1">
						<button type="button" class="px-2 py-1 text-xs rounded {unitSystem === 'metric' ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500'}" onclick={() => unitSystem = 'metric'}>mm</button>
						<button type="button" class="px-2 py-1 text-xs rounded {unitSystem === 'us' ? 'bg-orange-600/30 text-orange-300' : 'text-gray-500'}" onclick={() => unitSystem = 'us'}>in</button>
						<span class="text-[10px] text-gray-600 ml-1">Grid {unitSystem === 'us' ? '6"' : '10 cm'}</span>
					</div>

				</div>

				{#if results && tireDims}

					<div class="aspect-[4/3] w-full">

						<FrontEndDiagram {results} tire={tireDims} {steeringColumnLengthMm} {forkOffsetMm} {forkLengthMm} {suspensionType} {forkTravelMm} {compressionPct} {spindleOffsetMm} {spindleHeightMm} {stanchionDiaMm} {sliderDiaMm} {invertedForks} {suspensionOffsetMm} {suspensionHeightMm} {suspUpperMountHeightMm} {suspUpperMountOffsetMm} {linkLengthMm} {linkOffsetMm} {viewSide} {unitSystem} />

					</div>

				{:else}

					<div class="flex items-center justify-center h-64 text-gray-600">

						Enter valid parameters to see diagram

					</div>

				{/if}

			</div>



			<!-- Calculated results -->

			{#if results && tireDims}

				<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">

					<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Calculated Results</h3>

					<div class="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">

						<!-- Trail with chart icon -->

						<div class="text-gray-400 flex items-center gap-1 group relative">

							Trail

							<span class="invisible group-hover:visible absolute left-0 top-full mt-1 z-20 w-56 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 shadow-lg">

								Trail is the horizontal distance between the tire contact patch and where the steering axis meets the ground. Updates with compression.

							</span>

							<!-- Chart icon -->

							<button type="button" class="ml-1 hover:text-orange-400" class:text-orange-400={showTrailChart} class:text-gray-500={!showTrailChart} onclick={() => showTrailChart = !showTrailChart} title="Trail vs Travel chart">

								<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">

									<path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18" />

									<path stroke-linecap="round" stroke-linejoin="round" d="M7 16l4-4 4 4 5-5" />

								</svg>

							</button>

						</div>

						<div class="text-gray-100 font-mono text-right">{currentTrail.toFixed(1)} mm ({mmToIn(currentTrail).toFixed(2)}")</div>



						{#if trailSweep && isLinkType}

							<div class="text-gray-500 text-xs pl-2 group relative">

								Trail @ sag ({sagPct}%)

								<span class="invisible group-hover:visible absolute left-0 top-full mt-1 z-20 w-56 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 shadow-lg">

									Trail at rider sag ({sagPct}% compression). Represents cruise geometry under rider weight. This is the most relevant trail value for handling feel.

								</span>

							</div>

							<div class="text-orange-300 font-mono text-right text-xs">{trailAtSag.toFixed(1)} mm ({mmToIn(trailAtSag).toFixed(2)}")</div>

							<div class="text-gray-500 text-xs pl-2">Trail min</div>

							<div class="text-gray-300 font-mono text-right text-xs">{trailSweep.min.toFixed(1)} mm ({mmToIn(trailSweep.min).toFixed(2)}")</div>

							<div class="text-gray-500 text-xs pl-2">Trail max</div>

							<div class="text-gray-300 font-mono text-right text-xs">{trailSweep.max.toFixed(1)} mm ({mmToIn(trailSweep.max).toFixed(2)}")</div>

						{/if}



						<div class="text-gray-400 group relative">

							Mechanical trail

							<span class="invisible group-hover:visible absolute left-0 top-full mt-1 z-20 w-56 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 shadow-lg">

								Mechanical trail is the perpendicular distance from the axle to the steering axis, projected to the ground. It accounts for the rake angle.

							</span>

						</div>

						<div class="text-gray-100 font-mono text-right">{results.mechanicalTrailMm.toFixed(1)} mm ({mmToIn(results.mechanicalTrailMm).toFixed(2)}")</div>



						<div class="text-gray-400">Wheel radius</div>

						<div class="text-gray-100 font-mono text-right">{tireDims.outerRadiusMm.toFixed(1)} mm ({mmToIn(tireDims.outerRadiusMm).toFixed(2)}")</div>



						<div class="text-gray-400">Axle height</div>

						<div class="text-gray-100 font-mono text-right">{results.axleHeightMm.toFixed(1)} mm ({mmToIn(results.axleHeightMm).toFixed(2)}")</div>



						<div class="text-gray-400">Rake angle</div>

						<div class="text-gray-100 font-mono text-right">{rakeAngleDeg.toFixed(1)}&deg;</div>



						<div class="text-gray-400">Fork offset</div>

						<div class="text-gray-100 font-mono text-right">{forkOffsetMm.toFixed(1)} mm ({mmToIn(forkOffsetMm).toFixed(2)}")</div>



						{#if isLinkType}

							<div class="text-gray-400">Link length</div>

							<div class="text-gray-100 font-mono text-right">{linkLengthMm.toFixed(0)} mm ({mmToIn(linkLengthMm).toFixed(2)}")</div>

						{/if}

					</div>



					{#if suspLengthSweep}

						<!-- Suspension section -->

						<div class="flex items-center gap-2 pt-2">

							<div class="h-px flex-1 bg-gray-700"></div>

							<span class="text-[10px] text-gray-500 uppercase tracking-widest">Suspension</span>

							<div class="h-px flex-1 bg-gray-700"></div>

						</div>

						<div class="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">

							<div class="text-gray-400">Shock travel</div>

							<div class="text-gray-100 font-mono text-right">{suspLengthSweep.travel.toFixed(0)} mm ({mmToIn(suspLengthSweep.travel).toFixed(2)}")</div>

							<div class="text-gray-400">Shock max length</div>

							<div class="text-gray-100 font-mono text-right">{suspLengthSweep.max.toFixed(1)} mm ({mmToIn(suspLengthSweep.max).toFixed(2)}")</div>

							<div class="text-gray-400">Shock min length</div>

							<div class="text-gray-100 font-mono text-right">{suspLengthSweep.min.toFixed(1)} mm ({mmToIn(suspLengthSweep.min).toFixed(2)}")</div>

						</div>

					{/if}

				</div>

			{/if}

		</div>



		<!-- â”€â”€ Chart column (shown when active) â”€â”€ -->

		{#if showTrailChart && trailSweep}

		<div class="space-y-4">

			<div class="rounded-lg border border-gray-800 bg-gray-900 p-4">

				<div class="flex items-center justify-between mb-3">

					<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Trail vs Suspension Travel</h3>

					<button type="button" class="text-gray-500 hover:text-gray-300" onclick={() => showTrailChart = false} title="Close chart">

						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">

							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />

						</svg>

					</button>

				</div>

				<div class="relative w-full aspect-[4/3] border border-gray-700 rounded bg-gray-800">

					<svg class="w-full h-full" viewBox="0 0 500 375" preserveAspectRatio="none">

						<!-- Grid lines -->

						{#each [0.25, 0.5, 0.75] as frac}

							<line x1="40" y1={375 * frac} x2="500" y2={375 * frac} stroke="#374151" stroke-width="0.5" />

							<line x1={40 + 460 * frac} y1="0" x2={40 + 460 * frac} y2="355" stroke="#374151" stroke-width="0.5" />

						{/each}

						<!-- Axes -->

						<line x1="40" y1="355" x2="500" y2="355" stroke="#6b7280" stroke-width="1" />

						<line x1="40" y1="0" x2="40" y2="355" stroke="#6b7280" stroke-width="1" />

						<!-- Chart line -->

						<polyline

							fill="none"

							stroke="#f97316"

							stroke-width="2.5"

							points={trailSweep.data.map((d) => {

								const x = 40 + (d.pct / 100) * 460;

								const range = trailSweep.max - trailSweep.min || 1;

								const y = 345 - ((d.trail - trailSweep.min) / range) * 330;

								return `${x},${y}`;

							}).join(' ')}

						/>

						<!-- Sag marker (30%) -->

						{#if true}

							{@const sagX = 40 + (sagPct / 100) * 460}

							{@const sagTrailVal = trailSweep.data[Math.round(sagPct / 100 * (trailSweep.data.length - 1))]?.trail ?? 0}

							{@const sagRange = trailSweep.max - trailSweep.min || 1}

							{@const sagY = 345 - ((sagTrailVal - trailSweep.min) / sagRange) * 330}

							<line x1={sagX} y1="0" x2={sagX} y2="355" stroke="#22d3ee" stroke-width="0.75" stroke-dasharray="2,4" />

							<circle cx={sagX} cy={sagY} r="4" fill="none" stroke="#22d3ee" stroke-width="1.5" />

							<text x={sagX + 4} y="10" fill="#22d3ee" font-size="9" font-family="monospace">sag</text>

						{/if}

						<!-- Current position marker -->

						{#if true}

							{@const cx = 40 + (compressionPct / 100) * 460}

							{@const curTrail = trailSweep.data[Math.round(compressionPct / 100 * (trailSweep.data.length - 1))]?.trail ?? 0}

							{@const range = trailSweep.max - trailSweep.min || 1}

							{@const cy = 345 - ((curTrail - trailSweep.min) / range) * 330}

							<!-- Vertical tracking line -->

							<line x1={cx} y1="0" x2={cx} y2="355" stroke="#f97316" stroke-width="0.5" stroke-dasharray="4,3" />

							<!-- Horizontal tracking line -->

							<line x1="40" y1={cy} x2="500" y2={cy} stroke="#f97316" stroke-width="0.5" stroke-dasharray="4,3" />

							<circle cx={cx} cy={cy} r="6" fill="#f97316" stroke="#fff" stroke-width="2" />

							<!-- Value label -->

							<text x={cx} y={cy - 12} text-anchor="middle" fill="#fbbf24" font-size="11" font-family="monospace">{curTrail.toFixed(1)} mm ({mmToIn(curTrail).toFixed(2)}")</text>

						{/if}

						<!-- X-axis labels -->

						<text x="40" y="370" fill="#9ca3af" font-size="10">0%</text>

						<text x="270" y="370" text-anchor="middle" fill="#9ca3af" font-size="10">50%</text>

						<text x="495" y="370" text-anchor="end" fill="#9ca3af" font-size="10">100%</text>

						<!-- Y-axis labels -->

						<text x="36" y="15" text-anchor="end" fill="#9ca3af" font-size="10">{trailSweep.max.toFixed(0)}</text>

						<text x="36" y="350" text-anchor="end" fill="#9ca3af" font-size="10">{trailSweep.min.toFixed(0)}</text>

						<text x="36" y="182" text-anchor="end" fill="#9ca3af" font-size="10">{((trailSweep.max + trailSweep.min) / 2).toFixed(0)}</text>

					</svg>

					<!-- Axis title labels -->

					<div class="absolute bottom-0 left-0 right-0 text-center text-[10px] text-gray-500">Suspension Travel</div>

					<div class="absolute top-1/2 -left-1 -translate-y-1/2 -rotate-90 origin-center text-[10px] text-gray-500 whitespace-nowrap">Trail (mm)</div>

				</div>

			</div>

		</div>

		{/if}

	</div>

</div>



<!-- Load Vehicle Popup -->

{#if loadModalVisible}

	<!-- svelte-ignore a11y_click_events_have_key_events -->

	<!-- svelte-ignore a11y_no_static_element_interactions -->

	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onclick={() => { loadModalVisible = false; }}>

		<!-- svelte-ignore a11y_click_events_have_key_events -->

		<!-- svelte-ignore a11y_no_static_element_interactions -->

		<div class="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col shadow-2xl"

			onclick={(e) => e.stopPropagation()}>

			<div class="flex items-center justify-between px-5 py-3 border-b border-gray-700">

				<h3 class="text-sm font-semibold text-orange-400 uppercase tracking-wide">Load Vehicle Design</h3>

				<button onclick={() => { loadModalVisible = false; }}

					class="text-gray-400 hover:text-white text-lg leading-none">&times;</button>

			</div>

			<div class="p-4 overflow-y-auto flex-1">

				{#if savedVehicles.length === 0}

					<p class="text-gray-500 text-sm text-center py-6">No saved vehicles found.</p>

				{:else}

					<div class="space-y-2">

						{#each savedVehicles as v}

							<div class="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700">

								<span class="text-sm text-gray-200 font-medium">{v.name}</span>

								<div class="flex gap-2">

									<button onclick={() => handleLoadSelect(v.name)}

										class="px-3 py-1 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors">

										Load

									</button>

									<button onclick={() => handleDeleteVehicle(v.name)}

										class="px-3 py-1 text-xs font-medium rounded bg-red-800 hover:bg-red-700 text-red-200 transition-colors">

										Delete

									</button>

								</div>

							</div>

						{/each}

					</div>

				{/if}

			</div>

		</div>

	</div>

{/if}

