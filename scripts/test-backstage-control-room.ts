import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateBackstagePayload } from '../lib/backstage-contract'

async function main() {
  process.env.ALLOW_PRIVATE_WEBHOOK_FOR_TESTS = 'true'
  const botId = '441ea0b9-b435-475c-83ad-1106490240fe'
  const action: any = await validateBackstagePayload('action', { name: 'Lead qualificato', type: 'collect_lead', triggerKeywords: ['contatto'], config: { fields: 'email' }, enabled: true }, botId)
  assert.equal(action.enabled, false, 'le action create dal copilota devono restare disattivate')
  const workflow: any = await validateBackstagePayload('workflow', { name: 'Handoff', triggerType: 'new_message', steps: [], isActive: true }, botId)
  assert.equal(workflow.isActive, false, 'i workflow create dal copilota devono restare disattivati')
  await assert.rejects(() => validateBackstagePayload('knowledge_url', { url: 'file:///etc/passwd' }, botId), /HTTP|URL/i)
  await assert.rejects(() => validateBackstagePayload('prompt', { settingsPatch: { apiKey: 'secret' } }, botId), /unrecognized|non riconosciut/i)
  await assert.rejects(() => validateBackstagePayload('evaluations', { cases: [] }, botId))
  const evaluations: any = await validateBackstagePayload('evaluations', { cases: [{
    name: 'Memoria commerce',
    question: 'Quali mi consigli?',
    conversationTurns: ['Cerco una camicia da donna', 'Elegante e nera'],
    expectedKeywords: ['camicia'],
    forbiddenKeywords: [],
    qualityContract: { expectedIntents: ['product_discovery'], expectedTools: ['search_products'], cardPolicy: 'required', expectedMemory: { gender: 'women', category: 'shirt' } },
  }] }, botId)
  assert.equal(evaluations.cases[0].conversationTurns.length, 2)
  assert.equal(evaluations.cases[0].qualityContract.minimumMemoryRetention, 1)

  const root = join(__dirname, '..')
  const service = readFileSync(join(root, 'lib/backstage-service.ts'), 'utf8')
  const page = readFileSync(join(root, 'app/backstage/page.tsx'), 'utf8')
  const proxy = readFileSync(join(root, 'proxy.ts'), 'utf8')
  const migration = readFileSync(join(root, 'prisma/migrations/20260810193000_add_backstage_control_room/migration.sql'), 'utf8')
  assert.match(service, /Esegui prima la simulazione della bozza/)
  assert.match(service, /parallel_tool_calls: false/)
  assert.match(service, /Nessuna modifica live avviene/)
  assert.match(service, /commerceEvent\.findMany/)
  assert.match(service, /sampleCoverage/)
  assert.match(service, /classificationCoverage/)
  assert.match(service, /metricDefinitions/)
  assert.match(service, /volume non ancora esistente/)
  assert.match(service, /backstage\.draft\.applied/)
  assert.match(service, /backstage\.draft\.rolled_back/)
  assert.match(service, /conversationTurns: JSON\.stringify\(item\.conversationTurns\)/)
  assert.match(service, /qualityContract: item\.qualityContract \? JSON\.stringify/)
  assert.match(page, /Approva e applica/)
  assert.match(page, /Nessuna modifica automatica/)
  assert.match(page, /previewOnly/)
  assert.match(proxy, /api\//, 'le API non pubbliche devono attraversare la sessione owner')
  assert.match(migration, /FOREIGN KEY \("botId"\).*ON DELETE CASCADE/)
  console.log('Backstage Control Room: 20 controlli superati')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
