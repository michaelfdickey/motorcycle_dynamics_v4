<script lang="ts">
	import { browser } from '$app/environment';
	import ParamSlider from '$lib/components/ParamSlider.svelte';
	import {
		saveVehicleDesign,
		loadVehicleDesign,
		listVehicles,
		deleteVehicleDesign,
		getLastFileName,
		type VehicleDesign,
	} from '$lib/vehicleStore';
	import { defaultVehicleParams, type VehicleParams } from '$lib/braking';
	import {
		FORCE_TYPES,
		SYSTEM_TYPES,
		defaultThruster,
		emptyComponent,
		migrateExperimental,
		resolveExperimentalForces,
		thrustDirection,
		type AnchorPoint,
		type ComponentKind,
		type ExperimentalComponent,
		type ForceMode,
		type ForceType,
		type SystemType,
	} from '$lib/experimental';

	const N_PER_LBF = 4.44822;
	function nToLbf(n: number): number { return n / N_PER_LBF; }
	function lbfToN(lbf: number): number { return lbf * N_PER_LBF; }

	const SESSION_KEY = 'mototelos_experimental_session';

	let vehicleName = $state(browser ? getLastFileName() : 'my_bike');
	let savedVehicles = $state<{ name: string }[]>([]);
	let saveStatus = $state<'' | 'saving' | 'saved' | 'error'>('');
	let loadModalVisible = $state(false);
	let loadedDesign = $state<VehicleDesign | null>(null);
	let vehicle = $state<VehicleParams>(defaultVehicleParams());
	let components = $state<ExperimentalComponent[]>([]);
	let selectedId = $state<string | null>(null);
	let wizard = $state<null | { kind?: ComponentKind; forceMode?: ForceMode }>(null);
	let notice = $state('');

	const forces = $derived(resolveExperimentalForces(components, vehicle));

	async function refreshVehicleList() {
		savedVehicles = await listVehicles();
	}
	if (browser) refreshVehicleList();

	function persistSession() {
		if (!browser) return;
		localStorage.setItem(SESSION_KEY, JSON.stringify({
			vehicleName,
			components,
			selectedId,
		}));
	}

	function applyDesign(v: VehicleDesign) {
		loadedDesign = v;
		vehicleName = v.name;
		if (v.brakes?.vehicle) vehicle = { ...defaultVehicleParams(), ...v.brakes.vehicle } as VehicleParams;
		components = migrateExperimental(v.experimental?.components);
		selectedId = components[0]?.id ?? null;
	}

	async function handleSave() {
		if (!vehicleName.trim()) return;
		saveStatus = 'saving';
		const existing = await loadVehicleDesign(vehicleName.trim());
		const payload: VehicleDesign = {
			...(existing || loadedDesign || {}),
			name: vehicleName.trim(),
			version: ((existing?.version || loadedDesign?.version || 0) as number) + 1,
			savedAt: new Date().toISOString(),
			experimental: {
				components: components.map((c) => ({ ...c })),
			},
		};
		const ok = await saveVehicleDesign(payload);
		saveStatus = ok ? 'saved' : 'error';
		if (ok) {
			loadedDesign = payload;
			await refreshVehicleList();
		}
		setTimeout(() => { saveStatus = ''; }, 1500);
	}

	async function handleLoadSelect(name: string) {
		const v = await loadVehicleDesign(name);
		if (!v) return;
		applyDesign(v);
		loadModalVisible = false;
	}

	async function handleDeleteVehicle(name: string) {
		const ok = await deleteVehicleDesign(name);
		if (ok) savedVehicles = savedVehicles.filter((x) => x.name !== name);
	}

	let initialized = $state(false);
	$effect(() => {
		if (!browser || initialized) return;
		initialized = true;
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (raw) {
				const s = JSON.parse(raw);
				if (s.vehicleName) vehicleName = s.vehicleName;
				if (Array.isArray(s.components)) components = migrateExperimental(s.components);
				if (typeof s.selectedId === 'string') selectedId = s.selectedId;
			}
		} catch { /* ignore */ }
		void (async () => {
			const name = getLastFileName();
			let v = name ? await loadVehicleDesign(name) : null;
			if (!v) {
				const list = await listVehicles();
				if (list[0]) v = await loadVehicleDesign(list[0].name);
			}
			if (v) {
				loadedDesign = v;
				vehicleName = v.name;
				if (v.brakes?.vehicle) vehicle = { ...defaultVehicleParams(), ...v.brakes.vehicle } as VehicleParams;
				if (v.experimental?.components?.length) {
					components = migrateExperimental(v.experimental.components);
					selectedId = components[0]?.id ?? null;
				}
			}
		})();
	});

	$effect(() => {
		if (!browser || !initialized) return;
		JSON.stringify(components);
		void selectedId; void vehicleName;
		persistSession();
	});

	function startCreate() {
		wizard = {};
		notice = '';
	}

	function pickKind(kind: ComponentKind) {
		wizard = { kind };
	}

	function pickForceMode(mode: ForceMode) {
		wizard = { ...(wizard ?? {}), kind: 'force', forceMode: mode };
	}

	function addThruster(anchor: AnchorPoint = 'rear_axle') {
		const t = defaultThruster(anchor);
		components = [...components, t];
		selectedId = t.id;
		wizard = null;
		notice = '';
	}

	function pickForceType(type: ForceType, mode: ForceMode, implemented: boolean) {
		if (!implemented) {
			notice = 'That device is catalogued but not simulated yet. Vector thruster is the first live device.';
			return;
		}
		if (type === 'thruster') addThruster('rear_axle');
	}

	function pickSystem(type: SystemType, implemented: boolean) {
		if (!implemented) {
			notice = type === 'active_suspension'
				? 'Active suspension is catalogued: a system that sets ride height or damping during a manoeuvre. Not simulated yet.'
				: 'Dynamic fuel transfer is catalogued: pump mass between tanks to hold CoG. Not simulated yet.';
			return;
		}
		const c = emptyComponent('system');
		c.systemType = type;
		components = [...components, c];
		selectedId = c.id;
		wizard = null;
	}

	function removeSelected() {
		if (!selectedId) return;
		components = components.filter((c) => c.id !== selectedId);
		selectedId = components[0]?.id ?? null;
	}

	const svgW = 640;
	const svgH = 280;
	const groundY = 230;
	const schematic = $derived.by(() => {
		const wb = Math.max(800, vehicle.wheelbaseMm);
		const rf = Math.max(80, vehicle.frontTireRadiusMm);
		const rr = Math.max(80, vehicle.rearTireRadiusMm);
		const scale = Math.min(0.42, (svgW - 120) / wb, 90 / Math.max(rf, rr));
		const rearX = 70;
		const frontX = rearX + wb * scale;
		const rearY = groundY - rr * scale;
		const frontY = groundY - rf * scale;
		const p = vehicle.cogPositionPct / 100;
		const cogX = rearX + (1 - p) * wb * scale;
		const cogY = groundY - vehicle.cogHeightMm * scale;
		return { scale, rearX, frontX, rearY, frontY, rf: rf * scale, rr: rr * scale, cogX, cogY };
	});
