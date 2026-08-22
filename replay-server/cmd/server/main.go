// Comando principal do servidor local de replay.
//
// Arquitetura (cada item roda em sua própria goroutine, em paralelo):
//   - 1 worker de captura por câmera (buffer circular via FFmpeg)
//   - 1 servidor HTTP recebendo os cliques das botoeiras (ESP32)
//   - 1 watcher observando a pasta de replays prontos
//   - N workers de upload consumindo a fila
package main

import (
	"log"

	"replay-server/internal/api"
	"replay-server/internal/camera"
	"replay-server/internal/config"
	"replay-server/internal/uploader"
	"replay-server/internal/watcher"

	"time"
)

func main() {
	cfg, err := config.Load("config.json")
	if err != nil {
		log.Fatalf("erro ao carregar configuração: %v", err)
	}

	if len(cfg.Cameras) == 0 {
		log.Fatal("nenhuma câmera configurada em config.json")
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
	log.Fatal(servidor.Iniciar(cfg.HTTPPort)) // bloqueia aqui, mantendo o processo vivo
}
