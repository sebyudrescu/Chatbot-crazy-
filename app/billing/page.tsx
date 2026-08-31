"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";

type Workspace = {
  id: string;
  name: string;
  billingPlan: string;
  billingStatus: string;
  subscriptionCurrentPeriodEnd: string | null;
};
type BillingStatus = Workspace & {
  hasCustomer: boolean;
  hasSubscription: boolean;
  configured: boolean;
};

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="p-8 text-sm text-gray-500">Caricamento billing…</div>
        </DashboardLayout>
      }
    >
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const search = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(
    search.get("workspaceId") || "",
  );
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaces, workspaceId],
  );

  useEffect(() => {
    void fetch("/api/workspaces")
      .then((response) => response.json())
      .then((result) => {
        const list = result.data || [];
        setWorkspaces(list);
        setWorkspaceId((current) => current || list[0]?.id || "");
      });
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    setStatus(null);
    void fetch(
      `/api/billing/status?workspaceId=${encodeURIComponent(workspaceId)}`,
    )
      .then((response) => response.json())
      .then((result) =>
        result.success ? setStatus(result.data) : setMessage(result.error),
      );
  }, [workspaceId]);
  useEffect(() => {
    const checkout = search.get("checkout");
    if (checkout === "success")
      setMessage(
        "Checkout completato. L’attivazione viene confermata dal webhook firmato Stripe.",
      );
    if (checkout === "cancelled")
      setMessage("Checkout annullato: nessuna modifica al piano.");
  }, [search]);

  const openBilling = async (kind: "checkout" | "portal") => {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/billing/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data?.url) {
      setMessage(result.error || "Operazione non disponibile");
      setBusy(false);
      return;
    }
    window.location.assign(result.data.url);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Workspace billing
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-950">
              Piano e fatturazione
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Checkout e gestione abbonamento passano esclusivamente dalle
              pagine ospitate da Stripe. LitX conserva solo identificativi e
              stato del piano.
            </p>
          </div>
          {workspaces.length > 1 && (
            <label className="text-xs font-semibold text-gray-600">
              Workspace
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-gray-950">
                  {selected?.name || "Workspace"}
                </h2>
                <p className="text-xs text-gray-500">
                  Stato verificato lato server
                </p>
              </div>
            </div>
            {!status ? (
              <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento…
              </div>
            ) : (
              <div className="mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Piano" value={status.billingPlan} />
                  <Metric label="Stato" value={status.billingStatus} />
                </div>
                {status.subscriptionCurrentPeriodEnd && (
                  <p className="mt-4 text-xs text-gray-500">
                    Periodo corrente fino al{" "}
                    {new Date(
                      status.subscriptionCurrentPeriodEnd,
                    ).toLocaleDateString("it-IT")}
                    .
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  {status.hasSubscription ? (
                    <Button
                      onClick={() => void openBilling("portal")}
                      loading={busy}
                      icon={<ExternalLink className="h-4 w-4" />}
                    >
                      Gestisci su Stripe
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void openBilling("checkout")}
                      loading={busy}
                      disabled={!status.configured}
                      icon={<CreditCard className="h-4 w-4" />}
                    >
                      Attiva piano Pro
                    </Button>
                  )}
                </div>
                {!status.configured && (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    Billing non ancora aperto: servono prezzo, chiavi e webhook
                    Stripe configurati dall’agenzia.
                  </p>
                )}
              </div>
            )}
            {message && (
              <p
                role="status"
                className="mt-4 rounded-lg bg-brand-50 p-3 text-xs leading-5 text-brand-700"
              >
                {message}
              </p>
            )}
          </section>
          <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            <h2 className="mt-4 font-bold text-emerald-950">
              Pagamenti protetti
            </h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-emerald-800">
              <li>• Nessun numero di carta passa dai server LitX.</li>
              <li>• Webhook verificati con firma e idempotenza.</li>
              <li>• Solo il proprietario del workspace gestisce il piano.</li>
            </ul>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="mt-2 capitalize font-bold text-gray-950">{value}</p>
    </div>
  );
}
