# Replay Server — Servidor Local

Servidor local em Go responsável por:
1. Capturar o stream RTSP de cada câmera e manter um buffer circular de segmentos.
2. Receber a solicitação de replay (HTTP POST) vinda da botoeira ESP32.
3. Gerar o replay.mp4 + thumbnail.jpg dos últimos N segundos.
4. Observar a pasta de replays prontos e enfileirar para upload.
5. Enviar o par vídeo + thumbnail para a replay-api (`POST /upload`) e apagar os arquivos locais após HTTP 201.

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
│       ├── client.go           # POST multipart para a replay-api
│       └── uploader.go         # fila + workers; apaga arquivos só após 201
├── buffer/                     # segmentos de vídeo em rotação (criado em runtime)
└── replays/                    # replays finalizados, prontos pra upload
```

## Pré-requisitos

- Go 1.22 ou superior instalado ([https://go.dev/dl/](https://go.dev/dl/))
- FFmpeg instalado e disponível no PATH do sistema
- VS Code com a extensão oficial **Go** (da equipe golang.go)
- replay-api rodando (o servidor local envia os arquivos para `api_url`)

## Configuração (`config.json`)

Além das câmeras e do buffer, preencha:

| Campo | Exemplo | Uso |
|---|---|---|
| `api_url` | `http://localhost:3000` | Base URL da replay-api |
| `api_key` | (a chave em texto puro da unidade) | Header `Authorization: Bearer ...` |

A API Key é a mesma cadastrada na tabela `units` da replay-api (texto puro, não o hash).

## Como rodar (desenvolvimento)

1. Edite `config.json` com a URL RTSP real da sua câmera, `api_url` e `api_key`.
2. No terminal, dentro da pasta do projeto:

```bash
go run ./cmd/server
```

3. Teste manualmente o endpoint do botão (simulando o ESP32) com curl:

```bash
curl -X POST http://localhost:8080/replay \
  -H "Content-Type: application/json" \
  -d '{"quadra_id": 1, "acao": "replay"}'
```

4. Verifique se o `replay.mp4` e a `thumbnail.jpg` apareceram na pasta `replays/`.
   Depois do upload com sucesso (HTTP 201), os dois arquivos são apagados.

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
- [x] Etapa 4: upload para a replay-api (`POST /upload`) e remoção local após 201
- [ ] Rodar como serviço do Windows (usando algo como o NSSM) ou
      systemd no Linux, para iniciar automaticamente com o Mini PC
