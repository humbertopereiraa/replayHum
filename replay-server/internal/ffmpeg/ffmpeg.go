// Package ffmpeg localiza o binário do FFmpeg (ao lado do .exe ou no PATH)
// e monta os comandos usados na captura e na geração de replay.
package ffmpeg

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

var (
	mu       sync.RWMutex
	resolved string
	stderr   io.Writer = os.Stderr
)

// SetStderr redireciona o stderr da captura contínua (log em arquivo).
func SetStderr(w io.Writer) {
	if w == nil {
		w = os.Stderr
	}
	mu.Lock()
	stderr = w
	mu.Unlock()
}

// Stderr é o writer da captura RTSP. Não use em CombinedOutput —
// o Go recusa se Stderr já estiver preenchido.
func Stderr() io.Writer {
	mu.RLock()
	defer mu.RUnlock()
	return stderr
}

// Init procura o FFmpeg na pasta do executável e, se não achar, no PATH.
func Init(exeDir string) error {
	path, err := Find(exeDir)
	if err != nil {
		return err
	}
	mu.Lock()
	resolved = path
	mu.Unlock()
	return nil
}

// Bin retorna o caminho resolvido por Init, ou "ffmpeg" se Init não rodou.
func Bin() string {
	mu.RLock()
	defer mu.RUnlock()
	if resolved != "" {
		return resolved
	}
	return "ffmpeg"
}

// Command monta um exec.Cmd apontando para o FFmpeg resolvido.
// Não preenche Stderr/Stdout, para CombinedOutput() funcionar na geração do replay.
func Command(args ...string) *exec.Cmd {
	mu.RLock()
	bin := resolved
	mu.RUnlock()
	if bin == "" {
		bin = "ffmpeg"
	}
	return exec.Command(bin, args...)
}

// Find procura ffmpeg.exe (ou ffmpeg) em exeDir e depois no PATH.
func Find(exeDir string) (string, error) {
	if path, ok := findInDir(exeDir); ok {
		return path, nil
	}
	if path, err := exec.LookPath("ffmpeg"); err == nil {
		return path, nil
	}
	return "", fmt.Errorf("ffmpeg não encontrado em %s nem no PATH", exeDir)
}

func findInDir(exeDir string) (string, bool) {
	if exeDir == "" {
		return "", false
	}
	names := []string{"ffmpeg"}
	if runtime.GOOS == "windows" {
		names = []string{"ffmpeg.exe", "ffmpeg"}
	}
	var candidates []string
	for _, name := range names {
		candidates = append(candidates,
			filepath.Join(exeDir, name),
			filepath.Join(exeDir, "ffmpeg", name),
		)
	}
	for _, c := range candidates {
		info, err := os.Stat(c)
		if err == nil && !info.IsDir() {
			return c, true
		}
	}
	return "", false
}
