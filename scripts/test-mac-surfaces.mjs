import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '../../ac-web/node_modules/playwright');
const result = await build({ entryPoints: [resolve(root, 'src/renderer/document.ts')], bundle: true, platform: 'browser', format: 'iife', globalName: 'VibesDocument', write: false });
const styles = ['chat.css', 'settings.css'].map(name => `<style nonce="fixture">${readFileSync(resolve(root, '../arara-ai/media', name), 'utf8')}</style>`).join('');
const surfaces = '<div class="msg user"><div class="bubble" id="bubble">Message</div></div><details class="tool"></details><div class="approval"></div><div class="approval-detail"></div><section class="question-panel"></section><div class="task-list"></div><div class="task-list-head"></div><pre class="code"></pre><div id="message-queue"></div><div id="composer-offer"></div><input class="question-input"><input class="dialog-field"><div class="arara-dialog"></div><div class="select-panel"></div><input id="search"><button class="primary">Action</button>';
const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'">${styles}<script nonce="fixture"></script></head><body class="arara-chat">${surfaces}</body></html>`;
const theme = { '--vscode-editor-background': '#1b1d21', '--vscode-editorWidget-background': '#3f4869', '--vscode-input-background': '#53607f', '--vscode-textCodeBlock-background': '#314159', '--vscode-chat-requestBubbleBackground': '#263f59', '--vscode-sideBar-background': '#414d68', '--vscode-settings-textInputBackground': '#505b74', '--vscode-button-background': '#365c85' };
const browser = await chromium.launch({ headless: true });
try {
  for (const platform of ['MacIntel', 'Win32', 'Linux x86_64']) {
    const context = await browser.newContext();
    await context.addInitScript(value => Object.defineProperty(navigator, 'platform', { value }), platform);
    const page = await context.newPage(); await page.goto('about:blank'); await page.addScriptTag({ content: result.outputFiles[0].text });
    const document = await page.evaluate(({ html, theme, mac }) => VibesDocument.chatDocument(html, 'fixture', theme, null, mac), { html, theme, mac: platform === 'MacIntel' });
    await page.setContent(document);
    const values = await page.evaluate(() => {
      const selectors = ['#bubble', 'details.tool', '.approval', '.approval-detail', '.question-panel', '.task-list', '.task-list-head', 'pre.code', '#message-queue', '#composer-offer', '.question-input', '.dialog-field', '.arara-dialog', '#search', '.select-panel', 'button.primary'];
      return Object.fromEntries(selectors.map(selector => [selector, getComputedStyle(document.querySelector(selector)).backgroundColor]));
    });
    if (platform === 'MacIntel') {
      for (const [selector, color] of Object.entries(values)) assert.equal(color, selector === '.select-panel' ? 'rgba(0, 0, 0, 0.7)' : selector === 'button.primary' ? 'rgb(54, 92, 133)' : 'rgba(0, 0, 0, 0.2)', `${platform}: ${selector}`);
    } else {
      assert.equal(values['details.tool'], 'rgb(63, 72, 105)', platform);
      assert.equal(values['#bubble'], 'rgb(38, 63, 89)', platform);
      assert.equal(values['#search'], 'rgb(83, 96, 127)', platform);
    }
    await page.goto('about:blank');
    await page.setContent(`<html data-mac="${platform === 'MacIntel'}"><head><style>${readFileSync(resolve(root, 'src/renderer/tokens.css'), 'utf8')}${readFileSync(resolve(root, 'src/renderer/shell.css'), 'utf8')}</style></head><body><div id="signin"></div><div id="update"></div></body></html>`);
    assert.equal(await page.locator('#signin').evaluate(node => getComputedStyle(node).backgroundColor), platform === 'MacIntel' ? 'rgba(0, 0, 0, 0)' : 'rgb(27, 29, 33)');
    await context.close();
  }
  console.log('PASS: original chat/settings surfaces use dark Mac backgrounds; Windows/Linux theme backgrounds and primary button color are preserved');
} finally { await browser.close(); }
