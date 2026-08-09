/**
 * Background Worker for Async Ingestion
 * 
 * Processes jobs from the queue
 * Runs independently from chat API
 * Can be scaled horizontally
 */

import { 
  getNextJob, 
  startJob, 
  completeJob, 
  failJob, 
  updateJobProgress,
  JobType 
} from './ingestion-queue'
import { processAndStoreDocument } from './rag-pipeline'
import { recordPipelineStage } from './pipeline-telemetry'
import { SourceType } from './types'
import { prisma } from './db'
import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { deduplicateCrawledPages } from './crawler-pages'

/**
 * Call Firecrawl via external script
 * This avoids import issues and keeps API routes clean
 */
async function callFirecrawlScript(
  url: string, 
  maxPages: number, 
  jobId: string
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'firecrawl-worker.js')
    const apiKey = process.env.FIRECRAWL_API_KEY!
    
    console.log(`[Worker] Spawning Firecrawl script: ${scriptPath}`)
    console.log(`[Worker] Args: ${url}, ${maxPages}`)
    
    const child = spawn('node', [scriptPath, url, maxPages.toString(), apiKey])
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      const log = data.toString().trim()
      stderr += log + '\n'
      
      // Forward Firecrawl logs
      if (log) {
        console.log(`[Firecrawl] ${log}`)
      }
    })
    
    child.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout)
          
          if (result.success && result.data) {
            // Convert Firecrawl format to standard format
            const pages = result.data.map((page: any) => ({
              url: page.url || page.sourceURL,
              title: page.metadata?.title || 'Untitled',
              textContent: page.markdown || page.html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') || '',
              excerpt: page.metadata?.description || '',
              markdown: page.markdown,
              quality: 85 // Firecrawl content is high quality
            }))
            
            console.log(`[Worker] ✅ Firecrawl returned ${pages.length} pages`)
            resolve(pages)
          } else {
            reject(new Error(result.error || 'Firecrawl returned no data'))
          }
        } catch (e: any) {
          reject(new Error(`Failed to parse Firecrawl output: ${e.message}\nOutput: ${stdout}`))
        }
      } else {
        reject(new Error(`Firecrawl script failed with code ${code}: ${stderr}`))
      }
    })
    
    child.on('error', (error) => {
      reject(new Error(`Failed to spawn Firecrawl script: ${error.message}`))
    })
  })
}

/**
 * Process a single job
 */
async function processJob(job: any) {
  console.log(`[Worker] 🚀 Processing job ${job.id} (${job.jobType})`)
  
  const params = JSON.parse(job.params)
  
  try {
    switch (job.jobType) {
      case JobType.CRAWL:
        await processCrawlJob(job, params)
        break
        
      case JobType.PDF:
        await processPdfJob(job, params)
        break
        
      case JobType.URL:
        await processUrlJob(job, params)
        break
        
      case JobType.REINDEX:
        await processReindexJob(job, params)
        break
        
      default:
        throw new Error(`Unknown job type: ${job.jobType}`)
    }
    
  } catch (error: any) {
    console.error(`[Worker] ❌ Job ${job.id} failed:`, error)
    console.error(`[Worker] Error details:`, error.message, error.stack)
    await failJob(job.id, error)
    throw error  // Re-throw to be caught by worker loop
  }
}

/**
 * Process CRAWL job
 */
