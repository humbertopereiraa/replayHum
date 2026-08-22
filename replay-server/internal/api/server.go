// Package api expõe o endpoint HTTP local que a botoeira (ESP32) chama
// quando o aluno aperta o botão, solicitando a geração do replay.
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"replay-server/internal/camera"
	"replay-server/internal/config"
	"replay-server/internal/replay"
)

// ReplayRequest é o corpo JSON esperado, enviado pelo firmware do ESP32.
type ReplayRequest struct {
	QuadraID int    `json:"quadra_id"`
	Acao     string `json:"acao"`
}

// Server mantém referência aos workers de câmera para poder acessar
// o buffer de segmentos de cada uma na hora de gerar o replay.
type Server struct {
	Workers map[int]*camera.Worker // indexado pelo ID da câmera/quadra
	Cfg     *config.Config
}

// NovoServer cria o servidor HTTP com acesso aos workers de câmera.
func NovoServer(workers map[int]*camera.Worker, cfg *config.Config) *Server {
	return &Server{Workers: workers, Cfg: cfg}
}

// Iniciar sobe o servidor HTTP na porta configurada. É bloqueante —
// deve ser chamado dentro de uma goroutine própria em main.go.
func (s *Server) Iniciar(porta int) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/replay", s.handleReplay)
	mux.HandleFunc("/health", s.handleHealth)

	endereco := ":" + strconv.Itoa(porta)
	log.Printf("[api] servidor HTTP escutando em %s", endereco)
	return http.ListenAndServe(endereco, mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleReplay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}

	var req ReplayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	worker, ok := s.Workers[req.QuadraID]
	if !ok {
		http.Error(w, "quadra/câmera não encontrada", http.StatusNotFound)
		return
	}

	log.Printf("[api] replay solicitado para quadra %d", req.QuadraID)

	// Processa a geração do replay numa goroutine separada — assim a
	// resposta HTTP volta rápido pro ESP32, sem ele ficar esperando o
	// FFmpeg terminar de concatenar (o que pode levar alguns segundos).
	go func() {
		segmentosNecessarios := replay.SegmentosNecessarios(s.Cfg.ReplaySeconds, s.Cfg.SegmentSeconds)
		segmentos, err := worker.UltimosSegmentos(segmentosNecessarios)
		if err != nil {
			log.Printf("[api] erro ao buscar segmentos da quadra %d: %v", req.QuadraID, err)
			return
		}

		videoPath, thumbPath, err := replay.Gerar(segmentos, s.Cfg.ReplayPath, req.QuadraID)
		if err != nil {
			log.Printf("[api] erro ao gerar replay da quadra %d: %v", req.QuadraID, err)
			return
		}

		log.Printf("[api] replay gerado: %s (thumb: %s)", videoPath, thumbPath)
		// A partir daqui, o watcher da pasta de replays detecta os
		// arquivos novos e enfileira para upload automaticamente.
	}()

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"processando"}`))
}

