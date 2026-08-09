"use client";

import { CalendarDays, ExternalLink } from "lucide-react";
import { safeHttpUrl } from "@/components/chat/SafeRichText";

export interface ChatActionCard {
  id: string;
  label: string;
  action: string;
  type: string;
  variant?: string;
  metadata?: { title?: unknown; description?: unknown };
}

export function ActionCards({ actions }: { actions?: ChatActionCard[] }) {
  const valid = (actions || [])
    .flatMap((item) => {
      const href = safeHttpUrl(item.action);
      return href ? [{ ...item, href }] : [];
    })
    .slice(0, 3);
  if (!valid.length) return null;
  return (
    <div className="mt-2 grid gap-2">
      {valid.map((item) => {
        const title =
          typeof item.metadata?.title === "string" ? item.metadata.title : "";
        const description =
          typeof item.metadata?.description === "string"
            ? item.metadata.description
            : "";
        return (
          <section
            key={item.id}
            className="rounded-2xl border border-brand-100 bg-white p-3.5 shadow-sm"
          >
            {title || description ? (
              <div className="mb-3 flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  {title ? (
                    <h3 className="text-xs font-semibold text-gray-900">
                      {title}
                    </h3>
                  ) : null}
                  {description ? (
                    <p className="mt-0.5 text-[10px] leading-4 text-gray-500">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gray-950 px-3 text-[10px] font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2"
            >
              {item.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          </section>
        );
      })}
    </div>
  );
}
