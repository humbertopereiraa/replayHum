// Package config carrega as configurações do sistema a partir do config.json
package config

import (
	"encoding/json"
	"fmt"
	"os"
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
	HTTPPort       int      `json:"http_port"`
	BufferPath     string   `json:"buffer_path"`
	ReplayPath     string   `json:"replay_path"`
	SegmentSeconds int      `json:"segment_seconds"`
	MaxSegments    int      `json:"max_segments"`
	ReplaySeconds  int      `json:"replay_seconds"`
	UploadWorkers  int      `json:"upload_workers"`
	APIURL         string   `json:"api_url"`
	APIKey         string   `json:"api_key"`
	Cameras        []Camera `json:"cameras"`
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

	if err := cfg.validar(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) validar() error {
	if strings.TrimSpace(c.APIURL) == "" {
		return fmt.Errorf("api_url é obrigatório")
	}
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("api_key é obrigatório")
	}
	return nil
}
