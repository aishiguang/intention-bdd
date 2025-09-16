const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

const statusEl = $('status')!;
const form = $('gen-form') as HTMLFormElement;
const progressEl = $('progress') as HTMLPreElement;
const planEl = $('plan') as HTMLPreElement;
const gherkinEl = $('gherkin') as HTMLElement;
const submitBtn = $('submitBtn') as HTMLButtonElement;
const copyBtn = $('copyBtn') as HTMLButtonElement;
const downloadBtn = $('downloadBtn') as HTMLButtonElement;
const lenEl = $('len') as HTMLElement;
const wrapBtn = $('wrapBtn') as HTMLButtonElement;
const gherkinPre = $('gherkinPre') as HTMLElement;
const timingEl = $('timing') as HTMLElement;
const statusBar = $('statusBar') as HTMLElement;
const progressBadge = $('progressBadge') as HTMLElement;
const stagesEl = $('stages') as HTMLElement;

let es: EventSource | null = null;
let startedAt = 0;
let lastUpdateAt = 0;
let timingTimer: number | null = null;
const SILENCE_TIMEOUT_MS = 60000;

function setStatus(kind: 'ok' | 'err' | 'run', text: string) {
  const cls = kind === 'ok' ? 'badge ok' : kind === 'err' ? 'badge err' : 'badge run';
  statusEl.className = cls; statusEl.textContent = text;
  progressBadge.className = cls; progressBadge.textContent = text;
  statusBar.className = 'bar show'; statusBar.textContent = text;
  document.title = `${text} — Intention BDD`;
  if (kind === 'run') submitBtn.innerHTML = '<span class="spinner"></span> Generating…'; else submitBtn.textContent = 'Generate';
}

function append(line: string) {
  const ts = new Date().toISOString();
  progressEl.textContent += `[${ts}] ${line}\n`;
  progressEl.scrollTop = progressEl.scrollHeight;
}

function setGherkin(text?: string) {
  const t = text || '';
  gherkinEl.textContent = t;
  const n = t.length;
  lenEl.textContent = n ? `${n} chars` : '';
  copyBtn.disabled = !n; downloadBtn.disabled = !n; wrapBtn.disabled = !n;
  const w = window as any;
  if (n && w.hljs && typeof w.hljs.highlightElement === 'function') {
    w.hljs.highlightElement(gherkinEl);
  }
}

function setPlan(text?: string) {
  planEl.textContent = text || '';
}

function reset() {
  progressEl.textContent = '';
  setGherkin('');
  setPlan('');
  lenEl.textContent = '';
  timingEl.textContent = '';
  startedAt = 0; lastUpdateAt = 0; setStatus('run', 'Idle');
  Array.from(stagesEl.children).forEach(c => c.classList.remove('active', 'done'));
  markStage('queued');
}

function elapsed(): string {
  if (!startedAt) return '';
  const ms = Date.now() - startedAt;
  const s = Math.floor(ms / 1000);
  return `${s}s elapsed`;
}

document.querySelectorAll('[data-example]').forEach((a) => {
  a.addEventListener('click', (e) => { e.preventDefault(); const t = a as HTMLAnchorElement; ( $('repo') as HTMLInputElement ).value = t.dataset.example || ''; });
});

copyBtn.addEventListener('click', async () => {
  const text = gherkinEl.textContent || '';
  if (!text) return;
  try { await navigator.clipboard.writeText(text); append('Gherkin copied to clipboard'); } catch { append('Copy failed'); }
});

