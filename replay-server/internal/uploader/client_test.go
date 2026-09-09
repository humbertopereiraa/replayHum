package uploader

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClienteEnviarSucesso(t *testing.T) {
	job := jobDeTeste(t)

	var (
		gotAuth       string
		gotQuadra     string
		gotDuracao    float64
		gotVideoBytes float64
		gotThumbBytes float64
		gotVideoPUT   bool
		gotThumbPUT   bool
		gotVideoType  string
		gotThumbType  string
		gotConfirm    map[string]any
	)

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	defer srv.Close()

	mux.HandleFunc("/upload/sign", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("sign: método inesperado %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		gotAuth = r.Header.Get("Authorization")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("sign: JSON inválido: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		gotQuadra, _ = body["quadra"].(string)
		gotDuracao, _ = body["duracao_seg"].(float64)
		gotVideoBytes, _ = body["video_bytes"].(float64)
		gotThumbBytes, _ = body["thumb_bytes"].(float64)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"video_key":          "1/Quadra 1/123.mp4",
			"thumb_key":          "1/Quadra 1/123.jpg",
			"video_url":          srv.URL + "/b2/video",
			"thumb_url":          srv.URL + "/b2/thumb",
			"expira_em_segundos": 900,
		})
	})

	mux.HandleFunc("/b2/video", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("video PUT: método inesperado %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		gotVideoPUT = true
		gotVideoType = r.Header.Get("Content-Type")
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusOK)
	})

	mux.HandleFunc("/b2/thumb", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("thumb PUT: método inesperado %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		gotThumbPUT = true
		gotThumbType = r.Header.Get("Content-Type")
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusOK)
	})

	mux.HandleFunc("/upload/confirm", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("confirm: método inesperado %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&gotConfirm); err != nil {
			t.Errorf("confirm: JSON inválido: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"status":"recebido","replay_id":1}`))
	})

	cliente := NovoCliente(srv.URL, "chave-teste")
	if err := cliente.Enviar(job); err != nil {
		t.Fatalf("Enviar: %v", err)
	}

	if gotAuth != "Bearer chave-teste" {
		t.Errorf("Authorization = %q, want Bearer chave-teste", gotAuth)
	}
	if gotQuadra != "Quadra 1" {
		t.Errorf("quadra = %q, want Quadra 1", gotQuadra)
	}
	if gotDuracao != 30 {
		t.Errorf("duracao_seg = %v, want 30", gotDuracao)
	}
	if gotVideoBytes != 5 {
		t.Errorf("video_bytes = %v, want 5", gotVideoBytes)
	}
	if gotThumbBytes != 5 {
		t.Errorf("thumb_bytes = %v, want 5", gotThumbBytes)
	}
	if !gotVideoPUT {
		t.Error("PUT do vídeo ausente")
	}
	if !gotThumbPUT {
		t.Error("PUT da thumbnail ausente")
	}
	if gotVideoType != "video/mp4" {
		t.Errorf("Content-Type do vídeo = %q, want video/mp4", gotVideoType)
	}
	if gotThumbType != "image/jpeg" {
		t.Errorf("Content-Type da thumb = %q, want image/jpeg", gotThumbType)
	}
	if gotConfirm["video_key"] != "1/Quadra 1/123.mp4" {
		t.Errorf("confirm video_key = %v", gotConfirm["video_key"])
	}
	if gotConfirm["thumb_key"] != "1/Quadra 1/123.jpg" {
		t.Errorf("confirm thumb_key = %v", gotConfirm["thumb_key"])
	}
}

func TestClienteEnviarErroHTTP(t *testing.T) {
	job := jobDeTeste(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"erro":"API Key inválida"}`))
	}))
	defer srv.Close()

	err := NovoCliente(srv.URL, "chave-errada").Enviar(job)
	if err == nil {
		t.Fatal("esperava erro para status 401")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("erro = %q, deveria mencionar o status 401", err)
	}
}

func TestClienteEnviarArquivoAusente(t *testing.T) {
	job := Job{
		VideoPath:  filepath.Join(t.TempDir(), "nao-existe.mp4"),
		ThumbPath:  filepath.Join(t.TempDir(), "nao-existe.jpg"),
		Quadra:     "Quadra 1",
		DuracaoSeg: 30,
	}

	err := NovoCliente("http://localhost:3000", "chave").Enviar(job)
	if err == nil {
		t.Fatal("esperava erro ao abrir arquivo inexistente")
	}
}

func TestClienteEnviarConfirmIdempotente(t *testing.T) {
	job := jobDeTeste(t)

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	defer srv.Close()

	mux.HandleFunc("/upload/sign", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"video_key":          "1/Quadra 1/123.mp4",
			"thumb_key":          "1/Quadra 1/123.jpg",
			"video_url":          srv.URL + "/b2/video",
			"thumb_url":          srv.URL + "/b2/thumb",
			"expira_em_segundos": 900,
		})
	})
	mux.HandleFunc("/b2/video", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/b2/thumb", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/upload/confirm", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"recebido","replay_id":7}`))
	})

	if err := NovoCliente(srv.URL, "chave-teste").Enviar(job); err != nil {
		t.Fatalf("Enviar com confirm 200: %v", err)
	}
}

func jobDeTeste(t *testing.T) Job {
	t.Helper()
	dir := t.TempDir()
	video := filepath.Join(dir, "quadra1_20260101_120000.mp4")
	thumb := filepath.Join(dir, "quadra1_20260101_120000.jpg")
	if err := os.WriteFile(video, []byte("video"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(thumb, []byte("thumb"), 0644); err != nil {
		t.Fatal(err)
	}
	return Job{
		VideoPath:  video,
		ThumbPath:  thumb,
		Quadra:     "Quadra 1",
		DuracaoSeg: 30,
	}
}
