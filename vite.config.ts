import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { assertPublicFrontendEnv } from "./src/lib/publicBackendConfig.ts";

export default defineConfig(({ mode }) => {
  assertPublicFrontendEnv(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
    },
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
