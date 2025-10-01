import type { CodeEditor } from './monaco';
import { createEditor } from './monaco';
import { trackEvent, trackPageView } from './telemetry';
import { JestToGherkin } from 'jest-bdd-generator/lib/jest-to-gherkin';

type StoredTest = {
  feature: string;
  featureTitle: string;
  tests?: string;
};

const TEST_SESSION_KEY = 'intentionGeneratedTests';

const summaryEl = document.getElementById('integrationSummary') as HTMLElement | null;
const testsContainer = document.getElementById('integrationTestsEditor') as HTMLElement | null;
const gherkinContainer = document.getElementById('integrationGherkinEditor') as HTMLElement | null;
const copyBtn = document.getElementById('copyAllTests') as HTMLButtonElement | null;
const downloadBtn = document.getElementById('downloadAllTests') as HTMLButtonElement | null;
const clearSessionBtn = document.getElementById('clearSession') as HTMLButtonElement | null;

let aggregatedTests = '';
let gherkinSource = '';
let testsEditor: CodeEditor | null = null;
let testsEditorPromise: Promise<CodeEditor> | null = null;
let gherkinEditor: CodeEditor | null = null;
let gherkinEditorPromise: Promise<CodeEditor> | null = null;
const TESTS_PLACEHOLDER = '// Generated tests will appear here';
const GHERKIN_PLACEHOLDER = '# Gherkin from Step 2 will appear here';

trackPageView('integrate', { path: window.location.pathname });

if (testsContainer) {
  testsContainer.textContent = '';
  testsEditorPromise = createEditor(testsContainer, {
    language: 'typescript',
    value: aggregatedTests || TESTS_PLACEHOLDER,
    readOnly: true,
    wordWrap: 'on',
  });
  testsEditorPromise.then((editor) => {
    testsEditor = editor;
    updateEditors();
  })
    .catch(() => {
      testsContainer.textContent = aggregatedTests || TESTS_PLACEHOLDER;
    });
}

if (gherkinContainer) {
  gherkinContainer.textContent = '';
  gherkinEditorPromise = createEditor(gherkinContainer, {
    language: 'gherkin',
    value: gherkinSource || GHERKIN_PLACEHOLDER,
    readOnly: true,
    wordWrap: 'off',
  });
  gherkinEditorPromise.then((editor) => {
    gherkinEditor = editor;
    updateEditors();
  })
    .catch(() => {
      gherkinContainer.textContent = gherkinSource || GHERKIN_PLACEHOLDER;
    });
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

function updateEditors() {
  const testsContent = aggregatedTests || TESTS_PLACEHOLDER;
  if (testsEditorPromise) {
    testsEditorPromise.then(() => testsEditor!.setValue(testsContent));
  } else if (testsContainer) {
    testsContainer.textContent = testsContent;
  }
  const gherkinContent = gherkinSource || GHERKIN_PLACEHOLDER;
  if (gherkinEditorPromise) {
    gherkinEditorPromise.then(() => gherkinEditor!.setValue(gherkinContent));
  } else if (gherkinContainer) {
    gherkinContainer.textContent = gherkinContent;
  }
}

function refresh() {
  const stored = readStoredTests();
  const rawTests = stored
    .map((entry) => `describe('${entry.featureTitle}', ()=> {\n${(entry.tests || '')}});`.trim())
    .filter((block) => block.length > 0);
  aggregatedTests = rawTests.join('\n\n');
  if (rawTests.length) {
    try {
      const jestCompiler = new JestToGherkin();
      jestCompiler.transpile(rawTests[0], { fileName: 'generated-tests.spec.ts' });
      jestCompiler.output.forEach((steps) => {
        console.debug('Generated steps from Jest preview', steps);
      });
    } catch (err) {
      console.debug('jest-to-gherkin transpile failed', err);
    }
  }

  gherkinSource = readGherkin();
  updateEditors();

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
  } catch { }
  aggregatedTests = '';
  gherkinSource = '';
  refresh();
  trackEvent('integrate_clearSession');
});

refresh();

if (!aggregatedTests) {
  disableActions();
}
// initialize();
if (gherkinSource) {
  trackEvent('integrate_loadedGherkin', { length: gherkinSource.length });
}
