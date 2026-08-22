import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
let checks = 0;

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const schema = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
const readme = await readFile(path.join(root, "README.md"), "utf8");

check(packageJson.engines?.node === "24.x", "package.json must keep the Node.js 24 runtime contract");
check(packageJson.dependencies?.next?.includes("16"), "Next.js 16 must remain the declared framework");
check(!packageJson.dependencies?.["faiss-node"], "faiss-node must not return to the production dependency graph");
check(/datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"postgresql"/.test(schema), "Prisma must use PostgreSQL");
check(readme.includes("PostgreSQL") && readme.includes("Next.js 16"), "README must describe the current runtime");
check(!await exists("app/api/upload/widget-logo/route.ts"), "widget logos must not be written to the Vercel filesystem");
check(!await exists("lib/vector-store.ts"), "the legacy filesystem FAISS store must stay removed");
check(!await exists("lib/simple-vector-store.ts"), "the legacy JSON filesystem vector store must stay removed");

const forbiddenDocs = [
  "PROJECT_OVERVIEW.md",
  "PROJECT_HANDOFF.md",
  "QUICKSTART_NEXTJS.md",
  "RAG_SYSTEM.md",
  "GETTING_STARTED_RAG.md",
  "MIGRATION_COMPLETE.md",
];
for (const file of forbiddenDocs) {
  check(!await exists(file), `legacy operational document must stay removed: ${file}`);
}

if (failures.length) {
  console.error(JSON.stringify({ success: false, checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ success: true, checks, runtime: "node24-next16-postgresql", vectorFallback: "postgresql", optionalVectorIndex: "pinecone" }));

