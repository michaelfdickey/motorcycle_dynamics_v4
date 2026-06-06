import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// @ts-ignore - process.env is available at build time in Node
const backendPort: string = process.env['BACKEND_PORT'] || '8000';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	server: {
		proxy: {
			'/api': {
				target: `http://localhost:${backendPort}`,
				changeOrigin: true,
			},
		},
	},
});
