package replay

import (
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSegmentosNecessariosComMargem(t *testing.T) {
	casos := []struct {
		replay, segmento, want int
	}{
		{30, 8, 6},
		{30, 10, 5},
		{8, 8, 3},
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

func TestInicioCorte(t *testing.T) {
	inicio, trecho := inicioCorte(48, 30, 4.7)
	if math.Abs(inicio-13.3) > 0.001 || math.Abs(trecho-30) > 0.001 {
		t.Errorf("inicio=%v trecho=%v, want 13.3 e 30", inicio, trecho)
	}

	inicio, trecho = inicioCorte(48, 30, 40)
	if math.Abs(inicio) > 0.001 || math.Abs(trecho-8) > 0.001 {
		t.Errorf("sobra grande: inicio=%v trecho=%v, want 0 e 8", inicio, trecho)
	}
}

func TestParseDuracao(t *testing.T) {
	got, err := parseDuracao("Duration: 00:00:48.02, start: 0.000000, bitrate: 1 kb/s")
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(got-48.02) > 0.001 {
		t.Errorf("duração = %v, want 48.02", got)
	}

	got, err = parseDuracao("Duration: 01:02:03.50")
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(got-3723.50) > 0.001 {
		t.Errorf("duração = %v, want 3723.50", got)
	}
}

func TestArgsTrimReplayCompativelComCelular(t *testing.T) {
	args := argsTrimReplay(13.3, 30, "concat.mp4", "replay.mp4")
	got := strings.Join(args, " ")

	for _, trecho := range []string{"libx264", "baseline", "-an", "+faststart", "-ss 13.300", "-t 30.000"} {
		if !strings.Contains(got, trecho) {
			t.Errorf("args trim sem %q: %v", trecho, args)
		}
	}
	if strings.Contains(got, "-sseof") || strings.Contains(got, "-c copy") {
		t.Errorf("args trim inesperado: %v", args)
	}
	iInput := strings.Index(got, "-i ")
	iSS := strings.Index(got, "-ss ")
	iT := strings.Index(got, "-t ")
	if iInput < 0 || iSS < iInput || iT < iSS {
		t.Errorf("-ss e -t devem vir depois de -i: %v", args)
	}
	if args[len(args)-1] != "replay.mp4" {
		t.Errorf("saída = %q, want replay.mp4", args[len(args)-1])
	}
}
