# AGENTS.md — Arara Vibes

Siga `../AGENTS.md` e `../CLAUDE.md`. Operação e arquitetura em `../ac-docs/docs/54-arara-vibes.md`.

- Toda alteração no Arara Chat deve ser aplicada e validada também no PWA `/app` do `ac-web`, que se comunica com o `arara-ai`, e no `arara-vibes`, na mesma entrega. Kit, comportamento, ferramentas, permissões, mensagens e traduções comuns usam o código original do `arara-ai`; adapte somente a moldura e as diferenças explícitas de cada plataforma, sem copiar o chat.

- O repositório público contém a moldura Electron e o transporte local. Chat, navegador e configurações vêm do `arara-ai` original em execução; não copie código, CSS ou bundles privados.
- Abas de conversa são dinâmicas, sem numeração Chat 1/2/3. Preserve login, permissões, recusas e o estado de cada conversa ao alternar.
- A língua acompanha a escolha do Arara Code, com fallback do sistema e inglês, salvo quando a pessoa escolhe um idioma em Configurações › Geral do Vibes; todo texto da moldura tem catálogos en/pt/es.
- Animações ficam ligadas por padrão e só a opção Animações (Geral) as desliga; `prefers-reduced-motion` do sistema não interfere.
- Verifique `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:i18n`, `npm run build` e `node ../arara-ai/scripts/test-vibes-ide.cjs --app`, com dados isolados.
