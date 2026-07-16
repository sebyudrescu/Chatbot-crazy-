/**
 * POST /api/ingestion/upload-pdf
 * 
 * Async PDF upload - saves file and creates job in queue
 * Returns immediately with job ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { createIngestionJob, JobType } from '@/lib/ingestion-queue'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const botId = formData.get('botId') as string

    if (!file || !botId) {
      return NextResponse.json(
        { success: false, error: 'Missing file or botId' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.name.endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported' },
        { status: 400 }
      )
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    // Save file to disk
    const uploadDir = path.join(process.cwd(), 'data', 'uploads', botId)
    await fs.mkdir(uploadDir, { recursive: true })

    const fileId = randomUUID()
    const filePath = path.join(uploadDir, `${fileId}.pdf`)

    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    console.log(`[API] PDF saved: ${filePath}`)

    // Create job
    const job = await createIngestionJob(
      botId,
      JobType.PDF,
      { fileId, fileName: file.name },
      7 // Higher priority for PDFs (smaller, faster)
    )

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        fileName: file.name,
        fileSize: file.size,
        status: job.status,
        message: 'PDF uploaded. Processing will start shortly.',
        estimatedTime: '30-60 seconds'
      }
    })

  } catch (error: any) {
    console.error('[API] PDF upload error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

