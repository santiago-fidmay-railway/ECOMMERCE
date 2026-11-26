# Hospedagem: GitHub + Railway + Vercel

Arquitetura publicada:

| Peça | Serviço | Observação |
| --- | --- | --- |
| Banco MySQL 8 | Railway (plugin MySQL) | acesso interno pela API, acesso público pelo Workbench |
| API Express | Railway (serviço a partir de `backend/`) | porta vinda de `PORT`, health em `/api/health` |
| Frontend estático | Vercel (saída `dist/`) | `API_BASE_URL` aponta para a API do Railway |

Pagamento e estorno continuam sendo apenas simulação.

## 1. Código no GitHub

O repositório já está em `origin`. Publique as alterações de hospedagem:

```powershell
git add vercel.json backend/railway.json docs/hospedagem.md
git commit -m "Adiciona configuracao de hospedagem Railway e Vercel"
git push
```

`backend/.env` e `dist/` continuam fora do Git pelo `.gitignore`. Nenhum segredo vai para o repositório.

## 2. Banco MySQL no Railway

1. Em <https://railway.app>, crie um projeto e use **New → Database → Add MySQL**.
2. Abra o serviço MySQL, aba **Variables**. Guarde:
   - `MYSQL_URL` — conexão pela rede interna, usada pela API.
   - `MYSQL_PUBLIC_URL` — conexão externa, usada pelo Workbench e pela carga inicial.

O formato é `mysql://root:SENHA@HOST:PORTA/railway`. O banco chama-se `railway` e já existe; não é preciso criá-lo.

### Conectar o MySQL Workbench

Em **Database → Manage Connections → New**, usando os campos de `MYSQL_PUBLIC_URL`:

| Campo | Valor |
| --- | --- |
| Hostname | o host da URL pública |
| Port | a porta da URL pública (não é 3306) |
| Username | `root` |
| Password | a senha da URL |
| Default Schema | `railway` |

## 3. Carregar as tabelas e o catálogo no banco do Railway

Feito a partir da sua máquina, apontando a conexão para o Railway. Em `backend/.env`, comente os campos `DB_*` e informe:

```dotenv
MYSQL_URL=mysql://root:SENHA@HOST:PORTA/railway
DB_SSL=true
```

Depois, na raiz do projeto:

```powershell
npm.cmd --prefix backend run migrate
npm.cmd run demo
```

O primeiro comando cria as 26 tabelas e cadastra as cinco marcas; o segundo carrega os 18 produtos, reviews e 20 unidades por produto (tamanhos 38 a 44, cor Original). Nenhum dos dois apaga registros existentes.

Confira no Workbench:

```sql
USE railway;
SHOW TABLES;
SELECT COUNT(*) FROM produtos;
```

Ao terminar, **devolva `backend/.env` para a configuração local** (remova `MYSQL_URL` e `DB_SSL`, reative os `DB_*`). Senão o ambiente local continuará escrevendo no banco de produção.

## 4. API no Railway

1. No mesmo projeto, **New → GitHub Repo** e escolha este repositório.
2. Em **Settings → Source**, defina **Root Directory** como `backend`. O `backend/railway.json` cuida do comando de início e do health check.
3. Em **Variables**, configure:

| Variável | Valor |
| --- | --- |
| `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` (referência ao serviço MySQL) |
| `JWT_SECRET` | chave própria de 32+ caracteres, diferente da local |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `ADMIN_EMAIL` | o e-mail que será o administrador principal |
| `CORS_ORIGINS` | a URL da Vercel, depois do passo 5 |
| `FRONTEND_URL` | a mesma URL da Vercel |

Gere a chave com:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Não configure `PORT`: o Railway injeta a porta e o `server.js` a lê de `process.env.PORT`.

4. Em **Settings → Networking**, use **Generate Domain** para obter a URL pública.
5. Confira em `https://SUA-API.up.railway.app/api/health`. A resposta esperada é `{"status":"ok","modo_pagamento":"demonstracao"}`.

`TRUST_PROXY=1` é necessário porque o Railway fica atrás de proxy; sem ele o limite de tentativas de login contaria todos os visitantes como um só.

## 5. Frontend na Vercel

1. Em <https://vercel.com>, **Add New → Project** e importe o repositório.
2. Deixe **Root Directory** na raiz. O `vercel.json` já define `npm run build` e a saída `dist/`.
   O build copia as imagens de produtos de `backend/imagens/` para `dist/imagens/`, mantendo as URLs públicas `/imagens/...` usadas pelo frontend.
