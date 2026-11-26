// Pedidos fictícios exclusivamente para visualizar os gráficos no banco local.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true })
const db = require('../db/conn')
const { Pedido, Variante, Estoque } = require('../models/rel')

async function preparar() {
    if (process.env.NODE_ENV === 'production' || process.env.MYSQL_URL || process.env.DATABASE_URL ||
        !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) || process.env.DB_NAME !== 'ecom_teste') {
        throw new Error('Esta simulação só pode ser executada no MySQL local ecom_teste.')
    }
    const base = `http://127.0.0.1:${Number(process.env.PORT) || 3001}/api`
    let token
    async function api(rota, method = 'GET', dados) {
        const resposta = await fetch(base + rota, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(dados ? { body: JSON.stringify(dados) } : {}) })
        const retorno = await resposta.json()
        if (!resposta.ok) throw new Error(`${rota}: ${retorno.erro || resposta.status}`)
        return retorno
    }
    if (!process.env.LOCAL_PREVIEW_PASSWORD) throw new Error('Configure a conta local de prévia primeiro.')
    const login = await api('/login', 'POST', { email: process.env.ADMIN_EMAIL, senha: process.env.LOCAL_PREVIEW_PASSWORD })
    if (login.usuario.tipo !== 'ADMIN') throw new Error('A conta local precisa de acesso administrativo.')
    token = login.token
    const catalogo = await api('/admin/produtos')
    const produtos = catalogo.produtos.filter(p => p.ativo).sort((a, b) => a.codProduto - b.codProduto)
    if (produtos.length < 10) throw new Error('Carregue o catálogo local de demonstração primeiro.')
    const exemplos = [
        ['2026-09-08', 'ENTREGUE', 0, 1], ['2026-09-15', 'ENTREGUE', 1, 2], ['2026-09-22', 'ENTREGUE', 2, 1],
        ['2026-10-05', 'ENTREGUE', 3, 2], ['2026-10-12', 'ENTREGUE', 4, 1], ['2026-10-20', 'ENTREGUE', 0, 2],
        ['2026-11-03', 'ENVIADO', 5, 2], ['2026-11-08', 'EM_SEPARACAO', 6, 2], ['2026-11-15', 'CONFIRMADO', 7, 3],
        ['2026-11-20', 'CONFIRMADO', 8, 2], ['2026-11-25', 'PENDENTE', 9, 1], ['2026-11-25', 'CANCELADO', 1, 1]
    ]
    let criados = 0
    for (const [indice, [dia, destino, indiceProduto, quantidade]] of exemplos.entries()) {
        const observacoes = `[PREVIA-GRAFICOS-LOCAL-20261125] Exemplo ${indice + 1}. Pedido fictício para visualizar gráficos.`
        let pedido = await Pedido.findOne({ where: { observacoes } })
        if (!pedido) {
            const produto = produtos[indiceProduto]
            const detalhe = await api(`/admin/produtos/${produto.codProduto}`)
            const variante = detalhe.variantes.find(v => v.ativo && v.quantidade >= quantidade)
            if (!variante) throw new Error(`Sem saldo para simular ${produto.nome}.`)
            const retorno = await api('/pedidos', 'POST', { itens: [{ idProduto: produto.codProduto, idVariante: variante.codVariante, quantidade }], forma_pagamento: ['PIX', 'BOLETO', 'CARTAO_CREDITO'][indice % 3], chaveCheckout: `PREVIA-GRAFICOS-20261125-${indice + 1}`, observacoes })
            pedido = await Pedido.findByPk(retorno.pedido.id)
            criados++
        }
        const sequencia = ['PENDENTE', 'CONFIRMADO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE']
        if (destino === 'CANCELADO' && pedido.status !== destino) {
            await api(`/pedidos/${pedido.codPedido}/status`, 'PATCH', { status: destino })
        } else if (destino !== 'CANCELADO') {
            for (const status of sequencia.slice(sequencia.indexOf(pedido.status) + 1, sequencia.indexOf(destino) + 1)) {
                await api(`/pedidos/${pedido.codPedido}/status`, 'PATCH', { status })
            }
        }
        // Datas históricas apenas no banco de testes, para demonstrar a evolução mensal.
        await pedido.update({ dataPedido: new Date(`${dia}T12:00:00-03:00`) })
    }
    // Confere se o fluxo normal de compra/cancelamento manteve os saldos consistentes.
    for (const produto of produtos) {
        const total = Number(await Variante.sum('quantidade', { where: { idProduto: produto.codProduto, ativo: true } }))
        const estoque = await Estoque.findOne({ where: { idProduto: produto.codProduto } })
        if (estoque && estoque.quantidade !== total) throw new Error(`Saldo divergente no produto ${produto.codProduto}.`)
    }
    for (const rota of ['dashboard', 'pedidos-status', 'mais-vendidos', 'faturamento']) {
        console.log(rota + ': ' + JSON.stringify(await api('/relatorios/' + rota)))
    }
    console.log(`${criados} pedido(s) fictício(s) criado(s) no banco local. Nenhuma cobrança ou alteração em produção.`)
}
preparar().catch(erro => { console.error(erro.message); process.exitCode = 1 }).finally(() => db.close())
