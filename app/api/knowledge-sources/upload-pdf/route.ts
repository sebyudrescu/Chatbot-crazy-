import type { NextRequest } from 'next/server'
import { POST as uploadDocument } from '@/app/api/knowledge-sources/upload-document/route'

// Backward-compatible PDF endpoint used by the main Knowledge Base page.
// The shared document importer processes the upload directly from memory and
// persists extracted text/chunks, so it works on Vercel's read-only filesystem.
export async function POST(request: NextRequest) {
  return uploadDocument(request)
}
