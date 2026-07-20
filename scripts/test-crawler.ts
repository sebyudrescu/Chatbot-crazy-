import { createServer } from "node:http";
import { once } from "node:events";
import { SimpleIntelligentCrawler } from "../lib/simple-intelligent-crawler";
import { normalizeRemoteUrl } from "../lib/url-safety";
import { isPrivateNetworkAddress } from "../lib/url-safety";

const paragraph = (label: string) =>
  Array.from(
    { length: 14 },
    (_, index) =>
      `${label} sezione ${index + 1}: informazioni verificate su servizi, assistenza, tempi, modalità operative e risposte utili per i clienti.`,
  ).join(" ");

const serviceContent = paragraph("Servizi");
let redirectTrapHits = 0;
const pages = new Map<string, string>([
  [
    "/",
    `<html><head><title>Home test crawler</title></head><body><main><h1>Guida aziendale</h1><p>${paragraph("Home")}</p><a href="/servizi">Servizi</a><a href="/duplicato">Duplicato</a><a href="/faq">FAQ</a><a href="/asset.json">Asset</a><a href="https://example.com/esterno">Esterno</a></main></body></html>`,
  ],
  [
    "/servizi",
    `<html><head><title>Servizi</title></head><body><main><h1>Servizi</h1><p>${serviceContent}</p></main></body></html>`,
  ],
  [
    "/duplicato",
    `<html><head><title>Copia servizi</title></head><body><main><h1>Servizi</h1><p>${serviceContent}</p></main></body></html>`,
  ],
  [
    "/faq",
    `<html><head><title>FAQ</title></head><body><main><h1>Domande frequenti</h1><p>${paragraph("FAQ")}</p></main></body></html>`,
  ],
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://crawler.test").pathname;
  if (pathname === "/redirect-external") {
    const port = request.headers.host?.split(":").pop();
    response.writeHead(302, { Location: `http://localhost:${port}/redirect-trap` });
    response.end();
    return;
  }
  if (pathname === "/redirect-trap") {
    redirectTrapHits += 1;
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<html><body><p>${paragraph("Trap")}</p></body></html>`);
    return;
  }
  if (pathname === "/asset.json") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ignored: true }));
    return;
  }
  const html = pages.get(pathname);
  if (!html) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
});

async function main() {
  const normalizedDomain = normalizeRemoteUrl("  example.com/docs#section  ");
  if (normalizedDomain.toString() !== "https://example.com/docs") {
    throw new Error("Crawler did not normalize a domain without protocol");
  }
  let unsafeProtocolRejected = false;
  try {
    normalizeRemoteUrl("file:///etc/passwd");
  } catch {
    unsafeProtocolRejected = true;
  }
  if (!unsafeProtocolRejected) {
    throw new Error("Crawler URL normalization accepted an unsafe protocol");
  }
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.ALLOW_PRIVATE_CRAWL_FOR_TESTS = "true";

  try {
    const crawler = new SimpleIntelligentCrawler(baseUrl, {
      maxPages: 4,
      maxDepth: 2,
    });
    const results = await crawler.crawl();
    const stats = crawler.getStats();
    if (stats.crawledPages !== 4) {
      throw new Error(`Expected 4 fetched pages, received ${stats.crawledPages}`);
    }
    if (results.length !== 3) {
      throw new Error(`Duplicate page was not filtered: ${results.length} results`);
    }
    if (!results.every((page) => page.url.includes(`:${address.port}`))) {
      throw new Error("URL normalization dropped the non-standard port");
    }
    if (!results.some((page) => page.url.endsWith("/faq"))) {
      throw new Error("Same-domain linked pages were not discovered");
    }
    if (results.some((page) => page.url.includes("example.com"))) {
      throw new Error("Crawler followed an external-domain link");
    }

    const redirectCrawler = new SimpleIntelligentCrawler(`${baseUrl}/redirect-external`, {
      maxPages: 1,
      maxDepth: 0,
    });
    await redirectCrawler.crawl();
    if (redirectTrapHits !== 0) {
      throw new Error("Crawler contacted a redirect destination before validating it");
    }

    const rootOnly = new SimpleIntelligentCrawler(baseUrl, {
      maxPages: 4,
      maxDepth: 0,
    });
    await rootOnly.crawl();
    if (rootOnly.getStats().crawledPages !== 1) {
      throw new Error("Crawler ignored maxDepth=0");
    }

    const limited = new SimpleIntelligentCrawler(baseUrl, {
      maxPages: 2,
      maxDepth: 2,
    });
    await limited.crawl();
    if (limited.getStats().crawledPages > 2) {
      throw new Error("Crawler exceeded maxPages during parallel batches");
    }
    if (
      !isPrivateNetworkAddress("127.0.0.1") ||
      !isPrivateNetworkAddress("10.0.0.1") ||
      isPrivateNetworkAddress("8.8.8.8")
    ) {
      throw new Error("Private-network protection classification failed");
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          checks: [
            "url-port-preserved",
            "same-domain-discovery",
            "external-domain-block",
            "content-extraction",
            "duplicate-content-filter",
            "max-pages-hard-limit",
            "private-network-classification",
            "missing-protocol-normalization",
            "unsafe-protocol-rejection",
            "redirect-preflight-validation",
            "zero-depth-limit",
          ],
          stats,
        },
        null,
        2,
      ),
    );
  } finally {
    delete process.env.ALLOW_PRIVATE_CRAWL_FOR_TESTS;
    server.close();
    await once(server, "close");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
