import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const chat = read("app/api/chat/route.ts");
const orchestrator = read("lib/agentic-orchestrator.ts");
const runtime = read("lib/agentic-chat-runtime.ts");
const page = read("app/evaluations/page.tsx");
const chatbotApi = read("app/api/chatbots/[id]/route.ts");

assert.match(chat, /evaluationModel: z\.string\(\)\.refine\(isSupportedAIModel/);
assert.match(chat, /canUseEvaluationOverride/);
assert.match(chat, /verifyOwnerSessionToken/);
assert.match(chat, /Solo il proprietario può confrontare modelli/);
assert.match(chat, /evaluationMode: Boolean\(body\.evaluationModel\)/);
assert.match(chat, /aiModel: body\.evaluationModel \|\| chatbotSettings\.aiModel/);
assert.match(chat, /agentic\.handoffRequested && !body\.evaluationModel/);
assert.match(chat, /Il modello di valutazione non ha completato il test/);
assert.match(orchestrator, /context\.evaluationMode \? \[\] : await prisma\.agentAction\.findMany/);
assert.match(orchestrator, /!semanticActionCallMade && !context\.evaluationMode/);
assert.match(orchestrator, /totalUsage/);
assert.match(orchestrator, /estimatedCostUsd/);
assert.match(runtime, /usage: agentResult\.usage/);
assert.match(page, /Confronto A\/B controllato/);
assert.match(page, /evaluationModel: model/);
assert.match(page, /evaluationModel: currentModel/);
assert.match(page, /experimentId/);
assert.match(page, /totalCostUsd/);
assert.match(page, /Approva e rendi live/);
assert.match(page, /window\.confirm/);
assert.match(page, /\/api\/chatbots\/\$\{selectedId\}/);
assert.match(chatbotApi, /promptVersion\.create/);
assert.match(chatbotApi, /changeSummary/);

console.log("Model A/B evaluation: 23 controlli superati");
