"use client";

import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Clock3, Loader2, MessageCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { launchWhatsAppEmbeddedSignup } from "@/lib/meta-browser";

interface ClientStatus {
  provider: "whatsapp" | "instagram";
  botName: string;
  expiresAt: string;
  configured: boolean;
  connected: boolean;
  label?: string | null;
  appId: string;
  graphVersion: string;
  whatsappConfigId: string;
}

export default function MetaClientConnectionPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const currentToken = parameters.get("token") || "";
    const result = parameters.get("meta");
    const detail = parameters.get("detail");
    setToken(currentToken);
    if (!currentToken) {
      setError("Il link di collegamento non è valido.");
      setLoading(false);
      return;
    }
    if (result === "error") setError(detail || "Collegamento Meta non riuscito.");
    fetch(`/api/meta/client/status?token=${encodeURIComponent(currentToken)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Link non valido");
        setStatus(body.data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Link non valido"))
      .finally(() => setLoading(false));
  }, []);

  const connect = async () => {
    if (!status || !token) return;
    setBusy(true);
    setError("");
    try {
      if (status.provider === "instagram") {
        const response = await fetch(
          `/api/meta/client/instagram/connect?token=${encodeURIComponent(token)}`,
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Instagram non disponibile");
        window.location.assign(body.data.url);
        return;
      }

      const signup = await launchWhatsAppEmbeddedSignup(status);
      const response = await fetch("/api/meta/client/whatsapp/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...signup }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "WhatsApp non collegato");
      setStatus((current) =>
        current
          ? { ...current, connected: true, label: body.data.displayPhoneNumber || current.label }
          : current,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Collegamento Meta non riuscito");
    } finally {
      setBusy(false);
    }
  };

  const providerName = status?.provider === "instagram" ? "Instagram" : "WhatsApp";
  const ProviderIcon = status?.provider === "instagram" ? Camera : MessageCircle;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_#ede9fe_0,_#f8fafc_40%,_#ffffff_75%)] px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white shadow-lg shadow-brand-200">
            L
          </div>
          <div>
            <p className="text-sm font-bold text-gray-950">LitX AI</p>
            <p className="text-[10px] text-gray-500">Collegamento canale ufficiale</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-brand-100/70">
          <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ProviderIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600">
                  Configurazione protetta
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-gray-950">
                  Collega {providerName}
                </h1>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {status?.botName || "Verifica del collegamento in corso…"}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8 sm:py-8">
            {loading ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
                <p className="mt-3 text-sm font-semibold text-gray-800">Controllo il link sicuro…</p>
              </div>
            ) : status?.connected ? (
              <div className="py-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-gray-950">Collegamento completato</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {providerName} {status.label ? `(${status.label}) ` : ""}è ora collegato all’agente {status.botName}.
                </p>
                <p className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
                  Puoi chiudere questa pagina. Non hai condiviso password o token con LitX.
                </p>
              </div>
            ) : error && !status ? (
              <div className="py-5 text-center">
                <TriangleAlert className="mx-auto h-9 w-9 text-amber-500" />
                <h2 className="mt-4 text-base font-bold text-gray-950">Link non disponibile</h2>
                <p role="alert" className="mt-2 text-sm leading-6 text-gray-600">{error}</p>
                <p className="mt-4 text-xs text-gray-400">Chiedi a chi gestisce l’agente un nuovo link.</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">Le tue credenziali restano private</p>
                      <p className="mt-1 text-xs leading-5 text-emerald-800">
                        Accederai direttamente nella finestra ufficiale Meta. LitX riceve soltanto l’autorizzazione necessaria per gestire i messaggi.
                      </p>
                    </div>
                  </div>
                </div>

                <ol className="mt-5 space-y-3 text-xs leading-5 text-gray-600">
                  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">1</span><span>Premi “Continua con Meta”.</span></li>
                  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">2</span><span>Accedi e seleziona il tuo account professionale.</span></li>
                  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">3</span><span>Conferma i permessi richiesti da Meta.</span></li>
                </ol>

                {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}
                {!status?.configured && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Il gestore della piattaforma deve completare la configurazione Meta prima di procedere.</p>}

                <Button
                  className="mt-6"
                  fullWidth
                  size="lg"
                  disabled={busy || !status?.configured}
                  onClick={connect}
                  icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                >
                  {busy ? "Collegamento in corso…" : "Continua con Meta"}
                </Button>
                <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  Link valido fino alle {status ? new Date(status.expiresAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </div>
              </>
            )}
          </div>
        </section>
        <p className="mt-5 text-center text-[10px] leading-5 text-gray-400">
          Collegamento tramite le API ufficiali Meta · Nessuna password viene salvata da LitX
        </p>
      </div>
    </main>
  );
}
