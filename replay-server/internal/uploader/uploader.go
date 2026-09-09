package uploader

import (
	"errors"
	"log"
	"os"
	"sync"
	"time"
)

const (
	tamanhoFila   = 100
	maxTentativas = 5
)

var esperasRetry = []time.Duration{
	5 * time.Second,
	10 * time.Second,
	20 * time.Second,
	40 * time.Second,
}

// Servico é a fachada da fila de upload: o watcher enfileira Jobs e
// os workers pedem URL assinada, enviam ao B2 e confirmam na API.
// Arquivos locais só são apagados depois do confirm (HTTP 201 ou 200).
type Servico struct {
	cliente     *Cliente
	fila        chan Job
	mu          sync.Mutex
	emAndamento map[string]bool
	jaEnviados  map[string]bool
}

// NovoServico cria o serviço apontando para a replay-api.
func NovoServico(apiURL, apiKey string) *Servico {
	return &Servico{
		cliente:     NovoCliente(apiURL, apiKey),
		fila:        make(chan Job, tamanhoFila),
		emAndamento: make(map[string]bool),
		jaEnviados:  make(map[string]bool),
	}
}

// TentarEnfileirar coloca o job na fila se ele ainda não está em
// processamento nem foi enviado com sucesso (com arquivos residuais).
// Retorna false quando ignora o job ou a fila está cheia.
func (s *Servico) TentarEnfileirar(job Job) bool {
	s.mu.Lock()
	if s.emAndamento[job.VideoPath] || s.jaEnviados[job.VideoPath] {
		s.mu.Unlock()
		return false
	}
	s.emAndamento[job.VideoPath] = true
	s.mu.Unlock()

	select {
	case s.fila <- job:
		return true
	default:
		s.liberar(job.VideoPath)
		return false
	}
}

// IniciarWorkers sobe N goroutines consumindo a mesma fila. Limitar a
// quantidade evita saturar o link de upload da unidade.
func (s *Servico) IniciarWorkers(quantidade int) {
	for i := 0; i < quantidade; i++ {
		id := i + 1
		go s.worker(id)
	}
}

func (s *Servico) worker(id int) {
	log.Printf("[uploader %d] pronto para enviar arquivos", id)

	for job := range s.fila {
		s.processar(id, job)
	}
}

func (s *Servico) processar(id int, job Job) {
	log.Printf("[uploader %d] enviando: %s", id, job.VideoPath)

	var err error
	for tentativa := 1; tentativa <= maxTentativas; tentativa++ {
		err = s.cliente.Enviar(job)
		if err == nil {
			break
		}
		log.Printf("[uploader %d] falha ao enviar %s (tentativa %d/%d): %v", id, job.VideoPath, tentativa, maxTentativas, err)
		if tentativa < maxTentativas {
			time.Sleep(esperasRetry[tentativa-1])
		}
	}

	if err != nil {
		log.Printf("[uploader %d] desistindo de %s após %d tentativas; arquivo permanece no disco", id, job.VideoPath, maxTentativas)
		s.liberar(job.VideoPath)
		return
	}

	if err := apagarArquivos(job.VideoPath, job.ThumbPath); err != nil {
		log.Printf("[uploader %d] upload ok, mas falhou ao apagar arquivos de %s: %v", id, job.VideoPath, err)
		s.marcarEnviado(job.VideoPath)
		return
	}

	s.liberar(job.VideoPath)
	log.Printf("[uploader %d] envio concluído: %s", id, job.VideoPath)
}

func (s *Servico) liberar(videoPath string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.emAndamento, videoPath)
}

func (s *Servico) marcarEnviado(videoPath string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.emAndamento, videoPath)
	s.jaEnviados[videoPath] = true
}

func apagarArquivos(caminhos ...string) error {
	var errs []error
	for _, caminho := range caminhos {
		if err := os.Remove(caminho); err != nil && !os.IsNotExist(err) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
