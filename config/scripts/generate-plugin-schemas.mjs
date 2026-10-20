// Why: the zod schemas in src/shared/plugins are the only definition; this writes the published
// JSON Schemas and author references from them. The drift test in plugin-json-schema.test.ts
// fails when these files fall behind.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import * as esbuild from 'esbuild'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const ENTRY = path.join(REPO_ROOT, 'src', 'shared', 'plugins', 'plugin-json-schema.ts')

// Why under out/: the bundle keeps zod external, so it must resolve from the repo's node_modules.
mkdirSync(path.join(REPO_ROOT, 'out'), { recursive: true })
const buildDir = mkdtempSync(path.join(REPO_ROOT, 'out', 'plugin-schemas-'))
try {
  const outfile = path.join(buildDir, 'bundle.cjs')
  esbuild.buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'error',
    packages: 'external'
  })
  const files = createRequire(import.meta.url)(outfile).pluginSchemaGeneratedFiles()
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(REPO_ROOT, ...relative.split('/'))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
    console.log(`wrote ${relative}`)
  }
} finally {
  rmSync(buildDir, { recursive: true, force: true })
}
