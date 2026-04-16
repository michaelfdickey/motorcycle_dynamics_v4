<script lang="ts">
	import { parseTireDesignation, computeTireDimensions } from '$lib/tire';
	import { computeFrontEnd, type SuspensionType, type FrontEndInputs } from '$lib/frontEndGeometry';
	import FrontEndDiagram from '$lib/components/FrontEndDiagram.svelte';

	// ── State ──

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
	let linkLengthMm = $state(200);
	let linkOffsetMm = $state(0);

	const forkTubeSizes = [
		{ value: '33/46', label: 'Small — 33mm / 46mm (1.30" / 1.81")' },
		{ value: '37/50', label: 'Small — 37mm / 50mm (1.46" / 1.97")' },
		{ value: '41/54', label: 'Mid — 41mm / 54mm (1.61" / 2.13")' },
		{ value: '43/56', label: 'Mid — 43mm / 56mm (1.69" / 2.20")' },
		{ value: '43/58', label: 'Liter — 43mm / 58mm (1.69" / 2.28")' },
		{ value: '46/60', label: 'Liter — 46mm / 60mm (1.81" / 2.36")' },
		{ value: '48/62', label: 'USD — 48mm / 62mm (1.89" / 2.44")' },
		{ value: '50/65', label: 'USD — 50mm / 65mm (1.97" / 2.56")' },
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

	// ── Derived ──

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
</script>

<div class="space-y-6">
	<h2 class="text-2xl font-bold">Front End Geometry</h2>

	<div class="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_2fr] gap-6">
		<!-- ── Left column: Inputs ── -->
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
						<div>Width: <span class="text-gray-200">{tireDims.widthMm} mm</span></div>
						<div>Section height: <span class="text-gray-200">{tireDims.sectionHeightMm.toFixed(1)} mm</span></div>
						<div>Rim dia: <span class="text-gray-200">{tireDims.rimDiameterMm.toFixed(1)} mm</span></div>
						<div>Outer dia: <span class="text-gray-200">{tireDims.outerDiameterMm.toFixed(1)} mm</span></div>
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
					<span class="text-xs text-gray-500">Fork offset (mm)</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="-152" max="152" step="1"
							bind:value={forkOffsetMm}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="1" min="-152" max="152"
							bind:value={forkOffsetMm}
							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/>
					</div>
				</label>

				<label class="block">
					<span class="text-xs text-gray-500">Fork length (mm) - fully extended</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="200" max="900" step="5"
							bind:value={forkLengthMm}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="5" min="100" max="1200"
							bind:value={forkLengthMm}
							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/>
					</div>
				</label>

				{#if suspensionType === 'telescopic'}
					<label class="block">
						<span class="text-xs text-gray-500">Fork travel (mm)</span>
						<div class="flex items-center gap-2 mt-1">
							<input
								type="range" min="50" max="300" step="5"
								bind:value={forkTravelMm}
								class="flex-1 accent-orange-500"
							/>
							<input
								type="number" step="5" min="20" max="400"
								bind:value={forkTravelMm}
								class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
							/>
						</div>
					</label>

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
				{/if}

				<!-- Steering Column section divider -->
				<div class="flex items-center gap-3 pt-2">
					<div class="flex-1 border-t border-gray-700"></div>
					<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Steering Column</span>
					<div class="flex-1 border-t border-gray-700"></div>
				</div>

				<label class="block">
					<span class="text-xs text-gray-500">Steering column height (mm)</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="50" max="300" step="5"
							bind:value={steeringColumnHeightMm}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="5" min="50" max="500"
							bind:value={steeringColumnHeightMm}
							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/>
					</div>
				</label>

				<label class="block">
					<span class="text-xs text-gray-500">Steering column length (inches)</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="4" max="12" step="0.5"
							bind:value={steeringColumnLengthIn}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="0.5" min="4" max="12"
							bind:value={steeringColumnLengthIn}
							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/>
					</div>
				</label>

				<!-- Spindle Mount section divider -->
				<div class="flex items-center gap-3 pt-2">
					<div class="flex-1 border-t border-gray-700"></div>
					<span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Spindle Mount</span>
					<div class="flex-1 border-t border-gray-700"></div>
				</div>

				<label class="block">
					<span class="text-xs text-gray-500">Spindle offset (mm) - perpendicular to fork</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="-101.6" max="101.6" step="1"
							bind:value={spindleOffsetMm}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="1" min="-101.6" max="101.6"
							bind:value={spindleOffsetMm}
							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/>
					</div>
				</label>

				<label class="block">
					<span class="text-xs text-gray-500">Spindle height offset (mm) - along fork axis</span>
					<div class="flex items-center gap-2 mt-1">
						<input
							type="range" min="-101.6" max="101.6" step="1"
							bind:value={spindleHeightMm}
							class="flex-1 accent-orange-500"
						/>
						<input
							type="number" step="1" min="-101.6" max="101.6"
							bind:value={spindleHeightMm}
							class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
						/>
					</div>
				</label>

				{#if isLinkType}
					<label class="block">
						<span class="text-xs text-gray-500">Link arm length (mm)</span>
						<div class="flex items-center gap-2 mt-1">
							<input
								type="range" min="50" max="400" step="5"
								bind:value={linkLengthMm}
								class="flex-1 accent-orange-500"
							/>
							<input
								type="number" step="5" min="20" max="600"
								bind:value={linkLengthMm}
								class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
							/>
						</div>
					</label>

					<label class="block">
						<span class="text-xs text-gray-500">Link offset from steering axis (mm)</span>
						<div class="flex items-center gap-2 mt-1">
							<input
								type="range" min="-50" max="50" step="1"
								bind:value={linkOffsetMm}
								class="flex-1 accent-orange-500"
							/>
							<input
								type="number" step="1" min="-100" max="100"
								bind:value={linkOffsetMm}
								class="w-20 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 text-right"
							/>
						</div>
					</label>
				{/if}
			</div>

			<!-- Calculated results -->
			{#if results && tireDims}
				<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
					<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Calculated Results</h3>
					<div class="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
						<div class="text-gray-400">Trail</div>
						<div class="text-gray-100 font-mono text-right">{results.trailMm.toFixed(1)} mm</div>

						<div class="text-gray-400">Mechanical trail</div>
						<div class="text-gray-100 font-mono text-right">{results.mechanicalTrailMm.toFixed(1)} mm</div>

						<div class="text-gray-400">Wheel radius</div>
						<div class="text-gray-100 font-mono text-right">{tireDims.outerRadiusMm.toFixed(1)} mm</div>

						<div class="text-gray-400">Axle height</div>
						<div class="text-gray-100 font-mono text-right">{results.axleHeightMm.toFixed(1)} mm</div>

						<div class="text-gray-400">Rake angle</div>
						<div class="text-gray-100 font-mono text-right">{rakeAngleDeg.toFixed(1)}&deg;</div>

						<div class="text-gray-400">Fork offset</div>
						<div class="text-gray-100 font-mono text-right">{forkOffsetMm.toFixed(1)} mm</div>

						{#if isLinkType}
							<div class="text-gray-400">Link length</div>
							<div class="text-gray-100 font-mono text-right">{linkLengthMm.toFixed(0)} mm</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- ── Right column: Diagram ── -->
		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
			<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Side View</h3>
			{#if results && tireDims}
				<div class="aspect-[4/5] w-full">
					<FrontEndDiagram {results} tire={tireDims} {steeringColumnLengthMm} {forkOffsetMm} {forkLengthMm} {suspensionType} {forkTravelMm} {compressionPct} {spindleOffsetMm} {spindleHeightMm} {stanchionDiaMm} {sliderDiaMm} {invertedForks} />
				</div>
			{:else}
				<div class="flex items-center justify-center h-64 text-gray-600">
					Enter valid parameters to see diagram
				</div>
			{/if}
		</div>
	</div>
</div>
