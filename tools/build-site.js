const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
async function build() {
    const apiBase = process.env.API_BASE_URL || 'http://localhost:3001/api'
    const url = new URL(apiBase)
    if (!url.pathname.replace(/\/$/, '').endsWith('/api')) throw new Error('API_BASE_URL precisa terminar em /api.')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('API_BASE_URL inválida: use a URL HTTP ou HTTPS da API, sem credenciais.')
    const destino = path.join(root, 'dist')
    if (path.dirname(path.resolve(destino)) !== root || path.basename(destino) !== 'dist') throw new Error('Diretório de saída fora do projeto.')
    await fs.rm(destino, { recursive: true, force: true })
    await fs.mkdir(destino, { recursive: true })
    for (const pasta of ['css', 'js', 'pages', 'assets', 'ajuda', 'vendor']) {
        await fs.cp(path.join(root, 'frontend', pasta), path.join(destino, pasta), { recursive: true })
    }
    await fs.copyFile(path.join(root, 'frontend/index.html'), path.join(destino, 'index.html'))
    for (const arquivo of ['manifest.webmanifest', 'offline.html', 'sw.js']) await fs.copyFile(path.join(root, 'frontend', arquivo), path.join(destino, arquivo))
    await fs.cp(path.join(root, 'backend', 'imagens'), path.join(destino, 'imagens'), { recursive: true })
    await fs.cp(path.join(root, 'videos'), path.join(destino, 'videos'), { recursive: true })
    await fs.writeFile(path.join(destino, 'js/config.js'), 'window.SGFRUN_CONFIG = ' + JSON.stringify({ apiBase: url.href.replace(/\/$/, '') }) + ';\n')
    const sitemapUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null
    const rotas = ['', 'pages/catalogo.html', 'pages/quiz.html', 'pages/comparar.html', 'pages/marcas.html', 'pages/criador.html', 'pages/app.html']
    if (sitemapUrl) {
        const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
        await fs.writeFile(path.join(destino, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + rotas.map(rota => `<url><loc>${escape(new URL(rota, sitemapUrl).href)}</loc></url>`).join('') + '</urlset>')
    }
    await fs.writeFile(path.join(destino, 'robots.txt'), 'User-agent: *\nDisallow: /pages/admin.html\nDisallow: /pages/perfil.html\nDisallow: /pages/pedidos.html\nDisallow: /pages/pedido.html\nDisallow: /pages/colecao.html\n' + (sitemapUrl ? `Sitemap: ${new URL('sitemap.xml', sitemapUrl).href}\n` : ''))
    const conferir = async dir => {
        for (const item of await fs.readdir(dir, { withFileTypes: true })) {
            if (item.name.startsWith('.env') || ['backend', 'node_modules', '.git', '.backups'].includes(item.name)) throw new Error('Arquivo privado encontrado na saída pública.')
            if (item.isDirectory()) await conferir(path.join(dir, item.name))
        }
    }
    await conferir(destino)
    const hash = require('node:crypto').createHash('sha256')
    async function assinar(dir) {
        for (const nome of (await fs.readdir(dir)).sort()) {
            const arquivo = path.join(dir, nome)
            if ((await fs.stat(arquivo)).isDirectory()) await assinar(arquivo)
            else { hash.update(path.relative(destino, arquivo).replaceAll(path.sep, '/')); hash.update(await fs.readFile(arquivo)) }
        }
    }
    await assinar(destino)
    const worker = path.join(destino, 'sw.js')
    await fs.writeFile(worker, (await fs.readFile(worker, 'utf8')).replace('__SGFRUN_BUILD__', hash.digest('hex').slice(0, 20)))
    console.log('Site preparado em dist/. Somente arquivos públicos foram incluídos.')
}
if (require.main === module) build().catch(err => { console.error(err.message); process.exitCode = 1 })
module.exports = { build }
