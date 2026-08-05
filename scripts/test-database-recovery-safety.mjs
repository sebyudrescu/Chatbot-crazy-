import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve(process.cwd(), "scripts/database-recovery.mjs");
const script = readFileSync(scriptPath, "utf8");

function execute(args, env) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, DATABASE_URL: "", DIRECT_URL: "", ...env },
    encoding: "utf8",
    windowsHide: true,
  });
}

const source = "postgresql://litx:source-secret@source.example/litx";
const sameTarget = execute(["drill"], {
  DR_SOURCE_DATABASE_URL: source,
  DR_TARGET_DATABASE_URL: source,
  DR_CONFIRM_TARGET_DATABASE: "litx",
});
assert.notEqual(sameTarget.status, 0);
assert.match(sameTarget.stderr, /non può coincidere/);
assert.doesNotMatch(sameTarget.stderr, /source-secret/);

const missingConfirmation = execute(["drill"], {
  DR_SOURCE_DATABASE_URL: source,
  DR_TARGET_DATABASE_URL: "postgresql://litx:target-secret@target.example/litx_restore",
});
assert.notEqual(missingConfirmation.status, 0);
assert.match(missingConfirmation.stderr, /DR_CONFIRM_TARGET_DATABASE/);
assert.doesNotMatch(missingConfirmation.stderr, /target-secret/);

const pooled = execute(["backup"], {
  DR_SOURCE_DATABASE_URL: "postgresql://litx:secret@ep-example-pooler.eu-west-2.aws.neon.tech/litx",
  DR_ARCHIVE_PATH: resolve(process.cwd(), "should-not-exist.dump"),
});
assert.notEqual(pooled.status, 0);
assert.match(pooled.stderr, /non pooled/);

const missingArchive = execute(["backup"], { DR_SOURCE_DATABASE_URL: source });
assert.notEqual(missingArchive.status, 0);
assert.match(missingArchive.stderr, /DR_ARCHIVE_PATH/);
assert.equal(script.includes("--no-owner"), true);
assert.equal(script.includes("--no-privileges"), true);
assert.equal(script.includes("--exit-on-error"), true);
assert.equal(script.includes("DR_OVERWRITE_ARCHIVE"), true);

console.log(JSON.stringify({ success: true, checks: 14 }));
