package replay

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSegmentosNecessariosComMargem(t *testing.T) {
	casos := []struct {
		replay, segmento, want int
	}{
		{30, 8, 5},
		{30, 10, 4},
		{8, 8, 2},
		{30, 0, 1},
	}
	for _, c := range casos {
		got := SegmentosNecessarios(c.replay, c.segmento)
		if got != c.want {
			t.Errorf("SegmentosNecessarios(%d, %d) = %d, want %d", c.replay, c.segmento, got, c.want)
		}
	}
}

func TestEscreverListaConcatUsaSlash(t *testing.T) {
	dir := t.TempDir()
	seg := filepath.Join(dir, "segment_20260101_120000.mp4")
	if err := os.WriteFile(seg, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	lista, err := escreverListaConcat([]string{seg})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(lista)

	data, err := os.ReadFile(lista)
	if err != nil {
		t.Fatal(err)
	}
	linha := strings.TrimSpace(string(data))
	if strings.Contains(linha, `\`) {
		t.Errorf("lista concat ainda tem barra invertida: %s", linha)
	}
	if !strings.HasPrefix(linha, "file '") || !strings.HasSuffix(linha, ".mp4'") {
		t.Errorf("formato inesperado: %s", linha)
	}
}
