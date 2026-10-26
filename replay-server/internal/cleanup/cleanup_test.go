package cleanup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStartupApagaBufferEConcatMasPreservaReplay(t *testing.T) {
	root := t.TempDir()
	buffer := filepath.Join(root, "buffer")
	replays := filepath.Join(root, "replays")

	lixoCam := filepath.Join(buffer, "camera_1")
	if err := os.MkdirAll(lixoCam, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(lixoCam, "segment_20260101_120000.mp4"), []byte("seg"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(replays, 0755); err != nil {
		t.Fatal(err)
	}

	pendente := filepath.Join(replays, "quadra1_20260101_120000.mp4")
	thumb := filepath.Join(replays, "quadra1_20260101_120000.jpg")
	concat := filepath.Join(replays, "quadra1_20260101_115900_concat.mp4")
	if err := os.WriteFile(pendente, []byte("video"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(thumb, []byte("jpg"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(concat, []byte("tmp"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := Startup(buffer, replays); err != nil {
		t.Fatalf("Startup: %v", err)
	}

	if _, err := os.Stat(filepath.Join(lixoCam, "segment_20260101_120000.mp4")); !os.IsNotExist(err) {
		t.Fatal("segmento antigo deveria ter sido apagado")
	}
	if _, err := os.Stat(buffer); err != nil {
		t.Fatalf("pasta buffer deveria ter sido recriada: %v", err)
	}
	if _, err := os.Stat(concat); !os.IsNotExist(err) {
		t.Fatal("arquivo *_concat.mp4 deveria ter sido apagado")
	}
	if _, err := os.Stat(pendente); err != nil {
		t.Fatalf("replay pendente não deveria ser apagado: %v", err)
	}
	if _, err := os.Stat(thumb); err != nil {
		t.Fatalf("thumbnail pendente não deveria ser apagada: %v", err)
	}
}

func TestStartupBufferInexistente(t *testing.T) {
	root := t.TempDir()
	buffer := filepath.Join(root, "buffer")
	if err := Startup(buffer, filepath.Join(root, "replays")); err != nil {
		t.Fatalf("Startup com buffer inexistente: %v", err)
	}
	if _, err := os.Stat(buffer); err != nil {
		t.Fatalf("buffer não recriado: %v", err)
	}
}
