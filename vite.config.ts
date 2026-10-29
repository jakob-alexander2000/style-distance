import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/parity/**", "node_modules", "dist"],
  },
})
