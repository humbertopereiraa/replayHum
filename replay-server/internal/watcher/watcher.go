// Package watcher observa a pasta de replays prontos e enfileira o
// par .mp4 + .jpg para upload. Usa polling simples (sem dependências
// externas) — suficiente para esse volume baixo de arquivos.
package watcher

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"replay-server/internal/config"
	"replay-server/internal/uploader"
)

var nomeArquivoReplay = regexp.MustCompile(`^quadra(\d+)_`)

// Observar varre periodicamente a pasta e enfileira pares estáveis
// de vídeo + thumbnail. Deve ser chamado dentro de uma goroutine própria.
func Observar(pasta string, intervalo time.Duration, cameras []config.Camera, duracaoSeg int, servico *uploader.Servico) {
	if err := os.MkdirAll(pasta, 0755); err != nil {
		log.Printf("[watcher] erro ao criar pasta %s: %v", pasta, err)
		return
	}

	ticker := time.NewTicker(intervalo)
	defer ticker.Stop()

	log.Printf("[watcher] observando pasta: %s", pasta)

	for range ticker.C {
		arquivos, err := filepath.Glob(filepath.Join(pasta, "*.mp4"))
		if err != nil {
			log.Printf("[watcher] erro ao listar pasta: %v", err)
			continue
		}

		for _, videoPath := range arquivos {
			thumbPath := strings.TrimSuffix(videoPath, filepath.Ext(videoPath)) + ".jpg"
			if !parPronto(videoPath, thumbPath) {
				continue
			}

			job, err := montarJob(videoPath, thumbPath, cameras, duracaoSeg)
			if err != nil {
				log.Printf("[watcher] ignorando %s: %v", videoPath, err)
				continue
			}

			if servico.TentarEnfileirar(job) {
				log.Printf("[watcher] novo replay detectado, enfileirado: %s", videoPath)
			}
		}
	}
}

func parPronto(videoPath, thumbPath string) bool {
	if _, err := os.Stat(thumbPath); err != nil {
		return false
	}
	return arquivoEstavel(videoPath) && arquivoEstavel(thumbPath)
}

func montarJob(videoPath, thumbPath string, cameras []config.Camera, duracaoSeg int) (uploader.Job, error) {
	id, err := idCameraDoArquivo(videoPath)
	if err != nil {
		return uploader.Job{}, err
	}

	nome, ok := nomeDaCamera(cameras, id)
	if !ok {
		return uploader.Job{}, fmt.Errorf("câmera %d não encontrada na configuração", id)
	}

	return uploader.Job{
		VideoPath:  videoPath,
		ThumbPath:  thumbPath,
		Quadra:     nome,
		DuracaoSeg: duracaoSeg,
	}, nil
}

func idCameraDoArquivo(caminho string) (int, error) {
	base := filepath.Base(caminho)
	partes := nomeArquivoReplay.FindStringSubmatch(base)
	if len(partes) != 2 {
		return 0, fmt.Errorf("nome de arquivo inesperado: %s", base)
	}
	return strconv.Atoi(partes[1])
}

func nomeDaCamera(cameras []config.Camera, id int) (string, bool) {
	for _, cam := range cameras {
		if cam.ID == id {
			return cam.Nome, true
		}
	}
	return "", false
}

// arquivoEstavel verifica se o tamanho do arquivo parou de crescer,
// indicando que o FFmpeg já terminou de escrevê-lo.
func arquivoEstavel(caminho string) bool {
	info1, err := os.Stat(caminho)
	if err != nil {
		return false
	}
	time.Sleep(300 * time.Millisecond)
	info2, err := os.Stat(caminho)
	if err != nil {
		return false
	}
	return info1.Size() == info2.Size() && info1.Size() > 0
}
