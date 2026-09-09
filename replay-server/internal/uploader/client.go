package uploader

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	timeoutUpload     = 2 * time.Minute
	maxErroBody       = 4 * 1024
	tentativasConfirm = 3
	esperaConfirm     = 2 * time.Second
)

type signResponse struct {
	VideoKey         string `json:"video_key"`
	ThumbKey         string `json:"thumb_key"`
	VideoURL         string `json:"video_url"`
	ThumbURL         string `json:"thumb_url"`
	ExpiraEmSegundos int    `json:"expira_em_segundos"`
}

// Cliente pede URLs assinadas à replay-api, envia os arquivos direto
// ao B2 e confirma os metadados na API.
type Cliente struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NovoCliente cria um cliente HTTP com timeout, apontando para a API.
func NovoCliente(baseURL, apiKey string) *Cliente {
	return &Cliente{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: timeoutUpload,
		},
	}
}

// Enviar pede URLs assinadas, faz PUT do vídeo e da thumb no B2 e
// confirma na API. Se o PUT dos dois arquivos ok e o confirm falhar,
// tenta só o confirm de novo com as mesmas chaves.
func (c *Cliente) Enviar(job Job) error {
	if err := garantirArquivos(job.VideoPath, job.ThumbPath); err != nil {
		return err
	}

	signed, err := c.assinar(job)
	if err != nil {
		return err
	}

	if err := c.enviarArquivo(signed.VideoURL, job.VideoPath, "video/mp4"); err != nil {
		return fmt.Errorf("erro no PUT do vídeo: %w", err)
	}
	if err := c.enviarArquivo(signed.ThumbURL, job.ThumbPath, "image/jpeg"); err != nil {
		return fmt.Errorf("erro no PUT da thumbnail: %w", err)
	}

	return c.confirmarComRetry(job, signed)
}

func (c *Cliente) assinar(job Job) (signResponse, error) {
	videoInfo, err := os.Stat(job.VideoPath)
	if err != nil {
		return signResponse{}, fmt.Errorf("erro ao ler tamanho de %s: %w", job.VideoPath, err)
	}
	thumbInfo, err := os.Stat(job.ThumbPath)
	if err != nil {
		return signResponse{}, fmt.Errorf("erro ao ler tamanho de %s: %w", job.ThumbPath, err)
	}

	payload, err := json.Marshal(map[string]any{
		"quadra":      job.Quadra,
		"duracao_seg": job.DuracaoSeg,
		"video_bytes": videoInfo.Size(),
		"thumb_bytes": thumbInfo.Size(),
	})
	if err != nil {
		return signResponse{}, fmt.Errorf("erro ao serializar sign: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/upload/sign", bytes.NewReader(payload))
	if err != nil {
		return signResponse{}, fmt.Errorf("erro ao criar requisição de sign: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return signResponse{}, fmt.Errorf("erro ao chamar /upload/sign: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return signResponse{}, erroHTTP("API", resp)
	}

	var signed signResponse
	if err := json.NewDecoder(resp.Body).Decode(&signed); err != nil {
		return signResponse{}, fmt.Errorf("erro ao ler resposta de sign: %w", err)
	}
	if signed.VideoURL == "" || signed.ThumbURL == "" || signed.VideoKey == "" || signed.ThumbKey == "" {
		return signResponse{}, fmt.Errorf("resposta de sign incompleta")
	}
	return signed, nil
}

func (c *Cliente) enviarArquivo(urlAssinada, caminho, contentType string) error {
	arquivo, err := os.Open(caminho)
	if err != nil {
		return fmt.Errorf("erro ao abrir %s: %w", caminho, err)
	}
	defer arquivo.Close()

	info, err := arquivo.Stat()
	if err != nil {
		return fmt.Errorf("erro ao ler tamanho de %s: %w", caminho, err)
	}

	req, err := http.NewRequest(http.MethodPut, urlAssinada, arquivo)
	if err != nil {
		return fmt.Errorf("erro ao criar PUT: %w", err)
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Type", contentType)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("erro ao enviar arquivo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return erroHTTP("B2", resp)
	}
	return nil
}

func (c *Cliente) confirmarComRetry(job Job, signed signResponse) error {
	var err error
	for i := 1; i <= tentativasConfirm; i++ {
		err = c.confirmar(job, signed)
		if err == nil {
			return nil
		}
		if i < tentativasConfirm {
			time.Sleep(esperaConfirm)
		}
	}
	return err
}

func (c *Cliente) confirmar(job Job, signed signResponse) error {
	payload, err := json.Marshal(map[string]any{
		"video_key":   signed.VideoKey,
		"thumb_key":   signed.ThumbKey,
		"quadra":      job.Quadra,
		"duracao_seg": job.DuracaoSeg,
	})
	if err != nil {
		return fmt.Errorf("erro ao serializar confirm: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/upload/confirm", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("erro ao criar requisição de confirm: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("erro ao chamar /upload/confirm: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return erroHTTP("API", resp)
	}
	return nil
}

func garantirArquivos(caminhos ...string) error {
	for _, caminho := range caminhos {
		if _, err := os.Stat(caminho); err != nil {
			return fmt.Errorf("erro ao abrir %s: %w", caminho, err)
		}
	}
	return nil
}

func erroHTTP(origem string, resp *http.Response) error {
	retorno, _ := io.ReadAll(io.LimitReader(resp.Body, maxErroBody))
	return fmt.Errorf("%s retornou %d: %s", origem, resp.StatusCode, bytes.TrimSpace(retorno))
}
