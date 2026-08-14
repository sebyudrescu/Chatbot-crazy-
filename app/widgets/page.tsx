"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  Code2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ContactRound,
  Eye,
  FormInput,
  Layers3,
  Loader2,
  PackageSearch,
  PanelTop,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShoppingBag,
  Sparkles,
  ToggleLeft,
  Trash2,
  Upload,
  Copy,
  Workflow,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { DeclarativeWidget } from "@/components/chat/DeclarativeWidget";
import {
  defaultWidgetDefinition,
  WidgetDefinitionSchema,
  type WidgetDefinition,
} from "@/lib/widget-definition";

type TemplateId =
  "product_carousel" | "lead_capture" | "appointment" | "order_tracking";
type TabId = "builder" | "schema" | "functions" | "states" | "code";

interface Agent {
  id: string;
  companyName: string;
}

interface WidgetAction {
  id: string;
  name: string;
  type: "show_widget" | "api_widget";
  description?: string | null;
  triggerKeywords: string[];
  config: Record<string, unknown>;
  enabled: boolean;
}

interface WidgetVersionItem {
  id: string;
  version: number;
  changeSummary: string;
  createdAt: string;
  definition: WidgetDefinition;
}

interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  keywords: string[];
  title: string;
  body: string;
  label: string;
  schema: string[];
  functions: string[];
  states: string[];
}

interface WidgetForm {
  name: string;
  description: string;
  keywords: string;
  title: string;
  body: string;
  label: string;
  url: string;
  apiUrl: string;
  apiMethod: "GET" | "POST" | "PUT" | "PATCH";
  responsePath: string;
  bodyTemplate: string;
  enabled: boolean;
}

const templates: TemplateDefinition[] = [
  {
    id: "product_carousel",
    name: "Prodotti",
    description: "Consigli verificati, varianti e aggiunta al carrello.",
    icon: ShoppingBag,
    color: "bg-violet-50 text-violet-700",
    keywords: ["mostrami i prodotti", "cosa mi consigli", "voglio acquistare"],
    title: "Scelti per te",
    body: "Sfoglia i prodotti verificati e apri quello che preferisci.",
    label: "Aggiungi al carrello",
    schema: [
      "id",
      "title",
      "description",
      "reason",
      "image",
      "price",
      "productUrl",
      "availability",
    ],
    functions: ["Apri prodotto", "Aggiungi al carrello"],
    states: [
      "Raccogli preferenze",
      "Cerca catalogo",
      "Mostra risultati",
      "Conferma carrello",
    ],
  },
  {
    id: "lead_capture",
    name: "Raccolta lead",
    description: "Modulo con consenso per qualificare un contatto.",
    icon: ContactRound,
    color: "bg-emerald-50 text-emerald-700",
    keywords: [
      "voglio essere contattato",
      "richiedi informazioni",
      "parlare con voi",
    ],
    title: "Parliamo del tuo progetto",
    body: "Lascia i tuoi contatti: il team ti risponderà al più presto.",
    label: "Invia richiesta",
    schema: ["name", "email", "phone", "company", "consent"],
    functions: ["Valida contatto", "Salva lead", "Conferma invio"],
    states: ["Presenta modulo", "Raccogli consenso", "Valida dati", "Conferma"],
  },
  {
    id: "appointment",
    name: "Appuntamento",
    description: "CTA sicura verso il calendario autorizzato.",
    icon: CalendarDays,
    color: "bg-sky-50 text-sky-700",
    keywords: ["prenota appuntamento", "fissare una chiamata", "disponibilità"],
    title: "Prenota un appuntamento",
    body: "Scegli il giorno e l’orario più comodi dal calendario.",
    label: "Apri il calendario",
    schema: ["title", "description", "label", "url"],
    functions: ["Apri link verificato", "Registra clic"],
    states: ["Proponi appuntamento", "Apri calendario", "Attendi conferma"],
  },
  {
    id: "order_tracking",
    name: "Tracking ordine",
    description: "Richiede numero ordine ed email in modo protetto.",
    icon: PackageSearch,
    color: "bg-amber-50 text-amber-700",
    keywords: ["dov’è il mio ordine", "traccia ordine", "stato spedizione"],
    title: "Controlla il tuo ordine",
    body: "Inserisci numero ordine ed email usata durante l’acquisto.",
    label: "Controlla ordine",
    schema: ["orderNumber", "email", "consent"],
    functions: ["Verifica identità", "Cerca ordine", "Mostra stato"],
    states: [
      "Raccogli dati",
      "Verifica cliente",
      "Recupera ordine",
      "Mostra dettagli",
    ],
  },
];

const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "builder", label: "AI Builder", icon: Sparkles },
  { id: "schema", label: "Schema", icon: FormInput },
  { id: "functions", label: "Funzioni", icon: Settings2 },
  { id: "states", label: "Stati", icon: Workflow },
  { id: "code", label: "Code / DSL", icon: Code2 },
];

function templateById(value?: string) {
  return templates.find((template) => template.id === value) || templates[0];
}

function createForm(template: TemplateDefinition): WidgetForm {
  return {
    name: `Widget ${template.name}`,
    description: template.description,
    keywords: template.keywords.join(", "),
    title: template.title,
    body: template.body,
    label: template.label,
    url: "",
    apiUrl: "",
    apiMethod: "GET",
    responsePath: "",
    bodyTemplate: "{}",
    enabled: true,
  };
}

