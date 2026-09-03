<script lang="ts">
	import type { CurvePt, StepPt } from '$lib/suspension';

	let {
		curve,
		step,
		travelMm,
		sagMm,
		title = 'Force vs stroke',
		yUnit = 'N',
		stepTitle = 'Bump release',
	}: {
		curve: CurvePt[];
		step: StepPt[];
		travelMm: number;
		sagMm: number;
		title?: string;
		yUnit?: string;
		stepTitle?: string;
	} = $props();

	const W = 280;
	const H = 92;
	const padL = 28;
	const padR = 8;
	const padT = 8;
	const padB = 16;

	function path(pts: { x: number; y: number }[], xMax: number, yMax: number): string {
		if (!pts.length || xMax <= 0 || yMax <= 0) return '';
		const iw = W - padL - padR;
		const ih = H - padT - padB;
		return pts
			.map((p, i) => {
				const X = padL + (p.x / xMax) * iw;
				const Y = padT + ih - (p.y / yMax) * ih;
				return `${i === 0 ? 'M' : 'L'}${X.toFixed(1)} ${Y.toFixed(1)}`;
			})
			.join(' ');
	}

	const fMax = $derived(Math.max(10, ...curve.map((p) => p.f)) * 1.08);
	const xMax = $derived(Math.max(1, travelMm));
	const curvePath = $derived(path(curve.map((p) => ({ x: p.x, y: p.f })), xMax, fMax));
	const sagX = $derived(padL + (Math.min(sagMm, xMax) / xMax) * (W - padL - padR));

	const stepTMax = $derived(Math.max(0.4, step.at(-1)?.t ?? 1));
	const stepAmp = $derived(Math.max(8, ...step.map((p) => Math.abs(p.x))) * 1.15);
	const stepPath = $derived(
		path(
			step.map((p) => ({ x: p.t, y: p.x + stepAmp })),
			stepTMax,
			stepAmp * 2,
		),
	);
	const zeroY = $derived(padT + (H - padT - padB) / 2);
</script>

<div class="grid grid-cols-2 gap-2">
	<div>
		<div class="text-[10px] text-gray-500 mb-0.5">{title}</div>
		<svg viewBox="0 0 {W} {H}" class="w-full h-24 rounded bg-gray-950 border border-gray-800">
			<line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#374151" stroke-width="1" />
			<line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#374151" stroke-width="1" />
			<line x1={sagX} y1={padT} x2={sagX} y2={H - padB} stroke="#22d3ee" stroke-width="0.8" stroke-dasharray="2,3" />
			<path d={curvePath} fill="none" stroke="#fb923c" stroke-width="1.6" />
			<text x={padL + 2} y="10" fill="#6b7280" font-size="8">{Math.round(fMax)} {yUnit}</text>
			<text x={W - 42} y={H - 4} fill="#6b7280" font-size="8">{Math.round(xMax)} mm</text>
			<text x={sagX + 2} y="10" fill="#22d3ee" font-size="8">sag</text>
		</svg>
	</div>
	<div>
		<div class="text-[10px] text-gray-500 mb-0.5">{stepTitle}</div>
		<svg viewBox="0 0 {W} {H}" class="w-full h-24 rounded bg-gray-950 border border-gray-800">
			<line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#374151" stroke-width="1" />
			<line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#4b5563" stroke-width="0.8" stroke-dasharray="2,3" />
			<path d={stepPath} fill="none" stroke="#a78bfa" stroke-width="1.6" />
			<text x={padL + 2} y="10" fill="#6b7280" font-size="8">+{Math.round(stepAmp)} mm</text>
			<text x={W - 36} y={H - 4} fill="#6b7280" font-size="8">{stepTMax.toFixed(1)} s</text>
		</svg>
	</div>
</div>
