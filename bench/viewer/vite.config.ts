import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		target: 'es2022',
		manifest: true,
		rollupOptions: { input: { three: resolve(import.meta.dirname, 'three.html'), vtk: resolve(import.meta.dirname, 'vtk.html'), derivative: resolve(import.meta.dirname, 'derivative.html') } },
	},
	worker: { format: 'es' },
})
