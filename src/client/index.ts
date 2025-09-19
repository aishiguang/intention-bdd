export {};
import hljs from 'highlight.js/lib/core';
import gherkin from 'highlight.js/lib/languages/gherkin';
import markdown from 'highlight.js/lib/languages/markdown';
import { trackEvent, trackPageView } from './telemetry';
hljs.registerLanguage('gherkin', gherkin);
hljs.registerLanguage('markdown', markdown);
const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

const statusEl = $('status')!;
const form = $('gen-form') as HTMLFormElement;
const progressEl = $('progress') as HTMLPreElement;
const planEl = $('plan') as HTMLElement;
const gherkinEl = $('gherkin') as HTMLElement;
const submitBtn = $('submitBtn') as HTMLButtonElement;
const copyBtn = $('copyBtn') as HTMLButtonElement;
const downloadBtn = $('downloadBtn') as HTMLButtonElement;
const goGenerateBtn = $('goGenerateBtn') as HTMLButtonElement | null;
const lenEl = $('len') as HTMLElement;
const wrapBtn = $('wrapBtn') as HTMLButtonElement;
const gherkinPre = $('gherkinPre') as HTMLElement;
const timingEl = $('timing') as HTMLElement;
const statusBar = $('statusBar') as HTMLElement;
const progressBadge = $('progressBadge') as HTMLElement;
const stagesEl = $('stages') as HTMLElement;
const repoInput = $('repo') as HTMLInputElement;
const branchInput = $('branch') as HTMLInputElement;
const goGenerateHint = $('goGenerateHint') as HTMLElement | null;

let es: EventSource | null = null;
let startedAt = 0;
let lastUpdateAt = 0;
let timingTimer: number | null = null;
const SILENCE_TIMEOUT_MS = 60000;

const RESULT_CACHE_KEY = 'intentionIndexCache';

type ResultCache = {
  repo?: string;
  branch?: string;
  gherkin?: string;
};

trackPageView('index', { path: window.location.pathname });

function readResultCache(): ResultCache {
  try {
    const raw = sessionStorage.getItem(RESULT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as ResultCache;
    }
    return {};
  } catch {
    return {};
  }
}

function writeResultCache(data: ResultCache) {
  try {
    sessionStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

function updateResultCache(partial: Partial<ResultCache>) {
  const current = readResultCache();
  const next: ResultCache = { ...current, ...partial };
  if (!next.repo) delete next.repo;
  if (!next.branch) delete next.branch;
  if (!next.gherkin) delete next.gherkin;
  writeResultCache(next);
}

function clearResultCache() {
  try {
    sessionStorage.removeItem(RESULT_CACHE_KEY);
  } catch {}
}

function hydrateFromCache() {
  const cache = readResultCache();
  if (repoInput && cache.repo) repoInput.value = cache.repo;
  if (branchInput && cache.branch) branchInput.value = cache.branch;
  let cachedGherkin = cache.gherkin;
  let usedFallback = false;
  if (!cachedGherkin) {
    try {
      cachedGherkin = sessionStorage.getItem('gherkinPayload') || '';
      usedFallback = Boolean(cachedGherkin);
    } catch {
      cachedGherkin = '';
    }
  }
  if (cachedGherkin) {
    if (usedFallback) {
      const repoVal = repoInput ? repoInput.value.trim() : cache.repo;
      const branchVal = branchInput ? branchInput.value.trim() : cache.branch;
      updateResultCache({
        gherkin: cachedGherkin,
        repo: repoVal || cache.repo,
        branch: branchVal || cache.branch,
      });
    }
    setGherkin(cachedGherkin, { persist: false });
  } else {
    setupGoGenerateButton(false);
  }
}

function setStatus(kind: 'ok' | 'err' | 'run', text: string) {
  const cls = kind === 'ok' ? 'badge ok' : kind === 'err' ? 'badge err' : 'badge run';
  statusEl.className = cls; statusEl.textContent = text;
  progressBadge.className = cls; progressBadge.textContent = text;
  statusBar.className = kind === 'err' ? 'bar show error' : 'bar show'; statusBar.textContent = text;
  document.title = `${text} — Intention BDD`;
  submitBtn.textContent = kind === 'run' ? 'Generating…' : 'Generate';
}

function append(line: string) {
  const ts = new Date().toISOString();
  progressEl.textContent += `[${ts}] ${line}\n`;
  progressEl.scrollTop = progressEl.scrollHeight;
}

function setGherkin(text?: string, options?: { persist?: boolean }) {
  const t = text || '';
  gherkinEl.textContent = t;
  const n = t.length;
  lenEl.textContent = n ? `${n} chars` : '';
  copyBtn.disabled = !n; downloadBtn.disabled = !n; wrapBtn.disabled = !n;
  // Update or insert redirect button
  setupGoGenerateButton(n > 0);
  const shouldPersist = options?.persist !== false;
  if (shouldPersist) {
    try { sessionStorage.setItem('gherkinPayload', t); } catch {}
    const repoVal = repoInput ? repoInput.value.trim() : '';
    const branchVal = branchInput ? branchInput.value.trim() : '';
    updateResultCache({
      gherkin: t || undefined,
      repo: repoVal || undefined,
      branch: branchVal || undefined,
    });
  }
  if (n) {
    try {
      if ((gherkinEl as any).dataset && (gherkinEl as any).dataset.highlighted) {
        delete (gherkinEl as any).dataset.highlighted;
      }
      hljs.highlightElement(gherkinEl);
    } catch {}
  }
}

function setPlan(text?: string) {
  planEl.textContent = text || '';
  try {
    planEl.classList.add('language-markdown');
    if ((planEl as any).dataset && (planEl as any).dataset.highlighted) {
      delete (planEl as any).dataset.highlighted;
    }
    hljs.highlightElement(planEl);
  } catch {}
}

function reset() {
  progressEl.textContent = '';
  setGherkin('', { persist: false });
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
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const t = a as HTMLAnchorElement;
    if (repoInput) {
      repoInput.value = t.dataset.example || '';
      updateResultCache({ repo: repoInput.value.trim() || undefined });
    }
    trackEvent('index_exampleSelected', { example: t.dataset.example || '' });
  });
});

