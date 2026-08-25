const TOKEN_KEY = 'replay_token'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

function apiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) {
    throw new ApiError('URL da API não configurada', 0)
  }
  return url.replace(/\/$/, '')
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { erro?: string }
    throw new ApiError(body.erro || 'Erro inesperado', res.status)
  }

  return res.json() as Promise<T>
}

export type AlunoPerfil = { nome: string }
export type UnidadePerfil = { nome: string }

export type PerfilResponse = {
  aluno: AlunoPerfil
  unidade: UnidadePerfil
}

export type AuthResponse =
  | { status: 'código enviado' }
  | { status: 'autenticado'; token: string; aluno: AlunoPerfil; unidade: UnidadePerfil }

export type ReplayRow = {
  id: number
  quadra: string
  duracao_seg: number | null
  created_at: string
}

export type ReplayFilters = {
  quadra?: string
  data?: string
}

export function requestOtp(email: string): Promise<AuthResponse> {
  return api<AuthResponse>('/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function verifyOtp(email: string, codigo: string): Promise<AuthResponse> {
  return api<AuthResponse>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, codigo }),
  })
}

export function getMe(): Promise<PerfilResponse> {
  return api<PerfilResponse>('/auth/me')
}

export function listReplays(filters: ReplayFilters = {}): Promise<ReplayRow[]> {
  const params = new URLSearchParams()
  if (filters.quadra) params.set('quadra', filters.quadra)
  if (filters.data) params.set('data', filters.data)
  const query = params.toString()
  return api<ReplayRow[]>(`/replays${query ? `?${query}` : ''}`)
}

export function getDownloadUrl(id: number): Promise<{ url: string; expira_em_segundos: number }> {
  return api(`/replays/${id}/download`)
}

export function getThumbnailUrl(id: number): Promise<{ url: string }> {
  return api(`/replays/${id}/thumbnail`)
}
