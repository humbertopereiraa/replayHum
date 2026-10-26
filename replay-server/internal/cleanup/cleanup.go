// Package cleanup remove lixo de execuções anteriores no start do servidor.
package cleanup

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// Startup apaga o buffer circular inteiro e leftovers de concatenação
// do FFmpeg. Não remove replays prontos (quadraN_*.mp4 / .jpg): o
// watcher precisa deles para retentar o upload.
func Startup(bufferPath, replayPath string) error {
	if err := os.RemoveAll(bufferPath); err != nil {
		return fmt.Errorf("limpar buffer %s: %w", bufferPath, err)
	}
	if err := os.MkdirAll(bufferPath, 0755); err != nil {
		return fmt.Errorf("recriar buffer %s: %w", bufferPath, err)
	}
	log.Printf("[cleanup] buffer limpo: %s", bufferPath)

	if err := removerConcats(replayPath); err != nil {
		return err
	}
	return nil
}

func removerConcats(replayPath string) error {
	if replayPath == "" {
		return nil
	}
	arquivos, err := filepath.Glob(filepath.Join(replayPath, "*_concat.mp4"))
	if err != nil {
		return fmt.Errorf("listar leftovers de concat em %s: %w", replayPath, err)
	}
	for _, f := range arquivos {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("apagar leftover %s: %w", f, err)
		}
		log.Printf("[cleanup] leftover removido: %s", f)
	}
	return nil
}
