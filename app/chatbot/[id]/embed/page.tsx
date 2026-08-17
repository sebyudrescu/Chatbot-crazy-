'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Bot, Check, ChevronLeft, Clipboard, Code2, ExternalLink, MessageCircle, Monitor, Save, Smartphone, Tablet } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface EmbedSettings {
  enabled: boolean
  title: string
  subtitle: string
  theme: 'light' | 'dark'
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  primaryColor: string
  secondaryColor: string
  launcherColor: string
  brandLogoUrl: string
  autoOpen: boolean
  showLauncher: boolean
  launcherMessageEnabled: boolean
  launcherMessage: string
  launcherMessageDelay: number
  launcherMessageDuration: number
  customCSS: string
  allowedDomains: string
  widgetShape: 'circle' | 'rounded' | 'square'
  iconType: 'emoji' | 'logo' | 'icon'
  iconValue: string
  widgetSize: 'small' | 'medium' | 'large'
  animation: boolean
  shadow: boolean
  gradient: boolean
}

const initial: EmbedSettings = {
  enabled: false,
  title: 'AI Assistant',
  subtitle: 'Come posso aiutarti?',
  theme: 'light',
  position: 'bottom-right',
  primaryColor: '#633cff',
  secondaryColor: '#825cff',
  launcherColor: '#633cff',
  brandLogoUrl: '',
  autoOpen: false,
  showLauncher: true,
  launcherMessageEnabled: false,
  launcherMessage: '',
  launcherMessageDelay: 1500,
  launcherMessageDuration: 12000,
  customCSS: '',
  allowedDomains: '',
  widgetShape: 'circle',
  iconType: 'emoji',
  iconValue: '💬',
  widgetSize: 'medium',
  animation: true,
  shadow: true,
  gradient: true,
}

