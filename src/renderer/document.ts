export function chatDocument(html: string, token: string, theme: Record<string, string>, state: unknown, glass = false, motion = true): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nonce = doc.querySelector('script[nonce]')?.getAttribute('nonce');
  const policy = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!nonce || !policy) throw new Error('Invalid chat document');
  policy.setAttribute('content', `default-src 'none'; script-src 'nonce-${nonce}'; style-src data: 'nonce-${nonce}'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'`);
  const css = doc.createElement('style');
  css.setAttribute('nonce', nonce);
  const declarations = Object.entries(theme).filter(([key, value]) => /^--vscode-[\w-]+$/.test(key) && /^#[a-fA-F0-9]{3,8}$/.test(value)).map(([key, value]) => `${key}:${value}`).join(';');
  css.textContent = `:root{color-scheme:dark;${declarations};--vscode-font-family:system-ui,sans-serif;--vscode-font-size:13px;--vscode-editor-font-family:monospace;--vscode-editor-font-size:13px}html,body{height:100%;margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground,var(--vscode-editor-foreground));font-family:var(--vscode-font-family)}`;
  css.textContent += '@keyframes vibes-menu-in{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:none}}#composer{background:rgb(0 0 0/20%)!important}.picker-panel,#file-mentions{animation:vibes-menu-in 160ms cubic-bezier(.23,1,.32,1);transform-origin:bottom left}button,summary,[role=tab],[role=menuitem],[role=option],label,.picker-panel{user-select:none;-webkit-user-select:none}';
  css.textContent += /Mac/.test(navigator.platform) ? '.picker-panel,#file-mentions{background:rgb(0 0 0/70%)!important;-webkit-backdrop-filter:blur(24px) saturate(1.6)!important;backdrop-filter:blur(24px) saturate(1.6)!important}.mention-scroll-up,.mention-scroll-down{background:none!important}' : '.picker-panel,#file-mentions{background:var(--vscode-editorWidget-background)!important}';
  if (glass) css.textContent += 'html,body{background:transparent!important}#message-queue,#composer-offer{background:color-mix(in srgb,var(--vscode-editorWidget-background) 20%,transparent)!important}';
  css.textContent += '.picker-panel .model-option:hover,.picker-panel .model-option:focus-visible,.picker-panel .model-option[aria-pressed=true],.select-panel button.picker-option:hover,.select-panel button.picker-option:focus,.select-panel button.picker-option[aria-selected=true],.file-mention:hover,.file-mention[aria-selected=true]{background:rgb(64 68 76/60%)!important}';
  css.textContent += '.fork-conversation{display:none!important}';
  if (!motion) css.textContent += '*,*::before,*::after{animation:none!important;transition:none!important}';
  doc.head.append(css);
  const script = doc.createElement('script');
  script.setAttribute('nonce', nonce);
  const encode = (value: unknown) => JSON.stringify(value ?? null).replaceAll('<', '\\u003c');
  script.textContent = `(()=>{const token=${encode(token)};let state=${encode(state)};let acquired=false;const emit=(type,extra={})=>parent.postMessage({type,token,...extra},'*');for(const name of ['localStorage','sessionStorage']){const data=new Map();Object.defineProperty(globalThis,name,{configurable:true,value:{getItem:k=>data.get(String(k))??null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear(),key:i=>[...data.keys()][i]??null,get length(){return data.size}}})}globalThis.acquireVsCodeApi=()=>{if(acquired)throw Error('API already acquired');acquired=true;return{postMessage:message=>emit('input',{message}),getState:()=>state,setState:value=>{state=value;emit('state',{state});return state}}};addEventListener('message',event=>{if(event.source===parent&&event.data?.token===token&&event.data.type==='event')dispatchEvent(new MessageEvent('message',{data:event.data.message}))});addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open],details[open],.question-panel'))emit('escape')});addEventListener('DOMContentLoaded',()=>{emit('ready');document.querySelector('#input')?.focus()});})();`;
  doc.head.insertBefore(script, doc.head.querySelector('script'));
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
