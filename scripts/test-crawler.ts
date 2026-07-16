import { createServer } from "node:http";
import { once } from "node:events";
import { SimpleIntelligentCrawler } from "../lib/simple-intelligent-crawler";
import { isPrivateNetworkAddress } from "../lib/url-safety";

const paragraph = (label: string) =>
  Array.from(
    { length: 14 },
    (_, index) =>
      `${label} sezione ${index + 1}: informazioni verificate su servizi, assistenza, tempi, modalità operative e risposte utili per i clienti.`,
  ).join(" ");

const serviceContent = paragraph("Servizi");
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
