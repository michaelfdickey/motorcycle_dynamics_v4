<script lang="ts">
	import type { PistonGroup } from '$lib/braking';

	const POT_COLORS = ['#ef4444', '#dc2626', '#f87171', '#b91c1c', '#fb7185', '#991b1b'];

	let {
		cx,
		cy,
		discDiameterMm,
		tireOuterMm,
		potCount = 0,
		pistons = [] as PistonGroup[],
		dualSided = false,
		caliperAngleDeg = 90,
		rotorAngleDeg = 0,
		scale = 1,
		sw = 2,
		showLabel = true,
	}: {
		cx: number;
		cy: number;
		discDiameterMm: number;
		tireOuterMm: number;
		potCount?: number;
		pistons?: PistonGroup[];
		dualSided?: boolean;
		caliperAngleDeg?: number;
		rotorAngleDeg?: number;
		scale?: number;
		sw?: number;
		showLabel?: boolean;
	} = $props();

	const discR = $derived(Math.min(tireOuterMm * 0.92, Math.max(20, discDiameterMm / 2)) * scale);
	const font = $derived(Math.max(10, sw * 5));

	const potList = $derived.by(() => {
		const list: { diameterMm: number }[] = [];
		if (pistons.length > 0) {
			for (const g of pistons) {
				const n = Math.max(0, Math.round(g.count));
				const d = Math.max(4, g.diameterMm);
				for (let i = 0; i < n; i++) list.push({ diameterMm: d });
			}
		} else {
			const n = Math.max(0, Math.round(potCount));
			for (let i = 0; i < n; i++) list.push({ diameterMm: 30 });
		}
		return list;
	});

	/** 0° = top of the rotor; positive = clockwise in SVG (right-side view: 90° is the front of the wheel). */
	const a0 = $derived(((-90 + caliperAngleDeg) * Math.PI) / 180);

	const layout = $derived.by(() => {
		const n = potList.length;
		const trackW = discR * 0.26;
		const padR = discR - trackW * 0.5;
		if (n === 0) {
			return { pots: [] as { x: number; y: number; r: number; a: number; color: string }[], body: '', padR, rInner: 0, rOuter: 0 };
		}
		const diams = potList.map((p) => Math.max(6 * scale, p.diameterMm * scale));
		const meanD = diams.reduce((s, d) => s + d, 0) / n;
		const gap = Math.max(3.5 * scale, meanD * 0.28);
		let span = 0;
		for (const d of diams) span += d;
		span += (n - 1) * gap;
		let acc = -span / 2;
		const pots: { x: number; y: number; r: number; a: number; color: string }[] = [];
		for (let i = 0; i < n; i++) {
			const d = diams[i];
			const offset = acc + d / 2;
			const a = a0 + offset / padR;
			pots.push({
				x: cx + padR * Math.cos(a),
				y: cy + padR * Math.sin(a),
				r: d / 2,
				a,
				color: POT_COLORS[i % POT_COLORS.length],
			});
			acc += d + gap;
		}
		const maxR = Math.max(...pots.map((p) => p.r));
		const wall = Math.max(3.5 * scale, maxR * 0.38);
		const rInner = Math.max(discR * 0.42, padR - maxR - wall);
		const rOuter = Math.max(discR + wall * 0.85, padR + maxR + wall * 0.55);
		const aPad = wall / padR;
		const aStart = pots[0].a - pots[0].r / padR - aPad;
		const aEnd = pots[n - 1].a + pots[n - 1].r / padR + aPad;
		return { pots, body: caliperBodyPath(cx, cy, aStart, aEnd, rInner, rOuter), padR, rInner, rOuter };
	});

	const rotor = $derived.by(() => buildRotor(cx, cy, discR, scale));
	const labelY = $derived.by(() => {
		const ang = ((caliperAngleDeg % 360) + 360) % 360;
		const nearTop = ang < 48 || ang > 312;
		return cy - discR - sw * (nearTop ? 14 : 6);
	});

	function caliperBodyPath(
		ox: number,
		oy: number,
		aStart: number,
		aEnd: number,
		rInner: number,
		rOuter: number,
	): string {
		const innerS = polar(ox, oy, rInner, aStart);
		const innerE = polar(ox, oy, rInner, aEnd);
		const outerS = polar(ox, oy, rOuter, aStart);
		const outerE = polar(ox, oy, rOuter, aEnd);
		const rCap = Math.max(0.5, (rOuter - rInner) / 2);
		const large = Math.abs(aEnd - aStart) > Math.PI ? 1 : 0;
		return [
			`M${f(innerS.x)},${f(innerS.y)}`,
			`A${f(rInner)},${f(rInner)} 0 ${large} 1 ${f(innerE.x)},${f(innerE.y)}`,
			`A${f(rCap)},${f(rCap)} 0 0 1 ${f(outerE.x)},${f(outerE.y)}`,
			`A${f(rOuter)},${f(rOuter)} 0 ${large} 0 ${f(outerS.x)},${f(outerS.y)}`,
			`A${f(rCap)},${f(rCap)} 0 0 1 ${f(innerS.x)},${f(innerS.y)}`,
			'Z',
		].join(' ');
	}

	function buildRotor(ox: number, oy: number, R: number, s: number) {
		const hatInner = R * 0.2;
		const trackInner = R * 0.62;
		const carrierMid = (hatInner + trackInner) * 0.52;
		const holes: string[] = [circleSub(ox, oy, R), circleSub(ox, oy, hatInner)];

		const boltR = Math.max(R * 0.038, 1.6 * s);
		const boltPcd = carrierMid;
		for (let i = 0; i < 6; i++) {
			const a = (i * 60 + 12) * Math.PI / 180;
			holes.push(circleSub(ox + boltPcd * Math.cos(a), oy + boltPcd * Math.sin(a), boltR));
		}

		const petalR = Math.max(R * 0.055, 2 * s);
		const petalPcd = carrierMid;
		for (let i = 0; i < 6; i++) {
			const a = (i * 60 + 42) * Math.PI / 180;
			holes.push(circleSub(ox + petalPcd * Math.cos(a), oy + petalPcd * Math.sin(a), petalR));
		}

		const trackW = R - trackInner;
		const holeInner = Math.max(R * 0.028, 1.2 * s);
		const holeOuter = Math.max(R * 0.034, 1.4 * s);
		const r1 = trackInner + trackW * 0.32;
		const r2 = trackInner + trackW * 0.68;
		const n1 = Math.max(8, Math.min(16, Math.round((2 * Math.PI * r1) / (holeInner * 3.4))));
		const n2 = Math.max(10, Math.min(20, Math.round((2 * Math.PI * r2) / (holeOuter * 3.2))));
		for (let i = 0; i < n1; i++) {
			const a = (i / n1) * Math.PI * 2;
			holes.push(circleSub(ox + r1 * Math.cos(a), oy + r1 * Math.sin(a), holeInner));
		}
		for (let i = 0; i < n2; i++) {
			const a = ((i + 0.5) / n2) * Math.PI * 2;
			holes.push(circleSub(ox + r2 * Math.cos(a), oy + r2 * Math.sin(a), holeOuter));
		}

		const buttons: { x: number; y: number; r: number }[] = [];
		const btnN = 8;
		const btnR = Math.max(R * 0.028, 1.3 * s);
		for (let i = 0; i < btnN; i++) {
			const a = (i / btnN) * Math.PI * 2 + Math.PI / btnN;
			buttons.push({
				x: ox + trackInner * Math.cos(a),
				y: oy + trackInner * Math.sin(a),
				r: btnR,
			});
		}

		return {
			d: holes.join(''),
			hatInner,
			trackInner,
			buttons,
		};
	}

	function polar(ox: number, oy: number, r: number, a: number) {
		return { x: ox + r * Math.cos(a), y: oy + r * Math.sin(a) };
	}

	function circleSub(x: number, y: number, r: number): string {
		if (r <= 0.2) return '';
		return `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1 0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1 0 ${f(-2 * r)},0`;
	}

	function f(v: number): string {
		return v.toFixed(2);
	}
