package ffmpeg

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFindInDirAoLadoDoExe(t *testing.T) {
	dir := t.TempDir()
	nome := "ffmpeg"
	if runtime.GOOS == "windows" {
		nome = "ffmpeg.exe"
	}
	fake := filepath.Join(dir, nome)
	if err := os.WriteFile(fake, []byte("fake"), 0755); err != nil {
		t.Fatal(err)
	}

	got, ok := findInDir(dir)
	if !ok {
		t.Fatal("deveria achar o ffmpeg na pasta do exe")
	}
	if got != fake {
		t.Fatalf("got %s, want %s", got, fake)
	}
}

func TestFindInDirSubpastaFfmpeg(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "ffmpeg")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	nome := "ffmpeg"
	if runtime.GOOS == "windows" {
		nome = "ffmpeg.exe"
	}
	fake := filepath.Join(sub, nome)
	if err := os.WriteFile(fake, []byte("fake"), 0755); err != nil {
		t.Fatal(err)
	}

	got, ok := findInDir(dir)
	if !ok {
		t.Fatal("deveria achar ffmpeg/ffmpeg.exe")
	}
	if got != fake {
		t.Fatalf("got %s, want %s", got, fake)
	}
}

func TestFindInDirVazio(t *testing.T) {
	if _, ok := findInDir(t.TempDir()); ok {
		t.Fatal("pasta vazia não deveria ter ffmpeg")
	}
}

func TestFindPreferePastaDoExe(t *testing.T) {
	dir := t.TempDir()
	nome := "ffmpeg"
	if runtime.GOOS == "windows" {
		nome = "ffmpeg.exe"
	}
	fake := filepath.Join(dir, nome)
	if err := os.WriteFile(fake, []byte("fake"), 0755); err != nil {
		t.Fatal(err)
	}

	got, err := Find(dir)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got != fake {
		t.Fatalf("got %s, want %s (não o PATH)", got, fake)
	}
}

func TestCommandNaoPreencheStderr(t *testing.T) {
	cmd := Command("-version")
	if cmd.Stderr != nil {
		t.Fatal("Command não deve preencher Stderr; CombinedOutput precisa dele livre")
	}
	if cmd.Stdout != nil {
		t.Fatal("Command não deve preencher Stdout")
	}
}

func TestInitEBin(t *testing.T) {
	mu.Lock()
	old := resolved
	mu.Unlock()
	t.Cleanup(func() {
		mu.Lock()
		resolved = old
		mu.Unlock()
	})

	dir := t.TempDir()
	nome := "ffmpeg"
	if runtime.GOOS == "windows" {
		nome = "ffmpeg.exe"
	}
	fake := filepath.Join(dir, nome)
	if err := os.WriteFile(fake, []byte("fake"), 0755); err != nil {
		t.Fatal(err)
	}

	if err := Init(dir); err != nil {
		t.Fatalf("Init: %v", err)
	}
	if Bin() != fake {
		t.Fatalf("Bin = %s, want %s", Bin(), fake)
	}
}
