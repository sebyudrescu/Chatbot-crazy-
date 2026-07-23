import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function safeCell(value: unknown) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get("botId");
  const contacts = await prisma.cRMContact.findMany({
    where: botId && botId !== "all" ? { botId } : undefined,
    include: { chatbot: { select: { companyName: true } } },
    orderBy: { lastInteraction: "desc" },
    take: 50_000,
  });
  const headers = [
    "ID", "Agente", "Nome", "Email", "Telefono", "Azienda", "Fonte",
    "Fase", "Lead score", "Valore potenziale", "Consenso", "Tag",
    "Ultima interazione", "Creato il",
  ];
  const rows = contacts.map(contact => [
    contact.id,
    contact.chatbot.companyName,
    contact.name,
    contact.email,
    contact.phone,
    contact.company,
    contact.source,
    contact.stage,
    contact.leadScore,
    contact.potentialValue,
    contact.consentStatus,
    parseList(contact.tags).join(", "),
    contact.lastInteraction.toISOString(),
    contact.createdAt.toISOString(),
  ]);
  const csv = `\uFEFF${[headers, ...rows].map(row => row.map(safeCell).join(";")).join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatti-crm-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
