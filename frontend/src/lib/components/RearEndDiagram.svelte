<script lang="ts">
	import type { RearEndResults, RearSuspensionType, ShockAction } from '$lib/rearEndGeometry';
	import type { TireDimensions } from '$lib/tire';

	let {
		results,
		tire,
		suspensionType,
		shockAction,
		swingarmSectionMm = 40,
		shockBodyDiaMm = 50,
		viewSide = 'right',
	}: {
		results: RearEndResults;
		tire: TireDimensions;
		suspensionType: RearSuspensionType;
		shockAction: ShockAction;
		swingarmSectionMm?: number;
		shockBodyDiaMm?: number;
		viewSide?: 'left' | 'right';
	} = $props();

	const mirrorTransform = $derived(viewSide === 'left' ? 'scale(-1, 1)' : '');
	function sy(y: number): number { return -y; }

	const bounds = $derived.by(() => {
		const pts = [
			results.contactPatch,
			results.axleCenter,
			results.pivot,
			results.shockLower,
			results.shockUpper,
			results.countershaft,
			...(results.apex ? [results.apex] : []),
			...(results.rockerPivot ? [results.rockerPivot] : []),
			...(results.axleArc ?? []),
		];
		const r = tire.outerRadiusMm;
		let minX = -r - 80, maxX = r + 80, minY = -80, maxY = r + 80;
		for (const p of pts) {
			minX = Math.min(minX, p.x);
			maxX = Math.max(maxX, p.x);
			minY = Math.min(minY, p.y);
			maxY = Math.max(maxY, p.y);
		}
		minX -= r + 60;
		maxX += 80;
		minY -= 80;
		maxY += r + 40;
		return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
	});

	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);
	let isPanning = $state(false);
	let panStartX = $state(0);
	let panStartY = $state(0);
	let panStartPanX = $state(0);
	let panStartPanY = $state(0);
	let svgEl: SVGSVGElement | undefined = $state();

	type PovOption = 'free' | 'wheel' | 'pivot' | 'shock' | 'contact';
	let povFocus = $state<PovOption>('wheel');
	let povMenuOpen = $state(false);
	let freeX = $state(0);
	let freeY = $state(0);
	let panStartFreeX = $state(0);
	let panStartFreeY = $state(0);
	const povOptions: { value: PovOption; label: string }[] = [
		{ value: 'free', label: 'Floating (drag)' },
		{ value: 'wheel', label: 'Wheel Center' },
		{ value: 'pivot', label: 'Swingarm Pivot' },
		{ value: 'shock', label: 'Shock' },
		{ value: 'contact', label: 'Ground Contact Patch' },
	];

	const lockedCenter = $derived.by(() => {
		switch (povFocus) {
			case 'pivot': return results.pivot;
			case 'shock': return {
				x: (results.shockLower.x + results.shockUpper.x) / 2,
				y: (results.shockLower.y + results.shockUpper.y) / 2,
			};
			case 'contact': return results.contactPatch;
			default: return results.axleCenter;
		}
	});

	const lookAt = $derived(
		povFocus === 'free' ? { x: freeX, y: freeY } : { x: lockedCenter.x - panX, y: lockedCenter.y + panY },
	);

	const viewBox = $derived.by(() => {
		const w = bounds.width / zoom;
		const h = bounds.height / zoom;
		const cx = lookAt.x;
		const cy = -lookAt.y;
		return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
	});

	function selectPov(opt: PovOption) {
		if (opt === 'free') {
			freeX = lookAt.x;
			freeY = lookAt.y;
			panX = 0;
			panY = 0;
		}
		povFocus = opt;
		povMenuOpen = false;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		isPanning = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		panStartPanX = panX;
		panStartPanY = panY;
		panStartFreeX = lookAt.x;
		panStartFreeY = lookAt.y;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!isPanning || !svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const scaleX = bounds.width / (rect.width * zoom);
		const scaleY = bounds.height / (rect.height * zoom);
		const dx = (e.clientX - panStartX) * scaleX;
		const dy = (e.clientY - panStartY) * scaleY;
		if (povFocus === 'free') {
			freeX = panStartFreeX - dx;
			freeY = panStartFreeY + dy;
		} else {
			panX = panStartPanX + dx;
			panY = panStartPanY + dy;
		}
	}
	function onPointerUp() { isPanning = false; }
	function onWheel(e: WheelEvent) {
		if (!e.shiftKey) return;
		e.preventDefault();
		const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
		zoom = Math.max(0.1, Math.min(20, zoom * (delta < 0 ? 1.1 : 1 / 1.1)));
	}

	const sw = $derived(bounds.width / 320);
	const swThin = $derived(sw * 0.6);

	function polyPoints(corners: { x: number; y: number }[]): string {
		return corners.map((c) => `${c.x},${sy(c.y)}`).join(' ');
	}

	function capsule(a: { x: number; y: number }, b: { x: number; y: number }, width: number) {
		const dx = b.x - a.x, dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const px = (-dy / len) * (width / 2);
		const py = (dx / len) * (width / 2);
		return [
			{ x: a.x + px, y: a.y + py },
			{ x: a.x - px, y: a.y - py },
			{ x: b.x - px, y: b.y - py },
			{ x: b.x + px, y: b.y + py },
		];
	}

	const armPoly = $derived(capsule(results.axleCenter, results.pivot, swingarmSectionMm));
	const shockDir = $derived.by(() => {
		const dx = results.shockUpper.x - results.shockLower.x;
		const dy = results.shockUpper.y - results.shockLower.y;
		const len = Math.hypot(dx, dy) || 1;
		return { x: dx / len, y: dy / len, len };
	});
	const shockBodyLen = $derived(Math.max(40, shockDir.len * 0.55));
	const shockBody = $derived(capsule(
		results.shockLower,
		{
			x: results.shockLower.x + shockDir.x * shockBodyLen,
			y: results.shockLower.y + shockDir.y * shockBodyLen,
		},
		shockBodyDiaMm,
	));
	const shockShaft = $derived(capsule(
		{
			x: results.shockLower.x + shockDir.x * shockBodyLen * 0.7,
			y: results.shockLower.y + shockDir.y * shockBodyLen * 0.7,
		},
		results.shockUpper,
		Math.max(10, shockBodyDiaMm * 0.32),
	));

	const groundY = 0;
	const dimY = $derived(-tire.outerRadiusMm * 0.18);
	const armLen = $derived(Math.hypot(results.pivot.x - results.axleCenter.x, results.pivot.y - results.axleCenter.y));
	const shockLenLabel = $derived(results.shockLengthMm);
	const arcPts = $derived(
		(results.axleArc ?? []).map((p) => `${p.x},${sy(p.y)}`).join(' '),
	);
