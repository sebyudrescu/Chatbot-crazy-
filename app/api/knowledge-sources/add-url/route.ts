import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractTextFromURL, validateURL, cleanText } from '@/lib/document-processors'
import { processAndStoreDocument } from '@/lib/rag-pipeline'
import { SourceType, SourceStatus } from '@/lib/types'
import { z } from 'zod'

const AddURLSchema = z.object({
  botId: z.string().uuid(),
  url: z.string().url(),
})

// POST /api/knowledge-sources/add-url
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = AddURLSchema.parse(body)
    
    const { botId, url } = validatedData
    
    // Verify bot exists
    const bot = await prisma.chatbot.findUnique({
      where: { id: botId },
    })
    
    if (!bot) {
      return NextResponse.json(
        { success: false, error: 'Chatbot not found' },
        { status: 404 }
      )
    }
    
    console.log(`🌐 Adding URL: ${url}`)
    
    // Validate URL is accessible
    console.log('🔍 Validating URL...')
    const isValid = await validateURL(url)
    
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'URL is not accessible or does not contain HTML content' },
        { status: 400 }
      )
    }
    
    // Extract text from URL
    console.log('📄 Extracting text from URL...')
    const extractedText = await extractTextFromURL(url)
    const cleanedText = cleanText(extractedText)
    
    if (cleanedText.length < 100) {
      return NextResponse.json(
        { success: false, error: 'Insufficient text content extracted from URL' },
        { status: 400 }
      )
    }
    
    console.log(`✅ Extracted ${cleanedText.length} characters from URL`)
    
    // Check if URL already exists for this bot
    const existingSource = await prisma.knowledgeSource.findFirst({
      where: {
        botId,
        sourceUrl: url,
      },
    })
    
    if (existingSource) {
      return NextResponse.json(
        { success: false, error: 'This URL has already been added to the knowledge base' },
        { status: 409 }
      )
    }
    
    // Create knowledge source record
    const source = await prisma.knowledgeSource.create({
      data: {
        botId,
        sourceType: SourceType.URL,
        sourceUrl: url,
        contentText: cleanedText,
        status: SourceStatus.PROCESSING,
      },
    })
    
    // Process in background
    processAndStoreDocument(botId, source.id, SourceType.URL, cleanedText)
      .then((result) => {
        console.log(`✅ Background processing completed for ${source.id}:`, result)
      })
      .catch((error) => {
        console.error(`❌ Background processing failed for ${source.id}:`, error)
      })
    
    return NextResponse.json(
      {
        success: true,
        data: {
          sourceId: source.id,
          url,
          textLength: cleanedText.length,
          status: SourceStatus.PROCESSING,
          message: 'URL added successfully. Processing in background...',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error adding URL:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add URL',
      },
      { status: 500 }
    )
  }
}
