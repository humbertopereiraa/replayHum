package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
	}
	req := httptest.NewRequest(http.MethodPost, "/replay", strings.NewReader(`{"quadra_id":1}`))
	req.Header.Set("Authorization", "Bearer segredo-botoeira")
	rec := httptest.NewRecorder()

	s.handleReplay(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
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
