import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  Check,
  Database,
  FileText,
  Globe2,
  MessageSquare,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'

const featureItems = [
  { icon: Zap, title: 'Automazioni', text: 'Workflow visuali' },
  { icon: Plug, title: 'Integrazioni', text: 'Strumenti del cliente' },
  { icon: MessageSquare, title: 'Canali', text: 'Widget e inbox' },
  { icon: BarChart3, title: 'Analytics', text: 'Qualità e costi' },
  { icon: ShieldCheck, title: 'Sicurezza', text: 'Controlli prima del go-live' },
  { icon: Rocket, title: 'Scalabile', text: 'Un agente per cliente' },
] as const

const integrations = ['WhatsApp', 'Instagram', 'Slack', 'Shopify', 'WordPress', 'Zapier', 'HubSpot', 'Calendly', 'Stripe']

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050710] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[780px] bg-[radial-gradient(circle_at_18%_20%,rgba(99,60,255,.18),transparent_32%),radial-gradient(circle_at_78%_16%,rgba(73,48,255,.14),transparent_35%)]" />
      <nav className="relative z-20 border-b border-white/[0.07] bg-[#050710]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1580px] items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_0_24px_rgba(99,60,255,.35)]"><Sparkles className="h-5 w-5" /></span>
            <span className="text-lg font-bold tracking-tight">LitX <span className="text-brand-400">AI</span></span>
          </Link>
          <div className="hidden items-center gap-6 text-xs text-white/55 md:flex"><a href="#piattaforma" className="transition hover:text-white">Piattaforma</a><a href="#workflow" className="transition hover:text-white">Workflow</a><a href="#integrazioni" className="transition hover:text-white">Integrazioni</a></div>
          <Link href="/dashboard" className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-400/40 bg-brand-600 px-4 text-xs font-semibold shadow-[0_0_22px_rgba(99,60,255,.22)] transition hover:bg-brand-500">Apri dashboard <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </nav>

      <div className="relative mx-auto max-w-[1580px] space-y-4 px-4 py-5 lg:px-6 lg:py-7">
        <section id="piattaforma" className="grid gap-4 xl:grid-cols-[320px_minmax(540px,1fr)_390px]">
          <Hero />
          <DashboardPreview />
          <AgentPreview />
        </section>

        <section aria-label="Funzionalità principali" className="grid overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0d17]/90 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {featureItems.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-5 last:border-0 sm:border-r lg:border-b-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-700/5 text-brand-300 ring-1 ring-brand-400/20"><Icon className="h-4 w-4" /></span>
              <div><h2 className="text-xs font-semibold">{title}</h2><p className="mt-1 text-[10px] text-white/40">{text}</p></div>
            </div>
          ))}
        </section>

        <section id="workflow" className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(560px,1fr)_590px]">
          <DesignSystem />
          <WorkflowPreview />
          <WidgetShowcase />
        </section>

        <section id="integrazioni" className="rounded-2xl border border-white/[0.08] bg-[#090c15] px-5 py-5 lg:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
            <div className="shrink-0"><p className="text-xs font-semibold">Integrazioni native</p><p className="mt-1 text-[10px] text-white/40">Collega gli strumenti già usati dal cliente.</p></div>
            <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {integrations.map((name, index) => <div key={name} className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-3 text-[10px] text-white/65"><span className={`h-2 w-2 rounded-full ${index % 3 === 0 ? 'bg-emerald-400' : index % 3 === 1 ? 'bg-brand-400' : 'bg-amber-400'}`} />{name}</div>)}
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 px-2 py-5 text-[10px] text-white/35 sm:flex-row">
          <span>LitX AI · Workspace privato per costruire gli agenti dei tuoi clienti</span>
          <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />Sistema operativo</span>
        </footer>
      </div>
    </main>
  )
}

