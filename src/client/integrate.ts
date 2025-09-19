import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import gherkin from 'highlight.js/lib/languages/gherkin';
import { trackEvent, trackPageView } from './telemetry';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('gherkin', gherkin);

type StoredTest = {
  feature: string;
  featureTitle: string;
  tests?: string;
};

const TEST_SESSION_KEY = 'intentionGeneratedTests';

const summaryEl = document.getElementById('integrationSummary') as HTMLElement | null;
const testsCodeEl = document.getElementById('testsCodeInner') as HTMLElement | null;
const gherkinCodeEl = document.getElementById('gherkinCodeInner') as HTMLElement | null;
const copyBtn = document.getElementById('copyAllTests') as HTMLButtonElement | null;
const downloadBtn = document.getElementById('downloadAllTests') as HTMLButtonElement | null;
const clearSessionBtn = document.getElementById('clearSession') as HTMLButtonElement | null;

let aggregatedTests = '';
let gherkinSource = '';

trackPageView('integrate', { path: window.location.pathname });

function highlight(el: HTMLElement | null) {
  if (!el) return;
  try {
    if ((el as any).dataset && (el as any).dataset.highlighted) {
      delete (el as any).dataset.highlighted;
    }
    hljs.highlightElement(el);
  } catch {}
}

function readStoredTests(): StoredTest[] {
  try {
    const raw = sessionStorage.getItem(TEST_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      feature: typeof entry?.feature === 'string' ? entry.feature : '',
      featureTitle: typeof entry?.featureTitle === 'string' ? entry.featureTitle : 'Feature',
      tests: typeof entry?.tests === 'string' ? entry.tests : undefined,
    }));
  } catch {
    return [];
  }
}

function readGherkin(): string {
  try {
    return sessionStorage.getItem('gherkinPayload') || '';
  } catch {
    return '';
  }
}

function setSummary(text: string) {
  if (summaryEl) summaryEl.textContent = text;
}

function disableActions() {
  if (copyBtn) copyBtn.disabled = true;
  if (downloadBtn) downloadBtn.disabled = true;
}

function enableActions() {
  if (copyBtn) copyBtn.disabled = false;
  if (downloadBtn) downloadBtn.disabled = false;
}

function refresh() {
  const stored = readStoredTests();
  aggregatedTests = stored
    .map((entry) => (entry.tests || '').trim())
    .filter((block) => block.length > 0)
    .join('\n\n');
  gherkinSource = readGherkin();

  if (testsCodeEl) {
    testsCodeEl.textContent = aggregatedTests;
    highlight(testsCodeEl);
  }
  if (gherkinCodeEl) {
    gherkinCodeEl.textContent = gherkinSource;
    highlight(gherkinCodeEl);
  }

  const coveredCount = stored.filter((entry) => Boolean(entry.tests && entry.tests.trim().length)).length;
  if (coveredCount) {
    setSummary(`Loaded ${coveredCount} generated test block${coveredCount > 1 ? 's' : ''}. Copy or download them, then paste into your Jest suite.`);
    enableActions();
  } else {
    setSummary('No generated tests found. Return to Step 2 to build them, then hop back here.');
    disableActions();
  }
}

copyBtn?.addEventListener('click', async () => {
  if (!aggregatedTests) return;
  try {
    await navigator.clipboard.writeText(aggregatedTests);
    trackEvent('integrate_copyTests', { length: aggregatedTests.length });
  } catch {
    trackEvent('integrate_copyTests', { length: aggregatedTests.length, status: 'error' });
  }
});

downloadBtn?.addEventListener('click', () => {
  if (!aggregatedTests) return;
  const blob = new Blob([aggregatedTests], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'generated-tests.spec.ts';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  trackEvent('integrate_downloadTests', { length: aggregatedTests.length });
});

clearSessionBtn?.addEventListener('click', () => {
  try {
    sessionStorage.removeItem(TEST_SESSION_KEY);
    sessionStorage.removeItem('gherkinPayload');
  } catch {}
  aggregatedTests = '';
  gherkinSource = '';
  refresh();
  trackEvent('integrate_clearSession');
});

refresh();

if (!aggregatedTests) {
  disableActions();
}

if (gherkinSource) {
  trackEvent('integrate_loadedGherkin', { length: gherkinSource.length });
}
