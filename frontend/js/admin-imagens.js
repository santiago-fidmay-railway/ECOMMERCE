/* A seleção fica no navegador; os arquivos são enviados ao salvar o produto. */
window.ImagensAdmin = (() => {
  const grupos = [];
  const MAX_BYTES = 5 * 1024 * 1024;
  function urls(grupo) { return grupo.campo.value.split('\n').map(url => url.trim()).filter(Boolean); }
  function liberar(item) { URL.revokeObjectURL(item.previa); }
  function desenhar(grupo) {
    grupo.previa.replaceChildren();
    const adicionar = (src, nome, remover, pendente) => {
      const card = Loja.el('article', 'admin-image-card');
      const img = Loja.el('img'); img.src = src; img.alt = nome;
      img.onerror = () => { img.onerror = null; img.src = Auth.url('assets/images/placeholder.svg'); };
      const btn = Loja.el('button', 'btn btn-outline btn-sm', 'Remover'); btn.type = 'button'; btn.setAttribute('aria-label', `Remover ${nome}`); btn.onclick = remover;
      card.append(img, Loja.el('span', 'admin-small', pendente ? `${nome} · será enviada ao salvar` : nome), btn);
      grupo.previa.append(card);
    };
    urls(grupo).forEach((url, indice) => adicionar(Auth.imagem(url), `Imagem ${indice + 1}`, () => {
      grupo.campo.value = urls(grupo).filter((_, i) => i !== indice).join('\n'); desenhar(grupo);
    }));
    grupo.arquivos.forEach(item => adicionar(item.previa, item.arquivo.name, () => {
      grupo.arquivos = grupo.arquivos.filter(outro => outro !== item); liberar(item); desenhar(grupo);
    }, true));
  }
  function conectar(id, limite) {
    const campo = document.getElementById(id);
    const area = Loja.el('div', 'admin-image-upload');
    const label = Loja.el('label', 'form-label', limite === 1 ? 'Escolher imagem do computador' : 'Escolher fotos do computador');
    const input = Loja.el('input', 'form-control'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/avif'; input.multiple = limite > 1; input.id = id + 'Arquivos'; label.htmlFor = input.id;
    const mensagem = Loja.el('p', 'admin-small'); mensagem.setAttribute('role', 'status');
    const previa = Loja.el('div', 'admin-image-previews'); previa.setAttribute('aria-label', 'Prévia das imagens');
    area.append(label, input, Loja.el('p', 'admin-small', `JPG, PNG, WebP ou AVIF. Até 5 MB por foto.${limite > 1 ? ' Até 19 fotos na galeria.' : ''} Envio ao salvar o produto.`), mensagem, previa);
    campo.after(area);
    const grupo = { campo, input, mensagem, previa, arquivos: [], limite }; grupos.push(grupo);
    campo.addEventListener('input', () => desenhar(grupo));
    input.onchange = () => {
      const arquivos = [...input.files]; input.value = ''; mensagem.textContent = '';
      if (!arquivos.length) return;
      if (arquivos.some(a => !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(a.type) || a.size > MAX_BYTES || !a.size)) {
        mensagem.textContent = 'Escolha imagens JPG, PNG, WebP ou AVIF com até 5 MB cada.'; return;
      }
      if (limite > 1 && arquivos.length + grupo.arquivos.length + urls(grupo).length > limite) { mensagem.textContent = `A galeria pode ter até ${limite} fotos. Remova uma foto antes de adicionar outra.`; return; }
      if (limite === 1) { grupo.arquivos.forEach(liberar); grupo.arquivos = []; campo.value = ''; }
      grupo.arquivos.push(...arquivos.map(arquivo => ({ arquivo, previa: URL.createObjectURL(arquivo) })));
      desenhar(grupo);
    };
    desenhar(grupo);
  }
  return {
    iniciar() { conectar('produtoImagem', 1); conectar('produtoImagens', 19); },
    atualizar() { grupos.forEach(desenhar); },
    limpar() { grupos.forEach(grupo => { grupo.arquivos.forEach(liberar); grupo.arquivos = []; grupo.input.value = ''; grupo.mensagem.textContent = ''; desenhar(grupo); }); },
    async salvar() {
      for (const grupo of grupos) {
        while (grupo.arquivos.length) {
          const item = grupo.arquivos[0]; grupo.mensagem.textContent = `Enviando ${item.arquivo.name}…`;
          try {
            const resultado = await Api.enviarImagem(item.arquivo);
            grupo.campo.value = grupo.limite === 1 ? resultado.url : [...urls(grupo), resultado.url].join('\n');
            grupo.arquivos.shift(); liberar(item); desenhar(grupo);
            grupo.mensagem.textContent = 'Imagem enviada. Salvando o cadastro…';
          } catch (erro) { grupo.mensagem.textContent = `Não foi possível enviar ${item.arquivo.name}. A seleção foi mantida para tentar novamente.`; throw erro; }
        }
      }
    }
  };
})();
