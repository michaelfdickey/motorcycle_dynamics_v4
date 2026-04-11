<script lang="ts">
	let backendStatus = $state<string>('checking...');

	async function checkBackend() {
		try {
			const res = await fetch('http://localhost:8000/api/health');
			if (res.ok) {
				const data = await res.json();
				backendStatus = `Connected — ${data.app}`;
			} else {
				backendStatus = 'Backend returned error';
			}
		} catch {
			backendStatus = 'Backend not reachable';
		}
	}

	$effect(() => {
		checkBackend();
	});
</script>

<div class="space-y-8">
	<section class="rounded-xl border border-gray-800 bg-gray-900 p-8">
		<h2 class="text-2xl font-bold mb-2">Motorcycle Dynamics Simulator</h2>
		<p class="text-gray-400 mb-6">
			Physics simulation for motorcycle components. Enter simple geometries for suspension,
			frame, and linkage analysis.
		</p>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-5">
				<div class="text-orange-500 font-semibold mb-1">Suspension</div>
				<p class="text-sm text-gray-400">Spring/damper ODE simulation with configurable rate, length, and damping.</p>
			</div>
			<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-5">
				<div class="text-orange-500 font-semibold mb-1">Frame FEA</div>
				<p class="text-sm text-gray-400">Beam and node simulation of frame components with stress/displacement output.</p>
			</div>
			<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-5">
				<div class="text-orange-500 font-semibold mb-1">CFD (Future)</div>
				<p class="text-sm text-gray-400">Computational fluid dynamics analysis of fairings and aerodynamic components.</p>
			</div>
		</div>
	</section>

	<section class="rounded-xl border border-gray-800 bg-gray-900 p-6">
		<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">System Status</h3>
		<div class="flex items-center gap-2">
			{#if backendStatus.startsWith('Connected')}
				<span class="h-2 w-2 rounded-full bg-green-500"></span>
			{:else if backendStatus === 'checking...'}
				<span class="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
			{:else}
				<span class="h-2 w-2 rounded-full bg-red-500"></span>
			{/if}
			<span class="text-sm text-gray-400">Backend: {backendStatus}</span>
		</div>
	</section>
</div>