function Hero() {
  return (
    <section className="relative flex min-h-[610px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080b14] p-6 lg:p-7">
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-brand-300"><Sparkles className="h-3 w-3" />AI Agent Studio</span>
        <h1 className="mt-7 text-[42px] font-bold leading-[1.05] tracking-[-.045em] sm:text-5xl xl:text-[50px]">Crea AI Agent che lavorano per i tuoi <span className="bg-gradient-to-r from-brand-300 via-brand-500 to-blue-400 bg-clip-text text-transparent">clienti.</span></h1>
        <p className="mt-6 text-sm leading-6 text-white/50">Costruisci chatbot intelligenti, collega le fonti, automatizza i processi e consegna un sistema pronto all’uso. Tutto dal tuo workspace privato.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/chatbots" className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-brand-600 to-blue-600 px-5 text-xs font-semibold shadow-[0_10px_35px_rgba(99,60,255,.28)] transition hover:brightness-110">Crea un agente <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/testing" className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.07]"><MessageSquare className="h-4 w-4" />Apri il playground</Link>
        </div>
      </div>
      <div className="relative mt-12">
        <div className="flex -space-x-2">{['SU', 'AI', 'KB', 'QA'].map((item, index) => <span key={item} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#080b14] text-[8px] font-bold ${index === 0 ? 'bg-white text-gray-950' : 'bg-brand-600/30 text-brand-200'}`}>{item}</span>)}</div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-white/45"><span className="text-amber-300">★★★★★</span><span>Prompt, fonti, test e pubblicazione controllata</span></div>
        <div className="mt-8 h-20 opacity-60"><svg viewBox="0 0 300 80" className="h-full w-full" aria-hidden="true"><defs><linearGradient id="wave" x1="0" x2="1"><stop stopColor="#633cff" stopOpacity="0" /><stop offset=".5" stopColor="#7c5cff" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs><path d="M0 58 C35 20 60 70 95 36 S155 8 185 44 245 65 300 20" fill="none" stroke="url(#wave)" strokeWidth="2" /><path d="M0 70 C50 40 75 75 120 55 S185 25 225 58 270 65 300 45" fill="none" stroke="url(#wave)" strokeOpacity=".45" /></svg></div>
      </div>
    </section>
  )
}

function DashboardPreview() {
  const metrics = [
    ['Conversazioni', '12.456', '+12,8%'],
    ['Lead raccolti', '2.341', '+21,4%'],
    ['Utenti unici', '8.912', '+15,7%'],
    ['Messaggi', '45.231', '+17,3%'],
    ['Costo AI', '€28,45', '-8,2%'],
  ]
  return (
    <section aria-label="Anteprima dashboard LitX AI" className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#090c15] shadow-[0_24px_80px_rgba(0,0,0,.35)]">
      <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-5"><div><p className="text-xs font-semibold">Dashboard</p><p className="mt-0.5 text-[8px] text-white/35">Panoramica degli agenti</p></div><div className="flex items-center gap-2"><span className="h-7 rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[8px] text-white/45">Ultimi 30 giorni</span><span className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-800" /></div></div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{metrics.map(([label, value, delta]) => <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[8px] text-white/40">{label}</p><p className="mt-2 text-base font-semibold tracking-tight">{value}</p><p className={`mt-1 text-[8px] ${delta.startsWith('-') ? 'text-emerald-400' : 'text-emerald-400'}`}>{delta}</p><div className="mt-2 flex h-3 items-end gap-0.5">{[2,5,3,8,6,10,7].map((height, index) => <span key={index} className="w-full rounded-sm bg-brand-500/70" style={{ height }} />)}</div></div>)}</div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div className="flex justify-between"><p className="text-[10px] font-semibold">Conversazioni nel tempo</p><p className="text-[8px] text-white/35">Preview dati</p></div><svg viewBox="0 0 560 180" className="mt-4 h-44 w-full" aria-hidden="true"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#633cff" stopOpacity=".35" /><stop offset="1" stopColor="#633cff" stopOpacity="0" /></linearGradient></defs>{[20,60,100,140].map(y => <line key={y} x1="0" x2="560" y1={y} y2={y} stroke="white" strokeOpacity=".05" />)}<path d="M0 145 C45 138 55 85 100 105 S165 55 205 78 270 120 315 82 360 40 402 66 455 115 500 62 540 42 560 50 L560 180 L0 180Z" fill="url(#area)" /><path d="M0 145 C45 138 55 85 100 105 S165 55 205 78 270 120 315 82 360 40 402 66 455 115 500 62 540 42 560 50" fill="none" stroke="#7c5cff" strokeWidth="3" /></svg></div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[10px] font-semibold">Top intent</p><div className="mt-4 space-y-4">{[['Informazioni',32],['Prezzi',24],['Supporto',18],['Prenotazioni',12]].map(([name, value]) => <div key={name as string}><div className="flex justify-between text-[8px]"><span className="text-white/50">{name}</span><span>{value}%</span></div><div className="mt-1.5 h-1 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-blue-500" style={{ width: `${value}%` }} /></div></div>)}</div></div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <MiniPanel title="Ultime conversazioni"><p className="flex justify-between"><span>Giulia Rossi</span><span className="text-emerald-400">Lead</span></p><p className="flex justify-between"><span>Marco B.</span><span className="text-blue-400">Cliente</span></p></MiniPanel>
          <MiniPanel title="AI Agent attivi"><p className="flex justify-between"><span>Agente Vendite</span><span>2.456</span></p><p className="flex justify-between"><span>Supporto Clienti</span><span>1.882</span></p></MiniPanel>
          <MiniPanel title="Utilizzo AI"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'radial-gradient(circle at center,#090c15 55%,transparent 57%),conic-gradient(#7c5cff 73%,rgba(255,255,255,.08) 0)' }}>73%</div><div><p className="text-xs font-semibold">7.300</p><p className="text-[8px] text-white/35">token monitorati</p></div></div></MiniPanel>
        </div>
      </div>
    </section>
  )
}

function AgentPreview() {
  return (
    <section className="flex flex-col gap-4">
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090c15] p-6">
        <div className="absolute right-0 top-10 h-48 w-48 rounded-full bg-brand-600/20 blur-3xl" />
        <p className="text-xl font-semibold leading-tight">AI Agent<br /><span className="text-white/65">capiscono, rispondono e agiscono.</span></p>
        <div className="relative mt-7 flex min-h-52 items-center justify-center">
          <div className="absolute left-0 top-4 space-y-3"><ActionPill icon={<Check />} text="Risponde nel tono giusto" tone="green" /><ActionPill icon={<Database />} text="Recupera dalle fonti" tone="brand" /><ActionPill icon={<CalendarCheck />} text="Prenota appuntamenti" tone="amber" /></div>
          <div className="relative ml-20 mt-8">
            <div className="absolute inset-0 scale-125 rounded-full bg-brand-600/30 blur-2xl" />
            <div className="relative flex h-32 w-32 items-center justify-center rounded-[42%] border border-brand-300/50 bg-gradient-to-br from-brand-400 via-brand-700 to-blue-700 shadow-[inset_0_0_30px_rgba(255,255,255,.18),0_0_40px_rgba(99,60,255,.38)]">
              <div className="flex h-20 w-24 items-center justify-center gap-6 rounded-[42%] bg-[#070a18] shadow-inner"><span className="h-4 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /><span className="h-4 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /></div>
            </div>
            <div className="mx-auto h-7 w-20 rounded-b-full bg-gradient-to-b from-brand-700 to-brand-950" />
          </div>
        </div>
        <div className="relative mt-5 flex items-end justify-between gap-4"><p className="max-w-48 text-[11px] leading-5 text-white/45">Trasforma le conversazioni in azioni concrete e tracciabili.</p><Link href="/chatbots" className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-400/50 px-4 text-[10px] font-semibold text-brand-200">Configura <ArrowRight className="h-3 w-3" /></Link></div>
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-[#090c15] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Allena con qualsiasi fonte</p><p className="mt-1 text-[9px] text-white/35">Sincronizzazione e indicizzazione controllate</p></div><Link href="/knowledge/import" className="rounded-lg bg-brand-600 px-3 py-2 text-[9px] font-semibold">Aggiungi fonte</Link></div><div className="mt-4 grid grid-cols-5 gap-2">{[['Sito',Globe2],['PDF',FileText],['DOCX',FileText],['FAQ',MessageSquare],['Drive',Database]].map(([name, icon]) => { const Icon = icon as typeof Globe2; return <div key={name as string} className="flex flex-col items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] py-3 text-[8px] text-white/55"><Icon className="h-4 w-4 text-brand-300" />{name as string}</div> })}</div></div>
    </section>
  )
}

function DesignSystem() {
  return <section className="rounded-2xl border border-white/[0.08] bg-[#090c15] p-5"><p className="text-xs font-semibold">Design System</p><div className="mt-5 space-y-3"><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[9px] text-white/35">Colori</p><div className="mt-3 flex gap-2">{['#633cff','#7c5cff','#4521ba','#111827','#fff'].map(color => <span key={color} className="h-7 w-7 rounded-full border border-white/10" style={{ backgroundColor: color }} />)}</div></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[9px] text-white/35">Tipografia</p><p className="mt-2 text-3xl font-semibold">Aa <span className="text-[9px] font-normal text-white/40">Inter · chiara e leggibile</span></p></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[9px] text-white/35">Componenti</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-md bg-brand-600 px-3 py-2 text-[8px]">Primary</span><span className="rounded-md border border-white/10 px-3 py-2 text-[8px]">Secondary</span><span className="flex w-9 items-center rounded-full bg-brand-600 p-1"><span className="ml-auto h-3 w-3 rounded-full bg-white" /></span></div></div></div></section>
}

function WorkflowPreview() {
  return (
    <section className="relative min-h-[390px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090c15] p-5">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.25) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
      <div className="relative flex items-center justify-between"><div><p className="text-xs font-semibold">AI Automation Builder</p><p className="mt-1 text-[9px] text-white/35">Crea workflow visuali per ogni cliente</p></div><Link href="/workflow" className="rounded-md bg-brand-600 px-3 py-2 text-[9px] font-semibold">Nuovo workflow</Link></div>
      <div className="relative mt-12 hidden min-h-64 sm:block">
        <Connector className="left-[16%] top-[34px] w-[20%]" />
        <Connector className="left-[48%] top-[34px] w-[20%]" />
        <Connector className="left-[36%] top-[85px] h-[70px] w-px" vertical />
        <Node className="left-[2%] top-0" icon={<Zap />} title="Nuovo messaggio" meta="Trigger" />
        <Node className="left-[36%] top-0" icon={<Sparkles />} title="Classifica intento" meta="AI" highlight />
        <Node className="right-[2%] top-0" icon={<Database />} title="Aggiorna CRM" meta="Azione" />
        <Node className="left-[25%] top-[150px]" icon={<MessageSquare />} title="Invia email" meta="Azione" />
        <Node className="right-[22%] top-[150px]" icon={<Check />} title="Fine" meta="Completato" />
      </div>
      <div className="relative mt-8 grid gap-2 sm:hidden">{['Nuovo messaggio','Classifica intento','Aggiorna CRM','Invia email'].map((name, index) => <div key={name} className="rounded-lg border border-white/[0.08] bg-[#111522] p-3 text-[10px]"><span className="mr-2 text-brand-300">{index + 1}</span>{name}</div>)}</div>
    </section>
  )
}

function WidgetShowcase() {
  return <section className="grid gap-4 rounded-2xl border border-white/[0.08] bg-[#090c15] p-4 sm:grid-cols-[150px_minmax(0,1fr)_180px]"><div className="rounded-2xl border border-white/[0.08] bg-[#070912] p-3"><div className="mx-auto h-1 w-12 rounded-full bg-white/15" /><p className="mt-5 text-[8px] text-white/35">Agente Vendite</p><p className="mt-1 text-lg font-semibold">1.234</p><div className="mt-4 flex h-20 items-end gap-1">{[25,42,35,68,55,80,65,90].map((height,index)=><span key={index} className="w-full rounded-t bg-brand-500/80" style={{height:`${height}%`}} />)}</div><div className="mt-5 space-y-2"><div className="rounded-lg bg-white/[0.04] p-2 text-[8px]">Prezzi <span className="float-right">24%</span></div><div className="rounded-lg bg-white/[0.04] p-2 text-[8px]">Servizi <span className="float-right">18%</span></div></div></div><div className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070912]"><div className="flex items-center gap-2 border-b border-white/[0.07] p-3"><span className="h-6 w-6 rounded-full bg-brand-600" /><div><p className="text-[9px] font-semibold">LitX AI Assistant</p><p className="text-[7px] text-emerald-400">Online</p></div></div><div className="flex-1 space-y-3 p-4 text-[9px]"><p className="max-w-[75%] rounded-xl rounded-tl-sm bg-white/[0.06] p-3">Ciao! Come posso aiutarti oggi?</p><p className="ml-auto max-w-[75%] rounded-xl rounded-tr-sm bg-brand-600 p-3">Vorrei informazioni sui vostri servizi</p><p className="max-w-[75%] rounded-xl rounded-tl-sm bg-white/[0.06] p-3">Certo! Ti mostro le opzioni principali.</p></div><div className="border-t border-white/[0.07] p-3 text-[8px] text-white/30">Scrivi un messaggio...</div></div><div className="rounded-2xl border border-white/[0.08] bg-[#070912] p-4"><p className="text-[10px] font-semibold">Anteprima Widget</p><div className="mt-4 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 p-3"><p className="text-[10px] font-semibold">Ciao! Sono il tuo AI Assistant 👋</p><p className="mt-2 text-[8px] text-white/65">Come posso aiutarti?</p><div className="mt-4 space-y-2">{['Informazioni sui servizi','Prezzi','Prenota una call'].map(item=><div key={item} className="rounded-md bg-white px-2 py-2 text-[8px] font-medium text-brand-700">{item}</div>)}</div></div><div className="ml-auto mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 shadow-[0_0_20px_rgba(99,60,255,.4)]"><MessageSquare className="h-4 w-4" /></div></div></section>
}

function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[9px] font-semibold">{title}</p><div className="mt-3 space-y-2 text-[8px] text-white/45">{children}</div></div>
}

