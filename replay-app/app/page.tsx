'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  CloudDownload,
  Film,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'
import {
  ApiError,
  getDownloadUrl,
  getMe,
  getThumbnailUrl,
  getToken,
  isSessionLocked,
  listReplays,
  lockSession,
  logout as encerrarSessao,
  requestOtp,
  setToken,
  verifyOtp,
  type AuthResponse,
  type PerfilResponse,
  type ReplayRow,
} from '@/lib/api'

type View = 'landing' | 'email' | 'otp' | 'dashboard' | 'detail'
type AuthSuccess = Extract<AuthResponse, { status: 'autenticado' }>
type Replay = {
  id: number
  court: string
  date: string
  time: string
  day: string
  duration: string
  expired?: boolean
}

const OTP_SECONDS = 5 * 60
const DAY_MS = 24 * 60 * 60 * 1000

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDuration(seg: number | null): string {
  const total = seg ?? 30
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function mapReplay(row: ReplayRow): Replay {
  const created = new Date(row.created_at)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startYesterday = new Date(startToday)
  startYesterday.setDate(startYesterday.getDate() - 1)

  let day = created.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
  if (created >= startToday) day = 'Hoje'
  else if (created >= startYesterday) day = 'Ontem'

  return {
    id: row.id,
    court: row.quadra,
    date: created.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    day,
    duration: formatDuration(row.duracao_seg),
    expired: now.getTime() - created.getTime() > DAY_MS,
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome
}

function inicial(nome: string): string {
  const letra = nome.trim().charAt(0)
  return letra ? letra.toUpperCase() : 'A'
}

function triggerFileDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function Brand({ onClick }: { onClick?: () => void }) {
  return <button onClick={onClick} className="brand" aria-label="ReplayHum, início"><span className="brand-mark"><Play fill="currentColor" data-icon="inline-start" /></span><span>Replay<span>Hum</span></span></button>
}

function Button({ children, variant = 'primary', onClick, disabled, type = 'button' }: { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`button button-${variant}`}>{children}</button>
}

function PublicHeader({ onLogin }: { onLogin: () => void }) {
  return <header className="site-header"><Brand /><nav><a href="#como-funciona">Como funciona</a><a href="#beneficios">Benefícios</a><Button variant="secondary" onClick={onLogin}>Acessar meus replays <ArrowRight data-icon="inline-end" /></Button></nav><button className="mobile-menu" aria-label="Abrir menu"><Menu /></button></header>
}

function Landing({ onLogin }: { onLogin: () => void }) {
  return <div className="landing"><PublicHeader onLogin={onLogin} /><main>
    <section className="hero container"><div className="hero-copy"><div className="eyebrow"><Sparkles data-icon="inline-start" /> Seu momento, do seu jeito</div><h1>Reviva os melhores momentos da sua partida.</h1><p className="hero-text">Assista aos seus replays esportivos em poucos segundos. Acesse, assista e baixe suas jogadas diretamente pelo celular.</p><div className="hero-actions"><Button onClick={onLogin}>Ver meus replays <ArrowRight data-icon="inline-end" /></Button><span><ShieldCheck data-icon="inline-start" /> Disponível para alunos cadastrados</span></div></div><div className="hero-visual"><div className="video-preview"><img src="/replay-court.png" alt="Replay de uma quadra esportiva" /><div className="video-top"><span className="live-dot">REPLAY</span><span>00:30</span></div><button className="play-button" aria-label="Reproduzir prévia"><Play fill="currentColor" /></button><div className="video-bottom"><span>Quadra 2</span><span>19:42</span></div></div><div className="floating-card"><span className="avatar-small">JS</span><div><strong>Seu replay está pronto</strong><small>Agora mesmo · Arena Central</small></div><Check className="success-icon" /></div></div></section>
    <section id="como-funciona" className="steps-section"><div className="container"><div className="section-heading"><span className="eyebrow">Simples desde o primeiro ponto</span><h2>Como funciona</h2><p>Da quadra para o seu celular em três passos.</p></div><div className="steps-grid"><Step number="01" icon={<Trophy />} title="Jogue" text="Faça sua jogada normalmente." /><Step number="02" icon={<Zap />} title="Acione o replay" text="Pressione o botão disponível na quadra ao terminar." /><Step number="03" icon={<Smartphone />} title="Reviva" text="Acesse seus últimos 30 segundos pelo celular." /></div></div></section>
    <section id="beneficios" className="benefits-section"><div className="container benefits-layout"><div><span className="eyebrow">Feito para o seu jogo</span><h2>Seu melhor lance merece replay.</h2><p>Uma experiência rápida e segura para você guardar cada momento importante.</p></div><div className="benefits-grid"><Benefit icon={<Film />} title="Tudo em um só lugar" /><Benefit icon={<Smartphone />} title="Acesso rápido pelo celular" /><Benefit icon={<Clock3 />} title="Assista quando quiser" /><Benefit icon={<CloudDownload />} title="Baixe seus vídeos" /><Benefit icon={<LockKeyhole />} title="Acesso exclusivo e seguro" /></div></div></section>
    <section className="final-cta container"><div><span className="eyebrow">Próximo ponto: o replay</span><h2>Pronto para rever sua jogada?</h2><p>Entre com o e-mail cadastrado pela sua academia para acessar seus replays.</p></div><Button onClick={onLogin}>Acessar meus replays <ArrowRight data-icon="inline-end" /></Button></section>
  </main><footer className="footer container"><Brand /><span>Acesso exclusivo para alunos cadastrados</span><span>Fale com a recepção da sua academia caso precise de ajuda.</span></footer></div>
}

function Step({ number, icon, title, text }: { number: string; icon: React.ReactNode; title: string; text: string }) { return <div className="step"><div className="step-top"><span>{number}</span><div className="step-icon">{icon}</div></div><h3>{title}</h3><p>{text}</p></div> }
function Benefit({ icon, title }: { icon: React.ReactNode; title: string }) { return <div className="benefit"><span>{icon}</span><strong>{title}</strong></div> }

function AuthHeader({ onBack }: { onBack: () => void }) { return <header className="auth-header container"><Brand onClick={onBack} /><span className="secure-label"><LockKeyhole data-icon="inline-start" /> Acesso seguro</span></header> }

function Login({ view, setView, onAuthenticated }: { view: 'email' | 'otp'; setView: (v: View) => void; onAuthenticated: (result: AuthSuccess) => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(OTP_SECONDS)
  const [otpTick, setOtpTick] = useState(0)
  const [hasSavedSession, setHasSavedSession] = useState(() => !!getToken())

  useEffect(() => {
    if (view !== 'otp') return
    setSecondsLeft(OTP_SECONDS)
    const id = window.setInterval(() => {
      setSecondsLeft(s => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [view, otpTick])

  function goAuthenticated(result: AuthResponse) {
    if (result.status !== 'autenticado') return false
    onAuthenticated(result)
    return true
  }

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.includes('@')) {
      setError('Digite um e-mail válido.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await requestOtp(email)
      if (!goAuthenticated(result)) setView('otp')
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível enviar o código.'))
    } finally {
      setLoading(false)
    }
  }

  const switchAccount = async () => {
    await encerrarSessao()
    setHasSavedSession(false)
    setError('')
  }

  const submitCode = async () => {
    const codigo = code.join('')
    if (codigo.length < 6) {
      setOtpError('Digite os 6 dígitos do código.')
      return
    }
    setOtpLoading(true)
    setOtpError('')
    try {
      const result = await verifyOtp(email, codigo)
      if (!goAuthenticated(result)) {
        setOtpError('Não foi possível confirmar o código.')
      }
    } catch (err) {
      setOtpError(errorMessage(err, 'Código inválido ou expirado.'))
    } finally {
      setOtpLoading(false)
    }
  }

  const resendCode = async () => {
    setOtpError('')
    try {
      const result = await requestOtp(email)
      if (goAuthenticated(result)) return
      setCode(['', '', '', '', '', ''])
      setOtpTick(n => n + 1)
      setOtpError('Um novo código foi enviado para o seu e-mail.')
    } catch (err) {
      setOtpError(errorMessage(err, 'Não foi possível reenviar o código.'))
    }
  }

  const updateCode = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...code]
    next[index] = digit
    setCode(next)
    if (digit && index < 5) document.getElementById(`otp-${index + 1}`)?.focus()
  }

  return (
    <div className="auth-page">
      <AuthHeader onBack={() => setView('landing')} />
      <main className="auth-main">
        {view === 'email' ? (
          <form className="auth-card" onSubmit={submitEmail}>
            <div className="auth-icon"><Mail /></div>
            <span className="eyebrow">Área do aluno</span>
            <h1>Acesse seus replays</h1>
            <p>Use o e-mail cadastrado pela sua academia para entrar.</p>
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} placeholder="voce@email.com" aria-invalid={!!error} />
            {error && <span className="field-error">{error}</span>}
            <Button type="submit" disabled={loading}>
              {loading
                ? (hasSavedSession ? 'Entrando...' : 'Enviando código...')
                : hasSavedSession
                  ? <>Entrar <ArrowRight data-icon="inline-end" /></>
                  : <>Enviar código <ArrowRight data-icon="inline-end" /></>}
            </Button>
            {hasSavedSession && (
              <button className="back-link" type="button" onClick={() => void switchAccount()}>Usar outro e-mail</button>
            )}
            <small>Não tem cadastro? Fale com a recepção da sua academia.</small>
            <button className="back-link" type="button" onClick={() => setView('landing')}><ArrowLeft data-icon="inline-start" /> Voltar para o início</button>
          </form>
        ) : (
          <div className="auth-card">
            <button className="back-link otp-back" onClick={() => setView('email')}><ArrowLeft data-icon="inline-start" /> Voltar</button>
            <span className="eyebrow">Confirmação</span>
            <h1>Digite o código</h1>
            <p>Enviamos um código de 6 dígitos para <strong>{email || 'seu e-mail'}</strong>.</p>
            <div className="otp-row">{code.map((digit, index) => <input key={index} id={`otp-${index}`} inputMode="numeric" maxLength={1} value={digit} onChange={e => updateCode(e.target.value, index)} aria-label={`Dígito ${index + 1}`} />)}</div>
            {otpError && <span className="field-error">{otpError}</span>}
            <div className="expiry"><Clock3 /> Expira em <strong>{formatCountdown(secondsLeft)}</strong></div>
            <Button onClick={submitCode} disabled={otpLoading}>{otpLoading ? 'Confirmando...' : <>Confirmar <Check data-icon="inline-end" /></>}</Button>
            <button className="resend" onClick={resendCode}>Reenviar código</button>
          </div>
        )}
      </main>
    </div>
  )
}

function AppHeader({ onLogout, onHome, alunoNome, unidadeNome }: { onLogout: () => void; onHome: () => void; alunoNome?: string; unidadeNome?: string }) {
  const nome = alunoNome || 'Aluno'
  const unidade = unidadeNome || 'Sua academia'
  return (
    <header className="app-header">
      <div className="container app-header-inner">
        <Brand onClick={onHome} />
        <div className="unit">
          <span className="unit-dot" />
          <span><small>Unidade cadastrada</small><strong>{unidade}</strong></span>
          <ChevronDown />
        </div>
        <button className="user-menu" onClick={onLogout}>
          <span className="avatar">{inicial(nome)}</span>
          <span className="user-name">{nome}</span>
          <LogOut data-icon="inline-end" />
        </button>
      </div>
    </header>
  )
}

function Dashboard({ onDetail, onLogout, onUnauthorized, onHome, alunoNome, unidadeNome }: { onDetail: (r: Replay) => void; onLogout: () => void; onUnauthorized: () => void; onHome: () => void; alunoNome?: string; unidadeNome?: string }) {
  const [court, setCourt] = useState('')
  const [date, setDate] = useState('')
  const [courts, setCourts] = useState<string[]>([])
  const [replays, setReplays] = useState<Replay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showToast, setShowToast] = useState(false)
  const today = useMemo(() => isoDate(0), [])
  const yesterday = useMemo(() => isoDate(-1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const rows = await listReplays({
          quadra: court || undefined,
          data: date || undefined,
        })
        if (cancelled) return
        setReplays(rows.map(mapReplay))
        if (!court && !date) {
          setCourts([...new Set(rows.map(row => row.quadra))].sort())
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized()
          return
        }
        setError(errorMessage(err, 'Não foi possível carregar os replays.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [court, date, onUnauthorized])

  const clear = () => { setCourt(''); setDate('') }

  const startDownload = async (id: number) => {
    try {
      const { url } = await getDownloadUrl(id)
      triggerFileDownload(url, `replay-${id}.mp4`)
      setShowToast(true)
      window.setTimeout(() => setShowToast(false), 2400)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized()
      else setError(errorMessage(err, 'Não foi possível iniciar o download.'))
    }
  }

  return (
    <div className="app-page">
      <AppHeader onLogout={onLogout} onHome={onHome} alunoNome={alunoNome} unidadeNome={unidadeNome} />
      <main className="container dashboard-main">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">Área do aluno</span>
            <h1>Olá{alunoNome ? `, ${primeiroNome(alunoNome)}` : ''} <span className="wave">⌁</span></h1>
            <p>Confira seus últimos replays.</p>
          </div>
          <div className="replay-count"><strong>{loading ? '—' : replays.length}</strong><span>replays disponíveis</span></div>
        </div>
        <div className="filter-bar">
          <div className="filter-label">
            <span>Filtrar por</span>
            <label className="filter-select">
              <CalendarDays />
              <select value={date} onChange={e => setDate(e.target.value)} aria-label="Filtrar por data">
                <option value="">Todas as datas</option>
                <option value={today}>Hoje</option>
                <option value={yesterday}>Ontem</option>
              </select>
              <ChevronDown />
            </label>
            <label className="filter-select">
              <Trophy />
              <select value={court} onChange={e => setCourt(e.target.value)} aria-label="Filtrar por quadra">
                <option value="">Todas as quadras</option>
                {courts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDown />
            </label>
          </div>
          <span className="availability"><Clock3 /> Disponíveis por até 24 horas</span>
        </div>
        <div className="mobile-filters">
          <label>Data
            <select value={date} onChange={e => setDate(e.target.value)}>
              <option value="">Todas as datas</option>
              <option value={today}>Hoje</option>
              <option value={yesterday}>Ontem</option>
            </select>
          </label>
          <label>Quadra
            <select value={court} onChange={e => setCourt(e.target.value)}>
              <option value="">Todas as quadras</option>
              {courts.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="field-error" style={{ marginTop: 16 }}>{error}</p>}
        {loading ? (
          <div className="replay-grid" aria-busy="true" aria-label="Carregando replays">
            {Array.from({ length: 6 }).map((_, i) => (
              <article key={i} className="replay-card is-skeleton">
                <div className="thumb"><span className="skeleton" /></div>
                <div className="replay-info">
                  <div>
                    <div className="skeleton skeleton-line short" />
                    <div className="skeleton skeleton-line long" />
                  </div>
                  <div className="card-actions">
                    <div className="skeleton skeleton-btn" />
                    <div className="skeleton skeleton-icon" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : replays.length ? (
          <div className="replay-grid">
            {replays.map(replay => (
              <ReplayCard
                key={replay.id}
                replay={replay}
                onDetail={() => onDetail(replay)}
                onDownload={() => startDownload(replay.id)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><Film /></div>
            <h2>Nenhum replay encontrado</h2>
            <p>Assim que uma nova jogada estiver disponível, ela aparecerá aqui.</p>
            {(court || date) && <Button variant="secondary" onClick={clear}>Limpar filtros</Button>}
          </div>
        )}
      </main>
      {showToast && <div className="toast"><Check /> Download iniciado</div>}
    </div>
  )
}

function ReplayCard({ replay, onDetail, onDownload }: { replay: Replay; onDetail: () => void; onDownload: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getThumbnailUrl(replay.id)
      .then(({ url }) => { if (!cancelled) setThumb(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [replay.id])

  return (
    <article className={`replay-card ${replay.expired ? 'is-expired' : ''}`}>
      <button className="thumb" onClick={onDetail} aria-label={`Assistir replay da ${replay.court}`}>
        {thumb ? <img src={thumb} alt="Thumbnail do replay" /> : <span className="skeleton" />}
        <span className="thumb-overlay"><Play fill="currentColor" /></span>
        <span className="duration">{replay.duration}</span>
        {replay.expired && <span className="expired-label">Expirado</span>}
      </button>
      <div className="replay-info">
        <div>
          <span className="court-name">{replay.court}</span>
          <span className="replay-date"><CalendarDays /> {replay.date} · {replay.time}</span>
        </div>
        <div className="card-actions">
          <Button variant="secondary" onClick={onDetail}>Assistir <Play data-icon="inline-end" /></Button>
          <button className="icon-button" onClick={onDownload} aria-label="Baixar replay"><CloudDownload /></button>
        </div>
      </div>
    </article>
  )
}

function Detail({ replay, onBack, onLogout, onUnauthorized, onHome, alunoNome, unidadeNome }: { replay: Replay; onBack: () => void; onLogout: () => void; onUnauthorized: () => void; onHome: () => void; alunoNome?: string; unidadeNome?: string }) {
  const [playing, setPlaying] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loadingVideo, setLoadingVideo] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getThumbnailUrl(replay.id)
      .then(({ url }) => { if (!cancelled) setThumbUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [replay.id])

  const loadVideo = async () => {
    if (videoUrl) return videoUrl
    const { url } = await getDownloadUrl(replay.id)
    setVideoUrl(url)
    return url
  }

  const play = async () => {
    setLoadingVideo(true)
    setError('')
    try {
      await loadVideo()
      setPlaying(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized()
      else setError(errorMessage(err, 'Não foi possível carregar o vídeo.'))
    } finally {
      setLoadingVideo(false)
    }
  }

  const download = async () => {
    setError('')
    try {
      const url = await loadVideo()
      triggerFileDownload(url, `replay-${replay.id}.mp4`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized()
      else setError(errorMessage(err, 'Não foi possível iniciar o download.'))
    }
  }

  return (
    <div className="app-page">
      <AppHeader onLogout={onLogout} onHome={onHome} alunoNome={alunoNome} unidadeNome={unidadeNome} />
      <main className="container detail-main">
        <button className="back-link" onClick={onBack}><ArrowLeft data-icon="inline-start" /> Voltar para meus replays</button>
        <div className="detail-heading">
          <div>
            <span className="eyebrow">Replay · {replay.date}</span>
            <h1>{replay.court}</h1>
            <p>{replay.time}</p>
          </div>
          <span className="duration-pill"><Clock3 /> {replay.duration}</span>
        </div>
        <div className="player">
          {playing && videoUrl ? (
            <video src={videoUrl} poster={thumbUrl ?? undefined} controls autoPlay playsInline />
          ) : (
            <>
              {thumbUrl ? (
                <>
                  <img src={thumbUrl} alt="Vídeo do replay da quadra" />
                  <div className="player-shade" />
                </>
              ) : (
                <span className="skeleton" />
              )}
              {loadingVideo ? (
                <div className="playing-state"><div className="spinner" /><span>Carregando replay...</span></div>
              ) : (
                <button className="player-play" onClick={play} aria-label="Assistir replay"><Play fill="currentColor" /></button>
              )}
              <div className="player-controls"><span>00:00</span><div className="progress"><span /></div><span>{replay.duration}</span></div>
            </>
          )}
        </div>
        {error && <p className="field-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="detail-actions">
          <Button onClick={download}>Baixar vídeo <CloudDownload data-icon="inline-end" /></Button>
          <Button variant="secondary" onClick={play} disabled={playing || loadingVideo}>{playing ? 'Reproduzindo' : 'Assistir'} <Play data-icon="inline-end" /></Button>
        </div>
        <div className="security-notice">
          <LockKeyhole />
          <span><strong>Link seguro e temporário</strong><small>Válido por poucos minutos e exclusivo para a sua conta.</small></span>
        </div>
      </main>
    </div>
  )
}

export default function Page() {
  const [view, setView] = useState<View>('landing')
  const [selected, setSelected] = useState<Replay | null>(null)
  const [perfil, setPerfil] = useState<PerfilResponse | null>(null)

  const sair = useCallback(() => {
    lockSession()
    setSelected(null)
    setPerfil(null)
    setView('landing')
  }, [])

  const invalidarSessao = useCallback(() => {
    void encerrarSessao()
    setSelected(null)
    setPerfil(null)
    setView('landing')
  }, [])

  useEffect(() => {
    if (!getToken() || isSessionLocked()) return
    setView('dashboard')
    let cancelled = false
    getMe()
      .then(me => {
        if (!cancelled) setPerfil(me)
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) invalidarSessao()
      })
    return () => { cancelled = true }
  }, [invalidarSessao])

  const onAuthenticated = (result: AuthSuccess) => {
    setToken(result.token)
    setPerfil({ aluno: result.aluno, unidade: result.unidade })
    setView('dashboard')
  }

  const openDetail = (replay: Replay) => {
    setSelected(replay)
    setView('detail')
  }

  const alunoNome = perfil?.aluno.nome
  const unidadeNome = perfil?.unidade.nome

  if (view === 'landing') return <Landing onLogin={() => setView('email')} />
  if (view === 'email' || view === 'otp') return <Login view={view} setView={setView} onAuthenticated={onAuthenticated} />
  if (view === 'dashboard') return <Dashboard onDetail={openDetail} onLogout={sair} onUnauthorized={invalidarSessao} onHome={() => setView('dashboard')} alunoNome={alunoNome} unidadeNome={unidadeNome} />
  if (!selected) return <Dashboard onDetail={openDetail} onLogout={sair} onUnauthorized={invalidarSessao} onHome={() => setView('dashboard')} alunoNome={alunoNome} unidadeNome={unidadeNome} />
  return <Detail replay={selected} onBack={() => setView('dashboard')} onLogout={sair} onUnauthorized={invalidarSessao} onHome={() => setView('dashboard')} alunoNome={alunoNome} unidadeNome={unidadeNome} />
}
