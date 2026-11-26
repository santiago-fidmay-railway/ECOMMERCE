const express = require('express')
const path = require('node:path')
const { arquivoValido, diretorioMidias } = require('../services/midia.service')
const router = express.Router()

// As fotos são públicas, mas a criação de arquivos exige administrador em /admin/imagens.
router.get('/:arquivo', (req, res, next) => {
    if (!arquivoValido(req.params.arquivo)) return res.status(404).json({ erro: 'Imagem não encontrada.' })
    try {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        res.sendFile(path.join(diretorioMidias(), req.params.arquivo), { maxAge: '1y', immutable: true, dotfiles: 'deny' }, erro => {
            if (!erro) return
            if (erro.status === 404) return res.status(404).json({ erro: 'Imagem não encontrada.' })
            next(erro)
        })
    } catch (erro) { next(erro) }
})
module.exports = router
