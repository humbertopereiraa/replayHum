# Replay API

API mínima em Node.js/Express para o sistema de replay esportivo.

## Estrutura

```
replay-api/
├── .env.example              # copie para .env e preencha
├── migrations/
│   ├── 001_init.sql                    # rode isso no seu Postgres uma vez
│   ├── 002_unique_b2_key_video.sql     # unique em b2_key_video (confirm idempotente)
│   └── 003_import_api_key.sql          # hash da key de importação de alunos
├── src/
│   ├── config/
│   │   └── db.ts             # conexão com o Postgres
│   ├── middleware/
│   │   ├── auth.ts           # JWT do aluno + API Key de upload + key de import
│   │   └── rate-limit.ts     # tetos por IP / e-mail / aluno
│   ├── services/
│   │   ├── crypto.service.ts # blind index + criptografia do e-mail
│   │   ├── otp.service.ts    # geração/verificação do código OTP
│   │   └── b2.service.ts     # URLs assinadas (PUT/GET) e HeadObject no B2
│   ├── routes/
│   │   ├── auth.routes.ts      # OTP, /me, /logout
│   │   ├── upload.routes.ts    # POST /upload/sign e /upload/confirm (servidor local Go)
│   │   ├── students.routes.ts  # POST /students/import
│   │   └── replays.routes.ts   # GET /replays, download e thumbnail
│   └── server.ts             # junta tudo
└── package.json
```

## Banco de dados — opções gratuitas recomendadas

- **Supabase** (supabase.com) — Postgres gerenciado, free tier generoso
- **Neon** (neon.tech) — Postgres serverless, free tier bom para começar

Depois de criar o banco, rode os arquivos em `migrations/`
(`001_init.sql`, `002_unique_b2_key_video.sql` e `003_import_api_key.sql`)
direto no editor SQL do painel (Supabase e Neon têm um embutido).

## Configuração

1. `cp .env.example .env` e preencha com suas credenciais reais
   (banco, B2, Resend).
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
uma URL assinada (válida por 5 minutos). Quem tiver o link baixa o
arquivo nesse intervalo, sem JWT. Replay da unidade é visível para
todos os alunos da mesma academia (regra de produto).

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

Como ainda não existe painel administrativo, cadastre a primeira
unidade e as duas API Keys direto no banco. São chaves **diferentes**:

- `api_key_hash` — só o servidor local Go (upload)
- `import_api_key_hash` — só `POST /students/import`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').createHash('sha256').update('COLE_A_KEY_AQUI').digest('hex'))"
```

```sql
INSERT INTO units (nome, api_key_hash, import_api_key_hash)
VALUES ('Arena Sports', 'hash_da_key_de_upload', 'hash_da_key_de_import');
```

A key de upload **em texto puro** vai no `config.json` do Go
(`Authorization: Bearer <api_key>`). A de importação não entra no Mini PC.

Sem `import_api_key_hash`, o import responde 401.

## Cadastro de alunos

`POST /students/import` com `{ "alunos": [{ "nome", "email" }, ...] }`
(máx. 500 por request), autenticado com a key de importação.
Quem não vier no lote é desativado.

## Endpoints disponíveis

| Método | Rota | Quem chama | Autenticação |
|---|---|---|---|
| POST | `/auth/request-otp` | Site (aluno) | Nenhuma (rate limit) |
| POST | `/auth/verify-otp` | Site (aluno) | Nenhuma (rate limit) |
| POST | `/auth/logout` | Site (aluno) | Cookie opcional (sempre limpa) |
| GET | `/auth/me` | Site (aluno) | JWT |
| POST | `/upload/sign` | Servidor local (Go) | API Key de upload |
| POST | `/upload/confirm` | Servidor local (Go) | API Key de upload |
| POST | `/students/import` | Operação da unidade | API Key de importação |
| GET | `/replays` | Site (aluno) | JWT |
| GET | `/replays/:id/download` | Site (aluno) | JWT (30/min por aluno) |
| GET | `/replays/:id/thumbnail` | Site (aluno) | JWT |