function ActionPill({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: 'green' | 'brand' | 'amber' }) {
  const colors = tone === 'green' ? 'text-emerald-300 bg-emerald-400/10' : tone === 'amber' ? 'text-amber-300 bg-amber-400/10' : 'text-brand-300 bg-brand-400/10'
  return <div className="flex w-40 items-center gap-2 rounded-lg border border-white/[0.07] bg-[#101421]/90 p-2 text-[8px] text-white/65"><span className={`flex h-6 w-6 items-center justify-center rounded-md ${colors}`}>{icon}</span>{text}</div>
}

function Node({ className, icon, title, meta, highlight = false }: { className: string; icon: React.ReactNode; title: string; meta: string; highlight?: boolean }) {
  return <div className={`absolute z-10 w-[160px] rounded-xl border p-3 shadow-xl ${highlight ? 'border-brand-400/50 bg-[#17142b]' : 'border-white/[0.1] bg-[#111522]'} ${className}`}><div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${highlight ? 'bg-brand-500/20 text-brand-300' : 'bg-white/[0.05] text-white/55'}`}>{icon}</span><div><p className="text-[9px] font-semibold">{title}</p><p className="text-[7px] text-white/30">{meta}</p></div></div></div>
}

function Connector({ className, vertical = false }: { className: string; vertical?: boolean }) {
  return <span className={`absolute bg-gradient-to-r from-brand-500/20 via-brand-400/80 to-brand-500/20 ${vertical ? 'bg-gradient-to-b' : 'h-px'} ${className}`} />
}
