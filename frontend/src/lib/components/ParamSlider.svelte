<script lang="ts">
	let {
		label,
		value = $bindable(),
		min = 0,
		max = 100,
		step = 1,
		decimals = 1,
		unit = '',
		secondary = undefined as
			| { unit: string; to: (v: number) => number; from: (v: number) => number; step?: number; decimals?: number }
			| undefined,
		hint = '',
		tooltip = '',
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		decimals?: number;
		unit?: string;
		secondary?: { unit: string; to: (v: number) => number; from: (v: number) => number; step?: number; decimals?: number };
		hint?: string;
		tooltip?: string;
	} = $props();

	function setPrimary(raw: string) {
		const n = Number(raw);
		if (Number.isFinite(n)) value = n;
	}
	function setSecondary(raw: string) {
		if (!secondary) return;
		const n = Number(raw);
		if (Number.isFinite(n)) value = secondary.from(n);
	}
	function fmt(n: number, d: number): string {
		return Number.isFinite(n) ? n.toFixed(d) : '0';
	}
</script>

<label class="block">
	<span class="text-xs text-gray-500 {tooltip ? 'cursor-help' : ''}" title={tooltip || undefined}>
		{label}{#if tooltip}<span class="text-gray-600 ml-0.5">ⓘ</span>{/if}
	</span>
	<div class="flex items-center gap-1.5 mt-1">
		<input type="range" {min} {max} {step} bind:value class="flex-1 min-w-0 accent-orange-500" />
		<input
			type="number"
			{min}
			{max}
			{step}
			value={fmt(value, decimals)}
			oninput={(e) => setPrimary(e.currentTarget.value)}
			class="w-[4.25rem] shrink-0 rounded-md bg-gray-800 border border-gray-700 px-1.5 py-1 text-sm text-gray-100 text-right font-mono"
		/>
		<span class="text-[10px] text-gray-500 w-8 shrink-0">{unit}</span>
		{#if secondary}
			<input
				type="number"
				step={secondary.step ?? step}
				value={fmt(secondary.to(value), secondary.decimals ?? decimals)}
				oninput={(e) => setSecondary(e.currentTarget.value)}
				class="w-[4.25rem] shrink-0 rounded-md bg-gray-800 border border-gray-700 px-1.5 py-1 text-sm text-gray-100 text-right font-mono"
			/>
			<span class="text-[10px] text-gray-500 w-7 shrink-0">{secondary.unit}</span>
		{/if}
	</div>
	{#if hint}
		<p class="text-[11px] text-gray-600 mt-0.5">{hint}</p>
	{/if}
</label>
