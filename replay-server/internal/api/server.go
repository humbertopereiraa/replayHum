// Package api expõe o endpoint HTTP local que a botoeira (ESP32) chama
// quando o aluno aperta o botão, solicitando a geração do replay.
package api

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

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
	Workers      map[int]*camera.Worker // indexado pelo ID da câmera/quadra
	Cfg          *config.Config
	LogSinalPath string // vazio = botoeira_ultimo_sinal.log no CWD
	logSinalMu   sync.Mutex
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

	if !s.autorizarReplay(r) {
		http.Error(w, "não autorizado", http.StatusUnauthorized)
		return
	}

	var req ReplayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	if _, ok := s.Workers[req.QuadraID]; !ok {
		http.Error(w, "quadra/câmera não encontrada", http.StatusNotFound)
		return
	}

	origem := "replay"
	if strings.EqualFold(strings.TrimSpace(req.Acao), "heartbeat") {
		origem = "heartbeat"
	}
	s.registrarSinal(req.QuadraID, origem)

	if origem == "heartbeat" {
		log.Printf("[api] heartbeat da quadra %d", req.QuadraID)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
		return
	}

	worker := s.Workers[req.QuadraID]
	log.Printf("[api] replay solicitado para quadra %d", req.QuadraID)

	// Processa a geração numa goroutine — a resposta HTTP volta rápido
	// pro ESP32. A espera do segmento (até ~8s) e o FFmpeg ficam aqui.
	go func() {
		timeout := time.Duration(s.Cfg.SegmentSeconds+2) * time.Second
		worker.EsperarSegmentoFechar(timeout)

		segmentosNecessarios := replay.SegmentosNecessarios(s.Cfg.ReplaySeconds, s.Cfg.SegmentSeconds)
		segmentos, err := worker.UltimosSegmentos(segmentosNecessarios)
		if err != nil {
			log.Printf("[api] erro ao buscar segmentos da quadra %d: %v", req.QuadraID, err)
			return
		}

		videoPath, thumbPath, err := replay.Gerar(segmentos, s.Cfg.ReplayPath, req.QuadraID, s.Cfg.ReplaySeconds)
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

func (s *Server) caminhoLogSinal() string {
	if strings.TrimSpace(s.LogSinalPath) != "" {
		return s.LogSinalPath
	}
	return "botoeira_ultimo_sinal.log"
}

func (s *Server) registrarSinal(quadraID int, origem string) {
	s.logSinalMu.Lock()
	defer s.logSinalMu.Unlock()

	caminho := s.caminhoLogSinal()
	linhasPorQuadra := map[int]string{}
	ordem := make([]int, 0)

	if data, err := os.ReadFile(caminho); err == nil {
		for _, linha := range strings.Split(string(data), "\n") {
			linha = strings.TrimSpace(linha)
			if linha == "" {
				continue
			}
			id, ok := parseQuadraDaLinha(linha)
			if !ok {
				continue
			}
			if _, existe := linhasPorQuadra[id]; !existe {
				ordem = append(ordem, id)
			}
			linhasPorQuadra[id] = linha
		}
	}

	nova := fmt.Sprintf("%s quadra=%d origem=%s", time.Now().Format(time.RFC3339), quadraID, origem)
	if _, existe := linhasPorQuadra[quadraID]; !existe {
		ordem = append(ordem, quadraID)
	}
	linhasPorQuadra[quadraID] = nova

	var b strings.Builder
	for _, id := range ordem {
		b.WriteString(linhasPorQuadra[id])
		b.WriteByte('\n')
	}

	if err := os.WriteFile(caminho, []byte(b.String()), 0644); err != nil {
		log.Printf("[api] erro ao gravar sinal da botoeira: %v", err)
	}
}

func parseQuadraDaLinha(linha string) (int, bool) {
	const prefixo = "quadra="
	i := strings.Index(linha, prefixo)
	if i < 0 {
		return 0, false
	}
	resto := linha[i+len(prefixo):]
	fim := strings.IndexByte(resto, ' ')
	if fim < 0 {
		fim = len(resto)
	}
	n, err := strconv.Atoi(resto[:fim])
	if err != nil {
		return 0, false
	}
	return n, true
}

func (s *Server) autorizarReplay(r *http.Request) bool {
	esperado := strings.TrimSpace(s.Cfg.ReplayToken)
	recebido := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if esperado == "" || recebido == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(recebido), []byte(esperado)) == 1
}
