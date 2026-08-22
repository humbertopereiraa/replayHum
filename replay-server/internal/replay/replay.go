// Package replay concatena os segmentos recentes do buffer de uma câmera
// em um único arquivo replay.mp4, e gera a thumbnail correspondente.
package replay

import (
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Gerar cria o replay.mp4 e thumbnail.jpg a partir da lista de segmentos
// informada, salvando na pasta de saída. Retorna os caminhos gerados.
func Gerar(segmentos []string, pastaSaida string, cameraID int) (videoPath, thumbPath string, err error) {
	if len(segmentos) == 0 {
		return "", "", fmt.Errorf("nenhum segmento disponível no buffer para esta câmera")
	}

	if err := os.MkdirAll(pastaSaida, 0755); err != nil {
		return "", "", err
	}

	nomeBase := fmt.Sprintf("quadra%d_%s", cameraID, time.Now().Format("20060102_150405"))
	videoPath = filepath.Join(pastaSaida, nomeBase+".mp4")
	thumbPath = filepath.Join(pastaSaida, nomeBase+".jpg")

	// FFmpeg concat demuxer precisa de uma lista de arquivos num .txt
	listaPath, err := escreverListaConcat(segmentos)
	if err != nil {
		return "", "", err
	}
	defer os.Remove(listaPath)

	// Concatena os segmentos com -c copy (rápido, sem recodificar)
	cmdConcat := exec.Command("ffmpeg",
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", listaPath,
		"-c", "copy",
		videoPath,
	)
	if out, err := cmdConcat.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("erro ao concatenar segmentos: %w\n%s", err, out)
	}

	// Extrai 1 frame do meio do vídeo como thumbnail
	cmdThumb := exec.Command("ffmpeg",
		"-y",
		"-i", videoPath,
		"-ss", "1",
		"-frames:v", "1",
		thumbPath,
	)
	if out, err := cmdThumb.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("erro ao gerar thumbnail: %w\n%s", err, out)
	}

	return videoPath, thumbPath, nil
}

// escreverListaConcat gera o arquivo .txt temporário exigido pelo
// concat demuxer do FFmpeg, listando os segmentos na ordem correta.
func escreverListaConcat(segmentos []string) (string, error) {
	f, err := os.CreateTemp("", "concat_list_*.txt")
	if err != nil {
		return "", err
	}
	defer f.Close()

	var sb strings.Builder
	for _, s := range segmentos {
		abs, err := filepath.Abs(s)
		if err != nil {
			return "", err
		}
		sb.WriteString(fmt.Sprintf("file '%s'\n", abs))
	}

	if _, err := f.WriteString(sb.String()); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// SegmentosNecessarios calcula quantos segmentos são necessários pra
// cobrir a duração de replay desejada (ex: 30s), arredondando pra cima.
func SegmentosNecessarios(duracaoReplaySegundos, duracaoSegmentoSegundos int) int {
	return int(math.Ceil(float64(duracaoReplaySegundos) / float64(duracaoSegmentoSegundos)))
}
