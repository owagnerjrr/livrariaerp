# API demo no Render — configuração revisada

Trabalhar somente em livrariaerp. Docker mantém Node 24 e o build do monorepo; Prisma CLI permanece como dependência de runtime para migrations. Nenhum segredo é usado no build. O banco existente não é declarado no Blueprint, para evitar provisionar outro banco.

## Tela do Render

- Language: Docker
- Root Directory: vazio (raiz do repositório)
- Dockerfile Path: ./Dockerfile
- Region: Virginia (US East), igual ao PostgreSQL
- Instance Type: Free para demonstração (suspende por inatividade); Starter é alternativa paga
- Health Check Path: /api/health
- Pre-Deploy Command: vazio no Free. O entrypoint executa npm run db:migrate antes de abrir a API.
- Docker Command: vazio, usar CMD da imagem.
- Auto Deploy: desativado até revisar a configuração.

| Variável            | Valor/origem                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL        | Internal Database URL do PostgreSQL caramelo-erp-demo, copiada diretamente no painel Render. Nunca no Git/chat. |
| NODE_ENV            | production                                                                                                      |
| APP_ENV             | demo                                                                                                            |
| HOST                | 0.0.0.0                                                                                                         |
| WEB_ORIGIN          | Origem HTTPS definitiva do frontend Vercel, sem barra final/caminho. Não usar a URL da API.                     |
| DEMO_DATABASE_NAME  | caramelo_erp                                                                                                    |
| DEMO_SEED_CONFIRM   | caramelo_erp                                                                                                    |
| DEMO_ADMIN_PASSWORD | Criar senha exclusiva de demo com pelo menos 12 caracteres no painel. Não reutilizar senha local.               |
| DEMO_SEED_ON_START  | true somente para inicializar a demo no primeiro deploy; depois false                                           |
| SESSION_HOURS       | 4                                                                                                               |

PORT é fornecida automaticamente pelo Render; não cadastrar 3333. O backend lê process.env.PORT e escuta em 0.0.0.0. Em produção não carrega .env. A API recusa PostgreSQL localhost.

## Migrations e seed

npm run db:migrate executa somente prisma migrate deploy, preservando dados. As 12 migrations existentes são mantidas; nenhuma migration nova é necessária neste bloco. Não executar reset/db push. Não executamos qualquer comando contra o banco Render nesta preparação.

npm run db:seed:demo executa o seed separado e transacional. O banco caramelo_erp é aceito apenas mediante declaração e confirmação explícitas; exige APP_ENV=demo, servidor remoto, senha própria e banco vazio ou já marcado por este seed. Recusa outras empresas/usuários. Retry não duplica dados, repõe estoque ou muda a senha. DEMO_SEED_ON_START=true permite inicialização no Free sem depender de shell; qualquer falha impede abrir a API, em vez de ocultá-la.

Login: empresa demo; e-mail demo@caramelo.example; senha cadastrada em DEMO_ADMIN_PASSWORD. O seed cria somente dados fictícios: duas filiais, livros, fornecedores, estoque e operações mínimas usando os serviços existentes. Não copia o banco local.

## Frontend e CORS

O frontend deve usar o proxy /api já preparado na Vercel. DEMO_API_ORIGIN na Vercel será a origem HTTPS da API Render. WEB_ORIGIN no Render deve ser a origem pública exata da Vercel. A API valida essa origem nas mutações; não habilita CORS wildcard. O navegador usa uma única origem, mantendo cookies HttpOnly/Secure/SameSite=Lax e evitando cookies de terceiros. Acesso direto cross-origin à API não é a configuração suportada para login.

Antes do primeiro deploy, reserve/importe o projeto frontend para conhecer a origem pública e preenchê-la. Não inventar URL. URLs reais, conexão ao banco remoto, healthcheck remoto e login remoto só podem ser confirmados depois do deploy autorizado.

Docker não está instalado neste ambiente: a imagem deve ser construída pelo Render no primeiro deploy autorizado. O build Node/Prisma é validado localmente. Não foram executados testes que criam/apagam bancos, nem fixtures contra o banco principal ou Render.

Referências: https://render.com/docs/docker ; https://render.com/docs/deploys ; https://render.com/docs/free ; https://render.com/docs/postgresql-creating-connecting
