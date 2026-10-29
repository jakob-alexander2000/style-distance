import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/parity/**/*.test.ts"],
  },
})
