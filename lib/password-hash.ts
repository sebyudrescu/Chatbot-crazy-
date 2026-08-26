import "server-only";

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}

export async function hashUserPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return ["litx", "scrypt", "v1", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyUserPassword(password: string, encoded: string) {
  const [product, algorithm, version, cost, blockSize, parallelization, saltValue, hashValue] = encoded.split("$");
  if (product !== "litx" || algorithm !== "scrypt" || version !== "v1") return false;
  if (Number(cost) !== COST || Number(blockSize) !== BLOCK_SIZE || Number(parallelization) !== PARALLELIZATION) return false;
  try {
    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const received = await scrypt(password, Buffer.from(saltValue, "base64url"));
    return timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}
