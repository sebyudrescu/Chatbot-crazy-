import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractTextFromDOCX, extractTextFromPDF, extractTextFromPlainFile, normalizeDocumentText } from '@/lib/document-processors'
import { processAndStoreDocument } from '@/lib/rag-pipeline'

const allowed = new Set(['pdf', 'docx', 'txt', 'csv'])
function validateSignature(buffer: Buffer, extension: string) {
  if (buffer.length === 0) throw new Error('Il file è vuoto')
  if (extension === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Il contenuto non corrisponde a un PDF valido')
  }
  if (extension === 'docx' && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new Error('Il contenuto non corrisponde a un DOCX valido')
  }
  if (extension === 'txt' || extension === 'csv') {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192))
    const forbiddenControls = [...sample].filter(byte => byte === 0 || (byte < 9 || (byte > 13 && byte < 32))).length
    if (forbiddenControls / sample.length > 0.01) {
      throw new Error('Il file sembra binario: carica un documento di testo UTF-8')
    }
  }
}
async function extract(buffer: Buffer, extension: string) {
  if (extension === 'pdf') return extractTextFromPDF(buffer)
  if (extension === 'docx') return extractTextFromDOCX(buffer)
  return extractTextFromPlainFile(buffer, extension as 'txt' | 'csv')
}
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData(), file = form.get('file')
    const botId = String(form.get('botId') || ''), previewOnly = form.get('previewOnly') === 'true'
    if (!(file instanceof File) || !botId) return NextResponse.json({ success: false, error: 'File e agente sono obbligatori' }, { status: 400 })
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!allowed.has(extension)) return NextResponse.json({ success: false, error: 'Formato supportato: PDF, DOCX, TXT o CSV' }, { status: 400 })
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ success: false, error: 'Il file supera il limite di 15 MB' }, { status: 400 })
    const bot = await prisma.chatbot.findUnique({ where: { id: botId }, select: { id: true } })
    if (!bot) return NextResponse.json({ success: false, error: 'Agente non trovato' }, { status: 404 })
    const buffer = Buffer.from(await file.arrayBuffer())
    let text: string
    try {
      validateSignature(buffer, extension)
      text = normalizeDocumentText(await extract(buffer, extension))
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Documento non valido' },
        { status: 400 },
      )
    }
    if (text.length < 50) return NextResponse.json({ success: false, error: 'Il documento non contiene testo sufficiente' }, { status: 400 })
    if (text.length > 2_000_000) return NextResponse.json({ success: false, error: 'Il documento supera 2 milioni di caratteri: dividilo in più fonti' }, { status: 400 })
    const stats = { filename: file.name, type: extension, characters: text.length, words: text.split(/\s+/).length, preview: text.slice(0, 8000), truncated: text.length > 8000, warnings: text.length < 300 ? ['Contenuto molto breve: verifica che il file sia completo.'] : [] }
    if (previewOnly) return NextResponse.json({ success: true, data: stats })
    const source = await prisma.knowledgeSource.create({ data: { botId, sourceType: extension, originalFilename: file.name, contentText: text, status: 'processing', fileSize: file.size } })
    const processed = await processAndStoreDocument(botId, source.id, extension, text)
    if (!processed.success) return NextResponse.json({ success: false, error: processed.error || 'Indicizzazione non riuscita', sourceId: source.id }, { status: 500 })
    return NextResponse.json({ success: true, data: { ...stats, sourceId: source.id, status: 'completed', chunks: processed.chunkCount } }, { status: 201 })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Importazione non riuscita' }, { status: 500 }) }
}
