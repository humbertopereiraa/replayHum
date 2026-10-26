// Package config carrega as configurações do sistema a partir do config.json
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Camera representa uma câmera/quadra configurada
type Camera struct {
	ID      int    `json:"id"`
	Nome    string `json:"nome"`
	RTSPUrl string `json:"rtsp_url"`
}

// Config representa todas as configurações do servidor local
type Config struct {
	HTTPPort          int      `json:"http_port"`
	BufferPath        string   `json:"buffer_path"`
	ReplayPath        string   `json:"replay_path"`
	SegmentSeconds    int      `json:"segment_seconds"`
	MaxSegments       int      `json:"max_segments"`
	ReplaySeconds     int      `json:"replay_seconds"`
	ReplayEndMarginMs int      `json:"replay_end_margin_ms"`
	UploadWorkers     int      `json:"upload_workers"`
	APIURL            string   `json:"api_url"`
	APIKey            string   `json:"api_key"`
	ReplayToken       string   `json:"replay_token"`
	Cameras           []Camera `json:"cameras"`
}

// Load lê e decodifica o arquivo config.json no caminho informado
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("erro ao ler config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("erro ao decodificar config: %w", err)
	}
	if cfg.ReplayEndMarginMs <= 0 {
		cfg.ReplayEndMarginMs = 1200
	}

	if err := cfg.validar(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// LoadPadrao carrega config.json da pasta do executável (instalação) ou
// do CWD (desenvolvimento com go run), e resolve caminhos relativos.
func LoadPadrao() (*Config, string, error) {
	root, err := RootDir()
	if err != nil {
		return nil, "", err
	}
	cfg, err := Load(filepath.Join(root, "config.json"))
	if err != nil {
		return nil, root, err
	}
	cfg.ResolverCaminhos(root)
	return cfg, root, nil
}

// RootDir é a pasta onde estão o .exe e o config.json.
// Preferência: diretório do executável se houver config.json lá;
// senão o CWD (caso típico de `go run`).
func RootDir() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		cwd = ""
	}

	exe, err := os.Executable()
	if err != nil {
		if cwd == "" {
			return "", fmt.Errorf("não foi possível determinar a pasta do servidor: %w", err)
		}
		return cwd, nil
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}

	exeDir := filepath.Dir(exe)
	return chooseRoot(exeDir, cwd, fileExists(filepath.Join(exeDir, "config.json"))), nil
}

func chooseRoot(exeDir, cwd string, exeHasConfig bool) string {
	if exeHasConfig && exeDir != "" {
		return exeDir
	}
	if cwd != "" {
		return cwd
	}
	return exeDir
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// ResolverCaminhos torna buffer_path e replay_path absolutos em relação à raiz.
func (c *Config) ResolverCaminhos(root string) {
	c.BufferPath = resolvePath(root, c.BufferPath, "buffer")
	c.ReplayPath = resolvePath(root, c.ReplayPath, "replays")
}

func resolvePath(root, p, fallback string) string {
	if strings.TrimSpace(p) == "" {
		p = fallback
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	return filepath.Clean(filepath.Join(root, p))
}

func (c *Config) validar() error {
	if strings.TrimSpace(c.APIURL) == "" {
		return fmt.Errorf("api_url é obrigatório")
	}
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("api_key é obrigatório")
	}
	if strings.TrimSpace(c.ReplayToken) == "" {
		return fmt.Errorf("replay_token é obrigatório")
	}
	return nil
}
