import type { NextRequest } from 'next/server'
import { POST as uploadDocument } from '@/app/api/knowledge-sources/upload-document/route'

// Kept for older clients. Serverless deployments cannot hand a local file to a
// later worker invocation, so PDFs are extracted and indexed in this request.
export async function POST(request: NextRequest) {
  return uploadDocument(request)
}