downloadBtn.addEventListener('click', () => {
  const text = gherkinEl.textContent || '';
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'generated.feature'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

wrapBtn.addEventListener('click', () => {
  if (!gherkinPre) return;
  const wrapped = gherkinPre.classList.toggle('wrap');
  wrapBtn.textContent = wrapped ? 'No Wrap' : 'Wrap';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault(); if (es) { es.close(); es = null; }
  const repo = ( $('repo') as HTMLInputElement ).value.trim();
  const branch = ( $('branch') as HTMLInputElement ).value.trim();
  reset(); setStatus('run', 'Running'); submitBtn.disabled = true; startedAt = Date.now();
  startTiming();
  try {
    const resp = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, branch: branch || undefined }) });
    if (!resp.ok) { append('Failed to start job: ' + (await resp.text())); submitBtn.disabled = false; setStatus('err', 'Error'); return; }
    const { jobId } = await resp.json();
    append('Job started: ' + jobId);
    es = new EventSource('/api/progress/' + jobId);
    es.addEventListener('status', (ev) => {
      const { status } = JSON.parse((ev as MessageEvent).data);
      append('Status: ' + status); lastUpdateAt = Date.now();
      if (status === 'done') { setStatus('ok', 'Done'); submitBtn.disabled = false; timingEl.textContent = elapsed(); markStage('done'); if (es) { try { es.close(); } catch {} es = null; } }
      if (status === 'error') { handleFatal('Server reported an error.'); }
    });
    es.addEventListener('log', (ev) => {
      const { message } = JSON.parse((ev as MessageEvent).data);
      lastUpdateAt = Date.now();
      const parsed = parseMessage(message);
      if (parsed?.type === 'plan') setPlan(parsed.plan);
      else if (parsed?.type === 'stage') { const stage = parsed.stage; if ([ 'planning','generating','refining' ].includes(stage)) markStage(stage); }
      else append(message);
    });
    es.addEventListener('done', (ev) => {
      const { gherkin } = JSON.parse((ev as MessageEvent).data);
      if (gherkin) setGherkin(gherkin);
      stopTiming();
      if (es) { try { es.close(); } catch {} es = null; }
    });
    es.onerror = () => {
      const state = (es as EventSource).readyState; // 0 connecting, 1 open, 2 closed
      if (state === 2) {
        handleFatal('Connection closed unexpectedly. Please retry.');
      } else {
        setTimeout(() => {
          if (!lastUpdateAt || Date.now() - lastUpdateAt > 10000) {
            handleFatal('Network issue detected. Please retry.');
          }
        }, 10000);
      }
    };
  } catch (err: any) {
    append('Error: ' + (err?.message || String(err)));
    submitBtn.disabled = false; setStatus('err', 'Error');
    stopTiming();
  }
});

window.addEventListener('error', () => {
  handleFatal('Unexpected error occurred. Please retry.');
});
window.addEventListener('unhandledrejection', () => {
  handleFatal('Unexpected error occurred. Please retry.');
});

function parseMessage(msg: unknown): null | { type: 'stage', stage: string } | { type: 'plan', plan: string } {
  if (typeof msg !== 'string') return null;
  const stageMatch = msg.match(/::stage::(\w+)/);
  if (stageMatch) return { type: 'stage', stage: stageMatch[1] };
  const planMatch = msg.match(/::plan::([\s\S]+)/m);
  if (planMatch) return { type: 'plan', plan: planMatch[1] };
  return null;
}

function markStage(name: string) {
  const order = [ 'queued', 'planning', 'generating', 'refining', 'done' ];
  const idx = order.indexOf(name);
  order.forEach((n, i) => {
    const el = $('stage-' + n);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    if (i === idx) el.classList.add('active');
  });
}

function stopTiming() {
  if (timingTimer) { clearInterval(timingTimer); timingTimer = null; }
}

function startTiming() {
  if (!timingTimer) {
    timingTimer = window.setInterval(() => {
      if (startedAt) {
        timingEl.textContent = `${elapsed()}${lastUpdateAt ? ` · last update ${Math.floor((Date.now() - lastUpdateAt) / 1000)}s ago` : ''}`;
        if (lastUpdateAt && Date.now() - lastUpdateAt > SILENCE_TIMEOUT_MS) {
          handleFatal('Connection seems lost. Please try again.');
        }
      }
    }, 1000);
  }
}

function handleFatal(message: string) {
  if (es) { try { es.close(); } catch {} es = null; }
  setStatus('err', 'Error');
  submitBtn.disabled = false;
  stopTiming();
  append(message);
}