hydrateFromCache();

copyBtn.addEventListener('click', async () => {
  const text = gherkinEl.textContent || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    append('Gherkin copied to clipboard');
    trackEvent('index_copyResult', { length: text.length, status: 'success' });
  } catch {
    append('Copy failed');
    trackEvent('index_copyResult', { length: text.length, status: 'error' });
  }
});

downloadBtn.addEventListener('click', () => {
  const text = gherkinEl.textContent || '';
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'generated.feature'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  trackEvent('index_downloadFeature', { length: text.length });
});

wrapBtn.addEventListener('click', () => {
  if (!gherkinPre) return;
  const wrapped = gherkinPre.classList.toggle('wrap');
  wrapBtn.textContent = wrapped ? 'No Wrap' : 'Wrap';
  trackEvent('index_toggleWrap', { wrapped });
});

function setupGoGenerateButton(enabled: boolean) {
  if (!goGenerateBtn) return;
  goGenerateBtn.disabled = !enabled;
  goGenerateBtn.classList.toggle('ready', enabled);
  if (goGenerateHint) {
    goGenerateHint.textContent = enabled
      ? 'Ready — this opens Step 2 in a new page with your generated Gherkin.'
      : 'Generate Gherkin above to unlock Step 2.';
    goGenerateHint.dataset.state = enabled ? 'ready' : 'disabled';
  }
}

goGenerateBtn?.addEventListener('click', () => {
  const text = gherkinEl.textContent || '';
  if (!text) return;
  try { sessionStorage.setItem('gherkinPayload', text); } catch {}
  updateResultCache({
    gherkin: text,
    repo: repoInput ? repoInput.value.trim() || undefined : undefined,
    branch: branchInput ? branchInput.value.trim() || undefined : undefined,
  });
  trackEvent('index_goGenerate', { length: text.length });
  window.location.href = '/generate.html';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault(); if (es) { es.close(); es = null; }
  const repo = repoInput?.value.trim() || '';
  const branch = branchInput?.value.trim() || '';
  const cache = readResultCache();
  const repoChanged = Boolean(cache.repo && cache.repo !== repo);
  const branchChanged = Boolean(cache.branch && cache.branch !== branch);
  if (repoChanged || branchChanged) {
    clearResultCache();
    try { sessionStorage.removeItem('gherkinPayload'); } catch {}
  }
  updateResultCache({ repo: repo || undefined, branch: branch || undefined });
  trackEvent('index_jobStart', { repoProvided: Boolean(repo), branchProvided: Boolean(branch) });
  reset(); setStatus('run', 'Running'); submitBtn.disabled = true; startedAt = Date.now();
  startTiming();
  try {
    const resp = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, branch: branch || undefined }) });
    if (!resp.ok) {
      const errText = await resp.text();
      append('Failed to start job: ' + errText);
      submitBtn.disabled = false; setStatus('err', 'Error');
      trackEvent('index_jobStartFailed', { status: resp.status, body: errText.slice(0, 200) });
      return;
    }
    const { jobId } = await resp.json();
    append('Job started: ' + jobId);
    trackEvent('index_jobQueued', { hasJobId: Boolean(jobId) });
    es = new EventSource('/api/progress/' + jobId);
    es.addEventListener('status', (ev) => {
      const { status } = JSON.parse((ev as MessageEvent).data);
      append('Status: ' + status); lastUpdateAt = Date.now();
      if (status === 'done') {
        trackEvent('index_jobStatus', { status });
        setStatus('ok', 'Done'); submitBtn.disabled = false; timingEl.textContent = elapsed(); markStage('done'); /* keep SSE open until 'done' arrives */
      }
      if (status === 'error') {
        trackEvent('index_jobStatus', { status });
        handleFatal('Server reported an error.');
      }
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
      trackEvent('index_jobComplete', { length: gherkin ? gherkin.length : 0 });
      stopTiming();
      if (es) { try { es.close(); } catch {} es = null; }
    });
    es.onerror = () => {
      const state = (es as EventSource).readyState; // 0 connecting, 1 open, 2 closed
      if (state === 2) {
        trackEvent('index_sseError', { state });
        handleFatal('Connection closed unexpectedly. Please retry.');
      } else {
        setTimeout(() => {
          if (!lastUpdateAt || Date.now() - lastUpdateAt > 10000) {
            trackEvent('index_sseError', { state: (es as EventSource).readyState, reason: 'timeout' });
            handleFatal('Network issue detected. Please retry.');
          }
        }, 10000);
      }
    };
  } catch (err: any) {
    append('Error: ' + (err?.message || String(err)));
    submitBtn.disabled = false; setStatus('err', 'Error');
    trackEvent('index_jobStartException', { message: err?.message || String(err) });
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
  markStageError();
  trackEvent('index_fatal', { message });
}

function markStageError() {
  if (!stagesEl) return;
  const active = stagesEl.querySelector('.stage.active') as HTMLElement | null;
  if (active) {
    active.classList.remove('active');
    active.classList.add('error');
  } else {
    const queued = $('stage-queued');
    queued?.classList.add('error');
  }
}
