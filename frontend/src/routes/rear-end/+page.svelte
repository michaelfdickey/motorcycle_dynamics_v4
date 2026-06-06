<script lang="ts">
	// Rear-end placeholder — will inherit swingarm, rear suspension,
	// rear wheel/tire, sprocket, and chain parameters.
</script>

<div class="space-y-6">
	<h2 class="text-2xl font-bold">Rear End</h2>
	<p class="text-gray-400 text-sm">
		Define rear suspension geometry, swingarm, rear wheel and tire parameters.
		These will feed into braking, kinematics, and frame analysis.
	</p>

	<section class="rounded-xl border border-gray-800 bg-gray-900 p-8">
		<div class="text-center text-gray-500">
			<svg class="mx-auto mb-4 h-16 w-16 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="12" cy="14" r="6" />
				<circle cx="12" cy="14" r="2" />
				<path d="M6 14L2 8" />
				<path d="M2 8h6" />
				<circle cx="12" cy="14" r="0.5" fill="currentColor" />
			</svg>
			<h3 class="text-lg font-semibold text-gray-400 mb-2">Coming Soon</h3>
			<p class="text-sm text-gray-600 max-w-md mx-auto">
				Rear-end geometry will include swingarm length, pivot height, rear shock linkage ratios,
				rear wheel/tire specs, and chain line. Parameters defined here will be shared with the
				Brakes and Kinematics tabs.
			</p>
		</div>
	</section>

	<section class="rounded-xl border border-gray-800 bg-gray-900 p-6">
		<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Planned Parameters</h3>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
			<div class="bg-gray-800/50 rounded p-3">
				<div class="text-orange-500 font-semibold mb-1">Swingarm</div>
				<ul class="list-disc list-inside text-xs space-y-1">
					<li>Length (pivot to axle)</li>
					<li>Pivot height</li>
					<li>Material / section</li>
				</ul>
			</div>
			<div class="bg-gray-800/50 rounded p-3">
				<div class="text-orange-500 font-semibold mb-1">Rear Suspension</div>
				<ul class="list-disc list-inside text-xs space-y-1">
					<li>Shock length / travel</li>
					<li>Linkage ratio curve</li>
					<li>Spring rate / preload</li>
				</ul>
			</div>
			<div class="bg-gray-800/50 rounded p-3">
				<div class="text-orange-500 font-semibold mb-1">Rear Wheel</div>
				<ul class="list-disc list-inside text-xs space-y-1">
					<li>Tire designation</li>
					<li>Sprocket size</li>
					<li>Chain line offset</li>
				</ul>
			</div>
		</div>
	</section>
</div>
