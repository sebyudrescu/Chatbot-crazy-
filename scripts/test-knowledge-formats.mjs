import JSZip from 'jszip'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
let authCookie = ''

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(authCookie ? { Cookie: authCookie } : {}),
      ...(options?.headers || {}),
    },
  })
  let body
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { response, body }
}

async function authenticate() {
  const password = process.env.SMOKE_ACCESS_PASSWORD || process.env.APP_ACCESS_PASSWORD
  if (!password) return
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new Error(`Autenticazione test formati non riuscita: ${response.status}`)
  authCookie = (response.headers.get('set-cookie') || '').split(';')[0]
  if (!authCookie) throw new Error('Cookie autenticazione test formati mancante')
}

async function preview(botId, filename, content, type) {
  const form = new FormData()
  form.set('botId', botId)
  form.set('previewOnly', 'true')
  form.set('file', new File([content], filename, { type }))
  return request('/api/knowledge-sources/upload-document', { method: 'POST', body: form })
}

async function createDocx() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`)
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`)
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Manuale operativo del servizio clienti LitX AI.</w:t></w:r></w:p>
        <w:p><w:r><w:t>Gli appuntamenti possono essere prenotati dal lunedì al venerdì dalle nove alle diciotto.</w:t></w:r></w:p>
        <w:p><w:r><w:t>Per annullare una prenotazione, contattare l'assistenza almeno ventiquattro ore prima.</w:t></w:r></w:p>
      </w:body>
    </w:document>`)
  return zip.generateAsync({ type: 'uint8array' })
}

await authenticate()
const bots = await request('/api/chatbots')
if (!bots.response.ok) throw new Error('Impossibile caricare gli agenti per il test formati')
let botId = bots.body?.data?.[0]?.id
let temporaryBotId
if (!botId) {
  const created = await request('/api/chatbots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: '__KNOWLEDGE_FORMAT_TEST__',
      systemPrompt: 'Assistente temporaneo per verificare i formati delle fonti.',
      settings: { role: 'Assistente test', objective: 'Verificare il parsing dei documenti' },
    }),
  })
  if (!created.response.ok || !created.body?.data?.id) throw new Error('Impossibile creare l’agente temporaneo')
  botId = created.body.data.id
  temporaryBotId = botId
}

try {
  const cases = [
    ['txt', await preview(botId, 'assistenza.txt', 'Guida assistenza clienti. '.repeat(12), 'text/plain')],
    ['csv', await preview(botId, 'listino.csv', `servizio,prezzo,descrizione
Consulenza,90 euro,Sessione individuale di sessanta minuti
Audit,250 euro,Analisi completa e piano di miglioramento`, 'text/csv')],
    ['docx', await preview(botId, 'manuale.docx', await createDocx(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')],
  ]

  for (const [format, result] of cases) {
    if (!result.response.ok || result.body?.data?.type !== format || result.body?.data?.characters < 50) {
      throw new Error(`${format.toUpperCase()} non valido: ${JSON.stringify(result.body)}`)
    }
  }

  const invalidBinary = await preview(botId, 'falso.txt', new Uint8Array([0, 1, 2, 3, 4, 5, 0, 1, 2, 3]), 'text/plain')
  if (invalidBinary.response.status !== 400) throw new Error('Un file binario camuffato da TXT non è stato rifiutato')

  const invalidPdf = await preview(botId, 'falso.pdf', 'Questo non è un file PDF valido, anche se ha una estensione PDF.'.repeat(2), 'application/pdf')
  if (invalidPdf.response.status !== 400) throw new Error('Un file camuffato da PDF non è stato rifiutato')

  console.log(JSON.stringify({
    success: true,
    formats: cases.map(([format, result]) => ({
      format,
      characters: result.body.data.characters,
      words: result.body.data.words,
    })),
    rejected: ['binary-as-txt', 'text-as-pdf'],
  }, null, 2))
} finally {
  if (temporaryBotId) await request(`/api/chatbots/${temporaryBotId}`, { method: 'DELETE' }).catch(() => {})
}
