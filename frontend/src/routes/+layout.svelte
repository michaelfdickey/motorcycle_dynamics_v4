<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
	<header class="border-b border-gray-800 bg-gray-900">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
			<div class="flex items-center gap-3">
				<svg class="h-8 w-8 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="7" cy="17" r="3" />
					<circle cx="17" cy="17" r="3" />
					<path d="M10 17h4" />
					<path d="M14 17l3-8h-4l1-4-6 8h4" />
				</svg>
				<h1 class="text-xl font-bold tracking-tight">
					<span class="text-orange-500">Mototelos</span>
					<span class="ml-1 text-gray-400 font-normal">Motorcycle Dynamics</span>
				</h1>
			</div>
			<nav class="flex gap-6 text-sm text-gray-400">
				<a href="/" class="hover:text-gray-100 transition-colors">Home</a>
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-6 py-8">
		{@render children()}
	</main>

	<footer class="border-t border-gray-800 mt-auto">
		<div class="mx-auto max-w-7xl px-6 py-4 text-center text-xs text-gray-600">
			Mototelos Motorcycle Dynamics v0.1.0
		</div>
	</footer>
</div>
