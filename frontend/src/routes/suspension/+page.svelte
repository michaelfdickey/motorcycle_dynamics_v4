<div class="flex flex-col min-h-0 flex-1 gap-3">
	<h2 class="shrink-0 text-2xl font-bold">Suspension</h2>
	<p class="text-gray-400 max-w-3xl">
		Spring/damper rates, sag, and damping will be defined here and then used by the Brakes simulation
		for pitch and wheel travel. Until this tab is set up, Brakes uses the static sag already saved on
		the Front End / Rear End (or ~25% sag) and does not yet model suspension response to braking.
	</p>
	<div class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-500">
		Coming next: front and rear spring rate, preload, damping, and travel. Those values will feed the
		brake-pitch and weight-transfer model.
	</div>
</div>
