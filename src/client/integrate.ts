import type { CodeEditor } from './monaco';
import { createEditor } from './monaco';
import { trackEvent, trackPageView } from './telemetry';
import { JestToGherkin } from 'jest-bdd-generator/lib/jest-to-gherkin';
import { TestGeneratorFromSource } from "jest-bdd-generator/lib/gherkin-to-test";

type StoredTest = {
  feature: string;
  featureTitle: string;
  tests?: string;
};

const TEST_SESSION_KEY = 'intentionGeneratedTests';

const summaryEl = document.getElementById('integrationSummary') as HTMLElement | null;
const testsContainer = document.getElementById('integrationTestsEditor') as HTMLElement | null;
const stepsEditorContainer = document.getElementById('jestStepEditor') as HTMLDivElement | null;
const gherkinContainer = document.getElementById('integrationGherkinEditor') as HTMLElement | null;
const copyBtn = document.getElementById('copyAllTests') as HTMLButtonElement | null;
const downloadBtn = document.getElementById('downloadAllTests') as HTMLButtonElement | null;
const clearSessionBtn = document.getElementById('clearSession') as HTMLButtonElement | null;
const stepsDashboarder = document.getElementById('stepsDashboarder') as HTMLDivElement | null;
const previewTestsBtn = document.getElementById('previewTestsBtn') as HTMLButtonElement | null;

let aggregatedTests = '';
let gherkinSource = '';
let testsEditor: CodeEditor | null = null;
let gherkinEditor: CodeEditor | null = null;
let gherkinEditorPromise: Promise<CodeEditor> | null = null;
const TESTS_PLACEHOLDER = '// Generated tests will appear here';
const GHERKIN_PLACEHOLDER = '# Gherkin from Step 2 will appear here';

trackPageView('integrate', { path: window.location.pathname });

function prepareJestEditor (id: string) {
  let testsEditorPromise: Promise<CodeEditor>;
  const testsContainer = document.getElementById(id);
  if (testsContainer) {
    testsContainer.textContent = '';
    
    testsEditorPromise = createEditor(testsContainer, {
      language: 'typescript',
      value: aggregatedTests || TESTS_PLACEHOLDER,
      wordWrap: 'on',
    });
    testsEditorPromise.then((editor) => {
      testsEditor = editor;
      updateEditors();
    })
    .catch(() => {
      testsContainer.textContent = aggregatedTests || TESTS_PLACEHOLDER;
    });
    return testsEditorPromise;
  } else {
    return Promise.reject('Unavailable Editor DOM');
  }
}

const jestEditorPromise = prepareJestEditor('integrationTestsEditor');
const stepEditorPromise = prepareJestEditor('stepEditor');


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
  // if (testsEditorPromise) {
  //   testsEditorPromise.then(() => testsEditor!.setValue(testsContent));
  // } else if (testsContainer) {
  //   testsContainer.textContent = testsContent;
  // }
  const gherkinContent = gherkinSource || GHERKIN_PLACEHOLDER;
  if (gherkinEditorPromise) {
    gherkinEditorPromise.then(() => gherkinEditor!.setValue(gherkinContent));
  } else if (gherkinContainer) {
    gherkinContainer.textContent = gherkinContent;
  }
}

function refresh() {
  const stored = readStoredTests();

  const stepsMapped: {
    engine: TestGeneratorFromSource;
    gherkin: string;
    jest: string;
  }[] = [];
  stored.forEach((plan, idx) => {
    if (idx > 0) return;
    const engine = new TestGeneratorFromSource();
    engine.compileGherkinFromSource(plan.feature);

    const planTitle = plan.featureTitle.replace(/'/g, '\\\'')
    const codeJest = `describe('${planTitle}', () => {${plan.tests}})`;

    const steps = engine.compileKnownStepsFromSource(codeJest) || [];
    jestEditorPromise.then((editor) => editor.setValue(JSON.stringify(steps, null, 2)));
    
    stepsMapped[idx] = { engine, gherkin: plan.feature, jest: codeJest };

    // const ret = engine.generateGherkinFromSource(steps, plan.feature) ?? '';

    let stepEditing: typeof steps[0];
    //jestCompiler.uniqueSteps
    steps.forEach(step => {
      const stepWrapper = document.createElement('div');
      stepWrapper.textContent = `${step.key} ${step.value}`;
      stepWrapper.className = step.key;
      if (['Given', 'When', 'Then'].includes(step.key)) {
        stepWrapper.addEventListener('click', (e) => {
          stepsDashboarder?.querySelectorAll('.active').forEach(item => {
            item.classList.remove('active');
          })
          stepsDashboarder?.querySelectorAll('div').forEach(el => {
            if (el.textContent === stepWrapper.textContent) {
              el.classList.add('active');
            }
          })
          stepEditorPromise.then(editor => {
            const val = [`// ref: ${step.sourceCode?.imports}`];
            val.push(`// def: ${step.sourceCode?.exports}`)
            editor.setValue(step.sourceCode?.statements?.map(s => s.getFullText()).join('\n') ?? '//implement here');
            stepEditing = step;
          });
        });
      }
      stepsDashboarder?.appendChild(stepWrapper);
    });

    previewTestsBtn?.addEventListener('click', () => {
      if (stepEditing?.sourceCode) {
        stepEditorPromise.then(editor => {
          const ret: string[] = [];
          const insertCode = [
            stepsMapped[idx].jest.substring(0, stepEditing.pos.start.pos),
            editor.getValue(),
            stepsMapped[idx].jest.substring(stepEditing.pos.end.pos),
          ].join('');
          stepsMapped[idx].engine = new TestGeneratorFromSource();
          // const stepsUpdated = stepsMapped[idx].engine.compileKnownStepsFromSource(insertCode);

          const compiler = new JestToGherkin();
          compiler.transpile(insertCode, { fileName: 'preview.test.ts'});
          const stepsUpdated = compiler.output;

          const stepUpdate = stepsUpdated.find(s => s.key === stepEditing.key && s.value === stepEditing.value && s.parent === stepEditing.parent)!

          if (!stepUpdate?.sourceCode)  {
            throw new Error('Step not found after update');
          }

          steps.forEach(step => {
            if (step.key === stepEditing.key && step.value === stepEditing.value) {
              step.sourceCode = {...stepUpdate.sourceCode!};
            }
          });
          
          ret.push(stepsMapped[idx].engine.generateGherkinFromSource(stepsUpdated, stepsMapped[idx].gherkin) ?? '');
          
          const jest = ret.join('\n//-------\n');
          jestEditorPromise.then(editor => {
            editor.setValue(jest);
          });

          stored[idx].tests = jest
          stepsMapped[idx].jest = `describe('${planTitle}', () => {${jest}})`;
          sessionStorage.setItem(TEST_SESSION_KEY, JSON.stringify(stored) );
          // steps = stepsUpdated
        });

      };
    });

  })
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