</script>

<div class="relative w-full h-full">
	<div class="absolute top-2 right-2 z-10">
		<button
			type="button"
			class="flex items-center gap-1 rounded bg-gray-800/80 border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700/90 transition-colors"
			onclick={() => povMenuOpen = !povMenuOpen}
		>
			<span>{povOptions.find((o) => o.value === povFocus)?.label}</span>
		</button>
		{#if povMenuOpen}
			<div class="absolute top-full right-0 mt-1 rounded bg-gray-800 border border-gray-700 shadow-lg overflow-hidden">
				{#each povOptions as opt}
					<button
						type="button"
						class="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors {povFocus === opt.value ? 'text-orange-400' : 'text-gray-300'}"
						onclick={() => selectPov(opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<svg
		bind:this={svgEl}
		viewBox={viewBox}
		class="w-full h-full"
		class:cursor-grabbing={isPanning}
		class:cursor-grab={!isPanning}
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Rear end geometry side view"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointerleave={onPointerUp}
		onwheel={onWheel}
	>
		<g transform={mirrorTransform}>
			<!-- Ground -->
			<line
				x1={bounds.minX}
				y1={sy(groundY)}
				x2={bounds.maxX}
				y2={sy(groundY)}
				stroke="#a3a3a3"
				stroke-width={sw}
			/>

			<!-- Pivot height reference -->
			<line
				x1={bounds.minX}
				y1={sy(results.pivot.y)}
				x2={bounds.maxX}
				y2={sy(results.pivot.y)}
				stroke="#64748b"
				stroke-width={swThin}
				stroke-dasharray="{sw * 6} {sw * 4}"
				opacity="0.45"
			/>
			<text x={bounds.minX + sw * 8} y={sy(results.pivot.y) - sw * 3} fill="#94a3b8" font-size={sw * 5}>
				Pivot height
			</text>

			<!-- Vertical through axle -->
			<line
				x1={results.axleCenter.x}
				y1={sy(bounds.minY)}
				x2={results.axleCenter.x}
				y2={sy(bounds.maxY)}
				stroke="#1e3a5f"
				stroke-width={swThin}
				stroke-dasharray="{sw * 6} {sw * 4}"
			/>

			<!-- Axle travel arc (frame-fixed) -->
			{#if arcPts && suspensionType !== 'hardtail'}
				<polyline
					points={arcPts}
					fill="none"
					stroke="#22c55e"
					stroke-width={swThin}
					stroke-dasharray="{sw * 4} {sw * 3}"
					opacity="0.7"
				/>
			{/if}

			<!-- Chain lines -->
			<line
				x1={results.chainUpper.p1.x} y1={sy(results.chainUpper.p1.y)}
				x2={results.chainUpper.p2.x} y2={sy(results.chainUpper.p2.y)}
				stroke="#a8a29e" stroke-width={swThin} opacity="0.7"
			/>
			<line
				x1={results.chainLower.p1.x} y1={sy(results.chainLower.p1.y)}
				x2={results.chainLower.p2.x} y2={sy(results.chainLower.p2.y)}
				stroke="#a8a29e" stroke-width={swThin} opacity="0.7"
			/>

			<!-- Frame rail / hardtail look -->
			{#if suspensionType === 'hardtail' || suspensionType === 'softail'}
				<line
					x1={results.frameRailFront.x}
					y1={sy(results.frameRailFront.y)}
					x2={results.axleCenter.x}
					y2={sy(results.axleCenter.y)}
					stroke="#9ca3af"
					stroke-width={swingarmSectionMm * 0.35}
					stroke-linecap="round"
					opacity={suspensionType === 'softail' ? 0.55 : 0.9}
				/>
			{/if}

			<!-- Swingarm -->
			{#if suspensionType !== 'hardtail'}
				<polygon points={polyPoints(armPoly)} fill="#374151" stroke="#9ca3af" stroke-width={swThin} />
			{/if}

			<!-- Triangulated stays -->
			{#if results.apex}
				<line
					x1={results.axleCenter.x} y1={sy(results.axleCenter.y)}
					x2={results.apex.x} y2={sy(results.apex.y)}
					stroke="#9ca3af" stroke-width={sw * 1.4} stroke-linecap="round"
				/>
				<line
					x1={results.pivot.x} y1={sy(results.pivot.y)}
					x2={results.apex.x} y2={sy(results.apex.y)}
					stroke="#9ca3af" stroke-width={sw * 1.4} stroke-linecap="round"
				/>
				<circle cx={results.apex.x} cy={sy(results.apex.y)} r={sw * 2.2} fill="#f97316" />
			{/if}

			<!-- Linkage rocker + dogbone -->
			{#if results.rockerPivot && results.rockerDogbone && results.rockerShock && results.dogboneArm}
				<line
					x1={results.dogboneArm.x} y1={sy(results.dogboneArm.y)}
					x2={results.rockerDogbone.x} y2={sy(results.rockerDogbone.y)}
					stroke="#67e8f9" stroke-width={sw * 1.3}
				/>
				<line
					x1={results.rockerDogbone.x} y1={sy(results.rockerDogbone.y)}
					x2={results.rockerShock.x} y2={sy(results.rockerShock.y)}
					stroke="#c4b5fd" stroke-width={sw * 1.6}
				/>
				<circle cx={results.rockerPivot.x} cy={sy(results.rockerPivot.y)} r={sw * 2.4} fill="#a78bfa" stroke="#fff" stroke-width={sw * 0.4} />
			{/if}

			<!-- Shock -->
			{#if suspensionType !== 'hardtail'}
				<polygon points={polyPoints(shockBody)} fill="#4b5563" stroke="#fdba74" stroke-width={swThin} />
				<polygon points={polyPoints(shockShaft)} fill="none" stroke="#fdba74" stroke-width={swThin} />
				<line
					x1={results.shockLower.x} y1={sy(results.shockLower.y)}
					x2={results.shockUpper.x} y2={sy(results.shockUpper.y)}
					stroke="#f97316" stroke-width={swThin} stroke-dasharray="{sw * 5} {sw * 3}" opacity="0.85"
				/>
				<circle cx={results.shockLower.x} cy={sy(results.shockLower.y)} r={sw * 2} fill="#fdba74" />
				<circle cx={results.shockUpper.x} cy={sy(results.shockUpper.y)} r={sw * 2} fill="#fdba74" />
			{/if}

			<!-- Countershaft / sprockets -->
			<circle cx={results.countershaft.x} cy={sy(results.countershaft.y)} r={Math.max(12, 18)} fill="none" stroke="#a8a29e" stroke-width={swThin} />
			<circle cx={results.axleCenter.x} cy={sy(results.axleCenter.y)} r={Math.max(20, 40)} fill="none" stroke="#78716c" stroke-width={swThin} opacity="0.8" />

			<!-- Tire / rim -->
			<circle
				cx={results.axleCenter.x} cy={sy(results.axleCenter.y)}
				r={tire.outerRadiusMm}
				fill="none" stroke="#6b7280" stroke-width={sw}
			/>
			<circle
				cx={results.axleCenter.x} cy={sy(results.axleCenter.y)}
				r={tire.rimRadiusMm}
				fill="none" stroke="#9ca3af" stroke-width={swThin}
			/>
			<circle
				cx={results.axleCenter.x} cy={sy(results.axleCenter.y)}
				r={(tire.outerRadiusMm + tire.rimRadiusMm) / 2}
				fill="none" stroke="#6b7280" stroke-width={tire.outerRadiusMm - tire.rimRadiusMm}
				opacity="0.12"
			/>

			<!-- Pivot -->
			<circle cx={results.pivot.x} cy={sy(results.pivot.y)} r={sw * 3} fill="#22d3ee" stroke="#fff" stroke-width={sw * 0.5} />
			<text x={results.pivot.x + sw * 5} y={sy(results.pivot.y) - sw * 4} fill="#22d3ee" font-size={sw * 5}>
				Pivot
			</text>

			<!-- Axle -->
			<circle cx={results.axleCenter.x} cy={sy(results.axleCenter.y)} r={sw * 2.2} fill="#e5e7eb" />

			<!-- Contact patch -->
			<line
				x1={results.contactPatch.x - sw * 6} y1={sy(groundY)}
				x2={results.contactPatch.x + sw * 6} y2={sy(groundY)}
				stroke="#22c55e" stroke-width={swThin}
			/>
			<line
				x1={results.contactPatch.x} y1={sy(groundY - sw * 6)}
				x2={results.contactPatch.x} y2={sy(groundY + sw * 6)}
				stroke="#22c55e" stroke-width={swThin}
			/>

			<!-- Swingarm length dimension -->
			<line
				x1={results.axleCenter.x} y1={sy(dimY)}
				x2={results.pivot.x} y2={sy(dimY)}
				stroke="#fbbf24" stroke-width={swThin}
			/>
			<line x1={results.axleCenter.x} y1={sy(dimY - sw * 2)} x2={results.axleCenter.x} y2={sy(dimY + sw * 2)} stroke="#fbbf24" stroke-width={swThin} />
			<line x1={results.pivot.x} y1={sy(dimY - sw * 2)} x2={results.pivot.x} y2={sy(dimY + sw * 2)} stroke="#fbbf24" stroke-width={swThin} />
			<text
				x={(results.axleCenter.x + results.pivot.x) / 2}
				y={sy(dimY - sw * 4)}
				text-anchor="middle"
				fill="#fbbf24"
				font-size={sw * 5}
			>
				{armLen.toFixed(0)} mm
			</text>

			{#if suspensionType !== 'hardtail'}
				<text
					x={(results.shockLower.x + results.shockUpper.x) / 2 + sw * 6}
					y={sy((results.shockLower.y + results.shockUpper.y) / 2)}
					fill="#fdba74"
					font-size={sw * 4.5}
				>
					{shockLenLabel.toFixed(0)} mm {shockAction === 'expansion' ? 'exp' : 'cmp'}
				</text>
			{/if}
		</g>
	</svg>
</div>
