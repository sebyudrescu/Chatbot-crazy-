import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/db'
import { extractTextFromPDF, cleanText } from '@/lib/document-processors'
import { processAndStoreDocument } from '@/lib/rag-pipeline'
import { SourceType, SourceStatus } from '@/lib/types'

// Note: Next.js App Router handles file uploads automatically
// Max file size can be configured in next.config.js

// POST /api/knowledge-sources/upload-pdf
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const botId = formData.get('botId') as string
    
    if (!file || !botId) {
      return NextResponse.json(
        { success: false, error: 'File and botId are required' },
        { status: 400 }
      )
    }
    
    // Validate file type
    if (!file.type.includes('pdf')) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }
    
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
    
    console.log(`📤 Uploading PDF: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`)
    
    // Read file buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Extract text from PDF
    console.log('📄 Extracting text from PDF...')
    const extractedText = await extractTextFromPDF(buffer)
    const cleanedText = cleanText(extractedText)
    
    if (cleanedText.length < 100) {
      return NextResponse.json(
        { success: false, error: 'Insufficient text content extracted from PDF' },
        { status: 400 }
      )
    }
    
    console.log(`✅ Extracted ${cleanedText.length} characters from PDF`)
    
    // Create knowledge source record
    const source = await prisma.knowledgeSource.create({
      data: {
        botId,
        sourceType: SourceType.PDF,
        originalFilename: file.name,
        contentText: cleanedText,
        status: SourceStatus.PROCESSING,
      },
    })
    
    // Save file to disk (optional, for reference)
    const uploadDir = path.join(process.cwd(), 'data', 'uploads', botId)
    const fs = require('fs')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    const filePath = path.join(uploadDir, `${source.id}.pdf`)
    await writeFile(filePath, buffer)
    
    // Process in background (non-blocking)
    // In production, use a queue system like BullMQ or Inngest
    processAndStoreDocument(botId, source.id, SourceType.PDF, cleanedText)
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
          filename: file.name,
          textLength: cleanedText.length,
          status: SourceStatus.PROCESSING,
          message: 'PDF uploaded successfully. Processing in background...',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error uploading PDF:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload PDF',
      },
      { status: 500 }
    )
  }
}