async function processCrawlJob(job: any, params: any) {
  const crawlStartedAt = Date.now()
  const { url, maxPages = 50, maxDepth = 4 } = params
  const botId = job.botId
  
  await updateJobProgress(job.id, 10, 'Starting crawler...')
  
  console.log(`[Worker] Crawling URL: ${url}`)
  console.log(`[Worker] Max pages: ${maxPages}, Max depth: ${maxDepth}`)
  
  // Validate URL format
  try {
    new URL(url)
  } catch (error) {
    throw new Error(`Invalid URL format: ${url}. Please include https:// or http://`)
  }
  
  // Check which crawler to use
  const useFirecrawl = process.env.USE_FIRECRAWL === 'true' && process.env.FIRECRAWL_API_KEY
  
  let pages: any[]
  let usedCrawler = 'unknown'
  
  if (useFirecrawl) {
    console.log(`[Worker] Attempting Firecrawl (HTTP API)`)
    await updateJobProgress(job.id, 15, 'Using Firecrawl crawler...')
    
    try {
      // Child processes do not reliably receive traced dependencies inside
      // Vercel functions, so call Firecrawl through its HTTP API directly.
      const { FirecrawlHttpProvider } = await import('./firecrawl-http-provider')
      const provider = new FirecrawlHttpProvider()
      pages = await provider.crawl(url, { maxPages, maxDepth })
      usedCrawler = 'firecrawl'
      console.log(`[Worker] ✅ Firecrawl succeeded`)
      
    } catch (firecrawlError: any) {
      console.log(`[Worker] ⚠️ Firecrawl failed: ${firecrawlError.message}`)
      console.log(`[Worker] 🔄 Falling back to internal crawler...`)
      
      await updateJobProgress(job.id, 15, 'Firecrawl failed, using internal crawler...')
      
      // FALLBACK: Use internal crawler
      const { SimpleIntelligentCrawler } = await import('./simple-intelligent-crawler')
      const crawler = new SimpleIntelligentCrawler(url, {
        maxPages,
        maxDepth
      })
      
      const crawledPages = await crawler.crawl()
      
      // Convert to standard format
      pages = crawledPages.map(p => ({
        url: p.url,
        title: p.title,
        textContent: p.textContent,
        excerpt: p.textContent?.substring(0, 200) || '',
        quality: p.quality || 50,
        products: p.products || []
      }))
      
      usedCrawler = 'internal (fallback)'
      console.log(`[Worker] ✅ Internal crawler succeeded`)
    }
    
  } else {
    console.log(`[Worker] Using Internal crawler (Firecrawl not configured)`)
    await updateJobProgress(job.id, 15, 'Using internal crawler...')
    
    // Use internal crawler
    const { SimpleIntelligentCrawler } = await import('./simple-intelligent-crawler')
    const crawler = new SimpleIntelligentCrawler(url, {
      maxPages,
      maxDepth
    })
    
    const crawledPages = await crawler.crawl()
    
    // Convert to standard format
    pages = crawledPages.map(p => ({
      url: p.url,
      title: p.title,
      textContent: p.textContent,
      excerpt: p.textContent?.substring(0, 200) || '',
      quality: p.quality || 50,
      products: p.products || []
    }))
    
    usedCrawler = 'internal'
  }
  
  console.log(`[Worker] ✅ Crawled ${pages.length} pages using ${usedCrawler}`)
  await recordPipelineStage({ botId, jobId: job.id, stage: 'crawl', durationMs: Date.now() - crawlStartedAt, provider: usedCrawler, inputCount: 1, outputCount: pages.length })
  
  pages = deduplicateCrawledPages(pages, url)

  if (pages.length === 0) {
    throw new Error(`No pages could be crawled from ${url}. The site may be blocking requests or the URL is invalid.`)
  }

  const extractedProducts = pages.flatMap(page => Array.isArray(page.products) ? page.products : [])
  if (extractedProducts.length > 0) {
    await updateJobProgress(job.id, 35, `Importing ${extractedProducts.length} verified products...`)
    const { persistExtractedProducts } = await import('./commerce-importer')
    await persistExtractedProducts(botId, url, extractedProducts)
  }
  
  await updateJobProgress(job.id, 40, `Crawled ${pages.length} pages, processing...`)
  
  let sourcesCreated = 0
  let totalChunks = 0
  
  for (const page of pages) {
    try {
      // Import validation utilities
      const { validateAndSanitizeContent, logPagePreProcessing } = await import('./content-validation')
      
      // Log complete page info
      logPagePreProcessing(page, { jobId: job.id })
      
      // Validate content with detailed checking
      const cleaningStartedAt = Date.now()
      const validation = validateAndSanitizeContent(page.textContent, {
        url: page.url,
        sourceId: 'pending',
        phase: 'extraction'
      })
      
      if (!validation.valid) {
        await recordPipelineStage({ botId, jobId: job.id, stage: 'cleaning', durationMs: Date.now() - cleaningStartedAt, success: false, inputCount: 1, outputCount: 0, metadata: { reason: validation.reason } })
        console.log(`[Worker] ⚠️ SKIPPING ${page.url}`)
        console.log(`[Worker]    Reason: ${validation.reason}`)
        console.log(`[Worker]    Metadata:`, validation.metadata)
        
        // Continue to next page instead of failing entire job
        continue
      }
      
      console.log(`[Worker] ✅ Content validated for ${page.url}`)
      
      // Use sanitized content
      page.textContent = validation.sanitized!
      await recordPipelineStage({ botId, jobId: job.id, stage: 'cleaning', durationMs: Date.now() - cleaningStartedAt, inputCount: 1, outputCount: 1 })
      
      // Keep the last working version until this replacement is indexed.
      const previousSources = await prisma.knowledgeSource.findMany({
        where: { botId, sourceType: SourceType.URL, sourceUrl: page.url },
        select: { id: true },
      })

      // Create knowledge source
      const source = await prisma.knowledgeSource.create({
        data: {
          botId,
          sourceType: SourceType.URL,
          sourceUrl: page.url,
          contentText: page.textContent,
          status: 'processing',
          ingestionJobId: job.id,
          pageCount: 1
        }
      })
      
      // Process and store
      const embeddingStartedAt = Date.now()
      const result = await processAndStoreDocument(
        botId,
        source.id,
        SourceType.URL,
        page.textContent
      )
      await recordPipelineStage({ botId, jobId: job.id, stage: 'embedding', durationMs: Date.now() - embeddingStartedAt, success: result.success, inputCount: 1, outputCount: result.chunkCount })
      
      if (result.success) {
        sourcesCreated++
        totalChunks += result.chunkCount
        if (previousSources.length > 0) {
          const { deleteVectorsForSource, isPineconeConfigured } = await import('./pinecone-vector-store')
          if (isPineconeConfigured()) {
            for (const previous of previousSources) {
              await deleteVectorsForSource(botId, previous.id)
            }
          }
          await prisma.knowledgeSource.deleteMany({
            where: { id: { in: previousSources.map(previous => previous.id) }, botId },
          })
        }
      }
      
      const progress = 40 + Math.floor((sourcesCreated / pages.length) * 50)
      await updateJobProgress(job.id, progress, `Processed ${sourcesCreated}/${pages.length} pages`)
      
    } catch (error) {
      console.error(`[Worker] Error processing page ${page.url}:`, error)
      // Continue with next page
    }
  }
  
  await completeJob(job.id, sourcesCreated, totalChunks)
  
  console.log(`[Worker] ✅ Crawl job completed: ${sourcesCreated} sources, ${totalChunks} chunks`)
}

