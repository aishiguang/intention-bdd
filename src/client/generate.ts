import { TestGeneratorFromSource } from 'jest-bdd-generator/lib/gherkin-to-test';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import gherkin from 'highlight.js/lib/languages/gherkin';
import { trackEvent, trackPageView } from './telemetry';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('gherkin', gherkin);

declare global {
  interface Window {
    hljs?: any;
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

const input = $('gherkinInput') as HTMLTextAreaElement;
const featureSectionsAnchor = $('featureSectionsAnchor') as HTMLElement;
const toPretty = $('toPretty') as HTMLButtonElement;
const copyFeature = $('copyFeature') as HTMLButtonElement;
const clearFeature = $('clearFeature') as HTMLButtonElement;
const goIntegrateBtn = $('goIntegrateBtn') as HTMLButtonElement;
const goIntegrateHint = $('goIntegrateHint') as HTMLElement | null;

trackPageView('generate', { path: window.location.pathname });

const TEST_SESSION_KEY = 'intentionGeneratedTests';

type StoredTest = {
  feature: string;
  featureTitle: string;
  tests?: string;
};

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

function writeStoredTests(data: StoredTest[]) {
  try {
    sessionStorage.setItem(TEST_SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function clearStoredTests() {
  try {
    sessionStorage.removeItem(TEST_SESSION_KEY);
  } catch {}
}

function syncStoredTests(features: string[]): StoredTest[] {
  if (!features.length) {
    clearStoredTests();
    return [];
  }
  const prev = readStoredTests();
  const next = features.map((feature, idx) => {
    const previous = prev[idx];
    const keepPrev = Boolean(previous && previous.feature.trim() === feature.trim());
    const featureSource = keepPrev ? previous!.feature : feature;
    return {
      feature: featureSource,
      featureTitle: getFeatureTitle(featureSource),
      tests: keepPrev ? previous!.tests : previous?.tests,
    };
  });
  writeStoredTests(next);
  return next;
}

function persistGeneratedTest(index: number, featureSource: string, tests: string) {
  try {
    const current = readStoredTests();
    while (current.length <= index) {
      current.push({ feature: '', featureTitle: `Feature ${current.length + 1}` });
    }
    current[index] = {
      feature: featureSource,
      featureTitle: getFeatureTitle(featureSource),
      tests,
    };
    writeStoredTests(current);
  } catch {}
}

function loadFromSession() {
  try {
    const payload = sessionStorage.getItem('gherkinPayload');
    if (payload && input) {
      input.value = payload;
      trackEvent('generate_loadFromSession', { length: payload.length });
    }
  } catch {}
}

function highlight(el: HTMLElement | null) {
  if (!el) return;
  try {
    // If previously highlighted, clear the flag so hljs can re-run
    if ((el as any).dataset && (el as any).dataset.highlighted) {
      delete (el as any).dataset.highlighted;
    }
    hljs.highlightElement(el);
  } catch {}
}

function sanitizeGherkin(src: string): string {
  // Remove Markdown-style code fences like ``` or ```gherkin
  return src
    .split(/\r?\n/)
    .filter((line) => !/^```/.test(line.trim()))
    .join('\n')
    .trim();
}

function splitFeatures(src: string): string[] {
  const lines = src.split(/\r?\n/);
  const features: string[] = [];
  let buffer: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*Feature\s*:/.test(line)) {
      if (buffer.length) {
        features.push(buffer.join('\n').trim());
        buffer = [];
      }
    }
    buffer.push(line);
  }
  if (buffer.length) features.push(buffer.join('\n').trim());
  return features.filter(Boolean);
}

function getFeatureTitle(featSource: string): string {
  const m = featSource.match(/^\s*Feature\s*:\s*(.+)$/m);
  if (m && m[1]) return `Feature: ${m[1].trim()}`;
  const first = (featSource.split(/\r?\n/).find((l) => l.trim().length > 0) || '').trim();
  return first || 'Feature';
}

function renderFeatureSections(features: string[]) {
  if (!featureSectionsAnchor) return;
  featureSectionsAnchor.textContent = '';
  trackEvent('generate_renderFeatures', { count: features.length });
  const stored = syncStoredTests(features);
  stored.forEach((storedFeat, idx) => {
    const row = document.createDocumentFragment();

    const left = document.createElement('div');
    left.className = 'card';
    const leftTitle = document.createElement('h3');
    leftTitle.textContent = storedFeat.featureTitle;
    const ta = document.createElement('textarea');
    ta.value = storedFeat.feature;
    ta.style.width = '100%';
    ta.style.minHeight = '200px';
    ta.style.background = '#0f172a';
    ta.style.color = '#e5e7eb';
    ta.style.border = '1px solid #1f2937';
    ta.style.borderRadius = '8px';
    ta.style.padding = '12px';
    ta.style.fontFamily = 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace';
    const leftActions = document.createElement('div');
    leftActions.className = 'actions';
    leftActions.style.marginTop = '8px';
    const btnGen = document.createElement('button');
    btnGen.textContent = 'Generate Tests';
    const btnCopy = document.createElement('button'); btnCopy.textContent = 'Copy Feature';
    btnCopy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        trackEvent('generate_copyFeature', { featureIndex: idx, length: ta.value.length });
      } catch {}
    };
    leftActions.appendChild(btnGen);
    leftActions.appendChild(btnCopy);
    left.appendChild(leftTitle);
    left.appendChild(ta);
    left.appendChild(leftActions);

    const right = document.createElement('div');
    right.className = 'card';
    const rightTitle = document.createElement('h3'); rightTitle.textContent = 'Generated Tests';
    const pre = document.createElement('pre'); pre.className = 'code';
    const codeEl = document.createElement('code'); codeEl.className = 'language-typescript';
    pre.appendChild(codeEl);
    right.appendChild(rightTitle);
    right.appendChild(pre);

    if (storedFeat.tests) {
      codeEl.textContent = storedFeat.tests;
      highlight(codeEl);
    }

    btnGen.onclick = async () => {
      codeEl.textContent = '// Generating...'; highlight(codeEl);
      trackEvent('generate_featureTestsRequested', {
        featureIndex: idx,
        featureTitle: leftTitle.textContent || undefined,
        length: ta.value.length,
      });
      try {
        const gen = new TestGeneratorFromSource();
        gen.compileGherkinFromSource(ta.value || '');
        const steps = gen.compileKnownStepsFromSource('');
        const code = gen.generateGherkinFromSource(steps, ta.value || '') || '';
        codeEl.textContent = code; highlight(codeEl);
        storedFeat.tests = code;
        const updatedTitle = getFeatureTitle(ta.value || '');
        storedFeat.feature = ta.value || '';
        storedFeat.featureTitle = updatedTitle;
        leftTitle.textContent = updatedTitle;
        persistGeneratedTest(idx, ta.value || '', code);
        updateIntegrateButton(readStoredTests());
        trackEvent('generate_featureTestsResult', {
          featureIndex: idx,
          status: 'success',
          length: code.length,
          persisted: true,
        });
      } catch (e: any) {
        codeEl.textContent = `// Error generating tests: ${e?.message || String(e)}`; highlight(codeEl);
        trackEvent('generate_featureTestsResult', {
          featureIndex: idx,
          status: 'error',
          message: e?.message || String(e),
        });
      }
    };

    ta.addEventListener('input', () => {
      storedFeat.feature = ta.value || '';
      storedFeat.featureTitle = getFeatureTitle(storedFeat.feature);
      leftTitle.textContent = storedFeat.featureTitle;
      persistGeneratedTest(idx, storedFeat.feature, storedFeat.tests || '');
      updateIntegrateButton(readStoredTests());
    });

    row.appendChild(left);
    row.appendChild(right);
    featureSectionsAnchor.parentNode?.insertBefore(row, featureSectionsAnchor);
  });
  updateIntegrateButton(stored);
}

function updateIntegrateButton(stored: StoredTest[]) {
  if (!goIntegrateBtn) return;
  const hasTests = stored.some((entry) => Boolean(entry.tests && entry.tests.trim()));
  const enable = hasTests;
  goIntegrateBtn.disabled = !enable;
  goIntegrateBtn.classList.toggle('ready', enable);
  if (goIntegrateHint) {
    goIntegrateHint.textContent = enable
      ? 'Ready — this opens Step 3 to preview integration guidance.'
      : 'Generate tests to unlock Step 3.';
    goIntegrateHint.dataset.state = enable ? 'ready' : 'disabled';
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// wire events
toPretty?.addEventListener('click', () => {
  if (!input) return;
  const cleaned = sanitizeGherkin(input.value || '');
  const feats = splitFeatures(cleaned);
  trackEvent('generate_toPretty', {
    featureCount: feats.length,
    hadInput: Boolean(cleaned.length),
  });
  renderFeatureSections(feats);
});
copyFeature?.addEventListener('click', async () => {
  try {
    const value = input?.value || '';
    await navigator.clipboard.writeText(value);
    trackEvent('generate_copyRaw', { length: value.length });
  } catch {}
});
clearFeature?.addEventListener('click', () => {
  if (input && input.value) {
    trackEvent('generate_clear', { length: input.value.length });
    input.value = '';
  } else if (input) {
    input.value = '';
  }
  if (featureSectionsAnchor) featureSectionsAnchor.textContent = '';
  clearStoredTests();
  try { sessionStorage.removeItem('gherkinPayload'); } catch {}
  updateIntegrateButton([]);
});

loadFromSession();
// Auto-split on load if payload exists
if (input && input.value) {
  const cleaned = sanitizeGherkin(input.value || '');
  const feats = splitFeatures(cleaned);
  renderFeatureSections(feats);
}

input?.addEventListener('input', () => {
  try { sessionStorage.setItem('gherkinPayload', input.value || ''); } catch {}
  updateIntegrateButton(readStoredTests());
});

goIntegrateBtn?.classList.add('step-button');
goIntegrateBtn?.setAttribute('aria-label', 'Next · Step 3 of 3: Preview integration guidance');
goIntegrateBtn?.addEventListener('click', () => {
  try { sessionStorage.setItem('gherkinPayload', input?.value || ''); } catch {}
  const stored = readStoredTests();
  const hasTests = stored.some((entry) => Boolean(entry.tests && entry.tests.trim()));
  trackEvent('generate_goIntegrate', {
    featureCount: stored.length,
    hasTests,
  });
  window.location.href = '/integrate.html';
});

updateIntegrateButton(readStoredTests());
