import { context } from "esbuild"

const ctx = await context({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "esm",
  banner: {
    // PostCSS uses CJS internally; provide `require` in the ESM bundle.
    // https://github.com/evanw/esbuild/issues/1921
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },

  platform: "node",
  target: "node24",
  external: ["vscode"],

  minify: false,
  sourcemap: true,
  tsconfig: "tsconfig.json",
})

await ctx.rebuild()

if (process.argv.includes("--watch")) {
  console.log("esbuild: watching...")
  await ctx.watch()
} else {
  await ctx.dispose()
}
