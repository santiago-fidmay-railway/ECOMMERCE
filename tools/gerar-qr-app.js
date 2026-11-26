const fs = require('node:fs/promises')
const path = require('node:path')
const QRCode = require('../backend/node_modules/qrcode')
async function gerar() {
    const url = new URL(process.argv[2] || 'https://ecommerce-frontend-rosy-phi.vercel.app/pages/app')
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use um endereço público HTTPS sem credenciais.')
    const pasta = path.resolve(__dirname, '../frontend/assets/images')
    const opcoes = { errorCorrectionLevel: 'M', margin: 4, width: 320, color: { dark: '#050508', light: '#ffffff' } }
    await QRCode.toFile(path.join(pasta, 'instalar-app-qr.png'), url.href, opcoes)
    await fs.writeFile(path.join(pasta, 'instalar-app-qr.svg'), await QRCode.toString(url.href, { ...opcoes, type: 'svg' }))
    console.log(`QR code gerado para ${url.href}`)
}
gerar().catch(erro => { console.error(erro.message); process.exitCode = 1 })
