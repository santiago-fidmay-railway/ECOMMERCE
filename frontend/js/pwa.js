(() => {
  const base = new URL('../', document.currentScript.src);
  let convite, registro, atualizarSolicitado = false;
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function atualizarTela() {
    const botao = document.getElementById('instalarApp');
    if (botao) { botao.hidden = !convite || instalado(); botao.disabled = !convite; }
    const status = document.getElementById('appStatus');
    if (status) status.textContent = instalado() ? 'Você está usando a SGF RUN como aplicativo.' : convite ? 'Seu navegador está pronto para instalar a SGF RUN.' : 'Veja abaixo como adicionar a SGF RUN à tela inicial.';
    if (status && !window.isSecureContext) status.textContent = 'Para instalar, abra o endereço HTTPS da loja. Neste endereço, você pode continuar usando o site normalmente.';
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); convite = event; atualizarTela(); });
  window.addEventListener('appinstalled', () => { convite = null; atualizarTela(); });
  function mostrarAtualizacao() {
    if (document.getElementById('pwaAtualizacao')) return;
    const area = document.createElement('aside'); area.id = 'pwaAtualizacao'; area.className = 'pwa-update'; area.setAttribute('aria-label', 'Atualização do aplicativo');
    const texto = document.createElement('p'); texto.setAttribute('role', 'status'); texto.textContent = 'Uma nova versão da SGF RUN está disponível. Conclua sua compra ou salve as alterações antes de atualizar.';
    const acoes = document.createElement('div');
    const agora = document.createElement('button'); agora.type = 'button'; agora.className = 'btn btn-primary btn-sm'; agora.textContent = 'Atualizar agora';
    const depois = document.createElement('button'); depois.type = 'button'; depois.className = 'btn btn-outline btn-sm'; depois.textContent = 'Depois'; depois.onclick = () => area.remove();
    agora.onclick = () => {
      if (document.querySelector('form') && !window.confirm('A página será recarregada. Conclua sua compra ou salve as alterações antes de continuar. Atualizar agora?')) return;
      agora.disabled = true;
      if (registro?.waiting) { atualizarSolicitado = true; registro.waiting.postMessage({ type: 'APLICAR_ATUALIZACAO' }); }
      else location.reload();
    };
    acoes.append(agora, depois); area.append(texto, acoes); document.body.append(area);
  }
  document.addEventListener('DOMContentLoaded', async () => {
    atualizarTela();
    const botao = document.getElementById('instalarApp');
    if (botao) botao.onclick = async () => {
      if (!convite) return;
      const evento = convite; convite = null; atualizarTela();
      try { await evento.prompt(); await evento.userChoice; }
      catch { /* O navegador mantém a opção de instalação no próprio menu. */ }
      atualizarTela();
    };
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    // O Live Server pode servir /frontend; o escopo segue o diretório real do script.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (atualizarSolicitado) { atualizarSolicitado = false; location.reload(); }
      else if (registro?.active) mostrarAtualizacaoSilenciosa();
    });
    function mostrarAtualizacaoSilenciosa() {
      // A primeira ativação não recarrega nem interrompe a página.
      const existente = document.getElementById('pwaAtualizacao');
      if (existente) existente.querySelector('p').textContent = 'A atualização está pronta. Recarregue quando concluir sua compra ou salvar as alterações.';
    }
    try {
      registro = await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname, updateViaCache: 'none' });
      if (registro.waiting && navigator.serviceWorker.controller) mostrarAtualizacao();
      registro.addEventListener('updatefound', () => {
        const novo = registro.installing;
        novo?.addEventListener('statechange', () => { if (novo.state === 'installed' && navigator.serviceWorker.controller) mostrarAtualizacao(); });
      });
      // Verifica novas versões ao retornar para o app, sem recarregar a tela.
      let ultimaConsulta = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - ultimaConsulta > 60000) { ultimaConsulta = Date.now(); registro.update().catch(() => {}); }
      });
    } catch { /* Uma falha na instalação não impede a navegação normal da loja. */ }
  });
})();
