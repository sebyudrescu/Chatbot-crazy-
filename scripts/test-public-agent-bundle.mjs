import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tracePath = resolve(
  process.cwd(),
  '.next/server/app/agent/[botId]/page.js.nft.json',
)
const trace = JSON.parse(readFileSync(tracePath, 'utf8'))
const files = Array.isArray(trace.files) ? trace.files : []
const databaseRuntime = files.filter((file) => (
  file.includes('@prisma') ||
  file.includes('query_engine') ||
  file.includes('libquery_engine')
))

assert.equal(
  databaseRuntime.length,
  0,
  `La pagina pubblica trascina il runtime database: ${databaseRuntime.join(', ')}`,
)
assert.ok(
  files.length <= 105,
  `La pagina pubblica ha troppe dipendenze server (${files.length})`,
)

console.log(JSON.stringify({
  success: true,
  route: '/agent/[botId]',
  tracedFiles: files.length,
  databaseRuntimeFiles: databaseRuntime.length,
}))
