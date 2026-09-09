package uploader

// Job é o contrato da fila de upload: o par de arquivos locais e os
// metadados enviados em POST /upload/sign e POST /upload/confirm.
type Job struct {
	VideoPath  string
	ThumbPath  string
	Quadra     string
	DuracaoSeg int
}
