import { build } from "esbuild";
import { rmSync, mkdirSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  sourcemap: true,
  // AWS SDK v3 is provided by the Lambda runtime; keep the bundle lean.
  external: ["@aws-sdk/*"],
  logLevel: "info",
});

console.log("Backend bundled -> dist/index.js");
