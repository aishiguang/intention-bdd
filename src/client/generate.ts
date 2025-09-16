import { TestGeneratorFromSource } from 'jest-bdd-generator/lib/gherkin-to-test';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import gherkin from 'highlight.js/lib/languages/gherkin';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('gherkin', gherkin);

declare global { interface Window { hljs?: any } }

const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

const input = $('gherkinInput') as HTMLTextAreaElement;
const featureSections = $('featureSections') as HTMLElement;
const toPretty = $('toPretty') as HTMLButtonElement;
const copyFeature = $('copyFeature') as HTMLButtonElement;
const clearFeature = $('clearFeature') as HTMLButtonElement;

function loadFromSession() {
  try {
    const payload = sessionStorage.getItem('gherkinPayload');
    if (payload && input) input.value = payload;
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
  if (!featureSections) return;
  featureSections.innerHTML = '';
  features.forEach((feat, idx) => {
    const row = document.createElement('div');
    row.className = 'split';

    const left = document.createElement('div');
    left.className = 'card';
    const leftTitle = document.createElement('h3');
    leftTitle.textContent = getFeatureTitle(feat);
    const ta = document.createElement('textarea');
    ta.value = feat;
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
    btnCopy.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); } catch {} };
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

    btnGen.onclick = async () => {
      codeEl.textContent = '// Generating...'; highlight(codeEl);
      try {
        const gen = new TestGeneratorFromSource();
        gen.compileGherkinFromSource(ta.value || '');
        const steps = gen.compileKnownStepsFromSource('');
        const code = gen.generateGherkinFromSource(steps, ta.value || '') || '';
        codeEl.textContent = code; highlight(codeEl);
      } catch (e: any) {
        codeEl.textContent = `// Error generating tests: ${e?.message || String(e)}`; highlight(codeEl);
      }
    };

    row.appendChild(left);
    row.appendChild(right);
    featureSections.appendChild(row);
  });
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
  renderFeatureSections(feats);
});
copyFeature?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(input?.value || ''); } catch {} });
clearFeature?.addEventListener('click', () => { if (input) input.value = ''; if (featureSections) featureSections.innerHTML = ''; });

loadFromSession();
// Auto-split on load if payload exists
if (input && input.value) {
  const cleaned = sanitizeGherkin(input.value || '');
  const feats = splitFeatures(cleaned);
  renderFeatureSections(feats);
}
