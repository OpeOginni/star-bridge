import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["bot.ts"],
  format: ["esm"],
  shims: true,
  skipNodeModulesBundle: true,
});