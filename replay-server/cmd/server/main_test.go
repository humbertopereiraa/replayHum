package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRotacionarLogSemArquivoNaoEErro(t *testing.T) {
	path := filepath.Join(t.TempDir(), "replay-server.log")
	if !rotacionarLog(path) {
		t.Fatal("ausência de log deveria retornar true")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("não deveria criar o log")
	}
	if _, err := os.Stat(path + ".old"); !os.IsNotExist(err) {
		t.Fatal("não deveria criar .old")
	}
}

func TestRotacionarLogMoveAtualParaOld(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "replay-server.log")
	if err := os.WriteFile(path, []byte("sessao-atual"), 0644); err != nil {
		t.Fatal(err)
	}

	if !rotacionarLog(path) {
		t.Fatal("rotate deveria ter sucesso")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("log atual deveria ter sido movido")
	}
	got, err := os.ReadFile(path + ".old")
	if err != nil {
		t.Fatalf("ler .old: %v", err)
	}
	if string(got) != "sessao-atual" {
		t.Fatalf(".old = %q, want sessao-atual", got)
	}
}

func TestRotacionarLogSubstituiOldAnterior(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "replay-server.log")
	old := path + ".old"
	if err := os.WriteFile(old, []byte("sessao-antiga"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("sessao-1"), 0644); err != nil {
		t.Fatal(err)
	}

	if !rotacionarLog(path) {
		t.Fatal("primeiro rotate deveria ter sucesso")
	}
	got, err := os.ReadFile(old)
	if err != nil {
		t.Fatalf("ler .old após 1º start: %v", err)
	}
	if string(got) != "sessao-1" {
		t.Fatalf("após 1º start .old = %q, want sessao-1", got)
	}

	if err := os.WriteFile(path, []byte("sessao-2"), 0644); err != nil {
		t.Fatal(err)
	}
	if !rotacionarLog(path) {
		t.Fatal("segundo rotate deveria ter sucesso")
	}

	entradas, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entradas) != 1 {
		t.Fatalf("arquivos = %d, want 1 (.old): %v", len(entradas), nomes(entradas))
	}
	if entradas[0].Name() != "replay-server.log.old" {
		t.Fatalf("ficou %s, want replay-server.log.old", entradas[0].Name())
	}
	got, err = os.ReadFile(old)
	if err != nil {
		t.Fatalf("ler .old após 2º start: %v", err)
	}
	if string(got) != "sessao-2" {
		t.Fatalf("após 2º start .old = %q, want sessao-2 (substituiu a sessão anterior)", got)
	}
}

func nomes(entradas []os.DirEntry) []string {
	out := make([]string, len(entradas))
	for i, e := range entradas {
		out[i] = e.Name()
	}
	return out
}
