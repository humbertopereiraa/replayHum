package camera

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func criarSegmento(t *testing.T, dir, nome string) {
	t.Helper()
	path := filepath.Join(dir, nome)
	if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
		t.Fatalf("criar %s: %v", nome, err)
	}
}

func TestUltimosSegmentosDescartaOMaisNovo(t *testing.T) {
	dir := t.TempDir()
	w := &Worker{BufferDir: dir}

	criarSegmento(t, dir, "segment_20260101_120000.mp4")
	criarSegmento(t, dir, "segment_20260101_120008.mp4")
	criarSegmento(t, dir, "segment_20260101_120016.mp4")
	criarSegmento(t, dir, "segment_20260101_120024.mp4")
	criarSegmento(t, dir, "segment_20260101_120032.mp4")

	got, err := w.UltimosSegmentos(3)
	if err != nil {
		t.Fatalf("UltimosSegmentos: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3: %v", len(got), got)
	}

	want := []string{
		filepath.Join(dir, "segment_20260101_120008.mp4"),
		filepath.Join(dir, "segment_20260101_120016.mp4"),
		filepath.Join(dir, "segment_20260101_120024.mp4"),
	}
	for i, path := range want {
		if got[i] != path {
			t.Errorf("got[%d] = %s, want %s", i, got[i], path)
		}
	}
}

func TestEsperarSegmentoFecharBufferVazio(t *testing.T) {
	w := &Worker{BufferDir: t.TempDir()}
	inicio := time.Now()
	w.EsperarSegmentoFechar(2 * time.Second)
	if time.Since(inicio) > 300*time.Millisecond {
		t.Fatal("buffer vazio não deveria esperar o timeout")
	}
}

func TestEsperarSegmentoFecharRetornaQuandoRola(t *testing.T) {
	dir := t.TempDir()
	w := &Worker{BufferDir: dir, SegmentSeconds: 8}
	criarSegmento(t, dir, "segment_20260101_120000.mp4")

	done := make(chan struct{})
	go func() {
		w.EsperarSegmentoFechar(2 * time.Second)
		close(done)
	}()

	time.Sleep(300 * time.Millisecond)
	criarSegmento(t, dir, "segment_20260101_120008.mp4")

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timeout esperando rollover do segmento")
	}
}
