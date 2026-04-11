<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children } = $props();

	const tabs = [
		{ label: 'Home', href: '/' },
		{ label: 'Front End', href: '/front-end' },
		{ label: 'Suspension', href: '/suspension' },
		{ label: 'Frame FEA', href: '/frame-fea' },
		{ label: 'Kinematics', href: '/kinematics' },
		{ label: 'Geometry', href: '/geometry' },
		{ label: 'Aero / CFD', href: '/aero-cfd' },
		{ label: 'Materials', href: '/materials' },
		{ label: 'Components', href: '/components' },
		{ label: 'Results', href: '/results' },
		{ label: 'Settings', href: '/settings' },
	];
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
		</div>
		<nav class="mx-auto max-w-7xl px-6">
			<div class="flex gap-1 overflow-x-auto">
				{#each tabs as tab}
					<a
						href={tab.href}
						class="whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
							{page.url.pathname === tab.href
								? 'bg-gray-800 text-orange-500 border-t border-x border-orange-500/40'
								: 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50'}"
					>
						{tab.label}
					</a>
				{/each}
			</div>
		</nav>
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
