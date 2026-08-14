"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  resolveWidgetBinding,
  type WidgetDefinition,
} from "@/lib/widget-definition";
import {
  LeadCaptureForm,
} from "./LeadCaptureForm";
import { OrderLookupForm } from "./OrderTracking";
import { ProductCarousel } from "./ProductCarousel";
import { productCardsSchema } from "@/lib/commerce-types";

export interface DeclarativeWidgetPayload {
  id: string;
  actionId: string;
  definition: WidgetDefinition;
  data: Record<string, unknown>;
}

interface Props {
  widget: DeclarativeWidgetPayload;
  botId?: string;
  conversationId?: string | null;
  userSessionId?: string;
  onSendMessage?: (message: string) => void;
  onClientEvent?: (eventName: string, args: Record<string, unknown>) => void;
}

function safeLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, window.location.origin);
    const sameOrigin = url.origin === window.location.origin;
    return url.protocol === "https:" || sameOrigin ? url.toString() : null;
  } catch {
    return null;
  }
}

function display(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sì" : "No";
  return "";
}

export function DeclarativeWidget({
  widget,
  botId,
  conversationId,
  userSessionId,
  onSendMessage,
  onClientEvent,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [activeState, setActiveState] = useState(
    widget.definition.states.find((state) => state.initial)?.id || "",
  );
  const [busyFunction, setBusyFunction] = useState("");
  const [error, setError] = useState("");
  const functions = useMemo(
    () => new Map(widget.definition.functions.map((fn) => [fn.id, fn])),
    [widget.definition.functions],
  );
  const state = widget.definition.states.find((item) => item.id === activeState);
  const visible = state?.visibleNodeIds.length ? new Set(state.visibleNodeIds) : null;
  if (dismissed) return null;

  const resolve = (binding?: WidgetDefinition["root"]["binding"]) =>
    binding
      ? resolveWidgetBinding(binding, {
          data: widget.data,
          state: variables,
          context: { botId, conversationId },
        })
      : undefined;

  const run = async (functionId: string) => {
    const fn = functions.get(functionId);
    if (!fn || busyFunction) return;
    const args = Object.fromEntries(
      fn.inputs.map((input) => [input.name, resolve(input.binding)]),
    );
    setError("");
    setBusyFunction(functionId);
    try {
      if (fn.type === "open_link") {
        const url = safeLink(args.url ?? fn.config.url);
        if (!url) throw new Error("Link non valido");
        window.open(url, "_blank", "noopener,noreferrer");
      } else if (fn.type === "send_message") {
        const message = display(args.message ?? fn.config.message).trim();
        if (!message) throw new Error("Messaggio non valido");
        onSendMessage?.(message);
      } else if (fn.type === "dismiss") {
        setDismissed(true);
      } else if (fn.type === "set_variables") {
        const name = fn.config.variable;
        if (!name) throw new Error("Variabile non configurata");
        setVariables((current) => ({ ...current, [name]: args.value }));
      } else if (fn.type === "client_event") {
        const eventName = fn.config.eventName || "litx:widget-action";
        const detail = { widgetId: widget.id, functionId, args };
        window.dispatchEvent(new CustomEvent("litx:widget-action", { detail }));
        window.postMessage(
          { type: "WIDGET_ACTION_CALL", functionName: fn.id, args },
          window.location.origin,
        );
        onClientEvent?.(eventName, args);
      } else if (fn.type === "server_action") {
        const response = await fetch(
          `/api/actions/${encodeURIComponent(widget.actionId)}/widget-functions/${encodeURIComponent(fn.id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invocationId: crypto.randomUUID(),
              data: widget.data,
              state: variables,
              context: { botId, conversationId: conversationId || undefined },
            }),
          },
        );
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Funzione non riuscita");
        if (fn.waitForResponse && result.data && typeof result.data === "object") {
          setVariables((current) => ({ ...current, ...result.data }));
        }
      }
      if (fn.config.nextState) setActiveState(fn.config.nextState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Azione non riuscita");
    } finally {
      setBusyFunction("");
    }
  };

  const renderNode = (node: WidgetDefinition["root"]): React.ReactNode => {
    if (visible && node.id !== widget.definition.root.id && !visible.has(node.id)) return null;
    const bound = resolve(node.binding);
    const text = display(bound ?? node.text);
    const children = node.children.map((child: WidgetDefinition["root"]) => renderNode(child));
    if (node.type === "stack" || node.type === "card") {
      return <div key={node.id} className={node.type === "card" ? "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" : "space-y-3"}>{children}</div>;
    }
    if (node.type === "row") return <div key={node.id} className="flex flex-wrap items-center gap-3">{children}</div>;
    if (node.type === "title") return <h3 key={node.id} className="text-sm font-bold text-gray-950">{text}</h3>;
    if (node.type === "text") return <p key={node.id} className="text-xs leading-5 text-gray-600">{text}</p>;
    if (node.type === "badge") return <span key={node.id} className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">{text}</span>;
    if (node.type === "image") {
      const url = safeLink(bound);
      return url ? <Image key={node.id} unoptimized src={url} alt={node.props.alt || ""} width={960} height={640} className="max-h-64 w-full rounded-xl object-cover" /> : null;
    }
    if (node.type === "button") return (
      <button key={node.id} type="button" disabled={!node.functionId || Boolean(busyFunction)} onClick={() => node.functionId && void run(node.functionId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white disabled:opacity-50">
        {busyFunction === node.functionId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {text || functions.get(node.functionId || "")?.label || "Continua"}
        {functions.get(node.functionId || "")?.type === "open_link" ? <ExternalLink className="h-3.5 w-3.5" /> : null}
      </button>
    );
    if (node.type === "input") return <input key={node.id} className="input text-xs" placeholder={node.props.placeholder} value={display(variables[node.props.field || node.id])} onChange={(event) => setVariables((current) => ({ ...current, [node.props.field || node.id]: event.target.value }))} />;
    if (node.type === "checkbox") return <label key={node.id} className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={Boolean(variables[node.props.field || node.id])} onChange={(event) => setVariables((current) => ({ ...current, [node.props.field || node.id]: event.target.checked }))} />{text}</label>;
    if (node.type === "product_carousel") {
      const parsedProducts = productCardsSchema.safeParse(widget.data.products);
      return parsedProducts.success ? (
        <ProductCarousel
          key={node.id}
          cards={parsedProducts.data}
          presentation={{
            title: display(widget.definition.defaults.title),
            description: display(widget.definition.defaults.body),
            label: display(widget.definition.defaults.label),
          }}
        />
      ) : null;
    }
    if (node.type === "lead_form" && botId && conversationId && userSessionId) {
      return (
        <LeadCaptureForm
          key={node.id}
          botId={botId}
          conversationId={conversationId}
          userSessionId={userSessionId}
          definition={{
            id: widget.id,
            title: display(widget.definition.defaults.title) || widget.definition.name,
            description: display(widget.definition.defaults.body),
            fields: widget.definition.schema.map((field) => field.name),
            submitLabel: display(widget.definition.defaults.label) || "Invia richiesta",
          }}
        />
      );
    }
    if (node.type === "order_tracking") {
      return <OrderLookupForm key={node.id} busy={Boolean(busyFunction)} onLookup={(orderNumber, email) => onSendMessage?.(`Ordine ${orderNumber}, ${email}`)} />;
    }
    if (node.type === "appointment") {
      const appointmentFunction = widget.definition.functions.find((fn) => fn.type === "open_link");
      return <div key={node.id} className="rounded-2xl border border-gray-200 bg-white p-4"><p className="text-sm font-bold text-gray-900">{display(widget.definition.defaults.title)}</p><p className="mt-1 text-xs text-gray-500">{display(widget.definition.defaults.body)}</p>{appointmentFunction ? <button type="button" onClick={() => void run(appointmentFunction.id)} className="mt-3 min-h-10 w-full rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white">{appointmentFunction.label}</button> : null}</div>;
    }
    return null;
  };

  return (
    <section className="mt-2" aria-label={widget.definition.name}>
      {renderNode(widget.definition.root)}
      {error ? <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-[10px] text-red-700">{error}</p> : null}
    </section>
  );
}