/**
 * Process PDF job
 */
async function processPdfJob(job: any, params: any) {
  const { fileId, fileName } = params
  const botId = job.botId
  
  await updateJobProgress(job.id, 10, 'Reading PDF...')
  
  // Read the uploaded file
  const uploadDir = path.join(process.cwd(), 'data', 'uploads', botId)
  const filePath = path.join(uploadDir, fileId + '.pdf')
  
  const fileBuffer = await fs.readFile(filePath)
  const fileSize = fileBuffer.length
  
  await updateJobProgress(job.id, 30, 'Extracting text...')
  
  // Extract text (using existing logic from upload-pdf route)
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(fileBuffer)
  const text = data.text
  
  await updateJobProgress(job.id, 50, 'Creating chunks...')
  
  // Create knowledge source
  const source = await prisma.knowledgeSource.create({
    data: {
      botId,
      sourceType: SourceType.PDF,
      originalFilename: fileName,
      contentText: text,
      status: 'processing',
      ingestionJobId: job.id,
      fileSize,
      pageCount: data.numpages
    }
  })
  
  await updateJobProgress(job.id, 70, 'Generating embeddings...')
  
  // Process and store
  const result = await processAndStoreDocument(
    botId,
    source.id,
    SourceType.PDF,
    text
  )
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to process PDF')
  }
  
  await updateJobProgress(job.id, 90, 'Finalizing...')
  
  await completeJob(job.id, 1, result.chunkCount)
  
  console.log(`[Worker] ✅ PDF job completed: ${result.chunkCount} chunks`)
}

/**
 * Process single URL job
 */
