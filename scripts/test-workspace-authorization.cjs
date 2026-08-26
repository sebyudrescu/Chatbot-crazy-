const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, parent, isMain)
}

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

const {
  actorCanAccessWorkspace,
  allowedWorkspaceIds,
  isWorkspaceRole,
  roleHasPermission,
  workspaceWhere,
} = require('../lib/workspace-permissions.ts')

const workspaceA = '00000000-0000-4000-8000-00000000000a'
const workspaceB = '00000000-0000-4000-8000-00000000000b'
const owner = { kind: 'legacy_owner', userId: null, grants: null }
const client = {
  kind: 'user',
  userId: 'user-a',
  grants: [
    { workspaceId: workspaceA, role: 'operator' },
    { workspaceId: workspaceB, role: 'viewer' },
  ],
}

assert.equal(isWorkspaceRole('owner'), true)
assert.equal(isWorkspaceRole('root'), false)
assert.equal(roleHasPermission('owner', 'billing.manage'), true)
assert.equal(roleHasPermission('admin', 'members.manage'), true)
assert.equal(roleHasPermission('admin', 'billing.manage'), false)
assert.equal(roleHasPermission('operator', 'conversation.write'), true)
assert.equal(roleHasPermission('operator', 'chatbot.write'), false)
assert.equal(roleHasPermission('viewer', 'conversation.read'), true)
assert.equal(roleHasPermission('viewer', 'conversation.write'), false)
assert.equal(actorCanAccessWorkspace(owner, workspaceB, 'billing.manage'), true)
assert.equal(actorCanAccessWorkspace(client, workspaceA, 'conversation.write'), true)
assert.equal(actorCanAccessWorkspace(client, workspaceB, 'conversation.write'), false)
assert.equal(actorCanAccessWorkspace(client, '00000000-0000-4000-8000-00000000000c', 'workspace.read'), false)
assert.equal(allowedWorkspaceIds(owner, 'analytics.read'), null)
assert.deepEqual(allowedWorkspaceIds(client, 'conversation.write'), [workspaceA])
assert.deepEqual(allowedWorkspaceIds(client, 'analytics.read'), [workspaceA, workspaceB])
assert.deepEqual(workspaceWhere(client, 'chatbot.write'), { workspaceId: { in: [] } })

const root = path.resolve(__dirname, '..')
const proxy = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8')
const chatbots = fs.readFileSync(path.join(root, 'app/api/chatbots/route.ts'), 'utf8')
const chatbot = fs.readFileSync(path.join(root, 'app/api/chatbots/[id]/route.ts'), 'utf8')
const conversations = fs.readFileSync(path.join(root, 'app/api/conversations/route.ts'), 'utf8')
const analytics = fs.readFileSync(path.join(root, 'app/api/analytics/route.ts'), 'utf8')
const protectedCollections = [
  'app/api/actions/route.ts',
  'app/api/workflows/route.ts',
  'app/api/evaluations/route.ts',
  'app/api/integrations/route.ts',
  'app/api/contacts/route.ts',
  'app/api/commerce/route.ts',
  'app/api/knowledge-sources/route.ts',
].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
const protectedItems = [
  'app/api/actions/[id]/route.ts',
  'app/api/workflows/[id]/route.ts',
  'app/api/evaluations/[id]/route.ts',
  'app/api/integrations/[id]/route.ts',
  'app/api/contacts/[id]/route.ts',
  'app/api/commerce/[productId]/route.ts',
  'app/api/conversations/[id]/route.ts',
].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
const protectedKnowledgeOperations = [
  'app/api/knowledge-sources/add-url/route.ts',
  'app/api/knowledge-sources/crawl-with-progress/route.ts',
  'app/api/knowledge-sources/manual/route.ts',
  'app/api/knowledge-sources/sync/route.ts',
  'app/api/knowledge-sources/upload-document/route.ts',
  'app/api/ingestion/add-url/route.ts',
  'app/api/ingestion/cancel/route.ts',
  'app/api/ingestion/crawl/route.ts',
  'app/api/ingestion/retry/route.ts',
  'app/api/ingestion/status/route.ts',
].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
const protectedOperationalRoutes = [
  'app/api/actions/[id]/simulate/route.ts',
  'app/api/actions/[id]/widget-functions/[functionId]/route.ts',
  'app/api/actions/[id]/widget-versions/route.ts',
  'app/api/actions/[id]/widget-versions/[version]/restore/route.ts',
  'app/api/workflows/[id]/simulate/route.ts',
  'app/api/evaluations/calibrate/route.ts',
  'app/api/evaluations/judge/route.ts',
  'app/api/evaluations/runs/route.ts',
  'app/api/integrations/[id]/deliveries/route.ts',
  'app/api/integrations/[id]/test/route.ts',
  'app/api/conversations/[id]/assist/route.ts',
  'app/api/conversations/[id]/escalate/route.ts',
  'app/api/conversations/[id]/trace/route.ts',
  'app/api/conversations/export/route.ts',
  'app/api/contacts/export/route.ts',
].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
const protectedAgentOperations = [
  'app/api/chatbots/[id]/embed/route.ts',
  'app/api/chatbots/[id]/export/route.ts',
  'app/api/chatbots/[id]/prompt-versions/route.ts',
  'app/api/chatbots/[id]/prompt-versions/[versionId]/restore/route.ts',
  'app/api/chatbots/[id]/readiness/route.ts',
  'app/api/commerce/sync/route.ts',
  'app/api/commerce/tracking-key/route.ts',
  'app/api/ai-usage/route.ts',
  'app/api/search/route.ts',
].map(file => fs.readFileSync(path.join(root, file), 'utf8'))

assert.match(proxy, /isTenantReadyApi/)
assert.match(proxy, /litx_user_session/)
assert.match(proxy, /knowledgeMutationRoutes/)
assert.match(proxy, /\/api\/ingestion\/status/)
assert.match(chatbots, /workspaceWhere\(actor, "chatbot\.read"\)/)
assert.match(chatbots, /workspaceForNewChatbot/)
assert.match(chatbot, /requireBotPermission\(actor, params\.id, "chatbot\.read"\)/)
assert.match(chatbot, /requireBotPermission\(actor, params\.id, "chatbot\.write"\)/)
assert.match(conversations, /allowedWorkspaceIds\(actor, 'conversation\.read'\)/)
assert.match(analytics, /allowedWorkspaceIds\(actor, 'analytics\.read'\)/)
assert.match(analytics, /accessibleBotIds/)
for (const route of protectedCollections) {
  assert.match(route, /requireDashboardActor/)
  assert.match(route, /requireBotPermission|accessibleBotIds/)
}
for (const route of protectedItems) {
  assert.match(route, /requireDashboardActor/)
  assert.match(route, /requireResourcePermission|requireBotPermission/)
}
for (const route of protectedKnowledgeOperations) {
  assert.match(route, /requireDashboardActor/)
  assert.match(route, /requireResourcePermission|requireBotPermission/)
}
for (const route of protectedOperationalRoutes) {
  assert.match(route, /requireDashboardActor/)
  assert.match(route, /requireResourcePermission|requireBotPermission|accessibleBotIds/)
}
for (const route of protectedAgentOperations) {
  assert.match(route, /requireDashboardActor/)
  assert.match(route, /requireBotPermission|accessibleBotIds|allowedWorkspaceIds/)
}

console.log('Workspace authorization: 125 controlli superati')
