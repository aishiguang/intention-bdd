import { TestGeneratorFromSource } from 'jest-bdd-generator/lib/gherkin-to-test';
import type { CodeEditor, EditorOptions } from './monaco';
import { createEditor as createMonacoEditor } from './monaco';
import { trackEvent, trackPageView } from './telemetry';

const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

const featureSectionsAnchor = $('featureSectionsAnchor') as HTMLElement;
const goIntegrateBtn = $('goIntegrateBtn') as HTMLButtonElement;
const goIntegrateHint = $('goIntegrateHint') as HTMLElement | null;

let trackedEditors: CodeEditor[] = [];

function disposeTrackedEditors() {
  trackedEditors.forEach((editor) => {
    try {
      editor.dispose();
    } catch {}
  });
  trackedEditors = [];
}

async function createTrackedEditor(
  container: HTMLElement,
  options: EditorOptions,
  track = true,
) {
  const editor = await createMonacoEditor(container, options);
  if (track) trackedEditors.push(editor);
  return editor;
}

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
  disposeTrackedEditors();
  featureSectionsAnchor.textContent = '';
  trackEvent('generate_renderFeatures', { count: features.length });
  const stored = syncStoredTests(features);
  stored.forEach((storedFeat, idx) => {
    const row = document.createDocumentFragment();

    const left = document.createElement('div');
    left.className = 'card';
    const leftTitle = document.createElement('h3');
    leftTitle.textContent = storedFeat.featureTitle;
    const featureEditorHost = document.createElement('div');
    featureEditorHost.className = 'monaco-host monaco-host--gherkin';
    const leftActions = document.createElement('div');
    leftActions.className = 'actions';
    leftActions.style.marginTop = '8px';
    const btnGen = document.createElement('button');
    btnGen.textContent = 'Generate Tests';
    btnGen.disabled = true;
    const btnCopy = document.createElement('button');
    btnCopy.textContent = 'Copy Feature';
    btnCopy.disabled = true;
    leftActions.appendChild(btnGen);
    leftActions.appendChild(btnCopy);
    left.appendChild(leftTitle);
    left.appendChild(featureEditorHost);
    left.appendChild(leftActions);

    const right = document.createElement('div');
    right.className = 'card';
    const rightTitle = document.createElement('h3');
    rightTitle.textContent = 'Preview Tests';
    const testsEditorHost = document.createElement('div');
    testsEditorHost.className = 'monaco-host monaco-host--code';
    right.appendChild(rightTitle);
    right.appendChild(testsEditorHost);

    row.appendChild(left);
    row.appendChild(right);
    featureSectionsAnchor.parentNode?.insertBefore(row, featureSectionsAnchor);

    void (async () => {
      try {
        const [featureEditor, testsEditor] = await Promise.all([
          createTrackedEditor(featureEditorHost, {
            language: 'gherkin',
            value: storedFeat.feature || '',
            wordWrap: 'off',
          }),
          createTrackedEditor(testsEditorHost, {
            language: 'typescript',
            value: storedFeat.tests || '// Generate tests to preview the Jest output',
            readOnly: true,
            wordWrap: 'off',
          }),
        ]);

        btnGen.disabled = false;
        btnCopy.disabled = false;

        let generating = false;

        const syncFeatureState = () => {
          const latestValue = featureEditor.getValue();
          storedFeat.feature = latestValue;
          storedFeat.featureTitle = getFeatureTitle(latestValue);
          leftTitle.textContent = storedFeat.featureTitle;
          persistGeneratedTest(idx, storedFeat.feature, storedFeat.tests || '');
          updateIntegrateButton(readStoredTests());
        };

        featureEditor.onDidChangeModelContent(syncFeatureState);

        btnCopy.onclick = async () => {
          try {
            const value = featureEditor.getValue();
            await navigator.clipboard.writeText(value);
            trackEvent('generate_copyFeature', { featureIndex: idx, length: value.length });
          } catch {}
        };

        const runGenerate = async () => {
          if (generating) return;
          generating = true;
          btnGen.disabled = true;
          const featureSource = featureEditor.getValue() || '';
          const previousTests = storedFeat.tests || testsEditor.getValue() || '';
          testsEditor.setValue('// Generating...');
          trackEvent('generate_featureTestsRequested', {
            featureIndex: idx,
            featureTitle: leftTitle.textContent || undefined,
            length: featureSource.length,
          });
          try {
            const gen = new TestGeneratorFromSource();
            gen.compileGherkinFromSource(featureSource);
            const steps = gen.compileKnownStepsFromSource(previousTests) || [];

            // gherkinSource?.feature?.children?.forEach(...) // existing WIP logic intentionally left out
            const code = gen.generateGherkinFromSource(steps, featureSource) || '';
            const rendered = code.trim().length ? code : '// No tests generated';

            testsEditor.setValue(rendered);
            storedFeat.tests = rendered;
            const updatedTitle = getFeatureTitle(featureSource);
            storedFeat.featureTitle = updatedTitle;
            leftTitle.textContent = updatedTitle;
            persistGeneratedTest(idx, featureSource, rendered);
            updateIntegrateButton(readStoredTests());
            trackEvent('generate_featureTestsResult', {
              featureIndex: idx,
              status: 'success',
              length: rendered.length,
              persisted: true,
            });
          } catch (e: any) {
            const message = e?.message || String(e);
            const errorText = `// Error generating tests: ${message}`;
            testsEditor.setValue(errorText);
            trackEvent('generate_featureTestsResult', {
              featureIndex: idx,
              status: 'error',
              message,
            });
          } finally {
            generating = false;
            btnGen.disabled = false;
          }
        };

        btnGen.addEventListener('click', () => {
          void runGenerate();
        });

        if (!storedFeat.tests) {
          storedFeat.tests = testsEditor.getValue();
        }

        void runGenerate();
      } catch (error) {
        testsEditorHost.textContent = 'Unable to load editors. Please reload the page.';
        console.error('Failed to initialize feature editors', error);
      }
    })();
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

function loadFromSession() {
  try {
    const payload = sessionStorage.getItem('gherkinPayload');
    if (payload) {
    const cleaned = sanitizeGherkin(payload || '');
    const feats = splitFeatures(cleaned);
    renderFeatureSections(feats);
      trackEvent('generate_loadFromSession', { length: payload.length });
    }
  } catch {}
}

loadFromSession();

goIntegrateBtn?.classList.add('step-button');
goIntegrateBtn?.setAttribute('aria-label', 'Next · Step 3 of 3: Preview integration guidance');
goIntegrateBtn?.addEventListener('click', () => {
  const stored = readStoredTests();
  const hasTests = stored.some((entry) => Boolean(entry.tests && entry.tests.trim()));
  trackEvent('generate_goIntegrate', {
    featureCount: stored.length,
    hasTests,
  });
  window.location.href = '/integrate.html';
});

updateIntegrateButton(readStoredTests());
