# Replay Server — instalação no Mini PC

## O que este pacote contém

- `replay-server.exe` — captura RTSP, buffer, botoeira e upload
- `ffmpeg.exe` — vem junto; não precisa instalar FFmpeg no Windows
- `config.example.json` — modelo da configuração
- `install.ps1` / `uninstall.ps1`

A API na nuvem (replay-api) e o site do aluno **não** vão neste PC.

## Instalação

1. Extraia esta pasta no Mini PC.
2. Abra o PowerShell **como Administrador**.
3. Na pasta extraída:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

O programa é instalado em `C:\ReplayServer` e sobe sozinho quando o Windows liga
(tarefa agendada `ReplayServer`, conta SYSTEM).

## Configuração

Edite `C:\ReplayServer\config.json` (o instalador copia o example na primeira vez
e **não sobrescreve** um config já existente):

| Campo | O que preencher |
|---|---|
| `api_url` | URL da replay-api na nuvem |
| `api_key` | chave de **upload** da unidade (texto puro, não o hash) |
| `replay_token` | mesmo segredo configurado na botoeira ESP32 |
| `cameras[].rtsp_url` | URL RTSP real da câmera |
| `http_port` | porta local (padrão 8080); a botoeira aponta para este IP:porta |

Depois de editar, reinicie a tarefa:

```powershell
Restart-ScheduledTask -TaskName ReplayServer
```

Se `Restart-ScheduledTask` não existir nesta versão do Windows:

```powershell
Stop-ScheduledTask -TaskName ReplayServer
Start-ScheduledTask -TaskName ReplayServer
```

## Botoeira (ESP32)

O Postman em `localhost` **não prova** a botoeira: ela vem pela LAN e o Firewall do Windows bloqueia a porta 8080 por padrão.

1. PowerShell **como Administrador**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
C:\ReplayServer\abrir-porta.ps1
```

2. Anote o IPv4 deste PC (`ipconfig`). **Não use `localhost`.**
3. Na ESP32: segure o botão da quadra por **5 segundos** (abre o portal `BotaoReplay-Config`).
4. Preencha: Wi-Fi da academia, **host = IPv4 do Mini PC**, porta `8080`, o mesmo `replay_token` de `C:\ReplayServer\config.json`, quadra `1`.
5. Aperte o botão. No log deve aparecer `[api] POST /replay de 192.168....`.
   - Se **não aparecer nada**: firewall, IP errado ou ESP32 fora da rede.
   - Se aparecer `401`: token diferente do `config.json`.

## Verificar

- Saúde: abra `http://localhost:8080/health` — deve responder `ok`
- Log: `C:\ReplayServer\replay-server.log` (no start o atual vira `replay-server.log.old`; fica só a sessão anterior)
- A cada start o servidor **apaga o buffer** antigo (`buffer\`) e leftovers `*_concat.mp4`.
  Replays ainda não enviados (`quadraN_*.mp4` + `.jpg`) são preservados para retry.

## Desinstalação

```powershell
.\uninstall.ps1
```

Isso remove a tarefa agendada. O `config.json` permanece.

Para apagar também buffer, replays e logs:

```powershell
.\uninstall.ps1 -RemoveData
```
