import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FirecrawlHttpProvider } from '../lib/firecrawl-http-provider';

async function main() {
  assert.equal(
    existsSync(resolve(__dirname, '../lib/firecrawl-http-provider.js')),
    false,
    'Do not commit a compiled provider beside the TypeScript source: extensionless production imports may load the stale JavaScript copy',
  );

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FIRECRAWL_API_KEY;
  process.env.FIRECRAWL_API_KEY = 'test-only';
  const markdown = '# Spedizioni\n\nConsegna entro 24/48 ore lavorative. Riceverai una email con il tracking. '.repeat(4);
  const document = {
    markdown,
    html: '<main>Spedizioni</main>',
    rawHtml: '<nav>Menu</nav><script type="application/ld+json">{"@type":"Product","name":"Scarpa","url":"https://shop.example.com/scarpa","offers":{"@type":"Offer","price":"49","priceCurrency":"EUR"}}</script>',
    metadata: { sourceURL: 'https://shop.example.com/spedizioni', title: 'Spedizioni' },
  };
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      requests.push(body.scrapeOptions || body);
      return Response.json(String(_url).endsWith('/crawl') ? { success: true, id: 'fixture' } : { success: true, data: document });
    }
    return Response.json({ status: 'completed', data: [document] });
  }) as typeof fetch;
  try {
    const provider = new FirecrawlHttpProvider();
    const page = await provider.scrapeSinglePage('https://shop.example.com/');
    assert.equal(page?.textContent, markdown);
    assert.equal(page?.url, 'https://shop.example.com/spedizioni');
    assert.equal(page?.products?.[0].title, 'Scarpa');
    assert.ok(!page?.textContent.includes('Menu'));
    const pages = await provider.crawl('https://shop.example.com/', { maxPages: 1 });
    assert.equal(pages[0].textContent, markdown);
    assert.equal(pages[0].products?.[0].title, 'Scarpa');
    for (const request of requests) {
      assert.equal(request.onlyMainContent, true);
      assert.ok((request.formats as string[]).includes('rawHtml'));
      assert.deepEqual(request.excludeTags, ['.chatbot-widget-container']);
    }
    assert.equal(requests.length, 2);

    globalThis.fetch = (async () => Response.json({
      success: true,
      data: {
        markdown: '',
        html: '',
        rawHtml: '<nav>Solo navigazione</nav>',
        metadata: { sourceURL: 'https://shop.example.com/vuota' },
      },
    })) as typeof fetch;
    assert.equal(
      await provider.scrapeSinglePage('https://shop.example.com/vuota'),
      null,
      'An empty main-content response must trigger the ingestion fallback',
    );
    console.log('Firecrawl clean content and raw product evidence checks passed');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = originalKey;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
