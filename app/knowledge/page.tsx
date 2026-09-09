"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Upload,
  Globe,
  FileText,
  FileSpreadsheet,
  FileType2,
  PenLine,
  Trash2,
  Search,
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Globe2,
  ShieldCheck,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import Link from "next/link";
import { useDashboardPermissions } from "@/lib/use-dashboard-permissions";

interface KnowledgeSource {
  id: string;
  botId: string;
  sourceType: "url" | "pdf" | "docx" | "txt" | "csv" | "manual" | "qa";
  sourceUrl: string | null;
  originalFilename: string | null;
  contentText: string;
  processedAt: string | null;
  status: "processing" | "completed" | "failed";
  createdAt: string;
  chunkCount: number;
  errorMessage: string | null;
}

interface Chatbot {
  id: string;
  workspaceId: string;
  companyName: string;
  _count: {
    knowledgeSources: number;
  };
}

export default function KnowledgePage() {
  const permissions = useDashboardPermissions();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [selectedChatbot, setSelectedChatbot] = useState<string>("");
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<"pdf" | "url" | "crawl">("pdf");
  const [url, setUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<string>("");
  const selectedWorkspaceId = chatbots.find(
    (bot) => bot.id === selectedChatbot,
  )?.workspaceId;
  const canManageKnowledge = permissions.can(selectedWorkspaceId, "configure");

  useEffect(() => {
    fetchChatbots();
  }, []);

  const fetchChatbots = async () => {
    setPageError("");
    try {
      const response = await fetch("/api/chatbots");
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "Elenco chatbot non disponibile");
      const bots = data.data || [];
      setChatbots(bots);
      if (bots.length > 0) {
        const requestedBotId = new URLSearchParams(window.location.search).get(
          "botId",
        );
        const requestedBotExists =
          requestedBotId &&
          bots.some((bot: Chatbot) => bot.id === requestedBotId);
        setSelectedChatbot(requestedBotExists ? requestedBotId : bots[0].id);
      }
    } catch {
      setPageError(
        "Non è stato possibile caricare i chatbot. Riprova tra qualche secondo.",
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeSources = useCallback(async () => {
    if (!selectedChatbot) return;
    setSourcesLoading(true);
    setPageError("");
    try {
      const response = await fetch(
        `/api/knowledge-sources?botId=${selectedChatbot}`,
      );
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "Informazioni non disponibili");
      setKnowledgeSources(data.data || []);
    } catch {
      setPageError(
        "Non è stato possibile caricare le informazioni del chatbot.",
      );
    } finally {
      setSourcesLoading(false);
    }
  }, [selectedChatbot]);

  useEffect(() => {
    if (selectedChatbot) void fetchKnowledgeSources();
  }, [selectedChatbot, fetchKnowledgeSources]);

  const hasProcessingSources = knowledgeSources.some(
    (source) => source.status === "processing",
  );
  useEffect(() => {
    if (!selectedChatbot || !hasProcessingSources) return;
    const interval = window.setInterval(fetchKnowledgeSources, 5000);
    return () => window.clearInterval(interval);
  }, [selectedChatbot, hasProcessingSources, fetchKnowledgeSources]);

  const handleCrawl = async () => {
    if (!selectedChatbot) {
      setFeedback({ type: "error", text: "Seleziona prima un chatbot." });
      return;
    }

    if (!crawlUrl.trim()) {
      setFeedback({
        type: "error",
        text: "Inserisci l’indirizzo del sito da cui iniziare.",
      });
      return;
    }

    setCrawling(true);
    setFeedback(null);
    setCrawlProgress("Preparazione del sito...");

    try {
      const response = await fetch(
        "/api/knowledge-sources/crawl-with-progress",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            botId: selectedChatbot,
            url: crawlUrl.trim(),
            maxPages: 10,
            maxDepth: 3,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const jobId = data.jobId;
        let completed = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusResponse = await fetch(
            `/api/ingestion/status?jobId=${jobId}`,
          );
          const statusData = await statusResponse.json();
          if (!statusResponse.ok)
            throw new Error(statusData.error || "Stato crawl non disponibile");
          const job = statusData.data;
          setCrawlProgress(
            `${job.progress || 0}% · ${job.progressMessage || "Elaborazione in corso..."}`,
          );
          if (job.status === "completed") {
            completed = true;
            setCrawlUrl("");
            setShowUploadModal(false);
            await fetchKnowledgeSources();
            setFeedback({
              type: "success",
              text: `Sito aggiunto: ${job.sourcesCreated} pagine e ${job.chunksCreated} sezioni pronte per il chatbot.`,
            });
            break;
          }
          if (job.status === "failed")
            throw new Error(
              job.error || "Il crawler non è riuscito a completare il sito",
            );
        }
        if (!completed)
          throw new Error(
            "L’importazione sta impiegando più del previsto. Puoi chiudere questa finestra: il lavoro continuerà in background.",
          );
      } else {
        const data = await response.json();
        throw new Error(data.error || "Impossibile leggere il sito");
      }
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Non è stato possibile aggiungere il sito.",
      });
    } finally {
      setCrawling(false);
      setCrawlProgress("");
    }
  };

  const handleUpload = async () => {
    if (!selectedChatbot) {
      setFeedback({ type: "error", text: "Seleziona prima un chatbot." });
      return;
    }

    if (uploadType === "crawl") {
      return handleCrawl();
    }

    if (uploadType === "url" && !url.trim()) {
      setFeedback({
        type: "error",
        text: "Inserisci l’indirizzo della pagina web.",
      });
      return;
    }

    if (uploadType === "pdf" && !selectedFile) {
      setFeedback({ type: "error", text: "Seleziona un file PDF." });
      return;
    }

    setUploading(true);
    setFeedback(null);

    try {
      if (uploadType === "url") {
        // Upload URL
        const response = await fetch("/api/knowledge-sources/add-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            botId: selectedChatbot,
            url: url.trim(),
          }),
        });

        if (response.ok) {
          setUrl("");
          setShowUploadModal(false);
          fetchKnowledgeSources();
          setFeedback({
            type: "success",
            text: "Pagina web aggiunta alle informazioni del chatbot.",
          });
        } else {
          const data = await response.json();
          throw new Error(data.error || "Impossibile aggiungere la pagina web");
        }
      } else {
        // Upload PDF
        const formData = new FormData();
        formData.append("botId", selectedChatbot);
        formData.append("file", selectedFile!);

        const response = await fetch("/api/knowledge-sources/upload-pdf", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          setSelectedFile(null);
          setShowUploadModal(false);
          fetchKnowledgeSources();
          setFeedback({
            type: "success",
            text: "Documento aggiunto alle informazioni del chatbot.",
          });
        } else {
          const data = await response.json();
          throw new Error(data.error || "Impossibile caricare il documento");
        }
      }
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Non è stato possibile aggiungere le informazioni.",
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteSource = async (id: string) => {
    if (!confirm("Vuoi eliminare questa fonte dalle informazioni del chatbot?"))
      return;
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/knowledge-sources?sourceId=${id}&botId=${selectedChatbot}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        await fetchKnowledgeSources();
        setFeedback({ type: "success", text: "Fonte eliminata." });
      } else {
        const data = await response.json();
        throw new Error(data.error || "Eliminazione non riuscita");
      }
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Non è stato possibile eliminare la fonte.",
      });
    }
  };

  const filteredSources = knowledgeSources.filter((source) => {
    if (!searchTerm.trim()) return true;

    const search = searchTerm.toLowerCase();
    const filename = source.originalFilename?.toLowerCase() || "";
    const url = source.sourceUrl?.toLowerCase() || "";

    return filename.includes(search) || url.includes(search);
  });

  const getStatusBadge = (status: string) => {
    if (status === "completed")
      return (
        <Badge variant="success" dot>
          Pronta
        </Badge>
      );
    if (status === "processing")
      return (
        <Badge variant="info" dot>
          Elaborazione in corso
        </Badge>
      );
    if (status === "failed")
      return (
        <Badge variant="danger" dot>
          Errore
        </Badge>
      );
    return <Badge variant="gray">{status}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    if (status === "completed")
      return <CheckCircle className="w-5 h-5 text-success-600" />;
    if (status === "processing")
      return <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />;
    if (status === "failed")
      return <XCircle className="w-5 h-5 text-danger-600" />;
    return <AlertCircle className="w-5 h-5 text-gray-400" />;
  };

  const getSourceIcon = (type: KnowledgeSource["sourceType"]) => {
    if (type === "url") return <Globe className="h-6 w-6 text-brand-600" />;
    if (type === "csv")
      return <FileSpreadsheet className="h-6 w-6 text-emerald-600" />;
    if (type === "docx") return <FileType2 className="h-6 w-6 text-blue-600" />;
    if (type === "manual")
      return <PenLine className="h-6 w-6 text-violet-600" />;
    if (type === "qa")
      return <ShieldCheck className="h-6 w-6 text-emerald-600" />;
    return (
      <FileText
        className={`h-6 w-6 ${type === "pdf" ? "text-danger-600" : "text-gray-600"}`}
      />
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingSpinner fullPage text="Caricamento informazioni..." />
      </DashboardLayout>
    );
  }

  if (pageError && chatbots.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
          <Card className="w-full max-w-md" padding="md">
            <div className="text-center">
              <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
              <h1 className="mt-3 text-lg font-bold text-gray-950">
                Informazioni non disponibili
              </h1>
              <p className="mt-2 text-sm text-gray-500">{pageError}</p>
              <Button className="mt-5" onClick={() => void fetchChatbots()}>
                Riprova
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (chatbots.length === 0) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Card padding="none">
            <EmptyState
              icon={Database}
              title={
                permissions.isOwner
                  ? "Nessun chatbot disponibile"
                  : "Nessun chatbot assegnato"
              }
              description={
                permissions.isOwner
                  ? "Crea prima un chatbot per aggiungere le informazioni che userà nelle risposte."
                  : "Contatta LitX per collegare un chatbot al tuo account."
              }
              action={
                permissions.isOwner
                  ? {
                      label: "Crea chatbot",
                      onClick: () => {
                        window.dispatchEvent(new Event("open-create-modal"));
                      },
                      variant: "success",
                    }
                  : undefined
              }
            />
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const selectedBot = chatbots.find((b) => b.id === selectedChatbot);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mx-auto max-w-[1500px] px-5 pt-6 lg:px-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Cosa conosce il chatbot</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">
              Informazioni del chatbot
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Aggiungi e controlla le pagine e i documenti usati per rispondere
              ai clienti.
            </p>
          </div>
        </div>
      </div>

      {/* Chatbot Selector */}
      <div className="mx-auto mt-6 max-w-[1500px] px-5 lg:px-7">
        <div className="card p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="knowledge-chatbot"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                Chatbot
              </label>
              <select
                id="knowledge-chatbot"
                value={selectedChatbot}
                onChange={(e) => setSelectedChatbot(e.target.value)}
                className="input"
              >
                {chatbots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.companyName} ({bot._count.knowledgeSources} fonti)
                  </option>
                ))}
              </select>
            </div>

            {selectedBot && canManageKnowledge && (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/knowledge/import?botId=${selectedChatbot}`}
                  className="btn btn-secondary"
                >
                  <Upload className="h-4 w-4" />
                  Importa documenti
                </Link>
                <Button
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowUploadModal(true)}
                >
                  Aggiungi informazioni
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-7">
        {pageError && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            <span>{pageError}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchKnowledgeSources()}
            >
              Riprova
            </Button>
          </div>
        )}
        {feedback && (
          <div
            role="status"
            className={`mb-4 rounded-xl border p-3 text-xs ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            {feedback.text}
          </div>
        )}
        {selectedBot && permissions.loaded && !canManageKnowledge && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            Accesso in sola lettura: solo proprietari e admin possono modificare
            le fonti.
          </div>
        )}
        {selectedBot && (
          <>
            {/* Search */}
            <div className="mb-6">
              <Input
                placeholder="Cerca per nome file o URL..."
                icon={<Search className="w-4 h-4" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Knowledge Sources */}
            {sourcesLoading && knowledgeSources.length === 0 ? (
              <Card padding="none">
                <LoadingSpinner text="Caricamento informazioni..." />
              </Card>
            ) : filteredSources.length === 0 ? (
              <Card padding="none">
                <EmptyState
                  icon={Database}
                  title={
                    searchTerm
                      ? "Nessun risultato"
                      : "Nessuna informazione disponibile"
                  }
                  description={
                    searchTerm
                      ? "Nessuna fonte trovata con questo termine"
                      : `Aggiungi un documento o una pagina web per aiutare ${selectedBot.companyName} a rispondere meglio`
                  }
                  action={
                    !searchTerm && canManageKnowledge
                      ? {
                          label: "Aggiungi la prima fonte",
                          onClick: () => setShowUploadModal(true),
                          variant: "success",
                        }
                      : undefined
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredSources.map((source) => (
                  <Card key={source.id} hover padding="md" className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        {/* Icon */}
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {getSourceIcon(source.sourceType)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {source.originalFilename ||
                                readableSourceUrl(source.sourceUrl)}
                            </h3>
                            {getStatusBadge(source.status)}
                            {source.sourceType === "qa" && (
                              <Badge variant="success">Verificata</Badge>
                            )}
                          </div>

                          <div className="grid gap-4 text-sm sm:grid-cols-3">
                            <div>
                              <span className="text-gray-500">Tipo:</span>{" "}
                              <span className="text-gray-900 font-medium">
                                {sourceTypeLabel(source.sourceType)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">
                                Sezioni disponibili:
                              </span>{" "}
                              <span className="text-gray-900 font-medium">
                                {source.chunkCount}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Aggiunta:</span>{" "}
                              <span className="text-gray-900">
                                {new Date(source.createdAt).toLocaleDateString(
                                  "it-IT",
                                )}
                              </span>
                            </div>
                          </div>

                          {source.errorMessage && (
                            <p className="text-sm text-danger-600 mt-2">
                              Errore: {source.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-4">
                        {getStatusIcon(source.status)}
                        {canManageKnowledge && source.sourceType !== "qa" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSource(source.id)}
                            aria-label={`Elimina ${source.originalFilename || "fonte"}`}
                            title="Elimina fonte"
                            icon={
                              <Trash2 className="w-4 h-4 text-danger-600" />
                            }
                          />
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && canManageKnowledge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="knowledge-upload-title"
        >
          <Card className="max-w-2xl w-full" padding="none">
            <CardHeader>
              <CardTitle>
                <span id="knowledge-upload-title">Aggiungi informazioni</span>
              </CardTitle>
              <CardDescription>
                Scegli un documento, una pagina o un intero sito per{" "}
                {selectedBot?.companyName}.
              </CardDescription>
            </CardHeader>

            <div className="p-6 space-y-6">
              {/* Type Selector */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={uploadType === "pdf" ? "primary" : "secondary"}
                  onClick={() => setUploadType("pdf")}
                  icon={<FileText className="w-4 h-4" />}
                  size="sm"
                >
                  PDF
                </Button>
                <Button
                  variant={uploadType === "url" ? "primary" : "secondary"}
                  onClick={() => setUploadType("url")}
                  icon={<Globe className="w-4 h-4" />}
                  size="sm"
                >
                  URL
                </Button>
                <Button
                  variant={uploadType === "crawl" ? "primary" : "secondary"}
                  onClick={() => setUploadType("crawl")}
                  icon={<Globe2 className="w-4 h-4" />}
                  size="sm"
                >
                  Intero sito
                </Button>
              </div>

              {/* Upload Form */}
              {uploadType === "crawl" ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-brand-50 to-purple-50 border-2 border-brand-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Globe2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-brand-900 mb-1">
                          Importa automaticamente il sito
                        </p>
                        <p className="text-sm text-brand-800">
                          Inserisci l&apos;indirizzo principale: il sistema
                          troverà e preparerà le pagine utili.
                        </p>
                        <ul className="text-sm text-brand-700 mt-2 space-y-1">
                          <li>
                            ✅ Esplora automaticamente fino a 10 pagine per
                            importazione
                          </li>
                          <li>✅ Conserva il contenuto utile delle pagine</li>
                          <li>✅ Evita contenuti duplicati o poco utili</li>
                          <li>✅ Prepara il testo per risposte più precise</li>
                          <li>
                            ✅ Aggiunge tutto alle informazioni del chatbot
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Input
                    label="Indirizzo del sito"
                    placeholder="https://esempio.it"
                    value={crawlUrl}
                    onChange={(e) => setCrawlUrl(e.target.value)}
                    helperText="Inserisci l'indirizzo della homepage o della sezione da importare"
                    disabled={crawling}
                  />

                  {crawling && (
                    <div className="p-6 bg-gradient-to-br from-brand-50 to-purple-50 border-2 border-brand-300 rounded-xl">
                      <div className="flex items-center gap-4 mb-4">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                        <div>
                          <p className="font-bold text-brand-900">
                            Importazione del sito in corso...
                          </p>
                          <p className="text-sm text-brand-700">
                            Sto leggendo le pagine e preparando le informazioni.
                          </p>
                        </div>
                      </div>
                      {crawlProgress && (
                        <p className="text-sm text-brand-600 bg-white/50 rounded-lg px-4 py-2">
                          {crawlProgress}
                        </p>
                      )}
                      <div className="mt-4 flex items-center gap-2 text-xs text-brand-600">
                        <div className="w-2 h-2 bg-brand-600 rounded-full animate-pulse"></div>
                        Questo processo può richiedere 2-5 minuti
                      </div>
                    </div>
                  )}

                  {!crawling && (
                    <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
                      <p className="text-sm text-success-800">
                        <strong>Automatico:</strong> LitX segue i collegamenti
                        interni, evita i duplicati e conserva le pagine utili.
                        Non devi configurare altro.
                      </p>
                    </div>
                  )}
                </div>
              ) : uploadType === "url" ? (
                <Input
                  label="Indirizzo della pagina"
                  placeholder="https://esempio.it/spedizioni"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  helperText="Inserisci la pagina precisa che il chatbot deve conoscere"
                />
              ) : (
                <div>
                  <label className="form-label">File PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] || null)
                    }
                    className="input"
                  />
                  {selectedFile && (
                    <p className="text-sm text-gray-600 mt-2">
                      Selezionato: {selectedFile.name} (
                      {(selectedFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                Annulla
              </Button>
              <Button
                variant="success"
                onClick={handleUpload}
                loading={uploading || crawling}
                disabled={uploading || crawling}
                icon={
                  !uploading &&
                  !crawling &&
                  (uploadType === "crawl" ? (
                    <Globe2 className="w-4 h-4" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  ))
                }
              >
                {crawling
                  ? "Importazione..."
                  : uploading
                    ? "Caricamento..."
                    : uploadType === "crawl"
                      ? "Aggiungi sito"
                      : "Aggiungi"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}

function readableSourceUrl(value: string | null) {
  if (!value) return "Fonte senza nome";
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

function sourceTypeLabel(type: KnowledgeSource["sourceType"]) {
  const labels: Record<KnowledgeSource["sourceType"], string> = {
    url: "Pagina web",
    pdf: "Documento PDF",
    docx: "Documento Word",
    txt: "Documento di testo",
    csv: "Foglio dati",
    manual: "Testo inserito manualmente",
    qa: "Risposta verificata",
  };
  return labels[type];
}
