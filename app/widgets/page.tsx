"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
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
  Save,
  Settings2,
  ShoppingBag,
  Sparkles,
  ToggleLeft,
  Workflow,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";

type TemplateId =
  "product_carousel" | "lead_capture" | "appointment" | "order_tracking";
type TabId = "builder" | "schema" | "functions" | "states";

interface Agent {
  id: string;
  companyName: string;
}

interface WidgetAction {
  id: string;
  name: string;
  type: "show_widget";
  description?: string | null;
  triggerKeywords: string[];
  config: Record<string, string>;
  enabled: boolean;
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
  const [templateId, setTemplateId] = useState<TemplateId>("product_carousel");
  const [activeTab, setActiveTab] = useState<TabId>("builder");
  const [form, setForm] = useState<WidgetForm>(() => createForm(templates[0]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedTemplate = useMemo(
    () => templateById(templateId),
    [templateId],
  );

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
          (action) => action.type === "show_widget",
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
    void loadWidgets();
  }, [loadWidgets]);

  const startNew = useCallback((template: TemplateDefinition) => {
    setSelectedId("");
    setTemplateId(template.id);
    setForm(createForm(template));
    setActiveTab("builder");
    setError("");
    setNotice("");
  }, []);

  const editWidget = useCallback((widget: WidgetAction) => {
    const template = templateById(widget.config.template);
    setSelectedId(widget.id);
    setTemplateId(template.id);
    setForm({
      name: widget.name,
      description: widget.description || template.description,
      keywords: widget.triggerKeywords.join(", "),
      title: widget.config.title || template.title,
      body: widget.config.description || template.body,
      label: widget.config.label || template.label,
      url: widget.config.url || "",
      enabled: widget.enabled,
    });
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
    setSaving(true);
    setError("");
    setNotice("");
    const config: Record<string, string> = {
      template: templateId,
      title: form.title.trim(),
      description: form.body.trim(),
      label: form.label.trim(),
      rendererVersion: "1",
    };
    if (templateId === "appointment") config.url = form.url.trim();
    try {
      const response = await fetch(
        selectedId ? `/api/actions/${selectedId}` : "/api/actions",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(!selectedId ? { botId } : {}),
            name: form.name.trim(),
            type: "show_widget",
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
      };
      setSelectedId("");
      setTemplateId(generated.template);
      setForm((current) => ({
        ...current,
        name: generated.name,
        description: generated.description,
        title: generated.title,
        body: generated.body,
        label: generated.label,
        keywords: generated.triggerKeywords.join(", "),
      }));
      setNotice(
        "Proposta generata. Controllala nell’anteprima e salvala quando è pronta.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Generazione non riuscita",
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const updateForm = <Key extends keyof WidgetForm>(
    key: Key,
    value: WidgetForm[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
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
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {templates.map((template) => {
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
              })}
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
                  </section>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
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
                <DefinitionList
                  title="Schema dati del runtime"
                  description="Campi prodotti dal catalogo o dai moduli verificati. La struttura è bloccata per impedire dati o markup arbitrari."
                  icon={FormInput}
                  items={selectedTemplate.schema}
                  badge="Validato"
                />
              ) : null}
              {activeTab === "functions" ? (
                <DefinitionList
                  title="Funzioni operative"
                  description="Azioni realmente collegate al renderer di questo template; nessun JavaScript arbitrario viene eseguito."
                  icon={ToggleLeft}
                  items={selectedTemplate.functions}
                  badge="Runtime"
                />
              ) : null}
              {activeTab === "states" ? (
                <StateList items={selectedTemplate.states} />
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
            className="h-fit xl:sticky xl:top-24"
            aria-label="Anteprima widget"
          >
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-brand-600" />
                  <p className="text-xs font-bold text-gray-900">Anteprima</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-semibold text-gray-500">
                  Widget chat
                </span>
              </div>
              <div className="bg-gradient-to-b from-gray-50 to-white p-4 sm:p-5">
                <div className="mx-auto max-w-[320px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-medium">
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
                  <div className="min-h-[430px] bg-[#fbfbfd] p-3">
                    <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white p-3 text-[10px] leading-4 text-gray-600 shadow-sm">
                      Come posso aiutarti?
                    </div>
                    <div className="mt-3">
                      <WidgetPreview template={selectedTemplate} form={form} />
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

function DefinitionList({
  title,
  description,
  icon: Icon,
  items,
  badge,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
  badge: string;
}) {
  return (
    <section>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-gray-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-5 divide-y divide-gray-100 rounded-2xl border border-gray-100">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <CircleDot className="h-3.5 w-3.5 shrink-0 text-brand-500" />
              <code className="truncate text-xs font-semibold text-gray-700">
                {item}
              </code>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
              {badge}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StateList({ items }: { items: string[] }) {
  return (
    <section>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Workflow className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-gray-950">
            Flusso degli stati
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Sequenza controllata usata dal widget durante la conversazione.
          </p>
        </div>
      </div>
      <ol className="mt-5 space-y-2">
        {items.map((item, index) => (
          <li
            key={item}
            className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-950 text-[10px] font-bold text-white">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-xs font-semibold text-gray-700">
              {item}
            </span>
            {index < items.length - 1 ? (
              <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
            ) : (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function WidgetPreview({
  template,
  form,
}: {
  template: TemplateDefinition;
  form: WidgetForm;
}) {
  if (template.id === "product_carousel")
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-violet-100 via-white to-violet-50">
          <ShoppingBag className="h-14 w-14 text-violet-300" />
          <button
            type="button"
            aria-label="Prodotto precedente"
            className="absolute left-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-500 shadow"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Prodotto successivo"
            className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-700 shadow"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-3.5">
          <p className="text-sm font-bold text-gray-950">
            {form.title || template.title}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-gray-500">
            {form.body || template.body}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-brand-700">59,90 €</span>
            <span className="text-[9px] font-semibold text-emerald-600">
              Disponibile
            </span>
          </div>
          <button
            type="button"
            className="mt-3 h-9 w-full rounded-xl bg-brand-600 text-[10px] font-bold text-white"
          >
            {form.label || template.label}
          </button>
        </div>
      </div>
    );
  if (template.id === "lead_capture")
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <ContactRound className="h-4 w-4" />
        </span>
        <p className="mt-3 text-sm font-bold text-gray-950">
          {form.title || template.title}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-gray-500">
          {form.body || template.body}
        </p>
        <div className="mt-3 space-y-2">
          <div className="h-9 rounded-lg border border-gray-200 px-3 py-2 text-[9px] text-gray-400">
            Nome
          </div>
          <div className="h-9 rounded-lg border border-gray-200 px-3 py-2 text-[9px] text-gray-400">
            Email
          </div>
          <label className="flex items-start gap-2 text-[8px] leading-3 text-gray-500">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded border border-gray-300" />
            Acconsento al trattamento dei dati.
          </label>
        </div>
        <button
          type="button"
          className="mt-3 h-9 w-full rounded-xl bg-gray-950 text-[10px] font-bold text-white"
        >
          {form.label || template.label}
        </button>
      </div>
    );
  if (template.id === "appointment")
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <CalendarDays className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-bold text-gray-950">
          {form.title || template.title}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-gray-500">
          {form.body || template.body}
        </p>
        <button
          type="button"
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[10px] font-bold text-white"
        >
          {form.label || template.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        <PackageSearch className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-bold text-gray-950">
        {form.title || template.title}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-gray-500">
        {form.body || template.body}
      </p>
      <div className="mt-3 grid gap-2">
        <div className="h-9 rounded-lg border border-gray-200 px-3 py-2 text-[9px] text-gray-400">
          Numero ordine
        </div>
        <div className="h-9 rounded-lg border border-gray-200 px-3 py-2 text-[9px] text-gray-400">
          Email dell’acquisto
        </div>
      </div>
      <button
        type="button"
        className="mt-3 h-9 w-full rounded-xl bg-gray-950 text-[10px] font-bold text-white"
      >
        {form.label || template.label}
      </button>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <PanelTop className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[8px] text-gray-500">
          Dati protetti e non salvati nella chat
        </span>
      </div>
    </div>
  );
}