</script>

<div class="flex flex-col min-h-0 flex-1 gap-2">
	<div class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2">
		<h2 class="text-2xl font-bold whitespace-nowrap">Experimental</h2>
		<p class="text-xs text-gray-500 hidden md:block max-w-2xl">
			Imaginary devices attached to the vehicle. Create a force (passive or active) or a system.
			The first live device is a vector thruster on a wheel axle — it shows up in Simulation.
		</p>
		<div class="ml-auto flex items-center gap-2">
			<input type="text" bind:value={vehicleName} list="vehicle-list-exp"
				class="w-36 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 focus:border-orange-500 focus:outline-none"
				placeholder="vehicle name" />
			<datalist id="vehicle-list-exp">
				{#each savedVehicles as v}
					<option value={v.name}></option>
				{/each}
			</datalist>
			<button onclick={handleSave} class="px-3 py-1 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 text-white">
				{saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? 'OK' : 'Save'}
			</button>
			<button onclick={() => { refreshVehicleList(); loadModalVisible = true; }}
				class="px-3 py-1 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-white">Load</button>
		</div>
	</div>

	<div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,24rem)] gap-3">
		<div class="min-h-0 flex flex-col gap-3">
			<section class="flex-1 min-h-[14rem] rounded-xl border border-gray-800 bg-gray-900 p-3 flex flex-col">
				<div class="shrink-0 text-[10px] text-gray-500 mb-1 font-mono">
					Right-side view · 0° = up · 90° = forward · thruster force {forces.forwardN.toFixed(0)} N long / {forces.upN.toFixed(0)} N up
				</div>
				<div class="flex-1 min-h-0 rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
					<svg viewBox="0 0 {svgW} {svgH}" class="w-full h-full" preserveAspectRatio="xMidYMid meet">
						<line x1="20" y1={groundY} x2={svgW - 20} y2={groundY} stroke="#666" stroke-width="1.5" />
						<circle cx={schematic.rearX} cy={schematic.rearY} r={schematic.rr} fill="none" stroke="#94a3b8" stroke-width="2" />
						<circle cx={schematic.frontX} cy={schematic.frontY} r={schematic.rf} fill="none" stroke="#94a3b8" stroke-width="2" />
						<line x1={schematic.rearX} y1={schematic.rearY} x2={schematic.frontX} y2={schematic.frontY} stroke="#60a5fa" stroke-width="3" />
						<circle cx={schematic.cogX} cy={schematic.cogY} r="6" fill="#f97316" />
						<text x={schematic.cogX + 10} y={schematic.cogY - 6} fill="#f97316" font-size="11">CoG</text>
						{#each components as c (c.id)}
							{#if c.enabled && c.kind === 'force' && c.forceType === 'thruster'}
								{@const attach = c.anchor === 'front_axle'
									? { x: schematic.frontX, y: schematic.frontY }
									: c.anchor === 'rear_axle'
										? { x: schematic.rearX, y: schematic.rearY }
										: { x: schematic.cogX, y: schematic.cogY }}
								{@const dir = thrustDirection(c.directionDeg)}
								{@const sx = dir.x}
								{@const sy = -dir.y}
								{@const len = 48}
								{@const x2 = attach.x + sx * len}
								{@const y2 = attach.y + sy * len}
								<line x1={attach.x} y1={attach.y} x2={x2} y2={y2}
									stroke={c.id === selectedId ? '#22d3ee' : '#0e7490'} stroke-width="2.4" />
								<polygon
									points={`${x2},${y2} ${x2 - sx * 10 - sy * 5},${y2 - sy * 10 + sx * 5} ${x2 - sx * 10 + sy * 5},${y2 - sy * 10 - sx * 5}`}
									fill={c.id === selectedId ? '#22d3ee' : '#0e7490'}
								/>
								<circle cx={attach.x} cy={attach.y} r="5" fill="#164e63" stroke="#67e8f9" stroke-width="1" />
							{/if}
						{/each}
					</svg>
				</div>
			</section>

			<section class="shrink-0 rounded-xl border border-gray-800 bg-gray-900 p-3">
				<div class="flex items-center justify-between mb-2">
					<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Create</h3>
					<button type="button" onclick={startCreate}
						class="px-2 py-1 text-xs rounded bg-cyan-800 hover:bg-cyan-700 text-cyan-100">+ New device</button>
				</div>
				{#if notice}
					<p class="text-xs text-amber-400 mb-2">{notice}</p>
				{/if}
				{#if wizard}
					<div class="space-y-2 text-sm">
						{#if !wizard.kind}
							<p class="text-xs text-gray-500">What are you attaching?</p>
							<div class="flex gap-2">
								<button type="button" onclick={() => pickKind('force')}
									class="flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:border-cyan-500 text-left">
									<div class="text-cyan-300 text-xs font-semibold">Force</div>
									<div class="text-[11px] text-gray-500">A vector on the vehicle — thruster, wing, air brake.</div>
								</button>
								<button type="button" onclick={() => pickKind('system')}
									class="flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:border-violet-500 text-left">
									<div class="text-violet-300 text-xs font-semibold">System</div>
									<div class="text-[11px] text-gray-500">Active suspension, fuel transfer, anything that reconfigures the bike.</div>
								</button>
							</div>
						{:else if wizard.kind === 'force' && !wizard.forceMode}
							<p class="text-xs text-gray-500">Is the force always on, or commanded?</p>
							<div class="flex gap-2">
								<button type="button" onclick={() => pickForceMode('passive')}
									class="flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:border-cyan-500 text-left">
									<div class="text-xs font-semibold text-gray-200">Passive</div>
									<div class="text-[11px] text-gray-500">Always present (fixed wing).</div>
								</button>
								<button type="button" onclick={() => pickForceMode('active')}
									class="flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:border-cyan-500 text-left">
									<div class="text-xs font-semibold text-gray-200">Active</div>
									<div class="text-[11px] text-gray-500">You fire it (thruster, air brake, moving wing).</div>
								</button>
							</div>
						{:else if wizard.kind === 'force' && wizard.forceMode}
							<p class="text-xs text-gray-500">Pick a device ({wizard.forceMode}).</p>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
								{#each FORCE_TYPES.filter((t) => t.mode === wizard?.forceMode) as t}
									<button type="button" onclick={() => pickForceType(t.id, t.mode, t.implemented)}
										class="px-3 py-2 rounded-lg border text-left {t.implemented ? 'border-cyan-700 bg-cyan-950/40 hover:border-cyan-400' : 'border-gray-800 bg-gray-800/40 text-gray-500'}">
										<div class="text-xs font-semibold">{t.label} {t.implemented ? '' : '· soon'}</div>
										<div class="text-[11px] text-gray-500">{t.blurb}</div>
									</button>
								{/each}
							</div>
						{:else}
							<p class="text-xs text-gray-500">Pick a system.</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{#each SYSTEM_TYPES as t}
									<button type="button" onclick={() => pickSystem(t.id, t.implemented)}
										class="px-3 py-2 rounded-lg border text-left border-gray-800 bg-gray-800/40 text-gray-400">
										<div class="text-xs font-semibold">{t.label} · soon</div>
										<div class="text-[11px] text-gray-500">{t.blurb}</div>
									</button>
								{/each}
							</div>
						{/if}
						<button type="button" onclick={() => wizard = null} class="text-[11px] text-gray-500 hover:text-gray-300">Cancel</button>
					</div>
				{:else}
					<p class="text-[11px] text-gray-600">
						Tree: Create → Force → Passive/Active → (airfoil, air brake, thruster) · or Create → System → (active suspension, fuel transfer).
					</p>
				{/if}
			</section>
		</div>

		<div class="min-h-0 flex flex-col gap-2 overflow-y-auto">
			<section class="shrink-0 rounded-xl border border-gray-800 bg-gray-900 p-3">
				<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Installed</h3>
				{#if components.length === 0}
					<p class="text-xs text-gray-600">None yet. Create a vector thruster to see it on the axles and in Simulation.</p>
				{:else}
					<div class="space-y-1">
						{#each components as c (c.id)}
							<button type="button" onclick={() => selectedId = c.id}
								class="w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs
								{c.id === selectedId ? 'bg-cyan-950 border border-cyan-700 text-cyan-100' : 'bg-gray-800/70 border border-gray-800 text-gray-300'}">
								<span>{c.name}</span>
								<span class="text-[10px] text-gray-500 font-mono">
									{c.forceType ?? c.systemType} · {c.enabled ? 'on' : 'off'}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</section>

			{#each components as c (c.id)}
				{#if c.id === selectedId && c.forceType === 'thruster'}
					<section class="shrink-0 rounded-xl border border-cyan-900/60 bg-gray-900 p-3 space-y-3">
						<div class="flex items-center justify-between">
							<h3 class="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Vector thruster</h3>
							<button type="button" onclick={removeSelected} class="text-[11px] text-red-400 hover:text-red-300">Remove</button>
						</div>
						<label class="block">
							<span class="text-xs text-gray-500">Name</span>
							<input type="text" bind:value={c.name}
								class="mt-1 w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100" />
						</label>
						<label class="flex items-center gap-2 text-xs text-gray-400">
							<input type="checkbox" bind:checked={c.enabled}
								class="rounded border-gray-600 bg-gray-800 w-3.5 h-3.5 accent-cyan-500" />
							Enabled in Simulation
						</label>
						<div>
							<span class="text-xs text-gray-500">Anchor</span>
							<div class="mt-1 grid grid-cols-3 gap-1">
								{#each [
									{ id: 'front_axle' as AnchorPoint, label: 'Front axle' },
									{ id: 'rear_axle' as AnchorPoint, label: 'Rear axle' },
									{ id: 'cog' as AnchorPoint, label: 'CoG' },
								] as a}
									<button type="button" onclick={() => { c.anchor = a.id; }}
										class="px-2 py-1 rounded text-[11px] {c.anchor === a.id ? 'bg-cyan-800 text-white' : 'bg-gray-800 text-gray-400'}">
										{a.label}
									</button>
								{/each}
							</div>
						</div>
						<ParamSlider
							label="Thrust"
							bind:value={c.thrustN}
							min={0} max={8000} step={10} decimals={0}
							unit="N"
							secondary={{ unit: 'lbf', to: nToLbf, from: lbfToN, step: 5, decimals: 0 }}
							tooltip="Force the device produces. Rearward (270°) adds to braking without using tire grip. Forward (90°) fights braking / accelerates."
						/>
						<ParamSlider
							label="Direction"
							bind:value={c.directionDeg}
							min={0} max={360} step={1} decimals={0}
							unit="°"
							hint="0° = up · 90° = forward · 180° = down · 270° = rearward (clockwise, right-side view)"
							tooltip="Angle of the thrust vector at the anchor. Same convention as caliper position: 0° is the top of a circle on the vertical axis."
						/>
					</section>
				{/if}
			{/each}

			<section class="shrink-0 rounded-xl border border-gray-800 bg-gray-900 p-3 text-[11px] text-gray-500 space-y-1">
				<div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Net at rest (this setup)</div>
				<div>Longitudinal: {forces.forwardN.toFixed(0)} N ({forces.forwardN >= 0 ? 'forward' : 'rearward'})</div>
				<div>Vertical: {forces.upN.toFixed(0)} N ({forces.upN >= 0 ? 'up' : 'down'})</div>
				<div>Δ front load: {forces.dFrontN.toFixed(0)} N · Δ rear load: {forces.dRearN.toFixed(0)} N</div>
				<p class="pt-1 text-gray-600">
					Run it on the Simulation tab. Braking, acceleration, and suspension tests will all see these devices.
				</p>
			</section>
		</div>
	</div>
</div>

{#if loadModalVisible}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onclick={() => loadModalVisible = false} role="presentation">
		<div class="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
			<div class="flex items-center justify-between px-5 py-3 border-b border-gray-700">
				<h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Load vehicle</h3>
				<button onclick={() => loadModalVisible = false} class="text-gray-400 hover:text-white">&times;</button>
			</div>
			<div class="p-3 max-h-72 overflow-y-auto">
				{#each savedVehicles as v}
					<div class="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded">
						<button class="flex-1 text-left text-sm text-gray-200" onclick={() => handleLoadSelect(v.name)}>{v.name}</button>
						<button class="text-xs text-red-400" onclick={() => handleDeleteVehicle(v.name)}>Delete</button>
					</div>
				{/each}
				{#if savedVehicles.length === 0}
					<p class="text-xs text-gray-500 px-2 py-4">No saved vehicles.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
