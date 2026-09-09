# Replay Server — Servidor Local

Servidor local em Go responsável por:
1. Capturar o stream RTSP de cada câmera e manter um buffer circular de segmentos.
2. Receber a solicitação de replay (HTTP POST) vinda da botoeira ESP32.
3. Gerar o replay.mp4 + thumbnail.jpg dos últimos N segundos.
4. Observar a pasta de replays prontos e enfileirar para upload.
5. Pedir URLs assinadas à replay-api (`POST /upload/sign`), enviar vídeo + thumbnail direto ao B2 e confirmar metadados (`POST /upload/confirm`). Apagar os arquivos locais só após HTTP 201 ou 200 do confirm.

## Estrutura do projeto

```
replay-server/
├── go.mod                      # definição do módulo Go
├── config.json                 # configuração das câmeras, API e parâmetros
├── cmd/
│   └── server/
│       └── main.go             # ponto de entrada — junta tudo
├── internal/
│   ├── config/
│   │   └── config.go           # carrega o config.json
│   ├── camera/
│   │   └── capture.go          # captura RTSP + buffer circular (1 worker por câmera)
│   ├── replay/
│   │   └── replay.go           # concatena segmentos -> replay.mp4 + thumbnail
│   ├── api/
│   │   └── server.go           # servidor HTTP (recebe o clique do botão)
│   ├── watcher/
│   │   └── watcher.go          # observa a pasta de replays prontos
│   └── uploader/
│       ├── job.go              # contrato da fila (vídeo, thumb, quadra, duração)
│       ├── client.go           # sign + PUT no B2 + confirm na replay-api
│       └── uploader.go         # fila + retry; apaga arquivos só após confirm
├── buffer/                     # segmentos de vídeo em rotação (criado em runtime)
└── replays/                    # replays finalizados, prontos pra upload
```

## Pré-requisitos

- Go 1.22 ou superior instalado ([https://go.dev/dl/](https://go.dev/dl/))
- FFmpeg instalado e disponível no PATH do sistema
- VS Code com a extensão oficial **Go** (da equipe golang.go)
- replay-api rodando (o servidor local pede URLs assinadas em `api_url` e envia os arquivos direto ao B2)

## Configuração (`config.json`)

Além das câmeras e do buffer, preencha:

| Campo | Exemplo | Uso |
|---|---|---|
| `api_url` | `http://localhost:3000` | Base URL da replay-api |
| `api_key` | (a chave de **upload** da unidade) | Header `Authorization: Bearer ...` em `/upload/*` |
| `replay_token` | (segredo da botoeira) | Header `Authorization: Bearer ...` em `POST /replay` |

A `api_key` é a de upload cadastrada em `units.api_key_hash` (texto puro, não o hash).
Não use a key de importação de alunos no Mini PC.

O `replay_token` é um segredo só da LAN: o firmware da botoeira ESP32
precisa enviar o mesmo valor. Sem ele o servidor recusa subir.

## Como rodar (desenvolvimento)

1. Edite `config.json` com a URL RTSP real da sua câmera, `api_url`, `api_key` e `replay_token`.
2. No terminal, dentro da pasta do projeto:

```bash
go run ./cmd/server
```

3. Teste manualmente o endpoint do botão (simulando o ESP32) com curl:

```bash
curl -X POST http://localhost:8080/replay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token-da-botoeira" \
  -d '{"quadra_id": 1, "acao": "replay"}'
```

4. Verifique se o `replay.mp4` e a `thumbnail.jpg` apareceram na pasta `replays/`.
   Depois do confirm com sucesso (HTTP 201 ou 200), os dois arquivos são apagados.
   Se o envio falhar, o arquivo permanece no disco e o watcher tenta de novo.

## Como gerar o executável (.exe)

Rodando no Windows:
```bash
go build -o replay-server.exe ./cmd/server
```

Cross-compilando do Linux/Mac para Windows (não precisa estar no Windows):
```bash
GOOS=windows GOARCH=amd64 go build -o replay-server.exe ./cmd/server
```

Isso gera um único arquivo `.exe`, sem instalador, sem dependências
externas (a não ser o FFmpeg, que precisa estar instalado separadamente
no Mini PC).

## Próximos passos (conforme sua lista de etapas)

- [x] Etapa 1: captura + buffer circular
- [x] Etapa 2: endpoint HTTP + geração do replay
- [x] Etapa 3: watcher da pasta de replays
- [x] Etapa 4: upload direto ao B2 (URL assinada) e remoção local após confirm
- [ ] Rodar como serviço do Windows (usando algo como o NSSM) ou
      systemd no Linux, para iniciar automaticamente com o Mini PC
