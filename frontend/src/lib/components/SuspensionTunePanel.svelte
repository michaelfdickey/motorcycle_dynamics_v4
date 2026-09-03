<script lang="ts">
	import ParamSlider from './ParamSlider.svelte';
	import LengthSlider from './LengthSlider.svelte';
	import SuspensionCurve from './SuspensionCurve.svelte';
	import {
		type EndSuspension,
		type EndGeometry,
		type EndResults,
		springKinds,
		frontDamperArchs,
		rearDamperArchs,
		oilWeights,
		catalogFor,
		matchCatalog,
		nPerMmToKgMm,
		nPerMmToLbIn,
		lbInToNPerMm,
		barToPsi,
		psiToBar,
		forceCurve,
		stepResponse,
		applyRecommendedRate,
		hasHighSpeed,
	} from '$lib/suspension';

	let {
		title,
		end,
		type,
		config,
		geo,
		results,
		isFront,
	}: {
		title: string;
		end: 'front' | 'rear';
		type: string;
		config: EndSuspension;
		geo: EndGeometry;
		results: EndResults;
		isFront: boolean;
	} = $props();

	const damperOptions = $derived(isFront ? frontDamperArchs : rearDamperArchs);
	const catalog = $derived(catalogFor(end, type, config.unitCount));
	const catalogValue = $derived(matchCatalog(config.rateNPerMm, catalog));
	const damperNote = $derived(damperOptions.find((d) => d.value === config.damperArch)?.note ?? '');
	const springNote = $derived(springKinds.find((s) => s.value === config.springKind)?.note ?? '');
	const forkStyle = $derived(geo.telescopic);
	const hs = $derived(hasHighSpeed(config.damperArch));
	const curve = $derived(forceCurve(config, geo));
	const bump = $derived(stepResponse(config, geo, results));
	const sagColor = $derived(
		results.sagStatus === 'ok' ? 'text-emerald-400' : results.sagStatus === 'soft' ? 'text-amber-400' : 'text-sky-400',
	);
	const freqColor = $derived(
		results.freqStatus === 'ok' ? 'text-emerald-400' : 'text-amber-400',
	);

	function onCatalog(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		if (v === 'custom') return;
		const n = Number(v);
		if (Number.isFinite(n)) config.rateNPerMm = n;
	}

	function snapRate() {
		applyRecommendedRate(config, results.recommendedRateNPerMm, catalog);
	}

	function setPreloadToTarget() {
		config.preloadMm = Math.round(results.preloadToTargetMm * 10) / 10;
	}
</script>