3. Em **Environment Variables**, configure:

| Variável | Valor |
| --- | --- |
| `API_BASE_URL` | `https://SUA-API.up.railway.app/api` |

O valor **precisa terminar em `/api`**; o build falha caso contrário. O `tools/build-site.js` reescreve `js/config.js` com essa URL.

4. Faça o deploy e guarde a URL gerada.
5. Volte ao Railway e preencha `CORS_ORIGINS` e `FRONTEND_URL` com essa URL (sem barra final em `CORS_ORIGINS`). O serviço reinicia sozinho.

Sem esse último passo o navegador bloqueia as chamadas por CORS, mesmo com a API funcionando.

## 6. Criar o administrador em produção

Com `ADMIN_EMAIL` já configurado no Railway:

1. Abra a loja na URL da Vercel e **cadastre-se com exatamente esse e-mail**. A conta já nasce com cargo `ADMIN`.
2. O link **Administração** aparece no menu.

Se a conta já existia antes de configurar a variável, saia e entre novamente: a promoção também ocorre no login e na subida da API.

A senha é sempre definida por você no cadastro; o repositório não publica nenhuma senha padrão.

## Imagens enviadas pela administração

A imagem principal e a galeria aceitam arquivos JPG, PNG, WebP e AVIF estáticos, de até 5 MB e 25 megapixels cada. A seleção mostra uma prévia; o upload acontece ao salvar o produto. A galeria aceita até 19 fotos, reservando uma mídia para o review. Os links continuam disponíveis como alternativa. Remover uma foto do formulário remove sua associação ao produto, sem apagar o arquivo físico, pois ele pode estar em outro produto ou no histórico de pedidos.

Somente administradores autenticados podem enviar arquivos. A API decodifica as imagens, remove metadados e gera WebP de até 2000 × 2000 pixels. As referências salvas são `/api/midias/ARQUIVO.webp`; o frontend usa o domínio da API configurada, tanto localmente quanto na Vercel.

**No computador:** as fotos ficam em `backend/uploads/`, fora do Git e da saída `dist/`. O diretório pode ser substituído por `UPLOAD_DIR` no `.env` local. Inicie a API e o frontend com `npm run dev`; se a porta 5500 estiver ocupada, use `$env:FRONTEND_PORT='5501'; npm.cmd run dev` no PowerShell.

**Antes de publicar a versão com uploads:** adicione um volume ao serviço **ECOMMERCE (API)** no Railway, distinto do volume do MySQL, montado em `/data`. Configure `UPLOAD_DIR=/data/uploads` nas variáveis desse serviço e aplique as alterações. O volume estará disponível em tempo de execução; o build não deve escrever nele. Em produção, o envio fica indisponível se nenhum diretório persistente estiver configurado (`UPLOAD_DIR` ou `RAILWAY_VOLUME_MOUNT_PATH`). O restante da loja continua funcionando. Configurar um caminho sem montar o volume não garante persistência.

Veja a [documentação de volumes do Railway](https://docs.railway.com/volumes). Faça backup da pasta de uploads junto com o banco. Fotos enviadas no computador não são transferidas por `git push`; envie-as novamente no ambiente de destino ou copie os arquivos para o volume se também estiver migrando os registros locais. Alterar a pasta de uploads exige copiar as imagens existentes para a nova pasta.

## Gráficos administrativos

A visão geral apresenta valor mensal confirmado, subtotal por categoria, pedidos por status, os dez produtos mais vendidos por unidades e situação do estoque. Os filtros de data usam o dia em São Paulo e a data de criação do pedido. O ranking exclui pedidos pendentes e cancelados; o gráfico por status inclui todos. O estoque mostra o saldo atual dos produtos ativos, independentemente do período. Tabelas e exportação CSV permitem consultar os mesmos dados, inclusive quando não há valores para desenhar o gráfico.

## Manutenção

- Cada `git push` na branch principal redeploya os dois serviços.
- Backups: `npm.cmd --prefix backend run backup` com a conexão apontando para o Railway. O sistema de arquivos do container é descartável; guarde as exportações fora dele.
- As migrações rodam a cada subida da API e não apagam tabelas nem reiniciam o estoque.
