const Module = require("node:module");
const { randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");
const path = require("node:path");

let transcriptionInput = null;
let transcriptionUsage = null;
class FakeOpenAI {
  constructor() {
    this.audio = { transcriptions: { create: async (input) => {
      transcriptionInput = input;
      return { text: "Vorrei prenotare domani alle sedici", usage: { input_tokens: 10, output_tokens: 7, total_tokens: 17 } };
    } } };
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "openai") return FakeOpenAI;
  if (request === "./ai-usage" && parent?.filename?.endsWith("meta-attachments.ts")) {
    return { recordAIUsage: async (input) => { transcriptionUsage = input; } };
  }
  if (request.startsWith("@/")) return originalLoad.call(this, path.join(__dirname, "..", request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.META_GRAPH_API_VERSION = "v24.0";
process.env.ALLOW_PRIVATE_CRAWL_FOR_TESTS = "true";
process.env.OPENAI_API_KEY = "test-key";
require("ts-node/register/transpile-only");

const { encryptMetaToken } = require("../lib/meta-security.ts");
const {
  analyzeMetaAttachment,
  instagramAttachmentDescriptor,
  unsupportedAttachment,
  whatsappAttachmentDescriptor,
} = require("../lib/meta-attachments.ts");

const image = whatsappAttachmentDescriptor({ type: "image", image: { id: "media-image", mime_type: "image/jpeg", caption: "Che prodotto è?" } });
assert.deepEqual(image, { type: "image", mediaId: "media-image", mimeType: "image/jpeg", caption: "Che prodotto è?" });
const document = whatsappAttachmentDescriptor({ type: "document", document: { id: "media-pdf", mime_type: "application/pdf", filename: "preventivo.pdf" } });
assert.equal(document.type, "document");
assert.equal(document.filename, "preventivo.pdf");
assert.equal(whatsappAttachmentDescriptor({ type: "text", text: { body: "ciao" } }), null);
assert.deepEqual(instagramAttachmentDescriptor({ type: "image", payload: { url: "https://cdn.example/image.jpg" } }), { type: "image", url: "https://cdn.example/image.jpg" });

const audioFallback = unsupportedAttachment({ type: "audio", mediaId: "audio-1" });
assert.equal(audioFallback.analyzed, false);
assert.equal(audioFallback.actionText, "");
assert.match(audioFallback.queryText, /non inventare il contenuto/i);

function smokePdf() {
  const text = "Documento PDF allegato con ordine numero 12345 e richiesta di assistenza.";
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

const originalFetch = global.fetch;
;(async () => {
const config = { accessTokenEncrypted: encryptMetaToken("meta-access-token"), connectedAt: new Date().toISOString() };
const pdf = smokePdf();
global.fetch = async (url) => {
  if (String(url).includes("media-pdf")) return new Response(JSON.stringify({ url: "https://cdn.example/document.pdf", mime_type: "application/pdf", file_size: pdf.length }), { status: 200, headers: { "Content-Type": "application/json" } });
  return new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.length) } });
};
const analyzedPdf = await analyzeMetaAttachment({ provider: "whatsapp", descriptor: document, config, botId: "00000000-0000-4000-8000-000000000001" });
assert.equal(analyzedPdf.analyzed, true);
assert.match(analyzedPdf.queryText, /ordine numero 12345/i);
assert.match(analyzedPdf.displayText, /preventivo\.pdf/);

const audio = Buffer.from("OggS-fake-opus-audio");
global.fetch = async (url) => {
  if (String(url).includes("media-audio")) return new Response(JSON.stringify({ url: "https://cdn.example/voice.ogg", mime_type: "audio/ogg; codecs=opus", file_size: audio.length }), { status: 200, headers: { "Content-Type": "application/json" } });
  return new Response(audio, { status: 200, headers: { "Content-Type": "audio/ogg", "Content-Length": String(audio.length) } });
};
const analyzedAudio = await analyzeMetaAttachment({ provider: "whatsapp", descriptor: { type: "audio", mediaId: "media-audio", mimeType: "audio/ogg; codecs=opus" }, config, botId: "00000000-0000-4000-8000-000000000001" });
assert.equal(analyzedAudio.analyzed, true);
assert.match(analyzedAudio.queryText, /prenotare domani alle sedici/i);
assert.equal(analyzedAudio.actionText, "Vorrei prenotare domani alle sedici");
assert.equal(transcriptionInput.model, "gpt-4o-mini-transcribe");
assert.equal(transcriptionInput.file.type, "audio/ogg");
assert.equal(transcriptionUsage.feature, "channel_attachment_transcription");

global.fetch = async () => new Response(JSON.stringify({ url: "https://cdn.example/large.pdf", mime_type: "application/pdf", file_size: 6 * 1024 * 1024 }), { status: 200, headers: { "Content-Type": "application/json" } });
await assert.rejects(
  () => analyzeMetaAttachment({ provider: "whatsapp", descriptor: { ...document, mediaId: "too-large" }, config, botId: "00000000-0000-4000-8000-000000000001" }),
  /5 MB/,
);
global.fetch = originalFetch;

console.log(JSON.stringify({ success: true, checks: 18 }, null, 2));
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exit(1);
});
