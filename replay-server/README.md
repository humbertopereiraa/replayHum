# Replay Server — Servidor Local

Servidor local em Go responsável por:
1. Capturar o stream RTSP de cada câmera e manter um buffer circular de segmentos.
2. Receber a solicitação de replay (HTTP POST) vinda da botoeira ESP32.
3. Gerar o replay.mp4 (H.264 baseline, sem áudio, faststart) + thumbnail.jpg dos últimos N segundos, para o arquivo abrir no celular (player do site e galeria).
4. Observar a pasta de replays prontos e enfileirar para upload.
5. Pedir URLs assinadas à replay-api (`POST /upload/sign`), enviar vídeo + thumbnail direto ao B2 e confirmar metadados (`POST /upload/confirm`). Apagar os arquivos locais só após HTTP 201 ou 200 do confirm.

No start, o servidor apaga o buffer residual (`buffer/`) e leftovers `*_concat.mp4`. Replays ainda não enviados ficam em `replays/` para retry.

A captura RTSP dos segmentos continua em copy (CPU baixa). Só o MP4 final de ~30s é recodificado em H.264 baseline, sem áudio e com faststart, para abrir no celular (site e galeria). Replays já enviados ao B2 não mudam.

## Estrutura do projeto

```
replay-server/
├── go.mod                      # definição do módulo Go
├── config.json                 # configuração das câmeras, API e parâmetros
├── cmd/
│   └── server/
│       └── main.go             # ponto de entrada — junta tudo
├── internal/
│   ├── config/                 # carrega o config.json (pasta do .exe ou CWD)
│   ├── ffmpeg/                 # localiza ffmpeg.exe ao lado do binário ou no PATH
│   ├── cleanup/                # limpa buffer/lixo no start
│   ├── camera/                 # captura RTSP + buffer circular (1 worker por câmera)
│   ├── replay/                 # concatena segmentos -> MP4 H.264 (celular) + thumbnail
│   ├── api/                    # servidor HTTP (recebe o clique do botão)
│   ├── watcher/                # observa a pasta de replays prontos
│   └── uploader/               # fila + retry; apaga arquivos só após confirm
├── scripts/                    # build Windows + install/uninstall no Mini PC
├── vendor/ffmpeg/              # coloque ffmpeg.exe aqui antes do build-windows.ps1
├── buffer/                     # segmentos de vídeo em rotação (criado em runtime)
└── replays/                    # replays finalizados, prontos pra upload
```

## Pré-requisitos

- Go 1.22 ou superior instalado ([https://go.dev/dl/](https://go.dev/dl/))
- FFmpeg: no desenvolvimento, no PATH; no pacote do cliente, `vendor/ffmpeg/ffmpeg.exe` (veja abaixo)
- VS Code com a extensão oficial **Go** (da equipe golang.go)
- replay-api rodando (o servidor local pede URLs assinadas em `api_url` e envia os arquivos direto ao B2)

## Configuração (`config.json`)

O servidor procura `config.json` **na pasta do executável**. Se não houver (caso de `go run`), usa o diretório de trabalho. Caminhos relativos (`buffer_path`, `replay_path`) são resolvidos contra essa pasta — não dependem do CWD do Windows.

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

## Pacote para o Mini PC (Windows)

1. Baixe o FFmpeg essentials 64-bit e copie `ffmpeg.exe` para `vendor/ffmpeg/ffmpeg.exe`.
   Exemplo: [https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip](https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip)
2. No PowerShell, dentro de `replay-server`:

```powershell
.\scripts\build-windows.ps1
```

Isso gera `dist/` e `replay-server-windows.zip` (exe + FFmpeg + `install.ps1`).

3. No PC do cliente, extraia o zip, abra o PowerShell **como Administrador** e rode `.\install.ps1`.
4. Edite `C:\ReplayServer\config.json` e reinicie a tarefa `ReplayServer`.

A instalação registra uma tarefa agendada que sobe no boot (conta SYSTEM), grava log em `C:\ReplayServer\replay-server.log` e não sobrescreve um `config.json` já existente. A cada start o log atual vira `replay-server.log.old` (fica só a sessão anterior).

Detalhes: [scripts/README-INSTALACAO.md](scripts/README-INSTALACAO.md).

Build manual (sem pacote de instalação):

```bash
go build -o replay-server.exe ./cmd/server
```

## Etapas

- [x] Etapa 1: captura + buffer circular
- [x] Etapa 2: endpoint HTTP + geração do replay
- [x] Etapa 3: watcher da pasta de replays
- [x] Etapa 4: upload direto ao B2 (URL assinada) e remoção local após confirm
- [x] Executável Windows + instalação em `C:\ReplayServer` + start no boot