</script>

<g class="brake-rotor">
	<g transform="rotate({rotorAngleDeg} {cx} {cy})">
		<path d={rotor.d} fill="#ea580c" fill-rule="evenodd" opacity="0.55" />
		<circle cx={cx} cy={cy} r={discR} fill="none" stroke="#f97316" stroke-width={sw * 1.5} opacity="0.95" />
		<circle cx={cx} cy={cy} r={rotor.trackInner} fill="none" stroke="#fb923c" stroke-width={sw * 0.7} opacity="0.7" />
		<circle cx={cx} cy={cy} r={rotor.hatInner} fill="none" stroke="#fdba74" stroke-width={sw * 0.55} opacity="0.55" />
		{#each rotor.buttons as b}
			<circle cx={b.x} cy={b.y} r={b.r} fill="#c2410c" stroke="#9a3412" stroke-width={sw * 0.35} />
		{/each}
	</g>

	<!-- 0° datum: top of the rotor on the vertical axis -->
	<line
		x1={cx}
		y1={cy - discR}
		x2={cx}
		y2={cy - discR - Math.max(5, sw * 2.8)}
		stroke="#fdba74"
		stroke-width={sw * 0.55}
		opacity="0.65"
	/>

	{#if layout.pots.length > 0}
		<path
			d={layout.body}
			fill="#9f1239"
			fill-opacity="0.72"
			stroke="#e11d48"
			stroke-width={sw * 1.15}
			stroke-linejoin="round"
		/>
		<path
			d={layout.body}
			fill="none"
			stroke="#7f1d1d"
			stroke-width={sw * 0.45}
			opacity="0.85"
		/>
		{#each layout.pots as pot}
			<circle cx={pot.x} cy={pot.y} r={pot.r} fill={pot.color} stroke="#7f1d1d" stroke-width={sw * 0.55} />
			<circle cx={pot.x} cy={pot.y} r={pot.r * 0.55} fill="#881337" fill-opacity="0.55" stroke="#fecaca" stroke-width={sw * 0.35} opacity="0.9" />
		{/each}
	{/if}

	{#if showLabel}
		<text x={cx} y={labelY} fill="#f97316" font-size={font} text-anchor="middle">
			Ø{Math.round(discDiameterMm)} / {potList.length}-pot{dualSided ? ' dual' : ''}
		</text>
	{/if}
</g>
