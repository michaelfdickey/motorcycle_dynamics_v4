<script lang="ts">
	import { browser } from '$app/environment';

	let apiKey = $state(browser ? (localStorage.getItem('openai_api_key') || '') : '');
	let model = $state(browser ? (localStorage.getItem('openai_model') || 'gpt-4o') : 'gpt-4o');
	let saved = $state(false);

	function saveSettings() {
		if (!browser) return;
		localStorage.setItem('openai_api_key', apiKey);
		localStorage.setItem('openai_model', model);
		saved = true;
		setTimeout(() => { saved = false; }, 2000);
	}
</script>

<h2 class="text-2xl font-bold mb-2">Settings</h2>
<p class="text-gray-400 mb-6">Application settings, units, solver configuration, and preferences.</p>

<div class="max-w-xl space-y-6">
	<!-- AI Feedback Settings -->
	<section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
		<h3 class="text-sm font-semibold text-indigo-400 uppercase tracking-wide mb-4">AI Feedback (OpenAI)</h3>
		<div class="space-y-4">
			<div>
				<label class="block text-xs text-gray-400 mb-1">API Key</label>
				<input type="password" bind:value={apiKey} placeholder="sk-..."
					class="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none" />
				<p class="text-[10px] text-gray-600 mt-1">Stored in browser localStorage only. Never sent to our servers.</p>
			</div>
			<div>
				<label class="block text-xs text-gray-400 mb-1">Model</label>
				<select bind:value={model}
					class="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none">
					<option value="gpt-4o">GPT-4o</option>
					<option value="gpt-4o-mini">GPT-4o Mini</option>
					<option value="gpt-4-turbo">GPT-4 Turbo</option>
					<option value="o3-mini">o3-mini</option>
				</select>
			</div>
			<button onclick={saveSettings}
				class="px-4 py-2 text-sm font-medium rounded bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
				{saved ? '✓ Saved' : 'Save Settings'}
			</button>
		</div>
	</section>
</div>
