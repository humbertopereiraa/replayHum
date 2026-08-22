// Package camera cuida da captura contínua do stream RTSP de cada câmera
// e da manutenção do buffer circular de segmentos em disco (ou tmpfs).
package camera

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"time"

	"replay-server/internal/config"
)

// Worker representa o processo de captura de UMA câmera.
// Cada câmera roda sua própria goroutine, isolada das demais —
// se uma travar/reconectar, as outras continuam funcionando normalmente.
type Worker struct {
	Cam            config.Camera
	BufferDir      string
	SegmentSeconds int
	MaxSegments    int
}

// NewWorker cria um worker de captura para uma câmera específica,
// já garantindo que a pasta de buffer dela existe.
func NewWorker(cam config.Camera, bufferRoot string, segmentSeconds, maxSegments int) (*Worker, error) {
	dir := filepath.Join(bufferRoot, fmt.Sprintf("camera_%d", cam.ID))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	return &Worker{
		Cam:            cam,
		BufferDir:      dir,
		SegmentSeconds: segmentSeconds,
		MaxSegments:    maxSegments,
	}, nil
}

// Run inicia a captura em loop infinito. Se o FFmpeg cair por qualquer
// motivo (câmera desconectou, rede instável, etc.), ele reinicia sozinho
// após um pequeno intervalo — a câmera nunca fica "morta" pra sempre.
func (w *Worker) Run() {
	log.Printf("[camera %d] iniciando captura: %s", w.Cam.ID, w.Cam.Nome)

	// Goroutine separada só pra limpar segmentos antigos periodicamente
	go w.limparSegmentosAntigosPeriodicamente()

	for {
		if err := w.capturarUmaVez(); err != nil {
			log.Printf("[camera %d] erro na captura: %v — reiniciando em 5s", w.Cam.ID, err)
		}
		time.Sleep(5 * time.Second)
	}
}

// capturarUmaVez roda o FFmpeg em modo "segment", gravando pedaços curtos
// de vídeo continuamente. Usa -c copy (remux, sem recodificar) — CPU
// praticamente ociosa mesmo com várias câmeras simultâneas.
func (w *Worker) capturarUmaVez() error {
	padraoSaida := filepath.Join(w.BufferDir, "segment_%05d.mp4")

	args := []string{
		"-rtsp_transport", "tcp",
		"-i", w.Cam.RTSPUrl,
		"-c", "copy",
		"-f", "segment",
		"-segment_time", fmt.Sprintf("%d", w.SegmentSeconds),
		"-reset_timestamps", "1",
		"-strftime", "0",
		padraoSaida,
	}

	cmd := exec.Command("ffmpeg", args...)
	cmd.Stderr = os.Stderr // útil pra depurar durante o desenvolvimento

	return cmd.Run() // bloqueia até o ffmpeg encerrar (erro ou desconexão)
}

// limparSegmentosAntigosPeriodicamente mantém só os N segmentos mais
// recentes no buffer, apagando os mais antigos — é isso que implementa
// o "buffer circular" descrito na sua arquitetura original.
func (w *Worker) limparSegmentosAntigosPeriodicamente() {
	ticker := time.NewTicker(time.Duration(w.SegmentSeconds) * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		arquivos, err := filepath.Glob(filepath.Join(w.BufferDir, "segment_*.mp4"))
		if err != nil {
			continue
		}

		sort.Strings(arquivos) // nomes com zero-padding ordenam cronologicamente

		if len(arquivos) > w.MaxSegments {
			excedentes := arquivos[:len(arquivos)-w.MaxSegments]
			for _, f := range excedentes {
				_ = os.Remove(f)
			}
		}
	}
}

// UltimosSegmentos retorna os N segmentos COMPLETOS mais recentes do
// buffer desta câmera, em ordem cronológica — usado na hora de gerar
// um replay.
//
// Importante: o segmento mais novo de todos é sempre descartado, pois
// o FFmpeg pode ainda estar escrevendo nele no momento exato em que o
// replay foi solicitado (ele só fecha o arquivo ao completar
// segment_seconds). Incluí-lo geraria replays mais curtos que o
// esperado, com duração variável dependendo do timing do clique.
func (w *Worker) UltimosSegmentos(quantidade int) ([]string, error) {
	arquivos, err := filepath.Glob(filepath.Join(w.BufferDir, "segment_*.mp4"))
	if err != nil {
		return nil, err
	}
	sort.Strings(arquivos)

	// Descarta o mais recente (possivelmente incompleto/em escrita)
	if len(arquivos) > 0 {
		arquivos = arquivos[:len(arquivos)-1]
	}

	if len(arquivos) > quantidade {
		arquivos = arquivos[len(arquivos)-quantidade:]
	}
	return arquivos, nil
}
