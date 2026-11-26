const path = require('node:path')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const sharp = require('sharp')
const { falhar } = require('../utils/api.util')

const MAX_BYTES = 5 * 1024 * 1024
const arquivoValido = nome => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.webp$/.test(nome)
function diretorioMidias() {
    const pasta = process.env.UPLOAD_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH
    if (!pasta && process.env.NODE_ENV === 'production') falhar(503, 'Configure o armazenamento persistente das imagens antes de enviar arquivos.')
    return path.resolve(pasta || path.join(__dirname, '../uploads'))
}
async function salvarImagem(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) falhar(400, 'Escolha uma imagem JPG, PNG, WebP ou AVIF.')
    if (buffer.length > MAX_BYTES) falhar(413, 'Cada imagem pode ter até 5 MB.')
    let imagem
    try {
        const entrada = sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' })
        const meta = await entrada.metadata()
        if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(meta.format) || (meta.pages || 1) > 1) throw new Error('Formato inválido')
        // Recria a imagem, removendo metadados e impedindo que arquivos arbitrários sejam publicados.
        imagem = await entrada.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
    } catch { falhar(400, 'Imagem inválida. Use JPG, PNG, WebP ou AVIF estático, com até 25 megapixels.') }
    const pasta = diretorioMidias(), arquivo = `${randomUUID()}.webp`
    await fs.mkdir(pasta, { recursive: true })
    await fs.writeFile(path.join(pasta, arquivo), imagem, { flag: 'wx' })
    return { url: `/api/midias/${arquivo}`, bytes: imagem.length }
}
module.exports = { MAX_BYTES, arquivoValido, diretorioMidias, salvarImagem }
