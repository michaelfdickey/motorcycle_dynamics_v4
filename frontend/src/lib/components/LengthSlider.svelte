<script lang="ts">
	let {
		label,
		value = $bindable(),
		min = 0,
		max = 1000,
		step = 1,
		inchStep = 0.05,
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		inchStep?: number;
	} = $props();

	const MM_PER_IN = 25.4;

	function setMm(raw: string) {
		const n = Number(raw);
		if (Number.isFinite(n)) value = n;
	}
	function setIn(raw: string) {
		const n = Number(raw);
		if (Number.isFinite(n)) value = n * MM_PER_IN;
	}
</script>

<label class="block">
	<span class="text-xs text-gray-500">{label}</span>
	<div class="flex items-center gap-1.5 mt-1">
		<input type="range" {min} {max} {step} bind:value class="flex-1 min-w-0 accent-orange-500" />
		<input
			type="number"
			{min}
			{max}
			{step}
			value={Number.isFinite(value) ? +value.toFixed(1) : 0}
			oninput={(e) => setMm(e.currentTarget.value)}
			class="w-[4.25rem] shrink-0 rounded-md bg-gray-800 border border-gray-700 px-1.5 py-1 text-sm text-gray-100 text-right font-mono"
		/>
		<span class="text-[10px] text-gray-500 w-5 shrink-0">mm</span>
		<input
			type="number"
			step={inchStep}
			value={Number.isFinite(value) ? +(value / MM_PER_IN).toFixed(3) : 0}
			oninput={(e) => setIn(e.currentTarget.value)}
			class="w-[4.25rem] shrink-0 rounded-md bg-gray-800 border border-gray-700 px-1.5 py-1 text-sm text-gray-100 text-right font-mono"
		/>
		<span class="text-[10px] text-gray-500 w-4 shrink-0">in</span>
	</div>
</label>