<div class="space-y-4">
	<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
		<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">{title} hardware</h3>
		{#if geo.solid}
			<p class="text-sm text-gray-500">Hardtail — no spring or damper on this end. Geometry still shows the rigid rail.</p>
		{:else}
			<label class="block">
				<span class="text-xs text-gray-500">Spring type</span>
				<select bind:value={config.springKind} class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500">
					{#each springKinds as sk}
						<option value={sk.value}>{sk.label}</option>
					{/each}
				</select>
				<p class="text-[11px] text-gray-600 mt-1">{springNote}</p>
			</label>
			<label class="block">
				<span class="text-xs text-gray-500">Damper architecture</span>
				<select bind:value={config.damperArch} class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500">
					{#each damperOptions as d}
						<option value={d.value}>{d.label}</option>
					{/each}
				</select>
				<p class="text-[11px] text-gray-600 mt-1">{damperNote}</p>
			</label>
			<ParamSlider
				label="Number of spring/damper units"
				bind:value={config.unitCount}
				min={1}
				max={2}
				step={1}
				decimals={0}
				unit="×"
				hint={forkStyle ? 'Telescopic forks are almost always two legs.' : type === 'twin_shock' ? 'Twin-shock: two units. Monoshock: one.' : 'Usually one monoshock.'}
			/>
		{/if}
	</div>

	{#if !geo.solid}
		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
			<div class="flex items-center justify-between gap-2">
				<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Spring</h3>
				<button type="button" class="text-[11px] text-orange-400 hover:text-orange-300" onclick={snapRate}>
					Use recommended {nPerMmToKgMm(results.recommendedRateNPerMm).toFixed(2)} kg/mm
				</button>
			</div>
			{#if config.springKind !== 'air'}
				<label class="block">
					<span class="text-xs text-gray-500">Spring catalog (per unit)</span>
					<select value={catalogValue} onchange={onCatalog} class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500">
						<option value="custom">Custom</option>
						{#each catalog as c}
							<option value={String(c.nPerMm)}>{c.label} · {c.nPerMm.toFixed(1)} N/mm · {nPerMmToLbIn(c.nPerMm).toFixed(0)} lb/in</option>
						{/each}
					</select>
				</label>
				<ParamSlider
					label="Spring rate (per unit)"
					bind:value={config.rateNPerMm}
					min={isFront && forkStyle ? 4 : 8}
					max={isFront && forkStyle ? 20 : 280}
					step={0.1}
					decimals={2}
					unit="N/mm"
					secondary={{ unit: 'lb/in', to: nPerMmToLbIn, from: lbInToNPerMm, step: 1, decimals: 1 }}
				/>
				<p class="text-[11px] text-gray-600 -mt-1">{nPerMmToKgMm(config.rateNPerMm).toFixed(2)} kg/mm per unit · {nPerMmToKgMm(config.rateNPerMm * config.unitCount).toFixed(2)} kg/mm total</p>
			{/if}
			{#if config.springKind === 'coil_dual_rate'}
				<ParamSlider
					label="Second-rate add-on"
					bind:value={config.rate2NPerMm}
					min={1}
					max={isFront && forkStyle ? 12 : 120}
					step={0.1}
					decimals={2}
					unit="N/mm"
					secondary={{ unit: 'lb/in', to: nPerMmToLbIn, from: lbInToNPerMm, step: 1, decimals: 1 }}
				/>
				<LengthSlider label="Crossover (first-rate travel)" bind:value={config.crossoverMm} min={5} max={Math.max(10, geo.unitTravelMm)} />
			{/if}
			{#if config.springKind === 'coil_progressive'}
				<ParamSlider
					label="Progression"
					bind:value={config.rate2NPerMm}
					min={0}
					max={isFront && forkStyle ? 8 : 80}
					step={0.1}
					decimals={2}
					unit="N/mm"
					hint="Extra rate that builds with stroke². 0 is linear."
				/>
			{/if}
			{#if config.springKind === 'air'}
				<ParamSlider
					label="Air pressure"
					bind:value={config.airPressureBar}
					min={3}
					max={16}
					step={0.1}
					decimals={1}
					unit="bar"
					secondary={{ unit: 'psi', to: barToPsi, from: psiToBar, step: 1, decimals: 0 }}
				/>
				<ParamSlider
					label="Air can volume"
					bind:value={config.airCanVolumeCc}
					min={40}
					max={400}
					step={5}
					decimals={0}
					unit="cc"
					hint="Smaller volume = more progressive. Tokens and spacers reduce volume."
				/>
			{:else}
				<LengthSlider label="Preload" bind:value={config.preloadMm} min={0} max={30} step={0.5} inchStep={0.02} />
				<div class="flex items-center justify-between gap-2">
					<p class="text-[11px] text-gray-600">
						{(config.preloadMm / Math.max(0.5, config.threadPitchMm)).toFixed(1)} turns
						at {config.threadPitchMm.toFixed(2)} mm pitch
					</p>
					<button type="button" class="text-[11px] text-orange-400 hover:text-orange-300" onclick={setPreloadToTarget}>
						Set preload to target sag
					</button>
				</div>
				<ParamSlider
					label="Collar thread pitch"
					bind:value={config.threadPitchMm}
					min={0.75}
					max={2.5}
					step={0.05}
					decimals={2}
					unit="mm"
				/>
			{/if}
		</div>

		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
			<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Damper</h3>
			<label class="block">
				<span class="text-xs text-gray-500">Oil weight</span>
				<select bind:value={config.oilWeight} class="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500">
					{#each oilWeights as o}
						<option value={o.value}>{o.label} (~{o.cSt} cSt)</option>
					{/each}
				</select>
				<p class="text-[11px] text-gray-600 mt-1">Heavier oil raises both compression and rebound. Clickers trim around this baseline.</p>
			</label>
			{#if forkStyle}
				<LengthSlider label="Oil level (from top of tube, full extension)" bind:value={config.oilLevelMm} min={40} max={180} />
				<label class="flex items-center gap-2 text-xs text-gray-400">
					<input type="checkbox" bind:checked={config.includeAirAssist} class="accent-orange-500" />
					Include trapped-air spring (oil level)
				</label>
			{:else}
				<ParamSlider
					label="Nitrogen charge"
					bind:value={config.nitrogenBar}
					min={4}
					max={18}
					step={0.1}
					decimals={1}
					unit="bar"
					secondary={{ unit: 'psi', to: barToPsi, from: psiToBar, step: 1, decimals: 0 }}
				/>
			{/if}
			<ParamSlider
				label="Clicker range"
				bind:value={config.clickRange}
				min={8}
				max={30}
				step={1}
				decimals={0}
				unit="clk"
			/>
			<ParamSlider
				label="Compression (clicks out)"
				bind:value={config.compressionClicks}
				min={0}
				max={config.clickRange}
				step={1}
				decimals={0}
				unit="out"
				hint="0 = fully in (firm). Higher = more open."
			/>
			<ParamSlider
				label="Rebound (clicks out)"
				bind:value={config.reboundClicks}
				min={0}
				max={config.clickRange}
				step={1}
				decimals={0}
				unit="out"
			/>
			{#if hs}
				<ParamSlider label="High-speed compression (clicks out)" bind:value={config.hscClicks} min={0} max={config.clickRange} step={1} decimals={0} unit="out" />
				<ParamSlider label="High-speed rebound (clicks out)" bind:value={config.hsrClicks} min={0} max={config.clickRange} step={1} decimals={0} unit="out" />
			{/if}
		</div>

		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
			<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Sag targets</h3>
			<ParamSlider
				label="Target rider sag"
				bind:value={config.targetRiderSagPct}
				min={15}
				max={40}
				step={1}
				decimals={0}
				unit="%"
				hint="Street ~28–32%. Track ~23–28%. Measured along the unit."
			/>
			<ParamSlider
				label="Target static sag (bike only)"
				bind:value={config.targetStaticSagPct}
				min={3}
				max={15}
				step={1}
				decimals={0}
				unit="%"
			/>
		</div>

		<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
			<h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Results</h3>
			<div class="grid grid-cols-2 gap-y-1.5 gap-x-3 text-sm">
				<div class="text-gray-400">Rider sag</div>
				<div class="font-mono text-right {sagColor}">{results.riderSagMm.toFixed(1)} mm · {results.riderSagPct.toFixed(0)}%</div>
				<div class="text-gray-400">Static sag</div>
				<div class="text-gray-100 font-mono text-right">{results.staticSagMm.toFixed(1)} mm · {results.staticSagPct.toFixed(0)}%</div>
				<div class="text-gray-400">Target rider</div>
				<div class="text-gray-500 font-mono text-right">{config.targetRiderSagPct}%</div>
				<div class="text-gray-400">Wheel rate</div>
				<div class="text-gray-100 font-mono text-right">{results.wheelRateNPerMm.toFixed(2)} N/mm</div>
				<div class="text-gray-400">Unit rate @ sag</div>
				<div class="text-gray-100 font-mono text-right">{results.unitRateNPerMm.toFixed(2)} N/mm</div>
				<div class="text-gray-400">Ride frequency</div>
				<div class="font-mono text-right {freqColor}">{results.naturalFreqHz.toFixed(2)} Hz</div>
				<div class="text-gray-400">Comp. damping ζ</div>
				<div class="text-gray-100 font-mono text-right">{results.compressionZeta.toFixed(2)}</div>
				<div class="text-gray-400">Rebound damping ζ</div>
				<div class="text-gray-100 font-mono text-right">{results.reboundZeta.toFixed(2)}</div>
				<div class="text-gray-400">Force at sag</div>
				<div class="text-gray-100 font-mono text-right">{results.forceAtSagN.toFixed(0)} N</div>
				<div class="text-gray-400">Force at bottom</div>
				<div class="text-gray-100 font-mono text-right">{results.forceAtBottomN.toFixed(0)} N</div>
				<div class="text-gray-400">Sprung mass</div>
				<div class="text-gray-100 font-mono text-right">{results.sprungKg.toFixed(1)} kg</div>
			</div>
			{#if results.bottomOut}
				<p class="text-xs text-amber-400">Spring is too soft — rider sag uses the full stroke.</p>
			{:else if results.sagStatus === 'soft'}
				<p class="text-xs text-amber-400">Sag is deep. Stiffer spring or more preload.</p>
			{:else if results.sagStatus === 'stiff'}
				<p class="text-xs text-sky-400">Sag is shallow. Softer spring or less preload.</p>
			{/if}
			{#if results.freqStatus === 'low'}
				<p class="text-xs text-amber-400">Ride frequency is low — the end will wallow. Raise rate or reduce sprung mass.</p>
			{:else if results.freqStatus === 'high'}
				<p class="text-xs text-amber-400">Ride frequency is high — the end will feel harsh over sharp hits.</p>
			{/if}
			<SuspensionCurve curve={curve} step={bump} travelMm={geo.unitTravelMm} sagMm={results.riderSagMm} />
		</div>
	{/if}
</div>
