import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const toolsSource = readFileSync(resolve(process.cwd(), 'lib/agentic-tools.ts'), 'utf8')
const orchestratorSource = readFileSync(resolve(process.cwd(), 'lib/agentic-orchestrator.ts'), 'utf8')
const runtimeSource = readFileSync(resolve(process.cwd(), 'lib/agentic-chat-runtime.ts'), 'utf8')

for (const toolName of [
  'search_products',
  'get_product',
  'check_inventory',
  'present_products',
  'search_knowledge_base',
  'get_order_status',
]) {
  assert.match(toolsSource, new RegExp(`name:\\s*["']${toolName}["']`), `Tool mancante: ${toolName}`)
}

assert.equal((toolsSource.match(/strict:\s*true/g) || []).length, 6)
assert.ok((toolsSource.match(/additionalProperties:\s*false/g) || []).length >= 6)
assert.match(orchestratorSource, /openai\.responses\.create/)
assert.match(orchestratorSource, /const tools = \[\.\.\.AGENT_TOOLS, \.\.\.configuredActionTool\]/)
assert.match(orchestratorSource, /tools:\s*input\.tools/)
assert.match(orchestratorSource, /name:\s*["']run_configured_action["']/)
assert.match(orchestratorSource, /actions\.forceProductCards && productCards\.length === 0/)
assert.match(orchestratorSource, /executeAgentTool\("search_products"/)
assert.match(orchestratorSource, /executeAgentTool\("present_products"/)
assert.match(orchestratorSource, /Non ho trovato prodotti verificati da mostrarti/)
assert.match(orchestratorSource, /String\(config\.method \|\| ["']POST["']\)\.toUpperCase\(\) === ["']GET["']/)
assert.match(orchestratorSource, /tool_choice:\s*["']auto["']/)
assert.match(orchestratorSource, /parallel_tool_calls:\s*false/)
assert.match(orchestratorSource, /type:\s*["']function_call_output["']/)
assert.match(orchestratorSource, /MAX_AGENT_ROUNDS\s*=\s*[2-9]/)
assert.match(orchestratorSource, /MAX_TOOL_CALLS\s*=\s*[2-9]/)
assert.match(orchestratorSource, /conversationHistory\.slice\(-12\)/)
assert.match(orchestratorSource, /isAgentToolName\(call\.name\)/)
assert.match(orchestratorSource, /Se il cliente cambia argomento/)
assert.match(orchestratorSource, /non più di due chiarimenti/)
assert.match(orchestratorSource, /Non cambiare mai categoria/)
assert.match(orchestratorSource, /Se introduce esplicitamente una nuova categoria/)
assert.match(orchestratorSource, /const currentCommerceQuery = parseCommerceQuery\(context\.query\)/)
assert.match(orchestratorSource, /latestProductSearch\.resultCount === 0/)
assert.match(runtimeSource, /commerce\.order_lookup\.verified/)
assert.match(runtimeSource, /protectedDataStored:\s*false/)
assert.doesNotMatch(toolsSource, /filter\(\(variant\) => !args\.variant_id/)
assert.match(toolsSource, /selected_reference: variant\.id === args\.variant_id/)

console.log(JSON.stringify({ success: true, tools: 6, multiToolLoop: true }))
