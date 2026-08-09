import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const toolsSource = readFileSync(resolve(process.cwd(), 'lib/agentic-tools.ts'), 'utf8')
const orchestratorSource = readFileSync(resolve(process.cwd(), 'lib/agentic-orchestrator.ts'), 'utf8')

for (const toolName of [
  'search_products',
  'get_product',
  'check_inventory',
  'search_knowledge_base',
  'get_order_status',
]) {
  assert.match(toolsSource, new RegExp(`name:\\s*["']${toolName}["']`), `Tool mancante: ${toolName}`)
}

assert.equal((toolsSource.match(/strict:\s*true/g) || []).length, 5)
assert.equal((toolsSource.match(/additionalProperties:\s*false/g) || []).length, 5)
assert.match(orchestratorSource, /openai\.responses\.create/)
assert.match(orchestratorSource, /tools:\s*AGENT_TOOLS/)
assert.match(orchestratorSource, /tool_choice:\s*["']auto["']/)
assert.match(orchestratorSource, /parallel_tool_calls:\s*false/)
assert.match(orchestratorSource, /type:\s*["']function_call_output["']/)
assert.match(orchestratorSource, /MAX_AGENT_ROUNDS\s*=\s*[2-9]/)
assert.match(orchestratorSource, /MAX_TOOL_CALLS\s*=\s*[2-9]/)
assert.match(orchestratorSource, /conversationHistory\.slice\(-12\)/)
assert.match(orchestratorSource, /isAgentToolName\(call\.name\)/)

console.log(JSON.stringify({ success: true, tools: 5, multiToolLoop: true }))
