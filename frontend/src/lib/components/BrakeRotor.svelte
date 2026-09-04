<script lang="ts">
	let {
		cx,
		cy,
		discDiameterMm,
		tireOuterMm,
		potCount = 0,
		dualSided = false,
		sw = 2,
	}: {
		cx: number;
		cy: number;
		discDiameterMm: number;
		tireOuterMm: number;
		potCount?: number;
		dualSided?: boolean;
		sw?: number;
	} = $props();

	const discR = $derived(Math.min(tireOuterMm * 0.92, Math.max(20, discDiameterMm / 2)));
	const calW = $derived(Math.max(36, discR * 0.22));
	const calH = $derived(Math.max(44, discR * 0.28));
	const calX = $derived(cx - discR - calW * 0.35);
	const font = $derived(Math.max(10, sw * 5));
</script>

<circle cx={cx} cy={cy} r={discR} fill="none" stroke="#ef4444" stroke-width={sw * 1.6} opacity="0.95" />
<circle cx={cx} cy={cy} r={Math.max(8, discR * 0.22)} fill="none" stroke="#ef4444" stroke-width={sw * 0.7} opacity="0.5" />
<rect x={calX} y={cy - calH / 2} width={calW} height={calH} rx="3" fill="#ef4444" opacity="0.75" />
<text x={cx} y={cy - discR - sw * 6} fill="#ef4444" font-size={font} text-anchor="middle">
	Ø{Math.round(discDiameterMm)} / {potCount}-pot{dualSided ? ' dual' : ''}
</text>
