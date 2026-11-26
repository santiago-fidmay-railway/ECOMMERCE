const router = require('express').Router();
const ctrl = require('../controllers/relatorios.controller');
const { autenticar, apenasAdmin } = require('../middlewares/auth.middleware');

router.get('/dashboard', autenticar, apenasAdmin, ctrl.dashboard);
router.get('/vendas', autenticar, apenasAdmin, ctrl.vendasPorCategoria);
router.get('/faturamento', autenticar, apenasAdmin, ctrl.faturamentoMensal);
router.get('/estoque', autenticar, apenasAdmin, ctrl.situacaoEstoque);
router.get('/pedidos-status', autenticar, apenasAdmin, ctrl.pedidosPorStatus);
router.get('/mais-vendidos', autenticar, apenasAdmin, ctrl.produtosMaisVendidos);

module.exports = router;
