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

const globSegmentos = "segment_*.mp4"

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
	w.limparTodosSegmentos()

	padraoSaida := filepath.Join(w.BufferDir, "segment_%Y%m%d_%H%M%S.mp4")

	args := []string{
		"-rtsp_transport", "tcp",
		"-i", w.Cam.RTSPUrl,
		"-c", "copy",
		"-f", "segment",
		"-segment_time", fmt.Sprintf("%d", w.SegmentSeconds),
		"-reset_timestamps", "1",
		"-strftime", "1",
		padraoSaida,
	}

	cmd := exec.Command("ffmpeg", args...)
	cmd.Stderr = os.Stderr // útil pra depurar durante o desenvolvimento

	return cmd.Run() // bloqueia até o ffmpeg encerrar (erro ou desconexão)
}

func (w *Worker) limparTodosSegmentos() {
	arquivos, err := w.listarSegmentos()
	if err != nil {
		return
	}
	for _, f := range arquivos {
		_ = os.Remove(f)
	}
}

func (w *Worker) listarSegmentos() ([]string, error) {
	arquivos, err := filepath.Glob(filepath.Join(w.BufferDir, globSegmentos))
	if err != nil {
		return nil, err
	}
	sort.Strings(arquivos)
	return arquivos, nil
}

// limparSegmentosAntigosPeriodicamente mantém só os N segmentos mais
// recentes no buffer, apagando os mais antigos — é isso que implementa
// o "buffer circular" descrito na sua arquitetura original.
func (w *Worker) limparSegmentosAntigosPeriodicamente() {
	ticker := time.NewTicker(time.Duration(w.SegmentSeconds) * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		arquivos, err := w.listarSegmentos()
		if err != nil {
			continue
		}

		if len(arquivos) > w.MaxSegments {
			excedentes := arquivos[:len(arquivos)-w.MaxSegments]
			for _, f := range excedentes {
				_ = os.Remove(f)
			}
		}
	}
}

// EsperarSegmentoFechar bloqueia até o FFmpeg abrir um segmento mais novo
// que o atual (o do clique fechou) ou até o timeout. Depois disso,
// UltimosSegmentos pode descartar o arquivo em escrita com segurança.
func (w *Worker) EsperarSegmentoFechar(timeout time.Duration) {
	if timeout <= 0 {
		return
	}

	arquivos, err := w.listarSegmentos()
	if err != nil || len(arquivos) == 0 {
		return
	}
	atual := arquivos[len(arquivos)-1]

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(200 * time.Millisecond)
		arquivos, err := w.listarSegmentos()
		if err != nil || len(arquivos) == 0 {
			continue
		}
		if arquivos[len(arquivos)-1] != atual {
			return
		}
	}
}

// UltimosSegmentos retorna os N segmentos COMPLETOS mais recentes do
// buffer desta câmera, em ordem cronológica — usado na hora de gerar
// um replay.
//
// O segmento mais novo é descartado: depois de EsperarSegmentoFechar,
// ele é o pedaço aberto *depois* do clique, ainda em escrita.
func (w *Worker) UltimosSegmentos(quantidade int) ([]string, error) {
	arquivos, err := w.listarSegmentos()
	if err != nil {
		return nil, err
	}

	if len(arquivos) > 0 {
		arquivos = arquivos[:len(arquivos)-1]
	}

	if len(arquivos) > quantidade {
		arquivos = arquivos[len(arquivos)-quantidade:]
	}
	return arquivos, nil
}
