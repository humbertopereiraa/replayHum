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
func Gerar(segmentos []string, pastaSaida string, cameraID, replaySeconds int) (videoPath, thumbPath string, err error) {
	if len(segmentos) == 0 {
		return "", "", fmt.Errorf("nenhum segmento disponível no buffer para esta câmera")
	}
	if replaySeconds <= 0 {
		replaySeconds = 30
	}

	if err := os.MkdirAll(pastaSaida, 0755); err != nil {
		return "", "", err
	}

	nomeBase := fmt.Sprintf("quadra%d_%s", cameraID, time.Now().Format("20060102_150405"))
	videoPath = filepath.Join(pastaSaida, nomeBase+".mp4")
	thumbPath = filepath.Join(pastaSaida, nomeBase+".jpg")
	concatPath := filepath.Join(pastaSaida, nomeBase+"_concat.mp4")

	// FFmpeg concat demuxer precisa de uma lista de arquivos num .txt
	listaPath, err := escreverListaConcat(segmentos)
	if err != nil {
		return "", "", err
	}
	defer os.Remove(listaPath)

	cmdConcat := exec.Command("ffmpeg",
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", listaPath,
		"-c", "copy",
		concatPath,
	)
	if out, err := cmdConcat.CombinedOutput(); err != nil {
		_ = os.Remove(concatPath)
		return "", "", fmt.Errorf("erro ao concatenar segmentos: %w\n%s", err, out)
	}
	defer os.Remove(concatPath)

	// Corta os últimos N segundos. Com -c copy o corte alinha no keyframe.
	// Se o concat for mais curto que N, o FFmpeg usa o que houver.
	cmdTrim := exec.Command("ffmpeg",
		"-y",
		"-sseof", fmt.Sprintf("-%d", replaySeconds),
		"-i", concatPath,
		"-t", fmt.Sprintf("%d", replaySeconds),
		"-c", "copy",
		videoPath,
	)
	if out, err := cmdTrim.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("erro ao cortar replay: %w\n%s", err, out)
	}

	ssThumb := replaySeconds / 2
	if ssThumb < 1 {
		ssThumb = 1
	}
	cmdThumb := exec.Command("ffmpeg",
		"-y",
		"-ss", fmt.Sprintf("%d", ssThumb),
		"-i", videoPath,
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
		sb.WriteString(fmt.Sprintf("file '%s'\n", filepath.ToSlash(abs)))
	}

	if _, err := f.WriteString(sb.String()); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// SegmentosNecessarios calcula quantos segmentos são necessários pra
// cobrir a duração de replay desejada, com 1 extra de margem para o
// corte no keyframe (ex: 30s / 8s → 5).
func SegmentosNecessarios(duracaoReplaySegundos, duracaoSegmentoSegundos int) int {
	if duracaoSegmentoSegundos <= 0 {
		return 1
	}
	return int(math.Ceil(float64(duracaoReplaySegundos)/float64(duracaoSegmentoSegundos))) + 1
}
