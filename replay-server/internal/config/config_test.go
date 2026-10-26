package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestChooseRootPrefereExeQuandoTemConfig(t *testing.T) {
	got := chooseRoot(`C:\ReplayServer`, `C:\Windows\System32`, true)
	if got != `C:\ReplayServer` {
		t.Fatalf("got %s, want pasta do exe", got)
	}
}

func TestChooseRootUsaCwdSemConfigNoExe(t *testing.T) {
	got := chooseRoot(`/tmp/go-build123/exe`, `/proj/replay-server`, false)
	if got != `/proj/replay-server` {
		t.Fatalf("got %s, want cwd (go run)", got)
	}
}

func TestChooseRootFallbackExeSemCwd(t *testing.T) {
	got := chooseRoot(`/opt/replay`, "", false)
	if got != `/opt/replay` {
		t.Fatalf("got %s, want exe dir", got)
	}
}

func TestResolverCaminhosRelativos(t *testing.T) {
	cfg := &Config{
		BufferPath: "./buffer",
		ReplayPath: "replays",
	}
	root := t.TempDir()
	cfg.ResolverCaminhos(root)

	if cfg.BufferPath != filepath.Join(root, "buffer") {
		t.Errorf("buffer = %s", cfg.BufferPath)
	}
	if cfg.ReplayPath != filepath.Join(root, "replays") {
		t.Errorf("replays = %s", cfg.ReplayPath)
	}
}

func TestResolverCaminhosVaziosUsamDefault(t *testing.T) {
	cfg := &Config{}
	root := t.TempDir()
	cfg.ResolverCaminhos(root)

	if cfg.BufferPath != filepath.Join(root, "buffer") {
		t.Errorf("buffer default = %s", cfg.BufferPath)
	}
	if cfg.ReplayPath != filepath.Join(root, "replays") {
		t.Errorf("replays default = %s", cfg.ReplayPath)
	}
}

func TestResolverCaminhosAbsolutosNaoMudam(t *testing.T) {
	absBuffer := filepath.Join(t.TempDir(), "buf")
	absReplay := filepath.Join(t.TempDir(), "rep")
	cfg := &Config{BufferPath: absBuffer, ReplayPath: absReplay}
	cfg.ResolverCaminhos(`C:\ReplayServer`)

	if cfg.BufferPath != absBuffer {
		t.Errorf("buffer absoluto alterado: %s", cfg.BufferPath)
	}
	if cfg.ReplayPath != absReplay {
		t.Errorf("replay absoluto alterado: %s", cfg.ReplayPath)
	}
}

func TestLoadPadraoUsaConfigDoCwd(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	conteudo := `{
		"api_url": "http://localhost:3000",
		"api_key": "k",
		"replay_token": "t",
		"buffer_path": "./buffer",
		"replay_path": "./replays"
	}`
	if err := os.WriteFile(cfgPath, []byte(conteudo), 0644); err != nil {
		t.Fatal(err)
	}

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(cwd) })

	cfg, root, err := LoadPadrao()
	if err != nil {
		t.Fatalf("LoadPadrao: %v", err)
	}
	if root != dir {
		t.Fatalf("root = %s, want %s", root, dir)
	}
	if cfg.BufferPath != filepath.Join(dir, "buffer") {
		t.Errorf("buffer resolvido = %s", cfg.BufferPath)
	}
	if cfg.ReplayEndMarginMs != 1200 {
		t.Errorf("margem padrão = %d, want 1200", cfg.ReplayEndMarginMs)
	}
}
