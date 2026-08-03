import type { CrawledPage } from "./crawler-provider";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "msclkid", "srsltid", "dclid", "mc_cid", "mc_eid"]);

export function canonicalizeCrawledPageUrl(value: string | undefined, startUrl: string): string {
  const parsed = new URL(value || startUrl, startUrl);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.pathname = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function resolveFirecrawlPageUrl(page: Record<string, any>, startUrl: string): string {
  return canonicalizeCrawledPageUrl(
    page.url
      || page.sourceURL
      || page.metadata?.sourceURL
      || page.metadata?.canonicalURL
      || page.metadata?.url,
    startUrl,
  );
}

export function deduplicateCrawledPages(pages: CrawledPage[], startUrl: string): CrawledPage[] {
  const byUrl = new Map<string, CrawledPage>();
  for (const page of pages) {
    const url = canonicalizeCrawledPageUrl(page.url, startUrl);
    const normalized = { ...page, url };
    const current = byUrl.get(url);
    if (!current) {
      byUrl.set(url, normalized);
      continue;
    }
    const preferred = normalized.textContent.length > current.textContent.length ? normalized : current;
    byUrl.set(url, {
      ...preferred,
      products: [...new Map([...(current.products || []), ...(normalized.products || [])].map(product => [product.identityKey, product])).values()],
    });
  }
  return [...byUrl.values()];
}
