import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ] as any,
  environments: {
    client: {
      resolve: {
        noExternal: ['@kitware/vtk.js'],
      },
    },
  },
});
