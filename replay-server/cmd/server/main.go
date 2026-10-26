// Comando principal do servidor local de replay.
//
// Arquitetura (cada item roda em sua própria goroutine, em paralelo):
//   - 1 worker de captura por câmera (buffer circular via FFmpeg)
//   - 1 servidor HTTP recebendo os cliques das botoeiras (ESP32)
//   - 1 watcher observando a pasta de replays prontos
//   - N workers de upload consumindo a fila
package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"replay-server/internal/api"
	"replay-server/internal/camera"
	"replay-server/internal/cleanup"
	"replay-server/internal/config"
	"replay-server/internal/ffmpeg"
	"replay-server/internal/uploader"
	"replay-server/internal/watcher"
)

func main() {
	root, err := config.RootDir()
	if err != nil {
		log.Fatalf("erro ao localizar a pasta do servidor: %v", err)
	}

	logFile := configurarLog(root)
	if logFile != nil {
		defer logFile.Close()
	}
	log.Printf("pasta do servidor: %s", root)

	cfg, err := config.Load(filepath.Join(root, "config.json"))
	if err != nil {
		log.Fatalf("erro ao carregar configuração: %v", err)
	}
	cfg.ResolverCaminhos(root)

	if err := ffmpeg.Init(root); err != nil {
		log.Fatalf("ffmpeg não encontrado: %v", err)
	}
	log.Printf("usando ffmpeg: %s", ffmpeg.Bin())

	if len(cfg.Cameras) == 0 {
		log.Fatal("nenhuma câmera configurada em config.json")
	}

	if err := cleanup.Startup(cfg.BufferPath, cfg.ReplayPath); err != nil {
		log.Fatalf("erro ao limpar lixo da execução anterior: %v", err)
	}

	// --- 1. Sobe um worker de captura por câmera ---
	workers := make(map[int]*camera.Worker)
	for _, cam := range cfg.Cameras {
		w, err := camera.NewWorker(cam, cfg.BufferPath, cfg.SegmentSeconds, cfg.MaxSegments)
		if err != nil {
			log.Fatalf("erro ao criar worker da câmera %d: %v", cam.ID, err)
		}
		workers[cam.ID] = w
		go w.Run()
	}

	// --- 2. Serviço de upload (fila interna + workers) ---
	servicoUpload := uploader.NovoServico(cfg.APIURL, cfg.APIKey)
	servicoUpload.IniciarWorkers(cfg.UploadWorkers)

	// --- 3. Watcher observando a pasta de replays prontos ---
	go watcher.Observar(cfg.ReplayPath, 2*time.Second, cfg.Cameras, cfg.ReplaySeconds, servicoUpload)

	// --- 4. Servidor HTTP recebendo os cliques das botoeiras ---
	servidor := api.NovoServer(workers, cfg)
	servidor.LogSinalPath = filepath.Join(root, "botoeira_ultimo_sinal.log")
	log.Fatal(servidor.Iniciar(cfg.HTTPPort)) // bloqueia aqui, mantendo o processo vivo
}

func configurarLog(root string) *os.File {
	path := filepath.Join(root, "replay-server.log")
	flags := os.O_CREATE | os.O_APPEND | os.O_WRONLY
	if !rotacionarLog(path) {
		flags = os.O_CREATE | os.O_TRUNC | os.O_WRONLY
	}
	f, err := os.OpenFile(path, flags, 0644)
	if err != nil {
		log.Printf("não foi possível abrir %s: %v — log só no console", path, err)
		return nil
	}
	out := io.MultiWriter(os.Stderr, f)
	log.SetOutput(out)
	ffmpeg.SetStderr(out)
	return f
}

// rotacionarLog move path para path.old, substituindo o .old anterior.
// Retorna true se o arquivo atual foi afastado ou não existia; false se o
// rename falhou e o caller deve truncar para não deixar o log crescer sem teto.
func rotacionarLog(path string) bool {
	old := path + ".old"
	_ = os.Remove(old)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return true
	}
	if err := os.Rename(path, old); err != nil {
		return false
	}
	return true
}
