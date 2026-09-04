<script lang="ts">
	import ParamSlider from './ParamSlider.svelte';
	import {
		totalPotCount,
		totalPistonArea,
		type BrakeParams,
	} from '$lib/braking';

	const MM_PER_INCH = 25.4;
	function mmToIn(mm: number): number { return mm / MM_PER_INCH; }
	function inToMm(inch: number): number { return inch * MM_PER_INCH; }

	let {
		title,
		brake = $bindable(),
		tireRadiusMm = 0,
		rimRadiusMm = 0,
		referenceForceN = 150,
		inputLabel = 'lever',
	}: {
		title: string;
		brake: BrakeParams;
		tireRadiusMm?: number;
		rimRadiusMm?: number;
		referenceForceN?: number;
		inputLabel?: string;
	} = $props();

	const potCount = $derived(totalPotCount(brake.pistons));
	const pistonArea = $derived(totalPistonArea(brake.pistons));
	const masterArea = $derived(Math.PI * (brake.masterCylinderDiaMm / 2) ** 2);
	const hydraulicRatio = $derived(masterArea > 0.1 ? pistonArea / masterArea : 0);
	const clampN = $derived(referenceForceN * brake.leverRatio * hydraulicRatio);
	const effR = $derived((brake.discDiameterMm / 2 * 0.8) / 1000);
	const sides = $derived(brake.dualSided ? 2 : 1);
	const torqueNm = $derived(clampN * brake.padCoefficientOfFriction * sides * effR);
	const patchN = $derived(tireRadiusMm > 1 ? torqueNm / (tireRadiusMm / 1000) : 0);
	const discR = $derived(brake.discDiameterMm / 2);
	const discFitsRim = $derived(rimRadiusMm <= 0 || discR <= rimRadiusMm * 0.98);

	function addPiston() {
		brake.pistons = [...brake.pistons, { count: 1, diameterMm: 30 }];
	}
	function removePiston(i: number) {
		if (brake.pistons.length < 2) return;
		brake.pistons = brake.pistons.filter((_, j) => j !== i);
	}
</script>

