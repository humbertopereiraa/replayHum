package uploader

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	timeoutUpload = 2 * time.Minute
	maxErroBody   = 4 * 1024
)

// Cliente envia um Job para a replay-api via multipart.
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

// Enviar faz POST /upload com video, thumb, quadra e duracao_seg.
// Sucesso é apenas HTTP 201; qualquer outro status vira erro.
func (c *Cliente) Enviar(job Job) error {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	if err := anexarArquivo(writer, "video", job.VideoPath); err != nil {
		return err
	}
	if err := anexarArquivo(writer, "thumb", job.ThumbPath); err != nil {
		return err
	}
	if err := writer.WriteField("quadra", job.Quadra); err != nil {
		return fmt.Errorf("erro ao escrever campo quadra: %w", err)
	}
	if err := writer.WriteField("duracao_seg", strconv.Itoa(job.DuracaoSeg)); err != nil {
		return fmt.Errorf("erro ao escrever campo duracao_seg: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("erro ao fechar multipart: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/upload", body)
	if err != nil {
		return fmt.Errorf("erro ao criar requisição: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("erro ao chamar a API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		retorno, _ := io.ReadAll(io.LimitReader(resp.Body, maxErroBody))
		return fmt.Errorf("API retornou %d: %s", resp.StatusCode, bytes.TrimSpace(retorno))
	}

	return nil
}

func anexarArquivo(writer *multipart.Writer, campo, caminho string) error {
	arquivo, err := os.Open(caminho)
	if err != nil {
		return fmt.Errorf("erro ao abrir %s: %w", caminho, err)
	}
	defer arquivo.Close()

	parte, err := writer.CreateFormFile(campo, filepath.Base(caminho))
	if err != nil {
		return fmt.Errorf("erro ao criar campo %s: %w", campo, err)
	}
	if _, err := io.Copy(parte, arquivo); err != nil {
		return fmt.Errorf("erro ao copiar %s: %w", caminho, err)
	}
	return nil
}
