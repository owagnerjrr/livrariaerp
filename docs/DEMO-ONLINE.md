# Demonstração online — Livraria ERP

Esta cópia parte do Caramelo ERP no commit `910476cc3e78ed6d701ad5521f468b3e18e7655a`. O repositório original e seu PostgreSQL permanecem independentes. Repositório da demo: https://github.com/owagnerjrr/livrariaerp.

## Arquitetura

Frontend React/Vite estático na Vercel; API Node 24/Fastify persistente no Render; Prisma e PostgreSQL dedicado no Render. Nenhum módulo de negócio foi substituído. Não existe banco no frontend nem API persistente na Vercel.

O frontend continua usando `/api`. `build:demo:web` gera o formato oficial Build Output API da Vercel com proxy para `DEMO_API_ORIGIN`, antes do fallback da SPA. A URL é configurada no painel, sem modificar arquivos após conhecer o endereço real. O proxy preserva uma única origem no navegador: não se abrem CORS para outras origens nem se muda a sessão para cookies de terceiros. A API exige `WEB_ORIGIN` exata nas mutações. Cookies continuam HttpOnly, Secure em produção, SameSite=Lax. Não use a URL de um preview diferente sem atualizar a origem autorizada.

Fontes: [Vercel rewrites](https://vercel.com/docs/routing/rewrites), [Build Output API](https://vercel.com/docs/build-output-api/configuration), [Render Blueprint](https://render.com/docs/blueprint-spec).

## 1. Backend e PostgreSQL no Render

Consulte [configuração revisada do Render](RENDER-API.md). Usar Docker na raiz e o PostgreSQL **caramelo-erp-demo**, já criado em **Virginia (US East)**, banco **caramelo_erp**. O Blueprint não cria outro banco. Não fazer deploy antes da revisão dos campos e variáveis. Migrations e seed são executados pelo entrypoint somente no ambiente remoto autorizado.

## 2. Frontend na Vercel

Importe `owagnerjrr/livrariaerp` como projeto novo. Root Directory: **raiz do repositório**. Framework Preset: **Other**. Node: **24.x**. A configuração `vercel.json` define instalação/build; não substitua o Output Directory por `apps/web/dist`, pois o resultado completo está em `.vercel/output` e inclui o proxy.

Cadastre somente:

| Variável          | Valor                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| `DEMO_API_ORIGIN` | Origem HTTPS real da API Render, sem `/api`, sem credenciais e sem barra de caminho |

Não cadastre DATABASE_URL, senha do seed, tokens ou variáveis de banco no frontend. O build recusa endpoint ausente, localhost, HTTP, URLs com credenciais e placeholders `.invalid`.

```bash
npm run build:demo:web
```

Defina a URL definitiva da Vercel em WEB_ORIGIN do Render e reinicie/deploye a API. Previews com outra origem não são autorizados automaticamente. Não desative a proteção de deploy indiscriminadamente: para teste remoto, dê acesso ao convidado pelo mecanismo da Vercel ou use o deployment de produção do projeto **demo**.

## Dados e acesso

- Empresa: `demo`.
- E-mail: `demo@caramelo.example`.
- Senha: valor de `DEMO_ADMIN_PASSWORD` cadastrado no Render; nenhuma senha padrão é publicada.
- Uma empresa fictícia, duas filiais, um administrador, perfis com permissões atuais, dois fornecedores, um cliente sem CPF real, seis livros inventados e códigos EAN internos, dois depósitos comuns e dois caixas.
- Cada depósito recebe 20 unidades por livro por `moveStock` com documento/histórico. Duas vendas são criadas por `writeSale`: PIX manual e crédito em duas parcelas, com estoque, caixa, recebíveis e auditoria consistentes. Saldo inicial de caixa de R$100 por filial. Uma despesa fictícia de R$150 aparece em Contas a Pagar. Nenhum pagamento externo real é efetuado.
- Livros podem ser localizados pelo código `DEMO-001` a `DEMO-006` ou pelo EAN exibido no catálogo. Leitura física funciona como código + Enter.
- Dashboard, Catálogo, Estoque, PDV, Caixa, Compras, Contas a Pagar, Contas a Receber, Financeiro, Transferências, Inventário e Feiras/Eventos mantêm a navegação existente. Cadastros de compras/eventos/transferências/inventários começam vazios para a pessoa realizar os fluxos reais.

## Validação de publicação

Antes do push: `npm run db:generate`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check`, `npm exec -w @caramelo/database -- prisma validate`, `git diff --check` e Playwright desktop/mobile. Testes de integração usam somente PostgreSQL de teste separado. Não usar o banco remoto compartilhado da demonstração para fixtures destrutivas.

Após o deploy: verificar GET `https://API-REAL/api/health` e GET `https://FRONTEND-REAL/api/health`, login de demo, dashboard, todos os módulos e cookies de sessão; conferir requests/console e migrations no banco remoto. Uma página estática publicada sozinha não é uma demo funcional.

## Limitações e operação

- Demo compartilhada e editável; o administrador tem permissões amplas dentro da empresa fictícia. Dados de teste ficam visíveis ao outro convidado. Não inserir documentos pessoais, certificados ou dados reais.
- Sem fiscal, TEF, PIX bancário, boleto bancário, integrações ou conciliação externa.
- Não há reset público, limpeza automática, backups gerenciados pela aplicação, isolamento por convidado ou garantia de SLA.
- O plano gratuito da API pode suspender por inatividade; o PostgreSQL gratuito Render expira após 30 dias. Verifique as condições atuais e escolha plano persistente se a demonstração precisar durar mais. [Limites do Render](https://render.com/docs/free).
- Sem credenciais/acesso de criação no Render, URLs de API/frontend e validação remota ficam pendentes; não inventar endereços nem afirmar que o banco remoto respondeu.
- O original fica intacto; esta pasta tem `origin` apontando ao Caramelo e `demo` ao Livraria. Publicação: `git push demo main`, sem force. Atualizações futuras do original devem ser integradas e testadas nesta cópia, nunca feitas por reset que descarte a preparação da demo.
