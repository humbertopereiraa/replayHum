// Package replay concatena os segmentos recentes do buffer de uma câmera
// em um único arquivo replay.mp4, e gera a thumbnail correspondente.
package replay

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"replay-server/internal/ffmpeg"
)

// Gerar cria o replay.mp4 e thumbnail.jpg a partir da lista de segmentos
// informada, salvando na pasta de saída. Retorna os caminhos gerados.
func Gerar(segmentos []string, pastaSaida string, cameraID, replaySeconds int, sobra time.Duration) (videoPath, thumbPath string, err error) {
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

	cmdConcat := ffmpeg.Command(
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

	// Corta até o instante do pedido (fim do concat menos a sobra) e
	// recodifica para H.264 baseline sem áudio, com moov no início.
	duracao, err := duracaoSegundos(concatPath)
	if err != nil {
		return "", "", err
	}
	inicio, trecho := inicioCorte(duracao, float64(replaySeconds), sobra.Seconds())
	if trecho <= 0 {
		return "", "", fmt.Errorf("recorte vazio: duração %.3fs, sobra %.3fs", duracao, sobra.Seconds())
	}
	cmdTrim := ffmpeg.Command(argsTrimReplay(inicio, trecho, concatPath, videoPath)...)
	if out, err := cmdTrim.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("erro ao cortar replay: %w\n%s", err, out)
	}

	ssThumb := trecho / 2
	cmdThumb := ffmpeg.Command(
		"-y",
		"-ss", fmt.Sprintf("%.3f", ssThumb),
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

// argsTrimReplay monta os argumentos do FFmpeg para o MP4 final:
// H.264 baseline, sem áudio e com faststart, para iOS/Android.
// -ss e -t ficam depois de -i para cortar no quadro, não no keyframe.
func argsTrimReplay(inicioSeg, trechoSeg float64, concatPath, videoPath string) []string {
	return []string{
		"-y",
		"-i", concatPath,
		"-ss", fmt.Sprintf("%.3f", inicioSeg),
		"-t", fmt.Sprintf("%.3f", trechoSeg),
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-profile:v", "baseline",
		"-level", "4.1",
		"-pix_fmt", "yuv420p",
		"-an",
		"-movflags", "+faststart",
		videoPath,
	}
}

// inicioCorte devolve o início e a duração do trecho que termina
// sobraSeg antes do fim do concat e cobre até replaySeg para trás.
func inicioCorte(duracaoSeg, replaySeg, sobraSeg float64) (inicio, trecho float64) {
	fim := duracaoSeg - sobraSeg
	if fim < 0 {
		fim = 0
	}
	inicio = fim - replaySeg
	if inicio < 0 {
		inicio = 0
	}
	return inicio, fim - inicio
}

var reDuracao = regexp.MustCompile(`Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)`)

func duracaoSegundos(path string) (float64, error) {
	cmd := ffmpeg.Command("-hide_banner", "-i", path, "-f", "null", "-")
	out, err := cmd.CombinedOutput()
	segs, parseErr := parseDuracao(string(out))
	if parseErr != nil {
		if err != nil {
			return 0, fmt.Errorf("erro ao ler duração: %w\n%s", err, out)
		}
		return 0, parseErr
	}
	return segs, nil
}

func parseDuracao(saida string) (float64, error) {
	m := reDuracao.FindStringSubmatch(saida)
	if m == nil {
		return 0, fmt.Errorf("duração não encontrada na saída do ffmpeg")
	}
	h, _ := strconv.Atoi(m[1])
	min, _ := strconv.Atoi(m[2])
	sec, err := strconv.ParseFloat(m[3], 64)
	if err != nil {
		return 0, fmt.Errorf("duração inválida: %w", err)
	}
	return float64(h)*3600 + float64(min)*60 + sec, nil
}

// SegmentosNecessarios calcula quantos segmentos são necessários pra
// cobrir a duração de replay desejada, com 2 extras: um para o corte
// no fim do segmento e outro de margem (ex: 30s / 8s → 6).
func SegmentosNecessarios(duracaoReplaySegundos, duracaoSegmentoSegundos int) int {
	if duracaoSegmentoSegundos <= 0 {
		return 1
	}
	return int(math.Ceil(float64(duracaoReplaySegundos)/float64(duracaoSegmentoSegundos))) + 2
}