async function processUrlJob(job: any, params: any) {
  const { singleUrl, replaceSourceId } = params
  const botId = job.botId
  
  await updateJobProgress(job.id, 20, 'Fetching page...')
  
  // Fetch and extract (using crawler's fetch logic)
  const { SimpleIntelligentCrawler } = await import('./simple-intelligent-crawler')
  const crawler = new SimpleIntelligentCrawler(singleUrl, {
    maxPages: 1,
    maxDepth: 0
  })
  
  const pages = await crawler.crawl()
  
  if (pages.length === 0) {
    throw new Error('Failed to fetch URL')
  }
  
  const page = pages[0]

  if (page.products?.length) {
    const { persistExtractedProducts } = await import('./commerce-importer')
    await persistExtractedProducts(botId, singleUrl, page.products)
  }
  
  // Validate page content
  if (!page.textContent || typeof page.textContent !== 'string' || page.textContent.trim().length === 0) {
    throw new Error('No text content could be extracted from the URL. The page may be empty or blocked.')
  }
  
  console.log(`[Worker] Extracted ${page.textContent.length} characters`)
  
  await updateJobProgress(job.id, 50, 'Processing content...')
  
  // Create knowledge source
  const source = await prisma.knowledgeSource.create({
    data: {
      botId,
      sourceType: SourceType.URL,
      sourceUrl: page.url,
      contentText: page.textContent,
      status: 'processing',
      ingestionJobId: job.id,
      pageCount: 1
    }
  })
  
  // Process and store
  const result = await processAndStoreDocument(
    botId,
    source.id,
    SourceType.URL,
    page.textContent
  )
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to process URL')
  }

  if (replaceSourceId && replaceSourceId !== source.id) {
    const previous = await prisma.knowledgeSource.findFirst({
      where: { id: replaceSourceId, botId },
      select: { id: true },
    })
    if (previous) {
      try {
        const { deleteDatabaseVectorsForSource } = await import('./database-vector-store')
        await deleteDatabaseVectorsForSource(botId, previous.id)
        const { deleteVectorsForSource, isPineconeConfigured } = await import('./pinecone-vector-store')
        if (isPineconeConfigured()) {
          await deleteVectorsForSource(botId, previous.id)
        }
        await prisma.knowledgeSource.delete({ where: { id: previous.id } })
        console.log(`[Worker] Replaced stale source ${previous.id} with ${source.id}`)
      } catch (error) {
        console.error(`[Worker] New source is ready but old source cleanup failed:`, error)
      }
    }
  }
  
  await completeJob(job.id, 1, result.chunkCount)
  
  console.log(`[Worker] ✅ URL job completed: ${result.chunkCount} chunks`)
}

/**
 * Process REINDEX job
 */
async function processReindexJob(job: any, params: any) {
  const { sourceIds } = params
  const botId = job.botId
  
  await updateJobProgress(job.id, 10, 'Starting reindex...')
  
  let totalChunks = 0
  let processed = 0
  
  for (const sourceId of sourceIds) {
    const source = await prisma.knowledgeSource.findUnique({
      where: { id: sourceId }
    })
    
    if (!source) continue
    
    await updateJobProgress(
      job.id, 
      10 + Math.floor((processed / sourceIds.length) * 80),
      `Reindexing ${processed + 1}/${sourceIds.length}`
    )
    
    // Reprocess
    const result = await processAndStoreDocument(
      botId,
      source.id,
      source.sourceType as SourceType,
      source.contentText
    )
    
    if (result.success) {
      totalChunks += result.chunkCount
    }
    
    processed++
  }
  
  await completeJob(job.id, sourceIds.length, totalChunks)
  
  console.log(`[Worker] ✅ Reindex job completed: ${sourceIds.length} sources, ${totalChunks} chunks`)
}

/**
 * Main worker loop
 */
export async function startWorker(intervalMs: number = 5000) {
  console.log('[Worker] 🏭 Starting ingestion worker...')
  console.log(`[Worker] Polling interval: ${intervalMs}ms`)
  
  let isProcessing = false
  
  const processNext = async () => {
    if (isProcessing) {
      // console.log('[Worker] Already processing, skipping...')
      return
    }
    
    try {
      isProcessing = true
      
      const job = await getNextJob()
      
      if (!job) {
        // console.log('[Worker] No jobs in queue')
        return
      }
      
      console.log(`[Worker] 📋 Found job ${job.id} (${job.jobType}, attempt ${job.attempts + 1}/${job.maxAttempts})`)
      
      // Mark as started
      await startJob(job.id)
      
      // Process the job
      await processJob(job)
      
    } catch (error) {
      console.error('[Worker] ❌ Worker error:', error)
    } finally {
      isProcessing = false
    }
  }
  
  // Start polling
  const interval = setInterval(processNext, intervalMs)
  
  // Also process immediately
  processNext()
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Worker] 🛑 Shutting down worker...')
    clearInterval(interval)
    
    // Wait for current job to finish
    let attempts = 0
    while (isProcessing && attempts < 30) {
      console.log('[Worker] Waiting for current job to finish...')
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
    
    console.log('[Worker] ✅ Worker stopped')
    process.exit(0)
  }
  
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  
  return { stop: shutdown }
}

/**
 * Process a single job manually (for testing)
 */
export async function processJobManually(jobId: string) {
  const job = await prisma.ingestionJob.findUnique({
    where: { id: jobId }
  })
  
  if (!job) {
    throw new Error(`Job ${jobId} not found`)
  }
  
  await startJob(job.id)
  await processJob(job)
}
