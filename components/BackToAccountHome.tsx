"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackToAccountHome({
  label = "Torna alla panoramica",
}: {
  label?: string;
}) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) =>
        setHref(result.data?.mode === "client" ? "/portal" : "/chatbots"),
      )
      .catch(() => setHref("/login"));
  }, []);

  if (!href)
    return (
      <span
        aria-hidden
        className="inline-flex h-9 w-9 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
      />
    );
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-brand-200 hover:text-brand-600"
    >
      <ChevronLeft className="h-4 w-4" />
    </Link>
  );
}
