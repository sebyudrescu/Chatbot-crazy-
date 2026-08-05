import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const criticalTables = [
  "_prisma_migrations",
  "chatbots",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
  "integration_connections",
  "products",
  "product_variants",
  "workflows",
  "events",
];

function connection(raw, label) {
  if (!raw) throw new Error(`${label} non configurato`);
  const url = new URL(raw);
  if (!url.protocol.startsWith("postgres")) throw new Error(`${label} deve essere PostgreSQL`);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database || !url.username) throw new Error(`${label} incompleto`);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database,
    env: {
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: database,
      PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
      PGCHANNELBINDING: url.searchParams.get("channel_binding") || "prefer",
    },
  };
}

function safeError(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[postgres-connection-redacted]")
    .replace(/password\s*[=:]\s*\S+/gi, "password=[redacted]")
    .trim();
}

function run(command, args, env, capture = false) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => { stdout += chunk; });
    child.stderr?.on("data", chunk => { stderr += chunk; });
    child.on("error", error => rejectPromise(new Error(`${command} non disponibile: ${safeError(error.message)}`)));
    child.on("close", code => {
      if (code === 0) return resolvePromise(stdout);
      rejectPromise(new Error(`${command} terminato con codice ${code}: ${safeError(stderr)}`));
    });
  });
}

async function tableCount(env, table) {
  const output = await run("psql", [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command", `SELECT COUNT(*) FROM public."${table}";`,
  ], env, true);
  const value = Number(output.trim());
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Conteggio non valido per ${table}`);
  return value;
}

async function counts(env) {
  const result = {};
  for (const table of criticalTables) result[table] = await tableCount(env, table);
  return result;
}

async function main() {
  const startedAt = Date.now();
  const mode = process.argv[2] || process.env.DR_MODE || "drill";
  if (!["backup", "drill"].includes(mode)) throw new Error("La modalità deve essere backup oppure drill");
  if (mode === "backup" && !process.env.DR_ARCHIVE_PATH?.trim()) {
    throw new Error("DR_ARCHIVE_PATH è obbligatorio per conservare il backup");
  }

  const source = connection(process.env.DR_SOURCE_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL, "DR_SOURCE_DATABASE_URL");
  if (/-pooler\./i.test(source.host)) {
    throw new Error("Usa una connessione PostgreSQL non pooled per pg_dump (DR_SOURCE_DATABASE_URL o DIRECT_URL)");
  }

  let target;
  if (mode === "drill") {
    target = connection(process.env.DR_TARGET_DATABASE_URL, "DR_TARGET_DATABASE_URL");
    if (`${source.host}:${source.port}/${source.database}` === `${target.host}:${target.port}/${target.database}`) {
      throw new Error("Il database di destinazione non può coincidere con la sorgente");
    }
    if (process.env.DR_CONFIRM_TARGET_DATABASE !== target.database) {
      throw new Error("DR_CONFIRM_TARGET_DATABASE deve corrispondere esattamente al database di destinazione");
    }
  }

  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "litx-dr-"));
  const configuredArchive = process.env.DR_ARCHIVE_PATH?.trim();
  const archivePath = configuredArchive ? resolve(configuredArchive) : resolve(temporaryDirectory, "litx.dump");
  const keepArchive = Boolean(configuredArchive);

  try {
    if (existsSync(archivePath) && process.env.DR_OVERWRITE_ARCHIVE !== "true") {
      throw new Error("L'archivio esiste già; imposta DR_OVERWRITE_ARCHIVE=true solo per sostituirlo");
    }
    await mkdir(dirname(archivePath), { recursive: true });
    await run("pg_dump", [
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-privileges",
      "--file", archivePath,
    ], source.env);
    await run("pg_restore", ["--list", archivePath], {}, true);

    const archive = await readFile(archivePath);
    const archiveStats = await stat(archivePath);
    const report = {
      success: true,
      mode,
      createdAt: new Date().toISOString(),
      sourceDatabase: source.database,
      archiveBytes: archiveStats.size,
      archiveSha256: createHash("sha256").update(archive).digest("hex"),
      archiveRetained: keepArchive,
    };

    if (mode === "drill" && target) {
      const sourceCounts = await counts(source.env);
      await run("pg_restore", [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "--dbname", target.database,
        archivePath,
      ], target.env);
      const restoredCounts = await counts(target.env);
      const mismatches = criticalTables.filter(table => sourceCounts[table] !== restoredCounts[table]);
      if (mismatches.length) throw new Error(`Restore non equivalente nelle tabelle: ${mismatches.join(", ")}`);
      Object.assign(report, {
        targetDatabase: target.database,
        verifiedTables: criticalTables.length,
        verifiedRows: Object.values(restoredCounts).reduce((sum, value) => sum + value, 0),
        tableCounts: restoredCounts,
      });
    }

    report.durationMs = Date.now() - startedAt;
    if (keepArchive) {
      const manifestPath = `${archivePath}.manifest.json`;
      await writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: process.env.DR_OVERWRITE_ARCHIVE === "true" ? "w" : "wx" });
      report.manifestPath = manifestPath;
    }
    console.log(JSON.stringify(report));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`[database-recovery] ${safeError(error instanceof Error ? error.message : error)}`);
  process.exitCode = 1;
});