function parseKeywords(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export default function WidgetsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [botId, setBotId] = useState("");
  const [widgets, setWidgets] = useState<WidgetAction[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [actionType, setActionType] = useState<"show_widget" | "api_widget">("show_widget");
  const [templateId, setTemplateId] = useState<TemplateId>("product_carousel");
  const [activeTab, setActiveTab] = useState<TabId>("builder");
  const [form, setForm] = useState<WidgetForm>(() => createForm(templates[0]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [definition, setDefinition] = useState<WidgetDefinition>(() =>
    defaultWidgetDefinition("product_carousel"),
  );
  const [definitionJson, setDefinitionJson] = useState(() =>
    JSON.stringify(defaultWidgetDefinition("product_carousel"), null, 2),
  );
  const [aiProposal, setAiProposal] = useState<null | {
    definition: WidgetDefinition;
    template: TemplateId;
    name: string;
    description: string;
    title: string;
    body: string;
    label: string;
    triggerKeywords: string[];
    diff: string[];
  }>(null);
  const [versions, setVersions] = useState<WidgetVersionItem[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [galleryMode, setGalleryMode] = useState<"gallery" | "mine">("gallery");
  const [gallerySearch, setGallerySearch] = useState("");
  const [previewMode, setPreviewMode] = useState<"widget" | "bubble" | "page">("widget");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedTemplate = useMemo(
    () => templateById(templateId),
    [templateId],
  );
  const previewDefinition = useMemo(() => {
    const parsed = WidgetDefinitionSchema.safeParse({
      ...definition,
      defaults: {
        ...definition.defaults,
        title: form.title,
        body: form.body,
        label: form.label,
        ...(form.url ? { url: form.url } : {}),
      },
    });
    return parsed.success ? parsed.data : defaultWidgetDefinition(templateId, { title: form.title, body: form.body, label: form.label, url: form.url || undefined });
  }, [definition, form.body, form.label, form.title, form.url, templateId]);
  const visibleTemplates = useMemo(() => templates.filter((template) => `${template.name} ${template.description}`.toLowerCase().includes(gallerySearch.toLowerCase())), [gallerySearch]);
  const visibleWidgets = useMemo(() => widgets.filter((widget) => `${widget.name} ${widget.description || ""}`.toLowerCase().includes(gallerySearch.toLowerCase())), [gallerySearch, widgets]);

  const updateDefinition = useCallback((next: WidgetDefinition) => {
    setDefinition(next);
    setDefinitionJson(JSON.stringify(next, null, 2));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    const loadVersions = async () => {
      try {
        const response = await fetch(`/api/actions/${selectedId}/widget-versions`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Cronologia non disponibile");
        if (!cancelled) setVersions(result.data || []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Cronologia non disponibile");
      }
    };
    void loadVersions();
    return () => { cancelled = true; };
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    const loadAgents = async () => {
      try {
        const response = await fetch("/api/chatbots");
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Impossibile caricare gli agenti");
        const list = (result.data || []) as Agent[];
        if (!cancelled) {
          setAgents(list);
          setBotId((current) => current || list[0]?.id || "");
        }
      } catch (caught) {
        if (!cancelled)
          setError(
            caught instanceof Error ? caught.message : "Errore di caricamento",
          );
      }
    };
    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadWidgets = useCallback(async () => {
    if (!botId) {
      setWidgets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/actions?botId=${encodeURIComponent(botId)}`,
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Impossibile caricare i widget");
      setWidgets(
        ((result.data || []) as WidgetAction[]).filter(
          (action) => action.type === "show_widget" || action.type === "api_widget",
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Errore di caricamento",
      );
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    setSelectedId("");
    setActionType("show_widget");
    void loadWidgets();
  }, [loadWidgets]);

  const startNew = useCallback((template: TemplateDefinition) => {
    const nextDefinition = defaultWidgetDefinition(template.id, {
      title: template.title,
      body: template.body,
      label: template.label,
    });
    setSelectedId("");
    setTemplateId(template.id);
    setForm(createForm(template));
    setDefinition(nextDefinition);
    setDefinitionJson(JSON.stringify(nextDefinition, null, 2));
    setAiProposal(null);
    setActiveTab("builder");
    setError("");
    setNotice("");
  }, []);

  const editWidget = useCallback((widget: WidgetAction) => {
    const template = templateById(typeof widget.config.template === "string" ? widget.config.template : undefined);
    const parsedDefinition = WidgetDefinitionSchema.safeParse(widget.config.definition);
    const nextDefinition = parsedDefinition.success
      ? parsedDefinition.data
      : defaultWidgetDefinition(template.id, {
          title: typeof widget.config.title === "string" ? widget.config.title : template.title,
          body: typeof widget.config.description === "string" ? widget.config.description : template.body,
          label: typeof widget.config.label === "string" ? widget.config.label : template.label,
          url: typeof widget.config.url === "string" ? widget.config.url : undefined,
        });
    setSelectedId(widget.id);
    setActionType(widget.type);
    setTemplateId(template.id);
    setForm({
      name: widget.name,
      description: widget.description || template.description,
      keywords: widget.triggerKeywords.join(", "),
      title: typeof widget.config.title === "string" ? widget.config.title : template.title,
      body: typeof widget.config.description === "string" ? widget.config.description : template.body,
      label: typeof widget.config.label === "string" ? widget.config.label : template.label,
      url: typeof widget.config.url === "string" ? widget.config.url : "",
      apiUrl: widget.type === "api_widget" && typeof widget.config.url === "string" ? widget.config.url : "",
      apiMethod: ["GET", "POST", "PUT", "PATCH"].includes(String(widget.config.method)) ? widget.config.method as WidgetForm["apiMethod"] : "GET",
      responsePath: typeof widget.config.responsePath === "string" ? widget.config.responsePath : "",
      bodyTemplate: typeof widget.config.bodyTemplate === "string" ? widget.config.bodyTemplate : "{}",
      enabled: widget.enabled,
    });
    setDefinition(nextDefinition);
    setDefinitionJson(JSON.stringify(nextDefinition, null, 2));
    setAiProposal(null);
    setActiveTab("builder");
    setError("");
    setNotice("");
  }, []);

  const saveWidget = async () => {
    const triggerKeywords = parseKeywords(form.keywords);
    if (!botId || !form.name.trim() || triggerKeywords.length === 0) {
      setError("Seleziona un agente e completa nome e parole di attivazione.");
      return;
    }
    if (templateId === "appointment" && !/^https:\/\//i.test(form.url.trim())) {
      setError("Il widget appuntamento richiede un URL HTTPS valido.");
      return;
    }
    if (actionType === "api_widget" && !/^https:\/\//i.test(form.apiUrl.trim())) {
      setError("API + Widget richiede un URL HTTPS valido.");
      return;
    }
    let validatedDefinition: WidgetDefinition;
    try {
      const parsed = WidgetDefinitionSchema.parse(JSON.parse(definitionJson));
      validatedDefinition = WidgetDefinitionSchema.parse({
        ...parsed,
        template: parsed.template === "custom" ? "custom" : templateId,
        defaults: {
          ...parsed.defaults,
          title: form.title.trim(),
          body: form.body.trim(),
          label: form.label.trim(),
          ...(form.url.trim() ? { url: form.url.trim() } : {}),
        },
        functions: parsed.functions.map((fn) =>
          templateId === "appointment" && fn.type === "open_link"
            ? {
                ...fn,
                inputs: fn.inputs.map((input) =>
                  input.name === "url"
                    ? { ...input, binding: { ...input.binding, fallback: form.url.trim() } }
                    : input,
                ),
              }
            : fn,
        ),
      });
    } catch {
      setError("La definizione dichiarativa non è valida. Controlla lo Schema prima di salvare.");
      return;
    }
    setDefinition(validatedDefinition);
    setSaving(true);
    setError("");
    setNotice("");
    const config: Record<string, unknown> = {
      template: validatedDefinition.template,
      title: form.title.trim(),
      description: form.body.trim(),
      label: form.label.trim(),
      rendererVersion: "1",
      definition: validatedDefinition,
    };
    if (templateId === "appointment") config.url = form.url.trim();
    if (actionType === "api_widget") {
      config.url = form.apiUrl.trim();
      config.method = form.apiMethod;
      config.responsePath = form.responsePath.trim();
      if (form.apiMethod !== "GET") config.bodyTemplate = form.bodyTemplate.trim() || "{}";
    }
    try {
      const response = await fetch(
        selectedId ? `/api/actions/${selectedId}` : "/api/actions",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(!selectedId ? { botId } : {}),
            name: form.name.trim(),
            type: actionType,
            description: form.description.trim() || null,
            triggerKeywords,
            config,
            enabled: form.enabled,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Salvataggio non riuscito");
      setSelectedId(result.data.id);
      setNotice(
        selectedId
          ? "Widget aggiornato e pronto all’uso."
          : "Widget creato e pronto all’uso.",
      );
      await loadWidgets();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Salvataggio non riuscito",
      );
    } finally {
      setSaving(false);
    }
  };

  const generateWithAI = async () => {
    if (!botId || aiPrompt.trim().length < 12) {
      setError(
        "Seleziona un agente e descrivi il widget con almeno 12 caratteri.",
      );
      return;
    }
    setAiGenerating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/widgets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          prompt: aiPrompt.trim(),
          currentTemplate: templateId,
          currentDefinition: definition,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Generazione non riuscita");
      const generated = result.data as {
        template: TemplateId;
        name: string;
        description: string;
        title: string;
        body: string;
        label: string;
        triggerKeywords: string[];
        definition: WidgetDefinition;
        diff: string[];
      };
      setAiProposal(generated);
      setNotice("Proposta pronta: controlla le modifiche e approvala prima di applicarla.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Generazione non riuscita",
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const approveAiProposal = () => {
    if (!aiProposal) return;
    setSelectedId("");
    setTemplateId(aiProposal.template);
    setDefinition(aiProposal.definition);
    setDefinitionJson(JSON.stringify(aiProposal.definition, null, 2));
    setForm((current) => ({
      ...current,
      name: aiProposal.name,
      description: aiProposal.description,
      title: aiProposal.title,
      body: aiProposal.body,
      label: aiProposal.label,
      keywords: aiProposal.triggerKeywords.join(", "),
    }));
    setAiProposal(null);
    setNotice("Proposta approvata localmente. Salva il widget per renderla operativa.");
  };

  const updateForm = <Key extends keyof WidgetForm>(
    key: Key,
    value: WidgetForm[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyDefinitionCandidate = (candidate: WidgetDefinition) => {
    setError("");
    updateDefinition(candidate);
  };

  const moveItem = <Item,>(items: Item[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  const addSchemaField = () => {
    const name = `field${definition.schema.length + 1}`;
    applyDefinitionCandidate({
      ...definition,
      schema: [...definition.schema, { name, type: "string", label: `Campo ${definition.schema.length + 1}`, required: false }],
    });
  };

  const addFunction = () => {
    const id = `function_${definition.functions.length + 1}`;
    applyDefinitionCandidate({
      ...definition,
      functions: [...definition.functions, { id, label: "Nuova funzione", type: "dismiss", inputs: [], returns: [], waitForResponse: false, config: {} }],
    });
  };

  const updateFunctionAt = (index: number, next: WidgetDefinition["functions"][number]) => {
    applyDefinitionCandidate({ ...definition, functions: definition.functions.map((item, itemIndex) => itemIndex === index ? next : item) });
  };

  const addFunctionInput = (index: number) => {
    const fn = definition.functions[index];
    updateFunctionAt(index, { ...fn, inputs: [...fn.inputs, { name: `input${fn.inputs.length + 1}`, binding: { source: "data", path: "" } }] });
  };

  const addFunctionReturn = (index: number) => {
    const fn = definition.functions[index];
    updateFunctionAt(index, { ...fn, returns: [...fn.returns, { name: `result${fn.returns.length + 1}`, type: "string", label: `Risultato ${fn.returns.length + 1}`, required: false }] });
  };

  const addState = () => {
    const id = `state_${definition.states.length + 1}`;
    applyDefinitionCandidate({
      ...definition,
      states: [...definition.states, { id, label: `Stato ${definition.states.length + 1}`, initial: definition.states.length === 0, visibleNodeIds: [definition.root.id] }],
    });
  };

  const restoreVersion = async (version: number) => {
    if (!selectedId || versionLoading) return;
    setVersionLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/actions/${selectedId}/widget-versions/${version}/restore`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ripristino non riuscito");
      const selected = versions.find((item) => item.version === version);
      if (selected) updateDefinition(WidgetDefinitionSchema.parse(selected.definition));
      setNotice(`Versione ${version} ripristinata e resa operativa.`);
      await loadWidgets();
      const versionsResponse = await fetch(`/api/actions/${selectedId}/widget-versions`);
      const versionsResult = await versionsResponse.json();
      if (versionsResponse.ok) setVersions(versionsResult.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ripristino non riuscito");
    } finally {
      setVersionLoading(false);
    }
  };

  const duplicateCurrent = () => {
    if (!selectedId) return;
    setSelectedId("");
    setForm((current) => ({ ...current, name: `${current.name} — copia` }));
    setVersions([]);
    setNotice("Copia creata come bozza. Salvala per aggiungerla ai tuoi widget.");
  };

  const importDefinition = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) { setError("Il file JSON supera 200 KB."); return; }
    try {
      const raw = JSON.parse(await file.text());
      const imported = WidgetDefinitionSchema.parse(raw.definition || raw);
      const template = templateById(imported.template === "custom" ? "product_carousel" : imported.template);
      setSelectedId("");
      setActionType(raw.type === "api_widget" ? "api_widget" : "show_widget");
      setTemplateId(template.id);
      updateDefinition(imported);
      setForm({
        ...createForm(template),
        name: imported.name,
        description: imported.description,
        title: String(imported.defaults.title || template.title),
        body: String(imported.defaults.body || template.body),
        label: String(imported.defaults.label || template.label),
        apiUrl: typeof raw.url === "string" ? raw.url : "",
        apiMethod: ["GET", "POST", "PUT", "PATCH"].includes(raw.method) ? raw.method : "GET",
        responsePath: typeof raw.responsePath === "string" ? raw.responsePath : "",
        bodyTemplate: typeof raw.bodyTemplate === "string" ? raw.bodyTemplate : "{}",
      });
      setNotice("Widget importato e validato. Salvalo per renderlo operativo.");
    } catch (caught) {
      setError(caught instanceof Error ? `Import non valido: ${caught.message}` : "Import non valido");
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="eyebrow">Esperienze interattive</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
              Studio Widget
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Crea esperienze sicure dentro la chat usando template, dati e
              funzioni autorizzate.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_auto]">
            <label className="sr-only" htmlFor="widget-agent">
              Agente
            </label>
            <select
              id="widget-agent"
              className="input min-w-0 text-sm"
              value={botId}
              onChange={(event) => setBotId(event.target.value)}
            >
              {agents.length === 0 ? (
                <option value="">Nessun agente disponibile</option>
              ) : null}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.companyName}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="saved-widget">
              Widget salvato
            </label>
            <select
              id="saved-widget"
              className="input min-w-0 text-sm"
              value={selectedId}
              onChange={(event) => {
                const widget = widgets.find(
                  (item) => item.id === event.target.value,
                );
                if (widget) editWidget(widget);
                else startNew(selectedTemplate);
              }}
              disabled={!botId || loading}
            >
              <option value="">Nuovo widget</option>
              {widgets.map((widget) => (
                <option key={widget.id} value={widget.id}>
                  {widget.name}
                </option>
              ))}
            </select>
            <Button
              onClick={() => startNew(selectedTemplate)}
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
            >
              Nuovo
            </Button>
          </div>
        </header>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            <Check className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
          <aside
            className="card h-fit p-4"
            aria-label="Galleria template widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Galleria</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  Scegli una base sicura
                </p>
              </div>
              <Layers3 className="h-4 w-4 text-brand-600" />
            </div>
            <div className="mt-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-[10px] font-semibold">
              <button type="button" className={`rounded-md px-2 py-1.5 ${galleryMode === "gallery" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`} onClick={() => setGalleryMode("gallery")}>Galleria</button>
              <button type="button" className={`rounded-md px-2 py-1.5 ${galleryMode === "mine" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`} onClick={() => setGalleryMode("mine")}>I miei widget</button>
            </div>
            <input className="input mt-3 text-xs" value={gallerySearch} onChange={(event) => setGallerySearch(event.target.value)} placeholder="Cerca widget…" aria-label="Cerca widget" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="btn btn-secondary btn-sm cursor-pointer"><Upload className="h-3.5 w-3.5" />Importa<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importDefinition(event)} /></label>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!selectedId} onClick={duplicateCurrent}><Copy className="h-3.5 w-3.5" />Duplica</button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {galleryMode === "gallery" ? visibleTemplates.map((template) => {
                const Icon = template.icon;
                const selected = template.id === templateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => startNew(template)}
                    aria-pressed={selected}
                    className={`rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${selected ? "border-brand-300 bg-brand-50/70 shadow-sm" : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"}`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${template.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-gray-900">
                      {template.name}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-gray-500">
                      {template.description}
                    </span>
                  </button>
                );
              }) : visibleWidgets.map((widget) => (
                <button key={widget.id} type="button" onClick={() => editWidget(widget)} className={`rounded-xl border p-3 text-left transition ${selectedId === widget.id ? "border-brand-300 bg-brand-50/70" : "border-gray-100 hover:bg-gray-50"}`}>
                  <span className="block text-xs font-semibold text-gray-900">{widget.name}</span>
                  <span className="mt-1 block text-[10px] text-gray-500">{widget.type === "api_widget" ? "API + Widget" : "Widget LitX"}</span>
                </button>
              ))}
            </div>
            {loading ? (
              <p className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Caricamento widget…
              </p>
            ) : (
              <p className="mt-4 text-[11px] text-gray-400">
                {widgets.length} widget salvati per questo agente
              </p>
            )}
          </aside>

          <section
            className="card min-w-0 overflow-hidden"
            aria-labelledby="builder-title"
          >
            <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600">
                    {selectedId ? "Modifica widget" : "Nuovo widget"}
                  </p>
                  <h2
                    id="builder-title"
                    className="mt-1 text-lg font-bold text-gray-950"
                  >
                    {form.name || selectedTemplate.name}
                  </h2>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.enabled}
                    onChange={(event) =>
                      updateForm("enabled", event.target.checked)
                    }
                  />
                  <span
                    className={`relative h-5 w-9 rounded-full transition ${form.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${form.enabled ? "left-[18px]" : "left-0.5"}`}
                    />
                  </span>
                  {form.enabled ? "Attivo" : "Bozza"}
                </label>
              </div>
              <div
                className="flex gap-1 overflow-x-auto"
                role="tablist"
                aria-label="Sezioni del widget"
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${activeTab === tab.id ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {activeTab === "builder" ? (
                <div className="space-y-5">
                  <section
                    className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-white p-4 sm:p-5"
                    aria-labelledby="ai-builder-title"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3
                          id="ai-builder-title"
                          className="text-sm font-bold text-gray-950"
                        >
                          Descrivi l’esperienza
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          L’AI prepara un widget usando esclusivamente
                          componenti e funzioni LitX autorizzati. Non genera
                          codice eseguibile.
                        </p>
                      </div>
                    </div>
                    <textarea
                      className="textarea mt-4 min-h-24"
                      value={aiPrompt}
                      maxLength={3000}
                      onChange={(event) => setAiPrompt(event.target.value)}
                      placeholder="Es. crea una card prodotti elegante che chieda prima budget e preferenze e consenta di aggiungere la variante scelta al carrello"
                    />
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        onClick={() => void generateWithAI()}
                        loading={aiGenerating}
                        disabled={!botId || aiPrompt.trim().length < 12}
                        icon={<Sparkles className="h-4 w-4" />}
                      >
                        Genera proposta
                      </Button>
                    </div>
                    {aiProposal ? (
                      <div className="mt-4 rounded-xl border border-brand-200 bg-white p-3">
                        <p className="text-xs font-bold text-gray-950">Modifiche proposte</p>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-gray-600">
                          {aiProposal.diff.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <Button type="button" variant="secondary" onClick={() => setAiProposal(null)}>
                            Scarta
                          </Button>
                          <Button type="button" onClick={approveAiProposal} icon={<Check className="h-4 w-4" />}>
                            Approva proposta
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <span className="form-label">Nome interno</span>
                      <input
                        className="input"
                        value={form.name}
                        maxLength={120}
                        onChange={(event) =>
                          updateForm("name", event.target.value)
                        }
                        placeholder="Es. Consiglia prodotti"
                      />
                    </label>
                    <label className="block">
                      <span className="form-label">Template</span>
                      <select
                        className="input"
                        value={templateId}
                        onChange={(event) =>
                          startNew(templateById(event.target.value))
                        }
                      >
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="form-label">Origine dati</span>
                      <select className="input" value={actionType} onChange={(event) => setActionType(event.target.value as typeof actionType)}>
                        <option value="show_widget">Dati LitX / conversazione</option>
                        <option value="api_widget">API + Widget</option>
                      </select>
                    </label>
                  </div>
                  {actionType === "api_widget" ? (
                    <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                      <h3 className="text-xs font-bold text-sky-950">API + Widget</h3>
                      <p className="mt-1 text-[11px] text-sky-800">La risposta JSON viene validata contro lo schema prima di essere mostrata.</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
                        <label><span className="form-label">URL HTTPS</span><input type="url" className="input" value={form.apiUrl} onChange={(event) => updateForm("apiUrl", event.target.value)} placeholder="https://api.example.com/products" /></label>
                        <label><span className="form-label">Metodo</span><select className="input" value={form.apiMethod} onChange={(event) => updateForm("apiMethod", event.target.value as WidgetForm["apiMethod"])}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option></select></label>
                        <label className="sm:col-span-2"><span className="form-label">Percorso risposta</span><input className="input" value={form.responsePath} onChange={(event) => updateForm("responsePath", event.target.value)} placeholder="data.products" /><span className="form-helper">Lascia vuoto per usare tutto il JSON.</span></label>
                        {form.apiMethod !== "GET" ? <label className="sm:col-span-2"><span className="form-label">Body JSON</span><textarea className="textarea font-mono text-[11px]" value={form.bodyTemplate} onChange={(event) => updateForm("bodyTemplate", event.target.value)} /></label> : null}
                      </div>
                    </section>
                  ) : null}
                  <label className="block">
                    <span className="form-label">Quando deve usarlo</span>
                    <textarea
                      className="textarea min-h-24"
                      value={form.keywords}
                      onChange={(event) =>
                        updateForm("keywords", event.target.value)
                      }
                      placeholder="Separa le frasi con una virgola"
                    />
                    <span className="form-helper">
                      Inserisci frasi concrete separate da virgole. Il motore
                      userà solo queste regole autorizzate.
                    </span>
                  </label>
                  <label className="block">
                    <span className="form-label">Descrizione interna</span>
                    <input
                      className="input"
                      value={form.description}
                      maxLength={500}
                      onChange={(event) =>
                        updateForm("description", event.target.value)
                      }
                    />
                  </label>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                    <p className="text-xs font-bold text-gray-900">
                      Contenuto del widget
                    </p>
                    {templateId === "order_tracking" ? (
                      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                        <p className="text-xs font-semibold text-amber-900">
                          Modulo protetto LitX
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-amber-800">
                          Titolo, campi e pulsante sono gestiti dal runtime
                          sicuro: numero ordine ed email vengono verificati
                          senza essere salvati nella conversazione.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        <label className="block">
                          <span className="form-label">Titolo</span>
                          <input
                            className="input"
                            value={form.title}
                            onChange={(event) =>
                              updateForm("title", event.target.value)
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="form-label">Testo</span>
                          <textarea
                            className="textarea"
                            rows={3}
                            value={form.body}
                            onChange={(event) =>
                              updateForm("body", event.target.value)
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="form-label">Pulsante</span>
                          <input
                            className="input"
                            value={form.label}
                            onChange={(event) =>
                              updateForm("label", event.target.value)
                            }
                          />
                        </label>
                        {templateId === "appointment" ? (
                          <label className="block">
                            <span className="form-label">
                              URL calendario HTTPS
                            </span>
                            <input
                              type="url"
                              className="input"
                              value={form.url}
                              onChange={(event) =>
                                updateForm("url", event.target.value)
                              }
                              placeholder="https://calendly.com/..."
                            />
                          </label>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === "schema" ? (
                <section className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div><h3 className="text-sm font-bold text-gray-950">Schema dati</h3><p className="mt-1 text-xs text-gray-500">Aggiungi e modifica i campi realmente validati dal runtime.</p></div>
                    <Button type="button" size="sm" variant="secondary" onClick={addSchemaField} icon={<Plus className="h-3.5 w-3.5" />}>Campo</Button>
                  </div>
                  <div className="space-y-3">
                    {definition.schema.map((field, index) => (
                      <div key={`${field.name}-${index}`} className="grid gap-2 rounded-xl border border-gray-100 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <input className="input" value={field.name} onChange={(event) => applyDefinitionCandidate({ ...definition, schema: definition.schema.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} aria-label="Nome campo" />
                        <input className="input" value={field.label} onChange={(event) => applyDefinitionCandidate({ ...definition, schema: definition.schema.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} aria-label="Etichetta campo" />
                        <select className="input" value={field.type} onChange={(event) => applyDefinitionCandidate({ ...definition, schema: definition.schema.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as typeof field.type } : item) })} aria-label="Tipo campo">
                          {["string", "number", "boolean", "url", "email", "product_list", "order_status"].map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={field.required} onChange={(event) => applyDefinitionCandidate({ ...definition, schema: definition.schema.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item) })} />Richiesto</label>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyDefinitionCandidate({ ...definition, schema: definition.schema.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Elimina ${field.label}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {activeTab === "functions" ? (
                <section className="space-y-4">
                  <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-bold text-gray-950">Funzioni operative</h3><p className="mt-1 text-xs text-gray-500">Solo funzioni allowlisted, collegate al renderer reale.</p></div><Button type="button" size="sm" variant="secondary" onClick={addFunction} icon={<Plus className="h-3.5 w-3.5" />}>Funzione</Button></div>
                  {definition.functions.map((fn, index) => (
                    <div key={fn.id} className="grid gap-3 rounded-xl border border-gray-100 p-3 sm:grid-cols-2">
                      <label><span className="form-label">ID</span><input className="input" value={fn.id} onChange={(event) => applyDefinitionCandidate({ ...definition, functions: definition.functions.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value } : item) })} /></label>
                      <label><span className="form-label">Etichetta</span><input className="input" value={fn.label} onChange={(event) => applyDefinitionCandidate({ ...definition, functions: definition.functions.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></label>
                      <label><span className="form-label">Tipo</span><select className="input" value={fn.type} onChange={(event) => {
                        const type = event.target.value as typeof fn.type;
                        const config = type === "open_link" ? { url: "https://example.com" } : type === "send_message" ? { message: "Continua" } : type === "set_variables" ? { variable: "value" } : type === "client_event" ? { eventName: "litx:widget-action" } : type === "server_action" ? { url: "https://api.example.com/action", method: "POST" as const, bodyTemplate: "{}" } : {};
                        applyDefinitionCandidate({ ...definition, functions: definition.functions.map((item, itemIndex) => itemIndex === index ? { ...item, type, config } : item) });
                      }}><option value="open_link">open_link</option><option value="send_message">send_message</option><option value="dismiss">dismiss</option><option value="set_variables">set_variables</option><option value="client_event">client_event</option><option value="server_action">server_action</option></select></label>
                      {fn.type !== "dismiss" ? <label><span className="form-label">{fn.type === "send_message" ? "Messaggio" : fn.type === "set_variables" ? "Variabile" : fn.type === "client_event" ? "Nome evento" : "URL HTTPS"}</span><input className="input" value={fn.type === "send_message" ? fn.config.message || "" : fn.type === "set_variables" ? fn.config.variable || "" : fn.type === "client_event" ? fn.config.eventName || "" : fn.config.url || ""} onChange={(event) => {
                        const key = fn.type === "send_message" ? "message" : fn.type === "set_variables" ? "variable" : fn.type === "client_event" ? "eventName" : "url";
                        applyDefinitionCandidate({ ...definition, functions: definition.functions.map((item, itemIndex) => itemIndex === index ? { ...item, config: { ...item.config, [key]: event.target.value } } : item) });
                      }} /></label> : <div />}
                      {fn.type === "server_action" ? <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><label><span className="form-label">Metodo</span><select className="input" value={fn.config.method || "POST"} onChange={(event) => updateFunctionAt(index, { ...fn, config: { ...fn.config, method: event.target.value as "GET" | "POST" | "PUT" | "PATCH" } })}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label><span className="form-label">Stato successivo</span><select className="input" value={fn.config.nextState || ""} onChange={(event) => updateFunctionAt(index, { ...fn, config: { ...fn.config, nextState: event.target.value || undefined } })}><option value="">Nessuno</option>{definition.states.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}</select></label><label className="sm:col-span-2"><span className="form-label">Body template JSON</span><textarea className="textarea font-mono text-[11px]" value={fn.config.bodyTemplate || "{}"} onChange={(event) => updateFunctionAt(index, { ...fn, config: { ...fn.config, bodyTemplate: event.target.value } })} /></label></div> : <label><span className="form-label">Stato successivo</span><select className="input" value={fn.config.nextState || ""} onChange={(event) => updateFunctionAt(index, { ...fn, config: { ...fn.config, nextState: event.target.value || undefined } })}><option value="">Nessuno</option>{definition.states.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}</select></label>}
                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 sm:col-span-2"><div className="flex items-center justify-between"><p className="text-[11px] font-bold text-gray-800">Input e binding</p><Button type="button" size="sm" variant="ghost" onClick={() => addFunctionInput(index)} icon={<Plus className="h-3 w-3" />}>Input</Button></div>{fn.inputs.map((input, inputIndex) => <div key={`${input.name}-${inputIndex}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"><input className="input" value={input.name} aria-label="Nome input" onChange={(event) => updateFunctionAt(index, { ...fn, inputs: fn.inputs.map((item, itemIndex) => itemIndex === inputIndex ? { ...item, name: event.target.value } : item) })} /><select className="input" value={input.binding.source} onChange={(event) => updateFunctionAt(index, { ...fn, inputs: fn.inputs.map((item, itemIndex) => itemIndex === inputIndex ? { ...item, binding: { ...item.binding, source: event.target.value as typeof item.binding.source } } : item) })}><option value="data">data</option><option value="state">state</option><option value="context">context</option><option value="literal">literal</option></select><input className="input" value={input.binding.path} placeholder="path o valore" onChange={(event) => updateFunctionAt(index, { ...fn, inputs: fn.inputs.map((item, itemIndex) => itemIndex === inputIndex ? { ...item, binding: { ...item.binding, path: event.target.value } } : item) })} /><input className="input" value={input.binding.fallback === undefined ? "" : String(input.binding.fallback)} placeholder="fallback" onChange={(event) => updateFunctionAt(index, { ...fn, inputs: fn.inputs.map((item, itemIndex) => itemIndex === inputIndex ? { ...item, binding: { ...item.binding, fallback: event.target.value || undefined } } : item) })} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => updateFunctionAt(index, { ...fn, inputs: fn.inputs.filter((_, itemIndex) => itemIndex !== inputIndex) })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 sm:col-span-2"><div className="flex items-center justify-between"><p className="text-[11px] font-bold text-gray-800">Return schema</p><Button type="button" size="sm" variant="ghost" onClick={() => addFunctionReturn(index)} icon={<Plus className="h-3 w-3" />}>Campo</Button></div>{fn.returns.map((field, returnIndex) => <div key={`${field.name}-${returnIndex}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"><input className="input" value={field.name} onChange={(event) => updateFunctionAt(index, { ...fn, returns: fn.returns.map((item, itemIndex) => itemIndex === returnIndex ? { ...item, name: event.target.value } : item) })} /><input className="input" value={field.label} onChange={(event) => updateFunctionAt(index, { ...fn, returns: fn.returns.map((item, itemIndex) => itemIndex === returnIndex ? { ...item, label: event.target.value } : item) })} /><select className="input" value={field.type} onChange={(event) => updateFunctionAt(index, { ...fn, returns: fn.returns.map((item, itemIndex) => itemIndex === returnIndex ? { ...item, type: event.target.value as typeof item.type } : item) })}>{["string", "number", "boolean", "url", "email", "product_list", "order_status"].map((type) => <option key={type}>{type}</option>)}</select><label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={field.required} onChange={(event) => updateFunctionAt(index, { ...fn, returns: fn.returns.map((item, itemIndex) => itemIndex === returnIndex ? { ...item, required: event.target.checked } : item) })} />Richiesto</label><button type="button" className="btn btn-ghost btn-sm" onClick={() => updateFunctionAt(index, { ...fn, returns: fn.returns.filter((_, itemIndex) => itemIndex !== returnIndex) })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
                      <div className="flex items-end justify-between gap-2"><label className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={fn.waitForResponse} onChange={(event) => applyDefinitionCandidate({ ...definition, functions: definition.functions.map((item, itemIndex) => itemIndex === index ? { ...item, waitForResponse: event.target.checked } : item) })} />Attendi risposta</label><div className="flex gap-1"><button type="button" className="btn btn-ghost btn-sm" onClick={() => applyDefinitionCandidate({ ...definition, functions: moveItem(definition.functions, index, -1) })} aria-label="Sposta su"><ChevronLeft className="h-3.5 w-3.5 rotate-90" /></button><button type="button" className="btn btn-ghost btn-sm" onClick={() => applyDefinitionCandidate({ ...definition, functions: moveItem(definition.functions, index, 1) })} aria-label="Sposta giù"><ChevronRight className="h-3.5 w-3.5 rotate-90" /></button><button type="button" className="btn btn-ghost btn-sm" onClick={() => applyDefinitionCandidate({ ...definition, functions: definition.functions.filter((_, itemIndex) => itemIndex !== index), root: definition.root })} aria-label="Elimina funzione"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
                    </div>
                  ))}
                </section>
              ) : null}
              {activeTab === "states" ? (
                <section className="space-y-4">
                  <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-bold text-gray-950">Stati</h3><p className="mt-1 text-xs text-gray-500">Configura stato iniziale, ordine e nodi visibili.</p></div><Button type="button" size="sm" variant="secondary" onClick={addState} icon={<Plus className="h-3.5 w-3.5" />}>Stato</Button></div>
                  {definition.states.map((state, index) => (
                    <div key={state.id} className="grid gap-3 rounded-xl border border-gray-100 p-3 sm:grid-cols-2">
                      <label><span className="form-label">ID</span><input className="input" value={state.id} onChange={(event) => applyDefinitionCandidate({ ...definition, states: definition.states.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value } : item) })} /></label>
                      <label><span className="form-label">Etichetta</span><input className="input" value={state.label} onChange={(event) => applyDefinitionCandidate({ ...definition, states: definition.states.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></label>
                      <label className="sm:col-span-2"><span className="form-label">ID nodi visibili, separati da virgola</span><input className="input" value={state.visibleNodeIds.join(", ")} onChange={(event) => applyDefinitionCandidate({ ...definition, states: definition.states.map((item, itemIndex) => itemIndex === index ? { ...item, visibleNodeIds: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } : item) })} /></label>
                      <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="radio" name="initial-state" checked={state.initial} onChange={() => applyDefinitionCandidate({ ...definition, states: definition.states.map((item, itemIndex) => ({ ...item, initial: itemIndex === index })) })} />Stato iniziale</label></div>
                      <div className="flex justify-end gap-1"><button type="button" className="btn btn-ghost btn-sm" onClick={() => applyDefinitionCandidate({ ...definition, states: moveItem(definition.states, index, -1) })}><ChevronLeft className="h-3.5 w-3.5 rotate-90" /></button><button type="button" className="btn btn-ghost btn-sm" onClick={() => applyDefinitionCandidate({ ...definition, states: moveItem(definition.states, index, 1) })}><ChevronRight className="h-3.5 w-3.5 rotate-90" /></button><button type="button" className="btn btn-ghost btn-sm" disabled={definition.states.length <= 1 || state.initial} onClick={() => applyDefinitionCandidate({ ...definition, states: definition.states.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-3.5 w-3.5" /></button></div>
                    </div>
                  ))}
                </section>
              ) : null}
              {activeTab === "code" ? (
                <section className="space-y-4"><div><h3 className="text-sm font-bold text-gray-950">Code / DSL JSON</h3><p className="mt-1 text-xs text-gray-500">Definizione completa, senza HTML o JavaScript arbitrario. Viene validata prima del salvataggio.</p></div><textarea className="textarea min-h-[520px] font-mono text-[11px] leading-5" value={definitionJson} spellCheck={false} onChange={(event) => setDefinitionJson(event.target.value)} /><Button type="button" variant="secondary" onClick={() => { try { applyDefinitionCandidate(WidgetDefinitionSchema.parse(JSON.parse(definitionJson))); setNotice("DSL validata e applicata all’anteprima."); } catch (caught) { setError(caught instanceof Error ? caught.message : "DSL non valida"); } }}>Valida e applica</Button></section>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[11px] text-gray-400">
                Le modifiche diventano operative dopo il salvataggio.
              </p>
              <Button
                onClick={() => void saveWidget()}
                loading={saving}
                disabled={!botId}
                icon={<Save className="h-4 w-4" />}
              >
                {selectedId ? "Salva modifiche" : "Crea widget"}
              </Button>
            </div>
          </section>

          <aside
            className="h-fit space-y-4 xl:sticky xl:top-24"
            aria-label="Anteprima widget"
          >
            {selectedId ? (
              <section className="card p-4" aria-label="Cronologia versioni widget">
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-gray-950">Cronologia e rollback</h2><p className="mt-1 text-xs text-gray-500">Ogni modifica crea una versione ripristinabile.</p></div><RotateCcw className="h-4 w-4 text-brand-600" /></div>
                <div className="mt-4 space-y-2">{versions.length ? versions.slice(0, 10).map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3"><div className="min-w-0"><p className="text-xs font-bold text-gray-900">v{version.version}</p><p className="truncate text-[10px] text-gray-500">{version.changeSummary}</p><p className="mt-1 text-[9px] text-gray-400">{new Date(version.createdAt).toLocaleString("it-IT")}</p></div><Button type="button" size="sm" variant="secondary" loading={versionLoading} onClick={() => void restoreVersion(version.version)}>Ripristina</Button></div>) : <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">Nessuna versione precedente.</p>}</div>
              </section>
            ) : null}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-brand-600" />
                  <p className="text-xs font-bold text-gray-900">Anteprima</p>
                </div>
                <div className="flex rounded-lg bg-gray-100 p-1 text-[9px] font-semibold">{([['widget','Widget'],['bubble','Chat bubble'],['page','Agent page']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setPreviewMode(id)} className={`rounded-md px-2 py-1 ${previewMode === id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>{label}</button>)}</div>
              </div>
              <div className="bg-gradient-to-b from-gray-50 to-white p-4 sm:p-5">
                <div className={`mx-auto overflow-hidden border border-gray-200 bg-white shadow-medium ${previewMode === "page" ? "max-w-full rounded-xl" : previewMode === "bubble" ? "max-w-[280px] rounded-[28px]" : "max-w-[320px] rounded-2xl"}`}>
                  <div className="flex items-center gap-2 border-b border-gray-100 px-3.5 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold text-gray-900">
                        Assistente AI
                      </p>
                      <p className="text-[9px] text-emerald-600">Online</p>
                    </div>
                  </div>
                  <div className={`${previewMode === "page" ? "min-h-[560px]" : previewMode === "bubble" ? "min-h-[300px]" : "min-h-[430px]"} bg-[#fbfbfd] p-3`}>
                    <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white p-3 text-[10px] leading-4 text-gray-600 shadow-sm">
                      Come posso aiutarti?
                    </div>
                    <div className="mt-3">
                      <DeclarativeWidget
                        widget={{
                          id: "studio-preview",
                          actionId: selectedId || "studio-draft",
                          definition: previewDefinition,
                          data: {
                            ...definition.defaults,
                            url: form.url || definition.defaults.url,
                            products: [{
                              productId: "11111111-1111-4111-8111-111111111111",
                              variantId: "22222222-2222-4222-8222-222222222222",
                              title: "Prodotto di anteprima",
                              shortDescription: "Esempio verificato del renderer prodotti LitX.",
                              price: 59.9,
                              currency: "EUR",
                              availability: "in_stock",
                              imageUrl: "https://placehold.co/640x480/f5f3ff/633cff?text=LitX",
                              productUrl: "https://example.com/products/litx-preview",
                              reason: "Selezionato in base alle preferenze della conversazione.",
                              options: [{ name: "Taglia", availableValues: ["M"], unavailableValues: [] }],
                              variants: [{
                                variantId: "22222222-2222-4222-8222-222222222222",
                                label: "M",
                                choices: [{ name: "Taglia", value: "M" }],
                                price: 59.9,
                                currency: "EUR",
                                availability: "in_stock",
                              }],
                              actions: [{ type: "view", label: "Vedi prodotto", url: "https://example.com/products/litx-preview" }],
                            }],
                          },
                        }}
                        botId={botId || undefined}
                        conversationId="00000000-0000-4000-8000-000000000001"
                        userSessionId="studio-preview"
                        onSendMessage={(message) => setNotice(`Anteprima messaggio: ${message}`)}
                      />
                    </div>
                  </div>
                  <div className="border-t border-gray-100 bg-white p-3">
                    <div className="flex h-10 items-center justify-between rounded-xl border border-gray-200 px-3 text-[10px] text-gray-400">
                      Scrivi un messaggio…
                      <ArrowRight className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
