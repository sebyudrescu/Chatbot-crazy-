import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string) {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  ) {
    return true;
  }
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPrivateIPv4(mapped) : false;
}

export function isPrivateNetworkAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true;
}

export function normalizeRemoteUrl(value: string) {
  const input = value.trim();
  if (!input) throw new Error("Inserisci un URL valido");
  if (input.length > 2048) throw new Error("L’URL è troppo lungo");

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Inserisci un URL valido");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Sono consentiti soltanto URL HTTP o HTTPS");
  }
  if (!url.hostname) throw new Error("Inserisci un URL valido");
  url.hash = "";
  return url;
}

export async function assertSafeRemoteUrl(value: string) {
  const url = normalizeRemoteUrl(value);
  if (url.username || url.password) {
    throw new Error("Gli URL con credenziali incorporate non sono consentiti");
  }
  if (
    process.env.ALLOW_PRIVATE_CRAWL_FOR_TESTS === "true" ||
    process.env.ALLOW_PRIVATE_WEBHOOK_FOR_TESTS === "true"
  ) return url;
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Gli indirizzi locali o privati non possono essere scansionati");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateNetworkAddress(item.address))) {
    throw new Error("L’indirizzo risolve verso una rete privata o non consentita");
  }
  return url;
}

export async function assertSafeHttpsRemoteUrl(value: string) {
  const normalized = normalizeRemoteUrl(value);
  if (normalized.protocol !== "https:") {
    throw new Error("Le funzioni server dei widget richiedono un endpoint HTTPS");
  }
  return assertSafeRemoteUrl(normalized.toString());
}
