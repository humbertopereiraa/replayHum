package uploader

// Job é o contrato da fila de upload: o par de arquivos locais e os
// metadados que a replay-api espera em POST /upload.
type Job struct {
	VideoPath  string
	ThumbPath  string
	Quadra     string
	DuracaoSeg int
}
