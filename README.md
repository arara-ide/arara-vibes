# Arara Vibes

Complemento desktop open source do Arara Code: chat flutuante com o visual original do Arara AI, acima dos outros aplicativos. Abre direto na conversa e usa o login da IDE; sem conta conectada, mostra Entrar.

O Vibes inicia automaticamente um host oculto do Arara Code na pasta pessoal. Não pede workspace nem abre Explorer. O motor, o kit, as ferramentas, as permissões, os navegadores e o Obsidian pertencem ao Arara AI instalado; o pacote público contém somente a janela e o transporte local. O host oculto ainda usa o runtime do Code-OSS, não é um extension host independente.

## Desenvolvimento

Branches: `development` para trabalho diário; PR para `main` para distribuição.

Com os repositórios irmãos `arara-ai` e `arara-code` preparados:

```bash
npm ci
npm --prefix ../arara-ai run build
npm run build
npm start
```

`npm start` já usa `--no-sandbox --production`. Também aceita `npm start -- --no-sandbox --production`. O host recebe `--no-sandbox`; o ambiente de produção usa o mesmo `apply-environment.cjs production` chamado pelo `dev.sh --production`, com manifesto local e links para os bundles originais. Não altera o manifesto fonte do Arara AI.

O checkout local usa o runtime em `../arara-code/.work/vscodium/vscode`, preparado pelo fluxo de desenvolvimento da IDE com o patch `0043-background-window.patch` aplicado e compilado. Na distribuição, exige Arara Code com `companionHostVersion: 1`. A versão instalada anterior a esse contrato precisa ser atualizada.

O host local de desenvolvimento usa `~/.arara/vibes/profile`, reaproveita o arquivo de sessão já mantido pela IDE e observa logout. A pasta inicial é a pasta pessoal do usuário. A política de permissões do chat continua valendo. Navegadores, acessos de plataforma e integrações seguem suas conexões e autorizações originais.

`Option+Space` no macOS e `Ctrl+Shift+Space` nos outros sistemas mostram/ocultam o Vibes. Fechar a janela oculta; Sair na bandeja encerra o app e fecha o host que ele iniciou. Fixar e recolher preservam a conversa.

## Verificação

```bash
npm run typecheck
npm run lint
npm test
npm run check:i18n
npm run build
npm run test:smoke
node ../arara-ai/scripts/test-vibes-ide.cjs --app
```

O último comando abre a IDE real oculta e o Vibes real com perfis descartáveis, API local e CLI simulado, sem contas reais ou inferência. Verifica janela oculta, CSS original, envio, histórico, perguntas, inicialização automática e tela de login após logout.

Para inspeção no navegador do Arara Code:

```bash
node ../arara-ai/scripts/test-vibes-ide.cjs --keep
ARARA_VIBES_HOSTS=<diretório informado pelo teste> npm run preview
```

Abra a URL local informada pelo preview no navegador da IDE. Esse modo oferece a mesma moldura e o mesmo documento de chat; ações nativas são testadas no Electron.

## Distribuição complementar

A primeira abertura prepara em segundo plano o instalador estável do aplicativo complementar ausente. Os downloads vêm das releases públicas oficiais, com SHA-256 obrigatório e cache verificado; a instalação passa pelo instalador do sistema. A distribuição pública das alterações depende das releases dos dois produtos. O build nunca copia o `arara-ai` nem mídia privada para este pacote.

Ícones da moldura: Codicons, Microsoft, MIT, extraídos dos recursos públicos do Code-OSS. Licença em `assets/codicons-LICENSE`. Logo: branding público do Arara Code.
