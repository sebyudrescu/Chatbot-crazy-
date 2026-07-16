/**
 * GET /api/worker/start
 * 
 * Start the background worker (in-process)
 * Call this once when server starts
 */

import { NextRequest, NextResponse } from 'next/server'
import { startWorker } from '@/lib/ingestion-worker'

let workerRunning = false

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (workerRunning) {
    return NextResponse.json({
      success: true,
      message: 'Worker already running'
    })
  }

  try {
    // Start worker in background
    startWorker(3000)
    workerRunning = true
    
    console.log('✅ Background worker started via API')

    return NextResponse.json({
      success: true,
      message: 'Background worker started successfully'
    })

  } catch (error: any) {
    console.error('Failed to start worker:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
