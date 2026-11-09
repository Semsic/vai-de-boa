# Vai de Boa

Um aplicativo de corridas feito por [Semsic](https://github.com/Semsic) para mostrar um fluxo completo de desenvolvimento web. Passageiros pedem uma viagem e motoristas aceitam e alteram seu andamento. É um projeto independente de demonstração, sem vínculo com empresas de transporte.

**Saldo, tarifa e corridas são fictícios.** Não há pagamento, serviço de transporte real, GPS, geocodificação ou mapa de ruas. O mapa é uma ilustração.

![Tela inicial do Vai de Boa com mapa ilustrativo](docs/screenshots/tela-inicial.png)

## O que tem aqui

- React, TypeScript e Vite no frontend; Node.js, Express, Zod, bcrypt e JWT na API.
- PostgreSQL no Supabase: contas, histórico, saldo e limite de requisições compartilhado.
- Passageiro: cadastro, crédito fictício, solicitação, cancelamento e histórico.
- Motorista: fila, aceite, início e conclusão da corrida.
- Netlify publica o frontend e encaminha `/api` ao Render por uma Edge Function. A sessão usa cookie HTTP-only na origem da Netlify.
- O detalhe de borda móvel é uma implementação própria em CSS inspirada no [Moving Border do Aceternity UI](https://ui.aceternity.com/components/moving-border); ele respeita a preferência por movimento reduzido.

## Rodar localmente

1. Use Node.js na versão indicada em `.node-version` e execute `npm ci` na raiz.
2. Crie um projeto no Supabase. No SQL Editor, execute a migration [`supabase/migrations/001_demo.sql`](supabase/migrations/001_demo.sql) uma vez. Ela cria tabelas, RLS, permissões e funções transacionais. Use um projeto de desenvolvimento separado para experimentar.
3. Copie `.env.example` para `.env` e preencha `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_SECRET` e `RATE_LIMIT_SECRET`. Use segredos aleatórios com pelo menos 32 caracteres; não envie o `.env` ao GitHub. `PROXY_SECRET` é exigido em produção.
4. Rode `npm run dev`. Acesse `http://localhost:5173`. O Vite encaminha `/api` à API local na porta 4000.
5. Cadastre uma conta de passageiro e entre com e-mail e senha; depois, faça o mesmo com uma conta de motorista em outra sessão do navegador para experimentar o ciclo de uma corrida. O cadastro retorna a mesma mensagem para endereços novos ou existentes.

Comandos úteis: `npm run build`, `npm run typecheck`, `npm run lint` e `npm test`.

## Publicar

1. **Supabase:** crie o banco, aplique a migration e copie a URL e a chave secreta de servidor para o Render. A chave secreta ignora RLS e nunca deve ir para o navegador ou Git.
2. **Render:** crie um Web Service deste repositório (ou use `render.yaml`). Configure `NODE_ENV=production`, `APP_ORIGIN` com a origem exata da Netlify sem barra no final, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `RATE_LIMIT_SECRET` e `PROXY_SECRET`. Gere segredos independentes e aleatórios de pelo menos 32 caracteres. O health check é `/api/health`.
3. **Netlify:** importe o mesmo repositório. `netlify.toml` define o build, a pasta publicada e a Edge Function. Em variáveis de ambiente com escopo **Functions**, defina `RENDER_API_URL` como a origem HTTPS do serviço no Render (sem caminho) e `PROXY_SECRET` com o mesmo valor usado no Render. Esses valores ficam no servidor, não em variáveis `VITE_*`. Refaça o deploy após configurá-los.
4. Confira os fluxos com duas contas de teste, origem, cookie seguro e limites no ambiente publicado. O serviço gratuito do Render pode demorar para responder após inatividade.

## Como funciona o dinheiro de mentirinha

Novos perfis recebem R$ 100,00 fictícios; a tarifa de demonstração é fixa em R$ 18,00. Cada recarga adiciona até R$ 50,00, com teto de R$ 500,00 incluindo valores reservados para eventual cancelamento. A solicitação reserva o saldo, e o cancelamento antes do início devolve o valor. O banco faz essas mudanças dentro de transações e bloqueia alterações concorrentes da mesma corrida.

Senhas são protegidas com bcrypt; cookies são HTTP-only, `SameSite=Lax` e seguros em produção. Mutações verificam origem e token CSRF. Contadores de rate limit usam chaves HMAC e falham fechados se o banco estiver indisponível. A Edge Function fornece o IP ao Render por um canal com segredo configurado nos dois servidores; ela substitui cabeçalhos recebidos do cliente.

Não é um produto pronto para transportar pessoas: não há verificação de motoristas, recuperação de senha, confirmação de e-mail, pagamento, proteção antifraude ou monitoramento operacional. Não coloque dados sensíveis reais nesta demonstração. Em produção, estabeleça retenção e exclusão de dados e configure monitoramento, backups e proteções adicionais.

## Licença

MIT. Projeto criado por Semsic.
