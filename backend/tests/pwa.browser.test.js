const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const { chromium } = require('playwright')
let browser, server, base, versao = 1, saldo = 5, compras = 0
const root = path.resolve(__dirname, '../..')
before(async () => {
    const express = require('express'), app = express()
    const worker = await fs.readFile(path.join(root, 'frontend/sw.js'), 'utf8')
    app.get('/sw.js', (req, res) => res.type('application/javascript').set('Cache-Control', 'no-store').send(worker.replace('__SGFRUN_BUILD__', `teste-${versao}`)))
    app.get('/api/estoque', (req, res) => res.json({ saldo, segredo: 'dado privado' }))
    app.post('/api/pedidos', (req, res) => { compras++; res.json({ id: compras }) })
    app.get('/privado', (req, res) => res.type('html').send('<!doctype html><html><head><meta charset="UTF-8"><script src="/js/pwa.js" defer></script><link rel="stylesheet" href="/css/global.css"></head><body><h1>Conta particular</h1><form><input id="rascunho" value="pedido em andamento"></form></body></html>'))
    app.use(express.static(path.join(root, 'frontend')))
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${server.address().port}/`
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    browser = await chromium.launch({ headless: true, ...(require('node:fs').existsSync(chrome) ? { executablePath: chrome } : {}) })
})
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)) })
async function abrir(width = 1366, url = 'pages/app.html') {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    await page.goto(base + url)
    await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })) })
    return { context, page }
}
test('manifesto válido, ícones reais e instruções/instalação em desktop e celular', async () => {
    for (const width of [1366, 390]) {
        const { context, page } = await abrir(width)
        try {
            const cdp = await context.newCDPSession(page)
            const resultado = await cdp.send('Page.getAppManifest')
            assert.deepEqual(resultado.errors, [])
            const manifesto = JSON.parse(resultado.data)
            assert.equal(manifesto.name, 'SGF RUN'); assert.equal(manifesto.display, 'standalone')
            const sharp = require('sharp')
            for (const icone of manifesto.icons) {
                const meta = await sharp(path.join(root, 'frontend', icone.src)).metadata()
                assert.equal(`${meta.width}x${meta.height}`, icone.sizes)
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
            // Simula a disponibilização do prompt; a instalação nativa depende do navegador real.
            await page.evaluate(() => {
                const evento = new Event('beforeinstallprompt', { cancelable: true })
                evento.prompt = async () => { window.promptInstalarChamado = true }
                evento.userChoice = Promise.resolve({ outcome: 'accepted' })
                window.dispatchEvent(evento)
            })
            assert.equal(await page.locator('#instalarApp').isVisible(), true)
            await page.click('#instalarApp')
            assert.equal(await page.evaluate(() => window.promptInstalarChamado), true)
            assert.equal(await page.locator('#instalarApp').isVisible(), false)
            await fs.mkdir(path.join(root, 'test-results'), { recursive: true })
            await page.screenshot({ path: path.join(root, `test-results/app-instalar-${width}.png`), fullPage: true })
        } finally { await context.close() }
    }
})
test('Chrome reconhece os requisitos reais de instalação fora do modo anônimo', async () => {
    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'sgfrun-pwa-chrome-'))
    let context
    try {
        const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        context = await chromium.launchPersistentContext(pasta, { headless: true, ...(require('node:fs').existsSync(chrome) ? { executablePath: chrome } : {}) })
        const page = await context.newPage()
        await page.goto(base + 'pages/app.html')
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
        const client = await context.newCDPSession(page)
        const resultado = await client.send('Page.getInstallabilityErrors')
        assert.deepEqual(resultado.installabilityErrors, [])
    } finally { if (context) await context.close(); await fs.rm(pasta, { recursive: true, force: true }) }
})
test('offline mostra reconexão; não guarda conta, API, pedidos, preços ou estoque', async () => {
    const { context, page } = await abrir(390, 'privado')
    try {
        const consultar = () => page.evaluate(async () => (await fetch('/api/estoque')).json())
        assert.equal((await consultar()).saldo, 5); saldo = 2; assert.equal((await consultar()).saldo, 2)
        await page.evaluate(() => fetch('/api/pedidos', { method: 'POST' })); assert.equal(compras, 1)
        const cache = await page.evaluate(async () => {
            const urls = []
            for (const nome of await caches.keys()) for (const request of await (await caches.open(nome)).keys()) urls.push(new URL(request.url).pathname)
            return urls.sort()
        })
        assert.deepEqual(cache, ['/assets/icons/icon-192.png', '/assets/icons/icon-512.png', '/offline.html'])
        await context.setOffline(true)
        assert.equal(await page.evaluate(() => fetch('/api/estoque').then(() => 'resposta', () => 'sem rede')), 'sem rede')
        await page.goto(base + 'pages/admin.html')
        assert.match(await page.locator('h1').innerText(), /conexão voltar/)
        assert.equal(await page.locator('#voltarLoja').getAttribute('href'), base)
        await context.setOffline(false)
        await page.locator('#voltarLoja').click()
        await page.waitForURL(base)
        assert.equal(compras, 1)
    } finally { await context.close() }
})
test('nova versão aguarda consentimento e não interrompe formulário nem apaga o carrinho', async () => {
    const { context, page } = await abrir(1366, 'privado')
    try {
        await page.fill('#rascunho', 'alteração ainda não salva')
        await page.evaluate(() => localStorage.setItem('sk_cart', '[{"id":1,"quantidade":2}]'))
        let navegacoes = 0; page.on('framenavigated', frame => { if (frame === page.mainFrame()) navegacoes++ })
        versao++
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
        await page.locator('#pwaAtualizacao').waitFor()
        assert.equal(await page.locator('#rascunho').inputValue(), 'alteração ainda não salva')
        assert.equal(navegacoes, 0)
        await page.getByRole('button', { name: 'Depois', exact: true }).click()
        assert.equal(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), true)
        await page.reload(); await page.locator('#pwaAtualizacao').waitFor()
        page.once('dialog', dialog => dialog.dismiss())
        await page.getByRole('button', { name: 'Atualizar agora', exact: true }).click()
        assert.equal(await page.locator('#pwaAtualizacao').isVisible(), true)
        page.once('dialog', dialog => dialog.accept())
        await Promise.all([page.waitForEvent('domcontentloaded'), page.getByRole('button', { name: 'Atualizar agora', exact: true }).click()])
        assert.equal(await page.evaluate(() => localStorage.getItem('sk_cart')), '[{"id":1,"quantidade":2}]')
        assert.equal(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), false)
        const cachesAtivos = await page.evaluate(() => caches.keys())
        assert.deepEqual(cachesAtivos, [`sgfrun-offline-teste-${versao}`])
    } finally { await context.close() }
})
