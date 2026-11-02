import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";

export default defineConfig({
  // Share the one root .env file with web/ instead of duplicating Supabase
  // credentials in two places.
  envDir: resolve(__dirname, ".."),
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    react(),
    webExtension({
      manifest: "manifest.json",
      watchFilePaths: ["manifest.json"],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  build: {
    target: "es2020",
    minify: false,
  },
});
