package uploader

import (
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
		gotAuth    string
		gotQuadra  string
		gotDuracao string
		gotVideo   bool
		gotThumb   bool
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/upload" {
			t.Errorf("requisição inesperada: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}

		gotAuth = r.Header.Get("Authorization")
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Errorf("ParseMultipartForm: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		gotQuadra = r.FormValue("quadra")
		gotDuracao = r.FormValue("duracao_seg")
		if f, _, err := r.FormFile("video"); err == nil {
			gotVideo = true
			f.Close()
		}
		if f, _, err := r.FormFile("thumb"); err == nil {
			gotThumb = true
			f.Close()
		}

		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"status":"recebido","replay_id":1}`))
	}))
	defer srv.Close()

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
	if gotDuracao != "30" {
		t.Errorf("duracao_seg = %q, want 30", gotDuracao)
	}
	if !gotVideo {
		t.Error("campo video ausente")
	}
	if !gotThumb {
		t.Error("campo thumb ausente")
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
