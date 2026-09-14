package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"replay-server/internal/camera"
	"replay-server/internal/config"
)

func servidorTeste() *Server {
	return &Server{
		Workers: map[int]*camera.Worker{},
		Cfg:     &config.Config{ReplayToken: "segredo-botoeira"},
	}
}

func TestHandleReplaySemToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/replay", strings.NewReader(`{"quadra_id":1}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	servidorTeste().handleReplay(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestHandleReplayTokenInvalido(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/replay", strings.NewReader(`{"quadra_id":1}`))
	req.Header.Set("Authorization", "Bearer outro")
	rec := httptest.NewRecorder()

	servidorTeste().handleReplay(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestHandleReplayComTokenEQuadra(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "botoeira_ultimo_sinal.log")
	s := &Server{
		Workers: map[int]*camera.Worker{
			1: {BufferDir: t.TempDir(), SegmentSeconds: 8, MaxSegments: 15},
		},
		Cfg: &config.Config{
			ReplayToken:    "segredo-botoeira",
			ReplaySeconds:  30,
			SegmentSeconds: 8,
			ReplayPath:     t.TempDir(),
		},
		LogSinalPath: logPath,
	}
	req := httptest.NewRequest(http.MethodPost, "/replay", strings.NewReader(`{"quadra_id":1}`))
	req.Header.Set("Authorization", "Bearer segredo-botoeira")
	rec := httptest.NewRecorder()

	s.handleReplay(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Body.String() != `{"status":"processando"}` {
		t.Fatalf("body = %q, want processando", rec.Body.String())
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("ler log: %v", err)
	}
	conteudo := string(data)
	if !strings.Contains(conteudo, "quadra=1") || !strings.Contains(conteudo, "origem=replay") {
		t.Fatalf("log = %q", conteudo)
	}
}

func TestHandleReplayComTokenQuadraDesconhecida(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/replay", strings.NewReader(`{"quadra_id":1}`))
	req.Header.Set("Authorization", "Bearer segredo-botoeira")
	rec := httptest.NewRecorder()

	servidorTeste().handleReplay(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestHandleReplayHeartbeatNaoGeraVideo(t *testing.T) {
	replayPath := t.TempDir()
	logPath := filepath.Join(t.TempDir(), "botoeira_ultimo_sinal.log")
	s := &Server{
		Workers: map[int]*camera.Worker{
			1: {BufferDir: t.TempDir(), SegmentSeconds: 8, MaxSegments: 15},
		},
		Cfg: &config.Config{
			ReplayToken:    "segredo-botoeira",
			ReplaySeconds:  30,
			SegmentSeconds: 8,
			ReplayPath:     replayPath,
		},
		LogSinalPath: logPath,
	}

	req := httptest.NewRequest(http.MethodPost, "/replay", strings.NewReader(`{"quadra_id":1,"acao":"heartbeat"}`))
	req.Header.Set("Authorization", "Bearer segredo-botoeira")
	rec := httptest.NewRecorder()

	s.handleReplay(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Body.String() != `{"status":"ok"}` {
		t.Fatalf("body = %q, want ok", rec.Body.String())
	}

	time.Sleep(50 * time.Millisecond)
	entradas, err := os.ReadDir(replayPath)
	if err != nil {
		t.Fatalf("ler pasta replay: %v", err)
	}
	if len(entradas) != 0 {
		t.Fatalf("heartbeat não deveria gerar arquivos, got %v", entradas)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("ler log: %v", err)
	}
	conteudo := string(data)
	if !strings.Contains(conteudo, "quadra=1") || !strings.Contains(conteudo, "origem=heartbeat") {
		t.Fatalf("log = %q", conteudo)
	}
}
