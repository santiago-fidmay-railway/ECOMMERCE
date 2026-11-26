const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
let a, pasta, png, url
before(async () => {
    pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'sgfrun-midias-'))
    process.env.UPLOAD_DIR = pasta
    a = await require('./helpers/app').ambiente()
    png = await sharp({ create: { width: 24, height: 32, channels: 4, background: '#3b82f6' } }).png().toBuffer()
})
after(async () => {
    if (a) await a.fechar()
    if (pasta) await fs.rm(pasta, { recursive: true, force: true })
})
const enviar = (token, buffer = png, type = 'image/png') => fetch(a.base + '/admin/imagens', { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: buffer })

test('somente administrador pode enviar imagens; arquivo é recriado como WebP e servido entre origens', async () => {
    assert.equal((await enviar()).status, 401)
    assert.equal((await enviar(a.tokens.cliente)).status, 403)
    const resposta = await enviar(a.tokens.gestor)
    assert.equal(resposta.status, 201)
    const dados = await resposta.json(); url = dados.url
    assert.match(url, /^\/api\/midias\/[0-9a-f-]{36}\.webp$/)
    const foto = await fetch(a.base.replace(/\/api$/, '') + url)
    assert.equal(foto.status, 200)
    assert.match(foto.headers.get('content-type'), /image\/webp/)
    assert.equal(foto.headers.get('cross-origin-resource-policy'), 'cross-origin')
    const meta = await sharp(Buffer.from(await foto.arrayBuffer())).metadata()
    assert.equal(meta.format, 'webp'); assert.equal(meta.width, 24); assert.equal(meta.height, 32)
    assert.equal(meta.exif, undefined)
    const salvos = await fs.readdir(pasta)
    assert.deepEqual(salvos, [url.split('/').at(-1)])
    // Uma instância nova usa o mesmo diretório persistente.
    const express = require('express'), app = express()
    app.use('/api/midias', require('../routes/midias.routes'))
    const segundo = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    try { assert.equal((await fetch(`http://127.0.0.1:${segundo.address().port}${url}`)).status, 200) }
    finally { await new Promise(resolve => segundo.close(resolve)) }
})
test('rejeita conteúdo falso, SVG, arquivos enormes e nomes arbitrários', async () => {
    assert.equal((await enviar(a.tokens.gestor, Buffer.from('<script>alert(1)</script>'))).status, 400)
    assert.equal((await enviar(a.tokens.gestor, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml')).status, 400)
    assert.equal((await enviar(a.tokens.gestor, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413)
    const gigante = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer()
    assert.equal((await enviar(a.tokens.gestor, gigante)).status, 400)
    assert.equal((await a.request('/midias/.env')).status, 404)
    assert.equal((await a.request('/midias/inexistente.webp')).status, 404)
    const { urlPublica } = require('../utils/api.util')
    assert.throws(() => urlPublica('/api/midias/../../.env'))
    assert.throws(() => urlPublica('/api/midias/arquivo.svg'))
    assert.equal((await fs.readdir(pasta)).length, 1)
})
test('capa e galeria persistem referências portáveis e aparecem na API pública', async () => {
    const salvo = await a.request(`/admin/produtos/${a.produto.codProduto}`, a.tokens.gestor, 'PATCH', { imagem_url: url, midias: [{ tipo: 'IMAGEM', url, titulo: 'Foto enviada' }] })
    assert.equal(salvo.status, 200)
    const publico = await a.request(`/produtos/${a.produto.codProduto}`)
    assert.equal(publico.dados.imagem_url, url)
    assert.equal(publico.dados.midias.find(m => m.tipo === 'IMAGEM').url, url)
})
test('produção exige diretório persistente configurado', async () => {
    const antigo = process.env.NODE_ENV, mount = process.env.RAILWAY_VOLUME_MOUNT_PATH
    delete process.env.UPLOAD_DIR; delete process.env.RAILWAY_VOLUME_MOUNT_PATH; process.env.NODE_ENV = 'production'
    try { assert.throws(() => require('../services/midia.service').diretorioMidias(), e => e.status === 503) }
    finally { process.env.UPLOAD_DIR = pasta; process.env.NODE_ENV = antigo; if (mount !== undefined) process.env.RAILWAY_VOLUME_MOUNT_PATH = mount }
})
test('status inclui cancelados; ranking exclui pendentes/cancelados e respeita o dia de São Paulo', async () => {
    for (const [status, quantidade, dataPedido] of [['CONFIRMADO', 3, '2026-02-01T01:00:00Z'], ['ENTREGUE', 2, '2026-01-31T15:00:00Z'], ['CANCELADO', 20, '2026-01-31T12:00:00Z'], ['PENDENTE', 10, '2026-01-31T12:00:00Z'], ['CONFIRMADO', 7, '2026-02-01T04:00:00Z']]) {
        const pedido = await a.models.Pedido.create({ idUsuario: a.cliente.codUsuario, status, dataPedido, valorTotal: quantidade * 100 })
        await a.models.ItemPedido.create({ idPedido: pedido.codPedido, idProduto: a.produto.codProduto, quantidade, preco_unitario: 100, subtotal: quantidade * 100 })
    }
    for (const rota of ['pedidos-status', 'mais-vendidos']) {
        assert.equal((await a.request('/relatorios/' + rota)).status, 401)
        assert.equal((await a.request('/relatorios/' + rota, a.tokens.cliente)).status, 403)
        assert.equal((await a.request(`/relatorios/${rota}?inicio=2026-99-01`, a.tokens.gestor)).status, 400)
        assert.equal((await a.request(`/relatorios/${rota}?inicio=2026-02-01&fim=2026-01-01`, a.tokens.gestor)).status, 400)
        const vazio = await a.request(`/relatorios/${rota}?inicio=2025-01-01&fim=2025-01-01`, a.tokens.gestor)
        assert.deepEqual(vazio.dados.dados, [])
    }
    const periodo = '?inicio=2026-01-31&fim=2026-01-31'
    const status = await a.request('/relatorios/pedidos-status' + periodo, a.tokens.gestor)
    assert.equal(status.status, 200)
    assert.equal(status.dados.dados.reduce((n, d) => n + Number(d.quantidade), 0), 4)
    const ranking = await a.request('/relatorios/mais-vendidos' + periodo, a.tokens.gestor)
    assert.equal(ranking.status, 200)
    assert.equal(Number(ranking.dados.dados[0].quantidade), 5)
    assert.equal(Number(ranking.dados.dados[0].subtotal), 500)
})
