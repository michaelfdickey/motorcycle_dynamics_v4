<script lang="ts">
	import type { AssembledBike, Pt } from '$lib/bikeAssembly';
	import type { BrakeParams, BrakingResults, VehicleParams } from '$lib/braking';
	import { totalPotCount } from '$lib/braking';

	let {
		bike,
		vehicle: _vehicle,
		frontBrake,
		rearBrake,
		viewSide = 'right',
		pitchDeg = 0,
		frontWheelAngleDeg = 0,
		rearWheelAngleDeg = 0,
		farBgOffset = 0,
		nearBgOffset = 0,
		roadOffset = 0,
		results = null,
		simRunning = false,
		simTimeS = 0,
		simSpeedMs = 0,
		peakDecelG = 0,
		brakingDistanceM = 0,
		brakingTimeS = 0,
		frontSlip = false,
		rearSlip = false,
		frontRotorKJ = 0,
		rearRotorKJ = 0,
		initialSpeedKph = 100,
	}: {
		bike: AssembledBike;
		vehicle: VehicleParams;
		frontBrake: BrakeParams;
		rearBrake: BrakeParams;
		viewSide?: 'left' | 'right';
		pitchDeg?: number;
		frontWheelAngleDeg?: number;
		rearWheelAngleDeg?: number;
		farBgOffset?: number;
		nearBgOffset?: number;
		roadOffset?: number;
		results?: BrakingResults | null;
		simRunning?: boolean;
		simTimeS?: number;
		simSpeedMs?: number;
		peakDecelG?: number;
		brakingDistanceM?: number;
		brakingTimeS?: number;
		frontSlip?: boolean;
		rearSlip?: boolean;
		frontRotorKJ?: number;
		rearRotorKJ?: number;
		initialSpeedKph?: number;
	} = $props();

	const svgWidth = 1000;
	const svgHeight = 520;
	const spokeCount = 8;
	const roadMarkerSpacing = 40;

	const padX = 0.08;
	const padY = 0.12;
	const extent = $derived.by(() => {
		let minX = Math.min(bike.rearContact.x - bike.rearTire.outerRadiusMm, bike.frontContact.x - bike.frontTire.outerRadiusMm);
		let maxX = Math.max(bike.rearContact.x + bike.rearTire.outerRadiusMm, bike.frontContact.x + bike.frontTire.outerRadiusMm);
		let maxY = Math.max(bike.cog.y + 80, bike.frontTire.outerRadiusMm * 2.2, bike.rearTire.outerRadiusMm * 2.2, 700);
		for (const n of bike.nodes) {
			minX = Math.min(minX, n.x);
			maxX = Math.max(maxX, n.x);
			maxY = Math.max(maxY, n.y);
		}
		return { minX, maxX, maxY, width: Math.max(400, maxX - minX), height: Math.max(400, maxY) };
	});

	const scale = $derived(Math.min(
		(svgWidth * (1 - padX * 2)) / extent.width,
		(svgHeight * (1 - padY * 2 - 0.08)) / (extent.height + 40),
	));
	const groundY = $derived(svgHeight - 36);
	const worldMidX = $derived((extent.minX + extent.maxX) / 2);
	const originX = $derived(svgWidth / 2);

	function wxToSvg(wx: number): number {
		const dx = (wx - worldMidX) * scale;
		return viewSide === 'right' ? originX + dx : originX - dx;
	}
	function wyToSvg(wy: number): number {
		return groundY - wy * scale;
	}
	function toSvg(p: Pt): { x: number; y: number } {
		return { x: wxToSvg(p.x), y: wyToSvg(p.y) };
	}

	const cogS = $derived(toSvg(bike.cog));
	const pitchSign = $derived(viewSide === 'right' ? 1 : -1);
	const pitchRad = $derived((pitchDeg * pitchSign * Math.PI) / 180);

	function pitched(p: Pt): { x: number; y: number } {
		const s = toSvg(p);
		const c = Math.cos(pitchRad);
		const sn = Math.sin(pitchRad);
		const dx = s.x - cogS.x;
		const dy = s.y - cogS.y;
		return { x: cogS.x + dx * c - dy * sn, y: cogS.y + dx * sn + dy * c };
	}

	const frontAxleS = $derived(toSvg(bike.frontAxle));
	const rearAxleS = $derived(toSvg(bike.rearAxle));
	const frontR = $derived(bike.frontTire.outerRadiusMm * scale);
	const rearR = $derived(bike.rearTire.outerRadiusMm * scale);
	const frontRimR = $derived(bike.frontTire.rimRadiusMm * scale);
	const rearRimR = $derived(bike.rearTire.rimRadiusMm * scale);
	const frontDiscR = $derived(Math.min(frontR * 0.92, (frontBrake.discDiameterMm / 2) * scale));
	const rearDiscR = $derived(Math.min(rearR * 0.92, (rearBrake.discDiameterMm / 2) * scale));

	function spokes(cx: number, cy: number, r: number, angleDeg: number): string[] {
		const lines: string[] = [];
		for (let i = 0; i < spokeCount; i++) {
			const a = ((angleDeg + i * (360 / spokeCount)) * Math.PI) / 180;
			lines.push(`M${cx},${cy} L${cx + Math.cos(a) * r * 0.82},${cy + Math.sin(a) * r * 0.82}`);
		}
		return lines;
	}

	function poly(pts: { x: number; y: number }[]): string {
		return pts.map((p) => `${p.x},${p.y}`).join(' ');
	}

	function saRect(cx: number, cy: number, rakeDeg: number, halfH: number, halfW: number, ox: number, oy: number): Pt[] {
		const rake = (rakeDeg * Math.PI) / 180;
		const dirX = -Math.sin(rake);
		const dirY = Math.cos(rake);
		const perpX = dirY;
		const perpY = -dirX;
		return [
			{ x: cx + ox + halfH * dirX + halfW * perpX, y: cy + oy + halfH * dirY + halfW * perpY },
			{ x: cx + ox + halfH * dirX - halfW * perpX, y: cy + oy + halfH * dirY - halfW * perpY },
			{ x: cx + ox - halfH * dirX - halfW * perpX, y: cy + oy - halfH * dirY - halfW * perpY },
			{ x: cx + ox - halfH * dirX + halfW * perpX, y: cy + oy - halfH * dirY + halfW * perpY },
		];
	}

	const roadMarkers = $derived.by(() => {
		const markers: number[] = [];
		for (let x = -roadMarkerSpacing; x < svgWidth + roadMarkerSpacing; x += roadMarkerSpacing) {
			markers.push(x - (roadOffset % roadMarkerSpacing));
		}
		return markers;
	});

	function fe(p: Pt): Pt {
		if (!bike.front) return p;
		return { x: p.x + bike.front.ox, y: p.y + bike.front.oy };
	}
	function re(p: Pt): Pt {
		if (!bike.rear) return p;
		return { x: p.x + bike.rear.ox, y: p.y + bike.rear.oy };
	}

	const cogP = $derived(pitched(bike.cog));
