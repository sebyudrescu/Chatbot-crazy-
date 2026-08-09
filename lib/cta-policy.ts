export interface SafeCTA {
  id: string;
  type: "button" | "link" | "form" | "banner";
  label: string;
  action: string;
  variant?: "primary" | "secondary" | "success" | "info";
  icon?: string;
  metadata?: Record<string, unknown>;
}

export function safeCtaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function configuredCtasOnly(ctas: SafeCTA[]) {
  const seen = new Set<string>();
  return ctas.filter((cta) => {
    const url = safeCtaUrl(cta.action);
    const label = cta.label?.trim();
    if (!url || !label || seen.has(url)) return false;
    cta.action = url;
    cta.label = label.slice(0, 100);
    if (cta.metadata) {
      cta.metadata = {
        ...(typeof cta.metadata.title === "string"
          ? { title: cta.metadata.title.trim().slice(0, 120) }
          : {}),
        ...(typeof cta.metadata.description === "string"
          ? { description: cta.metadata.description.trim().slice(0, 500) }
          : {}),
      };
    }
    seen.add(url);
    return true;
  });
}