export default function EmbedPage() {
  const { id } = useParams<{ id: string }>()
  const [settings, setSettings] = useState<EmbedSettings>(initial)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetch(`/api/chatbots/${id}/embed`)
      .then(response => response.json())
      .then(result => setSettings({ ...initial, title: result.name || initial.title, ...(result.embedSettings || {}) }))
      .finally(() => setLoading(false))
  }, [id])

  const set = <K extends keyof EmbedSettings>(key: K, value: EmbedSettings[K]) => {
    setSettings(current => ({ ...current, [key]: value }))
  }
  const code = useMemo(() => {
    const origin = typeof window === 'undefined' ? 'https://app.litx.ai' : window.location.origin
    return `<script>\n  window.ChatbotConfig = { botId: '${id}' };\n</script>\n<script async src="${origin}/api/embed/widget.js?botId=${id}"></script>`
  }, [id])

  const save = async () => {
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch(`/api/chatbots/${id}/embed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Salvataggio non riuscito')
      setSettings(current => ({ ...current, ...result }))
      setNotice('Widget salvato correttamente.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Salvataggio non riuscito.')
    } finally {
      setSaving(false)
    }
  }
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (loading) return <DashboardLayout><LoadingSpinner fullPage text="Caricamento widget builder..." /></DashboardLayout>

  return <DashboardLayout>
    <div className="mx-auto max-w-[1500px] p-5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><Link href="/chatbots" className="rounded-lg border bg-white p-2 text-gray-500"><ChevronLeft className="h-4 w-4" /></Link><div><p className="eyebrow">Widget builder</p><h1 className="mt-1 text-2xl font-bold text-gray-950">Personalizza il widget</h1><p className="mt-1 text-sm text-gray-500">Logo, colori, invito iniziale e comportamento per il sito del cliente.</p></div></div>
        <div className="flex items-center gap-2"><label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-gray-600"><input type="checkbox" checked={settings.enabled} onChange={event => set('enabled', event.target.checked)} className="accent-brand-600" />Widget attivo</label><Button onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>Salva modifiche</Button></div>
      </div>
      {notice && <div className={`mt-4 rounded-lg px-4 py-3 text-xs ${notice.includes('correttamente') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice}</div>}

      <div className="mt-6 grid gap-5 xl:grid-cols-[350px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <Panel title="Identità"><Field label="Titolo"><input className="input" value={settings.title} onChange={event => set('title', event.target.value)} maxLength={120} /></Field><Field label="Sottotitolo"><input className="input" value={settings.subtitle} onChange={event => set('subtitle', event.target.value)} maxLength={300} /></Field></Panel>
          <Panel title="Brand e logo">
            <Field label="Logo URL (HTTPS)"><input type="url" className="input" value={settings.brandLogoUrl} onChange={event => { const value = event.target.value; setSettings(current => ({ ...current, brandLogoUrl: value, ...(current.iconType === 'logo' ? { iconValue: value } : {}) })) }} placeholder="https://cdn.shopify.com/.../logo.png" /><p className="mt-1 text-[10px] leading-4 text-gray-400">Incolla l’URL pubblico del logo Shopify, PNG, JPG, WebP o SVG.</p></Field>
            <div className="grid grid-cols-2 gap-3"><ColorField label="Principale" value={settings.primaryColor} onChange={value => set('primaryColor', value)} /><ColorField label="Secondario" value={settings.secondaryColor} onChange={value => set('secondaryColor', value)} /><ColorField label="Sfondo launcher" value={settings.launcherColor} onChange={value => set('launcherColor', value)} /><Select label="Tema" value={settings.theme} onChange={value => set('theme', value as EmbedSettings['theme'])} options={[["light","Chiaro"],["dark","Scuro"]]} /></div>
            <Select label="Contenuto launcher" value={settings.iconType} onChange={value => { const iconType = value as EmbedSettings['iconType']; setSettings(current => ({ ...current, iconType, iconValue: iconType === 'logo' ? (current.brandLogoUrl || current.iconValue) : current.iconValue })) }} options={[["emoji","Emoji"],["logo","Logo URL"],["icon","Icona"]]} />
            {settings.iconType === 'logo' ? <Field label="URL logo launcher"><input type="url" className="input" value={settings.iconValue} onChange={event => set('iconValue', event.target.value)} placeholder="https://.../logo.png" /></Field> : <Field label="Icona o emoji"><input className="input" value={settings.iconValue} onChange={event => set('iconValue', event.target.value)} maxLength={16} /></Field>}
            <div className="grid grid-cols-2 gap-3"><Select label="Forma" value={settings.widgetShape} onChange={value => set('widgetShape', value as EmbedSettings['widgetShape'])} options={[["circle","Cerchio"],["rounded","Arrotondato"],["square","Quadrato"]]} /><Select label="Dimensione" value={settings.widgetSize} onChange={value => set('widgetSize', value as EmbedSettings['widgetSize'])} options={[["small","Piccolo"],["medium","Medio"],["large","Grande"]]} /></div>
          </Panel>
          <Panel title="Invito iniziale">
            <Toggle label="Mostra call to action" checked={settings.launcherMessageEnabled} onChange={value => set('launcherMessageEnabled', value)} />
            <Field label="Testo"><textarea className="textarea" rows={3} maxLength={160} value={settings.launcherMessage} onChange={event => set('launcherMessage', event.target.value)} placeholder="Hai bisogno d’aiuto? Ti rispondiamo subito." /><p className="mt-1 text-right text-[10px] text-gray-400">{settings.launcherMessage.length} / 160</p></Field>
            <div className="grid grid-cols-2 gap-3"><Select label="Comparsa" value={String(settings.launcherMessageDelay)} onChange={value => set('launcherMessageDelay', Number(value))} options={[["0","Subito"],["800","0,8 secondi"],["1500","1,5 secondi"],["3000","3 secondi"]]} /><Select label="Durata" value={String(settings.launcherMessageDuration)} onChange={value => set('launcherMessageDuration', Number(value))} options={[["0","Sempre"],["8000","8 secondi"],["12000","12 secondi"],["20000","20 secondi"]]} /></div>
          </Panel>
          <Panel title="Comportamento"><Toggle label="Mostra launcher" checked={settings.showLauncher} onChange={value => set('showLauncher', value)} /><Toggle label="Apri automaticamente" checked={settings.autoOpen} onChange={value => set('autoOpen', value)} /><Toggle label="Animazione" checked={settings.animation} onChange={value => set('animation', value)} /><Toggle label="Ombra" checked={settings.shadow} onChange={value => set('shadow', value)} /><Toggle label="Gradiente" checked={settings.gradient} onChange={value => set('gradient', value)} /></Panel>
        </aside>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-3"><div><p className="text-xs font-semibold text-gray-900">Anteprima interattiva</p><p className="text-[10px] text-gray-400">Controlla logo, CTA, desktop, tablet e mobile</p></div><div className="flex rounded-lg bg-gray-100 p-1">{([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([value, Icon]) => <button key={value} aria-label={value} onClick={() => setDevice(value)} className={`rounded-md p-2 ${device === value ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400'}`}><Icon className="h-4 w-4" /></button>)}</div></div>
          <div className="flex min-h-[720px] items-center justify-center bg-[#f3f4f7] p-6"><div className={`relative overflow-hidden border bg-white shadow-medium transition-all ${device === 'desktop' ? 'h-[610px] w-full' : device === 'tablet' ? 'h-[620px] w-[540px]' : 'h-[650px] w-[330px]'} rounded-xl`}><div className="flex h-14 items-center justify-between border-b px-5"><span className="text-sm font-bold">Sito del cliente</span><div className="flex gap-4 text-[10px] text-gray-400"><span>Home</span><span>Shop</span><span>Contatti</span></div></div><div className="p-8"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-4 h-10 w-3/4 rounded bg-gray-100" /><div className="mt-3 h-3 w-1/2 rounded bg-gray-100" /></div><WidgetPreview settings={settings} /></div></div>
        </section>

        <aside className="space-y-4"><Panel title="Posizionamento"><Select label="Posizione" value={settings.position} onChange={value => set('position', value as EmbedSettings['position'])} options={[["bottom-right","Basso a destra"],["bottom-left","Basso a sinistra"],["top-right","Alto a destra"],["top-left","Alto a sinistra"]]} /><Field label="Domini consentiti"><textarea className="textarea" rows={3} value={settings.allowedDomains} onChange={event => set('allowedDomains', event.target.value)} placeholder="cliente.it, www.cliente.it" /><p className="mt-1 text-[10px] text-gray-400">Uno per riga o separati da virgola. Vuoto consente tutti.</p></Field></Panel><Panel title="Codice installazione"><p className="text-[11px] leading-5 text-gray-500">Incolla questo codice prima di <code>&lt;/body&gt;</code> nel sito del cliente.</p><pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-3 text-[10px] leading-5 text-gray-200">{code}</pre><Button fullWidth variant="secondary" onClick={copy} icon={copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}>{copied ? 'Copiato' : 'Copia codice'}</Button></Panel><div className="rounded-xl border border-brand-100 bg-brand-50 p-4"><div className="flex items-center gap-2 text-brand-700"><Code2 className="h-4 w-4" /><p className="text-xs font-semibold">Pronto per il cliente</p></div><p className="mt-2 text-[11px] leading-5 text-brand-700">Salva, abilita il widget e provalo sul dominio autorizzato prima della consegna.</p><Link href={`/chat/${id}`} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700">Apri test completo <ExternalLink className="h-3 w-3" /></Link></div></aside>
      </div>
    </div>
  </DashboardLayout>
}

function safeLogoUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : '' } catch { return '' }
}

function WidgetPreview({ settings }: { settings: EmbedSettings }) {
  const isRight = settings.position.includes('right')
  const isTop = settings.position.includes('top')
  const size = settings.widgetSize === 'small' ? 48 : settings.widgetSize === 'large' ? 68 : 58
  const brandLogo = safeLogoUrl(settings.brandLogoUrl)
  const launcherLogo = settings.iconType === 'logo' ? safeLogoUrl(settings.iconValue) : ''
  const headerBackground = settings.gradient ? `linear-gradient(135deg, ${settings.primaryColor}, ${settings.secondaryColor})` : settings.primaryColor
  return <div className={`absolute ${isRight ? 'right-5' : 'left-5'} ${isTop ? 'top-20' : 'bottom-5'} flex flex-col ${isRight ? 'items-end' : 'items-start'} gap-3`}>
    {settings.enabled && <div className={`w-72 overflow-hidden rounded-2xl border ${settings.theme === 'dark' ? 'border-gray-700 bg-gray-900 text-white' : 'bg-white text-gray-900'} ${settings.shadow ? 'shadow-hard' : ''}`}><div className="flex items-center gap-3 p-4 text-white" style={{ background: headerBackground }}>{brandLogo ? <img src={brandLogo} alt="" className="h-9 w-16 rounded-lg bg-white object-contain p-1" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Bot className="h-4 w-4" /></div>}<div><p className="text-xs font-semibold">{settings.title}</p><p className="text-[9px] text-white/75">{settings.subtitle}</p></div></div><div className="p-4"><div className={`rounded-xl p-3 text-[11px] leading-5 ${settings.theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>Ciao! Come posso aiutarti?</div><div className="mt-3 flex gap-2"><span className="rounded-lg border px-2 py-1 text-[9px]" style={{ color: settings.primaryColor }}>Informazioni</span><span className="rounded-lg border px-2 py-1 text-[9px]" style={{ color: settings.primaryColor }}>Prodotti</span></div></div><div className="flex items-center border-t px-4 py-3 text-[10px] text-gray-400">Scrivi un messaggio...<MessageCircle className="ml-auto h-4 w-4" style={{ color: settings.primaryColor }} /></div></div>}
    {settings.showLauncher && <div className="flex items-end gap-2">{settings.launcherMessageEnabled && settings.launcherMessage && <div className="max-w-48 rounded-xl border bg-white px-3 py-2 text-[10px] font-medium leading-4 text-gray-800 shadow-medium">{settings.launcherMessage}</div>}<div className={`${settings.widgetShape === 'circle' ? 'rounded-full' : settings.widgetShape === 'rounded' ? 'rounded-2xl' : 'rounded-md'} flex items-center justify-center overflow-hidden text-xl ${settings.shadow ? 'shadow-hard' : ''}`} style={{ width: size, height: size, background: settings.launcherColor, color: settings.primaryColor }}>{launcherLogo ? <img src={launcherLogo} alt="" className="h-full w-full object-contain p-2" /> : settings.iconValue || '💬'}</div></div>}
  </div>
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="card space-y-4 p-4"><h2 className="text-xs font-semibold text-gray-900">{title}</h2>{children}</div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-gray-600">{label}</span>{children}</label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><div className="flex gap-2"><input type="color" value={value} onChange={event => onChange(event.target.value)} className="h-10 w-12 rounded border" /><input value={value} onChange={event => onChange(event.target.value)} className="input min-w-0 font-mono text-[10px]" maxLength={7} /></div></Field> }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) { return <Field label={label}><select value={value} onChange={event => onChange(event.target.value)} className="input text-xs">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field> }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between text-[11px] text-gray-600"><span>{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-gray-200'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-[18px]' : 'left-0.5'}`} /></button></label> }
