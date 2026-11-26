const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { fichas } = require('../data/fichas-tecnicas')
let a
before(async () => { a = await require('./helpers/app').ambiente(); await require('../scripts/seed-demo').seedDemo() })
after(async () => { if (a) await a.fechar() })

test('18 modelos têm ficha validada, fonte oficial e dados públicos completos', async () => {
    assert.equal(fichas.length, 18)
    assert.equal(new Set(fichas.map(f => f.codigo)).size, 18)
    const { validarFicha } = require('../services/produto.service')
    for (const ficha of fichas) {
        const validada = validarFicha(ficha.dados)
        assert.equal(validada.peso_g, ficha.dados.peso_g)
        assert.ok(validada.peso_referencia)
        assert.equal(typeof validada.placa, 'boolean')
        assert.ok(validada.placa_descricao && validada.amortecimento && validada.superficie && validada.finalidades.length)
        const produto = await a.models.Produto.findOne({ where: { codigo_produto: ficha.codigo } })
        const publico = await a.request(`/produtos/${produto.codProduto}`)
        assert.equal(publico.status, 200)
        assert.equal(publico.dados.fichaTecnica.dados.peso_g, ficha.dados.peso_g)
        assert.equal(publico.dados.fichaTecnica.dados.fonte, ficha.dados.fonte)
    }
})
test('migração preenche cadastros legados, preserva edição manual e mantém estoque', async () => {
    const supra = await a.models.Produto.findOne({ where: { codigo_produto: 'OLYMPIKUS-SUPRA' } })
    const turbo = await a.models.Produto.findOne({ where: { codigo_produto: 'OLYMPIKUS-TURBO' } })
    await supra.update({ nome: 'Olympikus Supra' }); await turbo.update({ nome: 'Olympikus Turbo' })
    await a.models.Ficha.update({ dados: {} }, { where: { idProduto: supra.codProduto } })
    await a.models.Ficha.destroy({ where: { idProduto: turbo.codProduto } })
    const primeiro = await a.models.Produto.findOne({ where: { codigo_produto: 'BOSTON-13' } })
    const personalizado = { peso_g: 260, peso_referencia: 'Minha referência', fonte: fichas[0].dados.fonte }
    await a.models.Ficha.update({ dados: personalizado }, { where: { idProduto: primeiro.codProduto } })
    const saldoAntes = Number(await a.models.Variante.sum('quantidade'))
    await a.models.Migracao.destroy({ where: { nome: '20261125-fichas-oficiais-catalogo' } })
    await require('../migrations').migrar()
    assert.equal((await a.models.Ficha.findByPk(supra.codProduto)).dados.peso_g, 217)
    assert.equal((await a.models.Ficha.findByPk(turbo.codProduto)).dados.peso_g, 234)
    assert.deepEqual((await a.models.Ficha.findByPk(primeiro.codProduto)).dados, personalizado)
    await require('../migrations').migrar()
    assert.equal(Number(await a.models.Variante.sum('quantidade')), saldoAntes)
    assert.equal((await a.models.Ficha.findByPk(a.produto.codProduto)), null)
})
test('admin salva referências e estruturas sem perder fontes; bloqueia fonte maliciosa', async () => {
    const dados = fichas.find(f => f.codigo === 'ASICS-SUPERBLAST').dados
    const salvo = await a.request(`/admin/produtos/${a.produto.codProduto}`, a.tokens.gestor, 'PATCH', { ficha: dados })
    assert.equal(salvo.status, 200)
    assert.deepEqual((await a.models.Ficha.findByPk(a.produto.codProduto)).dados, dados)
    for (const fontes of [['javascript:alert(1)'], ['https://asics.com.evil.test/'], 'https://asics.com/']) {
        const res = await a.request(`/admin/produtos/${a.produto.codProduto}`, a.tokens.gestor, 'PATCH', { ficha: { ...dados, fontes } })
        assert.equal(res.status, 400)
    }
})
test('QR code é decodificável e aponta para a instalação no domínio público', async () => {
    const sharp = require('sharp'), jsQR = require('jsqr')
    const qr = path.resolve(__dirname, '../../frontend/assets/images/instalar-app-qr.png')
    const { data, info } = await sharp(qr).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const resultado = jsQR(new Uint8ClampedArray(data), info.width, info.height)
    assert.ok(resultado, 'O QR code deve ser legível')
    assert.equal(resultado.data, 'https://ecommerce-frontend-rosy-phi.vercel.app/pages/app')
    for (const pagina of ['index.html', 'pages/app.html']) {
        const html = await fs.readFile(path.resolve(__dirname, '../../frontend', pagina), 'utf8')
        assert.match(html, /instalar-app-qr\.png/)
    }
})
