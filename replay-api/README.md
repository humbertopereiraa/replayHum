# Replay API

API mínima em Node.js/Express para o sistema de replay esportivo.

## Estrutura

```
replay-api/
├── .env.example              # copie para .env e preencha
├── migrations/
│   └── 001_init.sql          # rode isso no seu Postgres uma vez
├── src/
│   ├── config/
│   │   └── db.js             # conexão com o Postgres
│   ├── middleware/
│   │   └── auth.js           # autenticarAluno (JWT) + autenticarServidorLocal (API Key)
│   ├── services/
│   │   ├── crypto.service.js # blind index + criptografia do e-mail
│   │   ├── otp.service.js    # geração/verificação do código OTP
│   │   └── b2.service.js     # upload e presigned URL no Backblaze B2
│   ├── routes/
│   │   ├── auth.routes.js      # POST /auth/request-otp, /auth/verify-otp
│   │   ├── upload.routes.js    # POST /upload (usado pelo servidor local Go)
│   │   └── replays.routes.js   # GET /replays, GET /replays/:id/download
│   └── server.js             # junta tudo
└── package.json
```

## Banco de dados — opções gratuitas recomendadas

- **Supabase** (supabase.com) — Postgres gerenciado, free tier generoso
- **Neon** (neon.tech) — Postgres serverless, free tier bom para começar

Depois de criar o banco, rode o arquivo `migrations/001_init.sql`
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
unidade e sua API Key direto no banco:

```sql
-- Gere uma API Key aleatória (ex: com o comando node acima) e
-- calcule o hash SHA-256 dela antes de inserir:
-- node -e "console.log(require('crypto').createHash('sha256').update('SUA_API_KEY_AQUI').digest('hex'))"

INSERT INTO units (nome, api_key_hash) VALUES ('Arena Sports', 'hash_gerado_aqui');
```

A API Key **em texto puro** (não o hash) é o que você coloca no
`config.json` do servidor local Go, no header `Authorization: Bearer <api_key>`.

## Cadastro de alunos (via CSV, como no plano original)

Ainda não implementado neste esqueleto mínimo — é o próximo passo
natural: uma rota `POST /admin/students/import` que lê um CSV,
calcula `email_hash` e `email_encrypted` para cada linha, e insere
em lote na tabela `students`.

## Endpoints disponíveis

| Método | Rota | Quem chama | Autenticação |
|---|---|---|---|
| POST | `/auth/request-otp` | Site (aluno) | Nenhuma |
| POST | `/auth/verify-otp` | Site (aluno) | Nenhuma |
| POST | `/upload` | Servidor local (Go) | API Key |
| GET | `/replays` | Site (aluno) | JWT (cookie) |
| GET | `/replays/:id/download` | Site (aluno) | JWT (cookie) |
| GET | `/replays/:id/thumbnail` | Site (aluno) | JWT (cookie) |