</script>

<svg viewBox="0 0 {svgWidth} {svgHeight}" class="w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Braking simulation side view">
	<defs>
		<marker id="arrowGreen" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
			<path d="M0,0 L6,3 L0,6 Z" fill="#22c55e" />
		</marker>
		<marker id="dimTick" markerWidth="1" markerHeight="6" refX="0.5" refY="3" orient="auto">
			<line x1="0.5" y1="0" x2="0.5" y2="6" stroke="#555" stroke-width="1" />
		</marker>
	</defs>

	{#each Array.from({ length: Math.ceil(svgWidth / 440) + 3 }, (_, i) => i) as i}
		{@const mx = i * 440 - ((farBgOffset % 440) + 440) % 440 - 220}
		<polygon points="{mx},{groundY} {mx + 220},{groundY - 260} {mx + 440},{groundY}" fill="#1a1a2e" stroke="none" />
		<polygon points="{mx + 160},{groundY} {mx + 300},{groundY - 170} {mx + 480},{groundY}" fill="#16162a" stroke="none" />
	{/each}
	<line x1="0" y1={groundY} x2={svgWidth} y2={groundY} stroke="#222" stroke-width="0.5" />

	{#each Array.from({ length: Math.ceil(svgWidth / 180) + 3 }, (_, i) => i) as i}
		{@const tx = i * 180 - ((nearBgOffset % 180) + 180) % 180 - 90}
		{@const worldIdx = i + Math.floor(nearBgOffset / 180)}
		{@const treeH = 165 + (((worldIdx % 3) + 3) % 3) * 40}
		<line x1={tx} y1={groundY} x2={tx} y2={groundY - treeH + 45} stroke="#2a1f14" stroke-width="8" />
		<polygon points="{tx},{groundY - treeH} {tx - 42},{groundY - treeH + 90} {tx + 42},{groundY - treeH + 90}" fill="#1a3a1a" stroke="none" />
		<polygon points="{tx},{groundY - treeH + 36} {tx - 54},{groundY - treeH + 126} {tx + 54},{groundY - treeH + 126}" fill="#153015" stroke="none" />
	{/each}

	<line x1="0" y1={groundY} x2={svgWidth} y2={groundY} stroke="#666" stroke-width="1.5" />
	{#each roadMarkers as mx}
		<line x1={mx} y1={groundY + 2} x2={mx} y2={groundY + 12} stroke="#444" stroke-width="2" />
	{/each}

	<!-- Unsprung: wheels, tires, rotors, calipers -->
	{#each [
		{ axle: frontAxleS, r: frontR, rim: frontRimR, disc: frontDiscR, ang: frontWheelAngleDeg, brake: frontBrake, pots: totalPotCount(frontBrake.pistons), dual: frontBrake.dualSided, kJ: frontRotorKJ, color: '#f97316' },
		{ axle: rearAxleS, r: rearR, rim: rearRimR, disc: rearDiscR, ang: rearWheelAngleDeg, brake: rearBrake, pots: totalPotCount(rearBrake.pistons), dual: rearBrake.dualSided, kJ: rearRotorKJ, color: '#22d3ee' },
	] as w}
		{@const calW = Math.max(8, 12 * scale * 4)}
		{@const calH = Math.max(10, 16 * scale * 4)}
		{@const calX = viewSide === 'right' ? w.axle.x - w.disc - calW * 0.35 : w.axle.x + w.disc - calW * 0.65}
		<circle cx={w.axle.x} cy={w.axle.y} r={(w.r + w.rim) / 2} fill="none" stroke="#64748b" stroke-width={Math.max(3, w.r - w.rim)} opacity="0.35" />
		<circle cx={w.axle.x} cy={w.axle.y} r={w.r} fill="none" stroke="#d4d4d8" stroke-width="1.8" />
		<circle cx={w.axle.x} cy={w.axle.y} r={w.rim} fill="none" stroke="#94a3b8" stroke-width="1.2" />
		{#each spokes(w.axle.x, w.axle.y, w.rim, w.ang) as d}
			<path {d} stroke="#78716c" stroke-width="1.2" fill="none" />
		{/each}
		<circle cx={w.axle.x} cy={w.axle.y} r={w.disc} fill="none" stroke="#ef4444" stroke-width="2.4" opacity="0.9" />
		<circle cx={w.axle.x} cy={w.axle.y} r={Math.max(4, w.disc * 0.22)} fill="none" stroke="#ef4444" stroke-width="1" opacity="0.5" />
		<rect x={calX} y={w.axle.y - calH / 2} width={calW} height={calH} rx="2" fill="#ef4444" opacity="0.7" />
		<circle cx={w.axle.x} cy={w.axle.y} r="3.5" fill={w.color} />
		<text x={w.axle.x} y={w.axle.y - w.r - 14} fill="#ef4444" font-size="9" text-anchor="middle">
			Ø{Math.round(w.brake.discDiameterMm)} / {w.pots}-pot
		</text>
		{#if results && (results.frontBrakeForceN + results.rearBrakeForceN) > 0}
			<title>Peak thermal energy absorbed per rotor during a full stop from {initialSpeedKph} km/h</title>
			<text x={w.axle.x} y={w.axle.y - w.r - 26} fill="#fbbf24" font-size="9" text-anchor="middle">
				{w.dual ? `L: ${w.kJ.toFixed(0)} kJ  R: ${w.kJ.toFixed(0)} kJ` : `Rotor: ${w.kJ.toFixed(0)} kJ`}
			</text>
		{/if}
	{/each}

	<!-- Sprung chassis: frame members + nodes -->
	{#if bike.hasFrame}
		{#each bike.members as m}
			{@const a = bike.nodeById[m.startId]}
			{@const b = bike.nodeById[m.endId]}
			{#if a && b}
				{@const pa = pitched(a)}
				{@const pb = pitched(b)}
				<line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
					stroke="#60a5fa" stroke-width={Math.max(1.5, Math.min(5, m.diameter * scale * 0.12))}
					stroke-linecap="round" opacity="0.95" />
			{/if}
		{/each}
		{#each bike.nodes as n}
			{#if n.type !== 'front_anchor' && n.type !== 'rear_anchor'}
				{@const p = pitched(n)}
				<circle cx={p.x} cy={p.y} r="2.2" fill="#93c5fd" />
			{/if}
		{/each}
	{:else}
		{@const a = pitched({ x: bike.frontAxle.x, y: bike.frontAxle.y + 80 })}
		{@const b = pitched({ x: bike.rearAxle.x, y: bike.rearAxle.y + 40 })}
		{@const c = pitched(bike.cog)}
		<polygon points="{a.x},{a.y} {b.x},{b.y} {c.x},{c.y}" fill="none" stroke="#6b7280" stroke-width="2" />
	{/if}

	<!-- Front end chassis (steering column / triples) pitched; fork to unsprung axle -->
	{#if bike.front}
		{@const fr = bike.front.results}
		{@const rake = bike.front.rakeDeg}
		{@const sc = fe(fr.steeringColumnCenter)}
		{@const saG = fe(fr.steeringAxisGround)}
		{@const saT = fe(fr.steeringAxisTop)}
		{@const ft = fe(fr.forkTop)}
		{@const pSaG = pitched(saG)}
		{@const pSaT = pitched(saT)}
		{@const pFt = pitched(ft)}
		{@const col = saRect(fr.steeringColumnCenter.x, fr.steeringColumnCenter.y, rake, bike.front.scHeightMm / 2, 25, bike.front.ox, bike.front.oy).map(pitched)}
		<line x1={pSaG.x} y1={pSaG.y} x2={pSaT.x} y2={pSaT.y} stroke="#60a5fa" stroke-width="1" stroke-dasharray="7,4" opacity="0.55" />
		<polygon points={poly(col)} fill="none" stroke="#f97316" stroke-width="2" />
		<line x1={pFt.x} y1={pFt.y} x2={frontAxleS.x} y2={frontAxleS.y}
			stroke="#f97316" stroke-width={Math.max(2.5, bike.front.tubeDiaMm * scale * 0.55)} opacity="0.45" stroke-linecap="round" />
		<line x1={pFt.x} y1={pFt.y} x2={frontAxleS.x} y2={frontAxleS.y} stroke="#f97316" stroke-width="1.5" />
		{#if fr.linkPivot && fr.linkEnd}
			{@const lp = pitched(fe(fr.linkPivot))}
			<line x1={lp.x} y1={lp.y} x2={frontAxleS.x} y2={frontAxleS.y} stroke="#f97316" stroke-width="3" />
			<circle cx={lp.x} cy={lp.y} r="3.5" fill="#f97316" />
		{/if}
		{@const pSc = pitched(sc)}
		<circle cx={pSc.x} cy={pSc.y} r="4" fill="#f97316" stroke="#fff" stroke-width="0.8" />
	{:else}
		{@const top = pitched({ x: bike.frontAxle.x, y: bike.frontAxle.y + 220 })}
		<line x1={frontAxleS.x} y1={frontAxleS.y} x2={top.x} y2={top.y} stroke="#f97316" stroke-width="3" />
	{/if}

	<!-- Rear end: swingarm / shock from pitched pivot to unsprung axle -->
	{#if bike.rear}
		{@const rr = bike.rear.results}
		{@const pivot = pitched(re(rr.pivot))}
		{@const section = Math.max(2, bike.rear.swingarmSectionMm * scale * 0.35)}
		<line x1={pivot.x} y1={pivot.y} x2={rearAxleS.x} y2={rearAxleS.y}
			stroke="#22d3ee" stroke-width={section} stroke-linecap="round" opacity="0.9" />
		{#if rr.apex}
			{@const ap = pitched(re(rr.apex))}
			<line x1={rearAxleS.x} y1={rearAxleS.y} x2={ap.x} y2={ap.y} stroke="#22d3ee" stroke-width={section * 0.55} />
			<line x1={pivot.x} y1={pivot.y} x2={ap.x} y2={ap.y} stroke="#22d3ee" stroke-width={section * 0.55} />
			<circle cx={ap.x} cy={ap.y} r="3" fill="#22d3ee" />
		{/if}
		{#if bike.rear.suspensionType !== 'hardtail'}
			{@const up = pitched(re(rr.shockUpper))}
			{@const lo = toSvg(re(rr.shockLower))}
			<line x1={lo.x} y1={lo.y} x2={up.x} y2={up.y} stroke="#fdba74" stroke-width="2.2" />
			<circle cx={lo.x} cy={lo.y} r="3" fill="#fdba74" />
			<circle cx={up.x} cy={up.y} r="3" fill="#fdba74" />
		{/if}
		{#if rr.rockerPivot && rr.rockerDogbone && rr.rockerShock && rr.dogboneArm}
			{@const rp = pitched(re(rr.rockerPivot))}
			{@const rd = pitched(re(rr.rockerDogbone))}
			{@const rs = pitched(re(rr.rockerShock))}
			{@const da = toSvg(re(rr.dogboneArm))}
			<line x1={da.x} y1={da.y} x2={rd.x} y2={rd.y} stroke="#67e8f9" stroke-width="1.6" />
			<line x1={rd.x} y1={rd.y} x2={rs.x} y2={rs.y} stroke="#c4b5fd" stroke-width="2" />
			<circle cx={rp.x} cy={rp.y} r="3" fill="#a78bfa" />
		{/if}
		{@const cs = pitched(re(rr.countershaft))}
		<circle cx={cs.x} cy={cs.y} r={Math.max(4, 14 * scale)} fill="none" stroke="#22d3ee" stroke-width="1" opacity="0.6" />
		<circle cx={pivot.x} cy={pivot.y} r="4.5" fill="#22d3ee" stroke="#fff" stroke-width="0.8" />
	{:else}
		{@const pvt = pitched({ x: bike.rearAxle.x + bike.wheelbaseMm * 0.22, y: bike.rearAxle.y + 80 })}
		<line x1={pvt.x} y1={pvt.y} x2={rearAxleS.x} y2={rearAxleS.y} stroke="#22d3ee" stroke-width="3" />
	{/if}

	<!-- CoG (pitches with chassis) -->
	<circle cx={cogP.x} cy={cogP.y} r="6" fill="#f97316" opacity="0.9" />
	<text x={cogP.x + 10} y={cogP.y - 5} fill="#f97316" font-size="10">CoG</text>
	{#if results && results.weightTransferN > 50}
		<line x1={cogP.x} y1={cogP.y + 10} x2={frontAxleS.x} y2={frontAxleS.y - 20}
			stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowGreen)" opacity="0.7" />
	{/if}

	<!-- Wheelbase dimension -->
	<line x1={frontAxleS.x} y1={groundY + 18} x2={rearAxleS.x} y2={groundY + 18}
		stroke="#555" stroke-width="0.5" marker-start="url(#dimTick)" marker-end="url(#dimTick)" />
	<text x={(frontAxleS.x + rearAxleS.x) / 2} y={groundY + 32} fill="#888" font-size="9" text-anchor="middle">
		WB: {Math.round(bike.wheelbaseMm)}mm ({(bike.wheelbaseMm / 25.4).toFixed(1)}")
	</text>

	{#if simRunning || simTimeS > 0}
		<rect x="8" y="8" width="250" height={frontSlip || rearSlip ? 105 : 85} rx="4" fill="#000" opacity="0.6" />
		<text x="15" y="26" fill="#e5e7eb" font-size="12" font-family="monospace">
			Speed: {(simSpeedMs * 3.6).toFixed(1)} km/h ({(simSpeedMs * 2.237).toFixed(1)} mph)
		</text>
		<text x="15" y="43" fill="#e5e7eb" font-size="12" font-family="monospace">Peak Decel: {peakDecelG.toFixed(2)} G</text>
		<text x="15" y="60" fill="#e5e7eb" font-size="12" font-family="monospace">
			Stop Dist: {brakingDistanceM.toFixed(1)} m ({(brakingDistanceM * 3.281).toFixed(1)} ft)
		</text>
		<text x="15" y="77" fill="#e5e7eb" font-size="12" font-family="monospace">Brake Time: {brakingTimeS.toFixed(2)} s</text>
		{#if frontSlip}
			<text x="15" y="96" fill="#ef4444" font-size="11" font-weight="bold">⚠ FRONT LOCKUP</text>
		{/if}
		{#if rearSlip}
			<text x="15" y={frontSlip ? 110 : 96} fill="#ef4444" font-size="11" font-weight="bold">⚠ REAR LOCKUP</text>
		{/if}
	{/if}
</svg>
