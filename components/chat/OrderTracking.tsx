"use client";

import { useState, type FormEvent } from "react";
import { Box, CalendarDays, ChevronDown, ExternalLink, Loader2, Mail, MapPin, PackageCheck, Truck } from "lucide-react";
import type { OrderStatusCard } from "@/lib/commerce-types";

function safeUrl(value?: string) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function dateLabel(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(date);
}

const statusTone = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-sky-100 text-sky-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
} as const;

export function OrderLookupForm({ busy = false, onLookup }: { busy?: boolean; onLookup: (orderNumber: string, email: string) => void | Promise<void> }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const valid = /^[A-Za-z0-9#-]{2,40}$/.test(orderNumber.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    void onLookup(orderNumber.trim(), email.trim().toLowerCase());
    setOrderNumber("");
    setEmail("");
  };
  return <form onSubmit={submit} className="mt-2 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm" autoComplete="off">
    <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><PackageCheck className="h-4 w-4" /></div><div><p className="text-xs font-semibold text-gray-900">Controlla il tuo ordine</p><p className="mt-0.5 text-[10px] leading-4 text-gray-500">I dati servono solo per la verifica e non vengono salvati nella conversazione.</p></div></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-medium text-gray-600"><span className="mb-1 block">Numero ordine</span><span className="relative block"><Box className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" /><input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} maxLength={40} inputMode="text" placeholder="#1048" aria-label="Numero ordine" className="input w-full py-2 pl-9 text-xs" /></span></label><label className="text-[10px] font-medium text-gray-600"><span className="mb-1 block">Email dell’acquisto</span><span className="relative block"><Mail className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" /><input value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} type="email" inputMode="email" placeholder="nome@email.it" aria-label="Email usata per l’acquisto" className="input w-full py-2 pl-9 text-xs" /></span></label></div>
    <button type="submit" disabled={!valid || busy} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}{busy ? "Verifica in corso…" : "Controlla ordine"}</button>
  </form>;
}

export function OrderStatusCardView({ card }: { card?: OrderStatusCard }) {
  const [expanded, setExpanded] = useState(false);
  if (!card) return null;
  const hero = card.items.find((item) => safeUrl(item.imageUrl));
  const eta = dateLabel(card.estimatedDeliveryAt);
  const detailsId = `order-details-${card.orderNumber.replace(/[^a-z0-9]/gi, "")}`;
  return <article className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label={`Stato ${card.orderNumber}`}>
    {hero?.imageUrl ? <div role="img" aria-label={hero.title} className="h-36 w-full bg-gray-100 bg-cover bg-center" style={{ backgroundImage: `url(${safeUrl(hero.imageUrl)})` }} /> : null}
    <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-medium text-gray-500">{card.storeName}</p><h3 className="mt-1 truncate text-sm font-bold text-gray-950">{card.items.length === 1 ? card.items[0].title : `${card.items.length} articoli`}</h3><p className="mt-0.5 text-[11px] text-gray-500">Ordine {card.orderNumber}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusTone[card.status.tone]}`}>{card.status.label}</span></div>
      <div className="mt-4 grid grid-cols-5 gap-1" aria-label={`Avanzamento: ${card.status.label}`}>{card.milestones.map((milestone) => <div key={milestone.key} className="min-w-0"><span className={`block h-1.5 rounded-full ${milestone.state === "complete" ? "bg-emerald-500" : milestone.state === "current" ? "bg-brand-600" : milestone.state === "attention" ? "bg-amber-500" : "bg-gray-200"}`} /><span className="mt-1 hidden truncate text-[8px] text-gray-400 sm:block">{milestone.label}</span></div>)}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3"><div>{eta ? <><p className="text-[9px] uppercase tracking-wide text-gray-400">Consegna stimata</p><p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-gray-900"><CalendarDays className="h-3.5 w-3.5 text-brand-600" />{eta}</p></> : <p className="text-[10px] text-gray-500">{card.shipments.length ? `${card.shipments.length} ${card.shipments.length === 1 ? "spedizione" : "spedizioni"}` : "Tracking non ancora disponibile"}</p>}</div><button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-[10px] font-semibold text-gray-700 hover:bg-gray-50">{expanded ? "Nascondi" : "Mostra dettagli"}<ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} /></button></div>
    </div>
    {expanded ? <div id={detailsId} className="border-t border-gray-100 bg-gray-50/70 p-4"><section><h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Articoli</h4><div className="mt-2 space-y-2">{card.items.map((item, index) => <div key={`${item.title}-${index}`} className="flex items-center gap-3 rounded-xl bg-white p-2.5"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">{safeUrl(item.imageUrl) ? <span role="img" aria-label={item.title} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${safeUrl(item.imageUrl)})` }} /> : <Box className="h-4 w-4 text-gray-300" />}</div><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-gray-900">{item.title}</p><p className="mt-0.5 text-[9px] text-gray-500">{item.variantTitle ? `${item.variantTitle} · ` : ""}Quantità {item.quantity}</p></div></div>)}</div></section>
      {card.shipments.length ? <section className="mt-4"><h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Spedizioni</h4><div className="mt-2 space-y-2">{card.shipments.map((shipment, index) => <div key={`${shipment.label}-${index}`} className="rounded-xl bg-white p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-gray-900">{shipment.label}</p><span className="text-[9px] font-medium text-gray-500">{shipment.statusLabel}</span></div>{shipment.estimatedDeliveryAt ? <p className="mt-1 text-[9px] text-gray-500">Consegna stimata: {dateLabel(shipment.estimatedDeliveryAt)}</p> : null}{shipment.tracking.map((tracking, trackingIndex) => <div key={`${tracking.number || tracking.url}-${trackingIndex}`} className="mt-2 border-t border-gray-100 pt-2 text-[9px] text-gray-600">{tracking.carrier ? <p>Corriere: <strong>{tracking.carrier}</strong></p> : null}{tracking.number ? <p className="mt-0.5">Tracking: <strong>{tracking.number}</strong></p> : null}</div>)}</div>)}</div></section> : null}
      {card.actions.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{card.actions.map((action, index) => { const href = safeUrl(action.url); return href ? <a key={`${action.type}-${index}`} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-gray-950 px-3 text-[10px] font-semibold text-white hover:bg-gray-800">{action.type === "track" ? <MapPin className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}{action.label}</a> : null; })}</div> : null}
    </div> : null}
  </article>;
}

