import { NextRequest, NextResponse } from 'next/server'
import { getCrawlerProvider } from '@/lib/crawler-provider'
import { prisma } from '@/lib/db'
import { processAndStoreDocument } from '@/lib/rag-pipeline'
import { SourceType, SourceStatus } from '@/lib/types'

/**
 * POST /api/knowledge-sources/crawl-site
 * 
 * Crawls an entire website and adds all pages to knowledge base
 * Now uses intelligent provider selection (Firecrawl or Internal)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { botId, url, maxPages, maxDepth } = body

    // Validation
    if (!botId || !url) {
      return NextResponse.json(
        { success: false, error: 'botId and url are required' },
        { status: 400 }
      )
    }

    // Verify chatbot exists
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: botId }
    })

    if (!chatbot) {
      return NextResponse.json(
        { success: false, error: 'Chatbot not found' },
        { status: 404 }
      )
    }

    console.log(`[Crawl] Starting crawl for: ${url}`)
    console.log(`[Crawl] Settings: maxPages=${maxPages || 50}, maxDepth=${maxDepth || 4}`)

    // Get crawler provider (auto-selects Firecrawl or Internal)
    const provider = getCrawlerProvider()
    console.log(`[Crawl] Using provider: ${provider.name}`)
    console.log(`[Crawl] Features: ${provider.getSupportedFeatures().join(', ')}`)

    // Start crawling
    const pages = await provider.crawl(url, {
      maxPages: maxPages || 50,
      maxDepth: maxDepth || 4
    })

    console.log(`[Crawl] ✅ Crawled ${pages.length} quality pages. Starting processing...`)

    // Process each page
    const processedSources = []
    let totalChunks = 0

    for (const page of pages) {
      try {
        console.log(`[Process] Processing: ${page.url}`)
        
        // Create knowledge source entry
        const source = await prisma.knowledgeSource.create({
          data: {
            botId,
            sourceType: SourceType.URL,
            sourceUrl: page.url,
            contentText: page.textContent,
            status: SourceStatus.PROCESSING,
          }
        })

        // Process and store using RAG pipeline
        const result = await processAndStoreDocument(
          botId,
          source.id,
          SourceType.URL,
          page.textContent
        )

        if (result.success) {
          processedSources.push({
            url: page.url,
            title: page.title,
            chunks: result.chunkCount,
            quality: page.quality
          })
          
          totalChunks += result.chunkCount
          console.log(`[Process] ✅ ${page.url}: ${result.chunkCount} chunks`)
        } else {
          console.error(`[Process] Failed: ${page.url} - ${result.error}`)
        }

        // Small delay between pages to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        console.error(`[Process] Error processing ${page.url}:`, error)
        // Continue with next page
      }
    }

    console.log(`[Crawl] Completed! ${processedSources.length} pages processed, ${totalChunks} chunks created`)
    
    // Update chatbot KB status
    await prisma.chatbot.update({
      where: { id: botId },
      data: {
        kbStatus: 'ready',
        kbLastIndexed: new Date(),
        kbTotalChunks: totalChunks
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        crawled: pages.length,
        processed: processedSources.length,
        totalChunks,
        provider: provider.name,
        sources: processedSources
      }
    })

  } catch (error) {
    console.error('[Crawl] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during crawl' 
      },
      { status: 500 }
    )
  }
}
