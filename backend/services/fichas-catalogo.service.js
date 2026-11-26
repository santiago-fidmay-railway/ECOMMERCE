const { Produto, Ficha } = require('../models/rel')
const { fichas } = require('../data/fichas-tecnicas')

async function preencherFichasCatalogo(transaction) {
    let preenchidas = 0
    for (const referencia of fichas) {
        const produto = await Produto.findOne({ where: { codigo_produto: referencia.codigo }, transaction })
        if (!produto || ![referencia.nome, ...referencia.nomesAlternativos].some(nome => nome.toLowerCase() === produto.nome.trim().toLowerCase())) continue
        const ficha = await Ficha.findByPk(produto.codProduto, { transaction, lock: transaction.LOCK.UPDATE })
        // Fichas já preenchidas por uma pessoa não são substituídas pelo catálogo.
        if (ficha && Object.keys(ficha.dados || {}).some(chave => chave !== 'fonte' && (Array.isArray(ficha.dados[chave]) ? ficha.dados[chave].length > 0 : ficha.dados[chave] != null && ficha.dados[chave] !== ''))) continue
        await Ficha.upsert({ idProduto: produto.codProduto, dados: referencia.dados, atualizado_em: new Date() }, { transaction })
        preenchidas++
    }
    return preenchidas
}
module.exports = { preencherFichasCatalogo }
