# Replay API

API mínima em Node.js/Express para o sistema de replay esportivo.

## Estrutura

```
replay-api/
├── .env.example              # copie para .env e preencha
├── migrations/
│   ├── 001_init.sql                    # rode isso no seu Postgres uma vez
│   ├── 002_unique_b2_key_video.sql     # unique em b2_key_video (confirm idempotente)
│   ├── 003_import_api_key.sql          # hash da key de importação (legado, não usada no login)
│   └── 004_acesso_google.sql           # código da quadra, token do QR e registro de logins
├── scripts/
│   └── gerar-acesso-unidade.mjs        # imprime código, URL do QR e o UPDATE
├── src/
│   ├── config/
│   │   └── db.ts             # conexão com o Postgres
│   ├── middleware/
│   │   ├── auth.ts           # JWT do visitante + API Key de upload
│   │   └── rate-limit.ts     # tetos por IP e por conta Google
│   ├── services/
│   │   ├── crypto.service.ts # blind index + criptografia do e-mail
│   │   ├── google.service.ts # confere o ID token do Google
│   │   └── b2.service.ts     # URLs assinadas (PUT/GET) e HeadObject no B2
│   ├── routes/
│   │   ├── auth.routes.ts      # Google + código da quadra, /me, /logout
│   │   ├── upload.routes.ts    # POST /upload/sign e /upload/confirm (servidor local Go)
│   │   └── replays.routes.ts   # GET /replays, stream, download e thumbnail
│   └── server.ts             # junta tudo
└── package.json
```

## Banco de dados — opções gratuitas recomendadas

- **Supabase** (supabase.com) — Postgres gerenciado, free tier generoso
- **Neon** (neon.tech) — Postgres serverless, free tier bom para começar

Depois de criar o banco, rode os arquivos em `migrations/`
(`001_init.sql`, `002_unique_b2_key_video.sql`, `003_import_api_key.sql`
e `004_acesso_google.sql`)
direto no editor SQL do painel (Supabase e Neon têm um embutido).

## Configuração

1. `cp .env.example .env` e preencha com suas credenciais reais
   (banco, B2 e o cliente OAuth do Google).
2. Gere as chaves aleatórias necessárias:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Rode isso 2 vezes: uma para `JWT_SECRET`/`EMAIL_HASH_KEY` (podem
   ser qualquer string longa), e OBRIGATORIAMENTE para
   `EMAIL_ENCRYPTION_KEY` (precisa ser exatamente 32 bytes em hex).
3. SSL do Postgres: com certificado válido do provedor, use
   `DATABASE_SSL_REJECT_UNAUTHORIZED=true`. Deixe `false` só se o
   pooler falhar com erro de certificado.

## Bucket B2

O bucket deve ser **privado**. A API nunca entrega o MP4: ela devolve
URLs assinadas. Quem entrou com o código daquela quadra vê os replays
dela. Não existe lista de alunos.

- **Stream** (`GET /replays/:id/stream`): `Content-Disposition: inline`,
  válida por 1 hora — usada pelo `<video>` do site.
- **Download** (`GET /replays/:id/download`):
  `Content-Disposition: attachment`, válida por 5 minutos — força o
  navegador a baixar o arquivo.

Quem tiver o link acessa o objeto nesse intervalo, sem JWT.

O player do site pede o MP4 **direto no B2**, não na API. O CORS do
Express (`FRONTEND_URL`) não cobre isso. No painel do bucket, permita
GET e HEAD da origem do site, com o header `Range`, e exponha
`Content-Range`, `Accept-Ranges` e `Content-Type`. Sem isso, alguns
navegadores (Safari em especial) podem recusar o play mesmo com a
URL inline correta.

## Rodando localmente (desenvolvimento, com reload automático)

```bash
npm install
npm run dev
```

## Gerando a build de produção

```bash
npm run build   # compila TypeScript -> JavaScript, gera pasta dist/
npm start       # roda a versão compilada (dist/server.js)
```

## Checando erros de tipo sem gerar build

```bash
npm run typecheck
```

## Cadastro de unidade (ainda manual, para o MVP)

Como ainda não existe painel administrativo, cadastre a unidade e a
API Key de upload direto no banco:

- `api_key_hash` — só o servidor local Go (upload)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').createHash('sha256').update('COLE_A_KEY_AQUI').digest('hex'))"
```

```sql
INSERT INTO units (nome, api_key_hash)
VALUES ('Arena Sports', 'hash_da_key_de_upload');
```

A key de upload **em texto puro** vai no `config.json` do Go
(`Authorization: Bearer <api_key>`).

## Acesso da quadra

Não há cadastro de pessoa. O código (ou o QR) escolhe a unidade e o
Google identifica quem entrou. Cada entrada grava uma linha em `logins`.

Na pasta `replay-api`, com o `.env` carregado:

```bash
node scripts/gerar-acesso-unidade.mjs 1
```

O script imprime o código curto, a URL `{FRONTEND_URL}/q/{token}` e o
`UPDATE` com os hashes. Gere o QR a partir dessa URL. O `1` é o id da
unidade. Sem id, o SQL sai com um placeholder.

No Google Cloud, crie um cliente OAuth do tipo "aplicativo da Web".
A origem autorizada é a URL do site. O mesmo client id vai em
`GOOGLE_CLIENT_ID` na API e em `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no site.

## Endpoints disponíveis

| Método | Rota | Quem chama | Autenticação |
|---|---|---|---|
| POST | `/auth/google` | Site | Código da quadra ou token do QR + ID token do Google |
| POST | `/auth/logout` | Site | Cookie opcional (sempre limpa) |
| GET | `/auth/me` | Site | JWT |
| POST | `/upload/sign` | Servidor local (Go) | API Key de upload |
| POST | `/upload/confirm` | Servidor local (Go) | API Key de upload |
| GET | `/replays` | Site | JWT |
| GET | `/replays/:id/stream` | Site | JWT (30/min por conta Google) |
| GET | `/replays/:id/download` | Site | JWT (30/min por conta Google) |
| GET | `/replays/:id/thumbnail` | Site | JWT |

