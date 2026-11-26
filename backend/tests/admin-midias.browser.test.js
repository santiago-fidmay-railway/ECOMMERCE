const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')
const { chromium } = require('playwright')
const sharp = require('sharp')
let a, browser, front, base, pasta, foto
const root = path.resolve(__dirname, '../..')
before(async () => {
    pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'sgfrun-browser-midias-'))
    process.env.UPLOAD_DIR = pasta
    a = await require('./helpers/app').ambiente()
    foto = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#6d5dfc' } }).png().toBuffer()
    const pedido = await a.models.Pedido.create({ idUsuario: a.cliente.codUsuario, status: 'CONFIRMADO', valorTotal: 300, dataPedido: '2026-11-20T12:00:00Z' })
    await a.models.ItemPedido.create({ idPedido: pedido.codPedido, idProduto: a.produto.codProduto, quantidade: 3, preco_unitario: 100, subtotal: 300 })
    const express = require('express'), app = express()
    app.use('/imagens', express.static(path.join(root, 'backend/imagens')))
    app.use(express.static(path.join(root, 'frontend')))
    front = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
    base = `http://127.0.0.1:${front.address().port}/`
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    browser = await chromium.launch({ headless: true, ...(require('node:fs').existsSync(chrome) ? { executablePath: chrome } : {}) })
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true })
})
after(async () => {
    if (browser) await browser.close()
    if (front) await new Promise(resolve => front.close(resolve))
    if (a) await a.fechar()
    if (pasta) await fs.rm(pasta, { recursive: true, force: true })
})
async function abrir(width) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.route('**/js/config.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.SGFRUN_CONFIG=${JSON.stringify({ apiBase: a.base })};` }))
    await context.route('https://fonts.googleapis.com/**', route => route.abort())
    await context.route('https://www.youtube-nocookie.com/**', route => route.abort())
    await context.addInitScript(({ token, id }) => {
        localStorage.setItem('sk_token', token)
        localStorage.setItem('sk_user', JSON.stringify({ id, nome: 'Gestor Teste', tipo: 'ADMIN' }))
    }, { token: a.tokens.gestor, id: a.gestor.codUsuario })
    const page = await context.newPage(), erros = []
    page.setDefaultTimeout(12000); page.on('pageerror', e => erros.push(e.message))
    await page.goto(base + 'pages/admin.html')
    await page.waitForFunction(() => document.querySelectorAll('#adminIndicadores article').length === 4)
    return { context, page, erros }
}
for (const width of [1366, 390]) {
    test(`gráficos com dados reais, filtro vazio e CSV em ${width}px`, async () => {
        const { context, page, erros } = await abrir(width)
        try {
            assert.equal(await page.locator('canvas').count(), 5)
            assert.deepEqual(await page.evaluate(() => Chart.getChart('chartVendidos').data.datasets[0].data), [3])
            assert.equal(await page.locator('#chartStatus').isVisible(), true)
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
            await page.screenshot({ path: path.join(root, `test-results/admin-graficos-${width}.png`), fullPage: true })
            const download = page.waitForEvent('download')
            await page.click('#exportarRelatorio')
            const csv = await fs.readFile(await (await download).path(), 'utf8')
            assert.match(csv, /Status/); assert.match(csv, /Confirmado/); assert.match(csv, /Modelo Teste/)
            await page.fill('#inicio', '2025-01-01'); await page.fill('#fim', '2025-01-01')
            await page.getByRole('button', { name: 'Aplicar período', exact: true }).click()
            await page.waitForSelector('#chartVendidosVazio:not([hidden])')
            assert.equal(await page.locator('#chartStatus').isVisible(), false)
            assert.equal(await page.locator('#chartEstoque').isVisible(), true)
            assert.deepEqual(erros, [])
        } finally { await context.close() }
    })
}
test('upload com prévia, remoção, salvamento e foto pública após recarregar', async () => {
    const { context, page, erros } = await abrir(1366)
    try {
        await page.getByRole('button', { name: 'Catálogo', exact: true }).click()
        await page.getByRole('button', { name: 'Editar', exact: true }).first().click()
        let envios = 0; page.on('request', r => { if (r.url().endsWith('/admin/imagens')) envios++ })
        await page.setInputFiles('#produtoImagemArquivos', { name: 'tenis.png', mimeType: 'image/png', buffer: foto })
        await page.setInputFiles('#produtoImagensArquivos', [
            { name: 'lateral.png', mimeType: 'image/png', buffer: foto },
            { name: 'sola.png', mimeType: 'image/png', buffer: foto }
        ])
        assert.equal(envios, 0)
        assert.equal(await page.locator('.admin-image-card img[src^="blob:"]').count(), 3)
        await page.getByRole('button', { name: 'Remover sola.png', exact: true }).click()
        await page.screenshot({ path: path.join(root, 'test-results/admin-upload-previa.png'), fullPage: true })
        const salvar = page.waitForResponse(r => r.url().includes('/admin/produtos/') && r.request().method() === 'PATCH')
        await page.getByRole('button', { name: 'Salvar produto', exact: true }).click()
        assert.equal((await salvar).status(), 200)
        await page.waitForFunction(() => document.querySelector('#produtoId').value === '')
        assert.equal(envios, 2)
        await a.produto.reload()
        assert.match(a.produto.imagem_url, /^\/api\/midias\//)
        const midias = await a.models.Midia.findAll({ where: { idProduto: a.produto.codProduto, tipo: 'IMAGEM' } })
        assert.equal(midias.length, 1)
        await page.reload(); await page.getByRole('button', { name: 'Catálogo', exact: true }).click()
        await page.getByRole('button', { name: 'Editar', exact: true }).first().click()
        assert.equal(await page.locator('#produtoImagem').inputValue(), a.produto.imagem_url)
        await page.waitForFunction(() => [...document.querySelectorAll('.admin-image-card img')].every(img => img.complete && img.naturalWidth > 0))
        await page.goto(base + `pages/produto.html?id=${a.produto.codProduto}`)
        await page.waitForFunction(() => { const img = document.querySelector('#mainImage'); return img?.complete && img.naturalWidth > 0 && img.src.includes('/api/midias/'); })
        assert.deepEqual(erros, [])
    } finally { await context.close() }
})
test('arquivo inválido mantém formulário e permite tentar novamente; foto removida não é apagada do servidor', async () => {
    const { context, page, erros } = await abrir(390)
    try {
        await page.getByRole('button', { name: 'Catálogo', exact: true }).click()
        await page.getByRole('button', { name: 'Editar', exact: true }).first().click()
        const original = a.produto.imagem_url
        await page.setInputFiles('#produtoImagemArquivos', { name: 'falsa.png', mimeType: 'image/png', buffer: Buffer.from('arquivo sem imagem') })
        await page.getByRole('button', { name: 'Salvar produto', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('#adminMessage').textContent.includes('Imagem inválida'))
        assert.equal(await page.locator('#produtoNome').inputValue(), a.produto.nome)
        assert.match(await page.locator('.admin-image-card span').first().innerText(), /falsa.png/)
        await a.produto.reload(); assert.equal(a.produto.imagem_url, original)
        await page.setInputFiles('#produtoImagemArquivos', { name: 'nova.png', mimeType: 'image/png', buffer: foto })
        await page.locator('#produtoImagens + .admin-image-upload').getByRole('button', { name: 'Remover Imagem 1', exact: true }).click()
        const salvar = page.waitForResponse(r => r.url().includes('/admin/produtos/') && r.request().method() === 'PATCH')
        await page.getByRole('button', { name: 'Salvar produto', exact: true }).click()
        assert.equal((await salvar).status(), 200)
        assert.equal(await a.models.Midia.count({ where: { idProduto: a.produto.codProduto, tipo: 'IMAGEM' } }), 0)
        const anterior = await fetch(a.base.replace(/\/api$/, '') + original)
        assert.equal(anterior.status, 200)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        assert.deepEqual(erros, [])
    } finally { await context.close() }
})