<div class="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
	<div class="flex items-center justify-between gap-2">
		<h3 class="text-sm font-semibold text-red-400 uppercase tracking-wide">{title}</h3>
		<span class="text-[10px] text-gray-500 font-mono">
			{potCount}-pot · Ø{Math.round(brake.discDiameterMm)} · {brake.dualSided ? 'dual' : 'single'}
		</span>
	</div>

	<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
		<div class="bg-gray-800/50 rounded p-2 cursor-help" title="Hydraulic ratio = total caliper piston area ÷ master-cylinder bore area. A 7:1 ratio means 1 N of fluid force at the master becomes 7 N of clamp at the pistons, before lever ratio.">
			<div class="text-gray-500">Hyd. ratio ⓘ</div>
			<div class="text-gray-100 font-mono">{hydraulicRatio.toFixed(1)} : 1</div>
		</div>
		<div class="bg-gray-800/50 rounded p-2 cursor-help" title="Clamp force squeezing the pads onto the disc at the reference {inputLabel} force. Clamp = {inputLabel} force × lever ratio × hydraulic ratio.">
			<div class="text-gray-500">Clamp @ {referenceForceN} N {inputLabel} ⓘ</div>
			<div class="text-gray-100 font-mono">{clampN.toFixed(0)} N</div>
		</div>
		<div class="bg-gray-800/50 rounded p-2 cursor-help" title="Brake torque at the wheel = clamp × pad μ × number of friction faces × effective disc radius (~80% of outer radius). This is what tries to stop the wheel spinning.">
			<div class="text-gray-500">Torque ⓘ</div>
			<div class="text-gray-100 font-mono">{torqueNm.toFixed(0)} Nm</div>
		</div>
		<div class="bg-gray-800/50 rounded p-2 cursor-help" title="Longitudinal force at the tire contact patch if the tire can hold it: torque ÷ tire radius. If this exceeds μ_tire × axle load, the wheel starts to lock.">
			<div class="text-gray-500">Patch force ⓘ</div>
			<div class="text-gray-100 font-mono">{patchN > 0 ? `${patchN.toFixed(0)} N` : '—'}</div>
		</div>
	</div>
	{#if !discFitsRim}
		<p class="text-[11px] text-amber-400">
			Disc Ø {brake.discDiameterMm.toFixed(0)} mm is larger than the rim ({(rimRadiusMm * 2).toFixed(0)} mm). It will not fit inside the wheel.
		</p>
	{/if}

	<ParamSlider
		label="Disc diameter"
		bind:value={brake.discDiameterMm}
		min={160} max={520} step={1} decimals={1}
		unit="mm"
		secondary={{ unit: 'in', to: mmToIn, from: inToMm, step: 0.05, decimals: 2 }}
		tooltip="Outer diameter of the rotor. Larger discs raise torque (more leverage) and heat capacity, but must fit inside the rim."
	/>
	<ParamSlider
		label="Disc thickness"
		bind:value={brake.discThicknessMm}
		min={2} max={10} step={0.1} decimals={1}
		unit="mm"
		secondary={{ unit: 'in', to: mmToIn, from: inToMm, step: 0.005, decimals: 3 }}
		tooltip="Rotor thickness. Thicker discs store more heat and resist warping; they add unsprung mass. Street rotors are typically 4–6 mm."
	/>

	<div>
		<div class="flex items-center justify-between mb-1">
			<span class="text-xs text-gray-500 cursor-help" title="Each row is a piston size in the caliper. Qty × π × (bore/2)² is summed into total piston area, which sets hydraulic ratio. Mixed-size calipers (e.g. 30+34 mm) are common on four-piston fronts.">Pistons ⓘ ({potCount} pots, {pistonArea.toFixed(0)} mm²)</span>
			<button type="button" onclick={addPiston}
				class="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300">+ Add size</button>
		</div>
		{#each brake.pistons as group, i}
			<div class="grid grid-cols-[40px_1fr_1fr_20px] gap-1 items-center mb-1">
				<input type="number" value={group.count} min="1" max="8" step="1"
					oninput={(e) => { brake.pistons[i].count = Math.max(1, +e.currentTarget.value); }}
					class="w-full rounded bg-gray-800 border border-gray-700 px-1.5 py-1 text-gray-100 text-right text-xs" title="Quantity" />
				<input type="number" value={group.diameterMm} step="0.5"
					oninput={(e) => { brake.pistons[i].diameterMm = +e.currentTarget.value; }}
					class="w-full rounded bg-gray-800 border border-gray-700 px-1.5 py-1 text-gray-100 text-right text-xs" title="Diameter (mm)" />
				<input type="number" value={+(group.diameterMm / MM_PER_INCH).toFixed(3)} step="0.01"
					oninput={(e) => { brake.pistons[i].diameterMm = +e.currentTarget.value * MM_PER_INCH; }}
					class="w-full rounded bg-gray-800 border border-gray-700 px-1.5 py-1 text-gray-100 text-right text-xs" title="Diameter (in)" />
				{#if brake.pistons.length > 1}
					<button type="button" onclick={() => removePiston(i)}
						class="text-gray-500 hover:text-red-400 text-xs leading-none" title="Remove">×</button>
				{:else}
					<span></span>
				{/if}
			</div>
		{/each}
		<div class="grid grid-cols-[40px_1fr_1fr_20px] gap-1 text-[9px] text-gray-600 -mt-0.5">
			<span class="text-center">Qty</span>
			<span class="text-center">mm</span>
			<span class="text-center">in</span>
			<span></span>
		</div>
	</div>

	<ParamSlider
		label="Pad μ"
		bind:value={brake.padCoefficientOfFriction}
		min={0.2} max={0.7} step={0.01} decimals={2}
		unit=""
		hint="Street organic ~0.35–0.42 · sintered ~0.40–0.50 · race ~0.50–0.60"
		tooltip="Pad-to-rotor friction, not tire grip. It only scales brake torque. Tire-road μ lives on the Simulation tab and is a separate interface."
	/>
	<ParamSlider
		label="Pad area (per pad)"
		bind:value={brake.padAreaMm2}
		min={400} max={5000} step={10} decimals={0}
		unit="mm²"
		tooltip="Contact area of one pad face. Used for thermal load later; clamp force itself comes from piston area, not pad area."
	/>
	<ParamSlider
		label="Master cylinder Ø"
		bind:value={brake.masterCylinderDiaMm}
		min={10} max={22} step={0.1} decimals={1}
		unit="mm"
		secondary={{ unit: 'in', to: mmToIn, from: inToMm, step: 0.01, decimals: 3 }}
		tooltip="Bore of the lever or pedal master cylinder. Smaller bore raises hydraulic ratio (more clamp per input newton) but lengthens lever travel."
	/>
	<ParamSlider
		label="Lever / pedal ratio"
		bind:value={brake.leverRatio}
		min={1} max={8} step={0.1} decimals={1}
		unit=":1"
		tooltip="Mechanical advantage from your hand or foot to the master-cylinder piston. Typical hand levers are ~4:1; rear pedals ~3–4:1."
	/>
	<label class="flex items-center gap-2 text-xs text-gray-400 pt-1 cursor-help" title="Two discs on the same wheel (one each side). Doubles friction faces, so torque roughly doubles for the same clamp. Common on fronts; rare on rears.">
		<input type="checkbox" bind:checked={brake.dualSided}
			class="rounded border-gray-600 bg-gray-800 w-3.5 h-3.5 accent-orange-500" />
		<span>{brake.dualSided ? 'Dual discs (both sides of the wheel)' : 'Single disc'} ⓘ</span>
	</label>
</div>
