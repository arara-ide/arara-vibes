# Arara Vibes

Um chat flutuante do Arara Code que fica por cima dos outros aplicativos. Ele abre direto na conversa e usa o mesmo login da IDE. Se você não estiver logado, aparece o botão Entrar.

O Vibes abre o Arara Code escondido, em segundo plano, na sua pasta pessoal. Você não precisa escolher pasta nem ver o editor. A IA, as ferramentas, as permissões, os navegadores e o Obsidian são os mesmos do Arara AI instalado. Este pacote tem só a janela do chat e a conexão com a IDE.

## Atalhos

- **Mostrar/esconder:** `Option+Space` no macOS, `Ctrl+Shift+Space` no Windows e Linux.
- **Fechar a janela:** só esconde o Vibes.
- **Sair (na bandeja):** fecha o Vibes e a IDE escondida.

Fixar e recolher a janela não apagam a conversa.

## Atualizações

Clique no botão de atualizar no topo, ou em **Verificar atualizações** na bandeja. A tela mostra a versão instalada e a disponível do Arara Code e do Arara Vibes. O Vibes procura atualizações sozinho a cada 5 minutos.

**Atualizar tudo** atualiza primeiro o Code e depois o Vibes. Se der erro, a mensagem continua na tela e você pode tentar de novo.

No macOS, o Code é trocado sem abrir o editor. Se outra janela do Code estiver aberta, ou faltar permissão, a atualização não acontece e o Vibes continua funcionando.

Na primeira vez que você abre o Vibes, ele baixa em segundo plano o app que estiver faltando. Os downloads vêm das releases oficiais e são conferidos com SHA-256.

## Desenvolvimento

Branches: `development` para o dia a dia, `main` para a versão estável.

Você precisa dos repositórios `arara-ai` e `arara-code` na mesma pasta, já preparados:

```bash
npm ci
npm --prefix ../arara-ai run build
npm run build
npm start
```

O `npm start` já usa `--no-sandbox --production`.

Em dev, o Vibes usa a IDE de `../arara-code/.work/vscodium/vscode`, com o patch `0043-background-window.patch` aplicado. A versão instalada precisa ter `companionHostVersion: 1`. Se for mais antiga, atualize o Arara Code. O perfil de dev fica em `~/.arara/vibes/profile`.

## Testes

```bash
npm run typecheck
npm run lint
npm test
npm run check:i18n
npm run build
npm run test:smoke
npm run test:updates
node ../arara-ai/scripts/test-vibes-ide.cjs --app
```

O último comando abre a IDE e o Vibes de verdade, com perfis temporários e uma IA simulada. Nenhuma conta real é usada.

Para ver no navegador do Arara Code:

```bash
node ../arara-ai/scripts/test-vibes-ide.cjs --keep
ARARA_VIBES_HOSTS=<pasta mostrada pelo teste> npm run preview
```

Abra a URL que aparecer. Ações nativas da janela só funcionam no app Electron.

## Créditos

Ícones: Codicons, da Microsoft, licença MIT (veja `assets/codicons-LICENSE`). Logo: marca pública do Arara Code.
