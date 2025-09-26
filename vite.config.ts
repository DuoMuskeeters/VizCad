import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  const isSSRBuild = env.VITE_SSR_BUILD === 'true';
  
  return {
    plugins: [
      tanstackRouter({ 
        autoCodeSplitting: !isSSRBuild, // Disable code splitting for SSR build
      }),
      viteReact(),
      tailwindcss(),
      cloudflare(),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    build: isSSRBuild ? {
      // SSR Build Configuration
      lib: {
        entry: resolve(__dirname, 'src/entry.server.tsx'),
        name: 'VizCadSSR',
        fileName: 'entry.server',
        formats: ['es']
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/server', '@kitware/vtk.js', 'vtk.js'],
        output: {
          globals: {
            'react': 'React',
            'react-dom': 'ReactDOM',
            'react-dom/server': 'ReactDOMServer'
          }
        }
      },
      ssr: true,
      outDir: 'dist/server',
      emptyOutDir: true,
      sourcemap: true,
      target: 'esnext',
      minify: false, // Keep readable for debugging
    } : {
      // Client Build Configuration  
      outDir: 'dist/client',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          client: resolve(__dirname, 'src/entry.client.tsx')
        },
        output: {
          manualChunks: {
            // Split vendor chunks for better caching
            vendor: ['react', 'react-dom'],
            router: ['@tanstack/react-router'],
            vtk: ['@kitware/vtk.js', 'vtk.js'],
          }
        }
      },
      sourcemap: true,
      target: 'esnext',
    },
    ssr: {
      // External packages that should not be bundled for SSR
      external: isSSRBuild ? [
        'react', 
        'react-dom', 
        'react-dom/server',
        '@kitware/vtk.js',
        'vtk.js'
      ] : undefined,
      noExternal: isSSRBuild ? [
        '@tanstack/react-router'
      ] : undefined,
    },
    define: {
      // Environment variables
      __SSR_BUILD__: isSSRBuild,
      // Polyfill for browser globals in SSR
      global: isSSRBuild ? 'globalThis' : 'globalThis',
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@tanstack/react-router',
      ],
      exclude: isSSRBuild ? ['@kitware/vtk.js', 'vtk.js'] : [],
    },
  }
});
