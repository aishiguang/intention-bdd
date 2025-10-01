import loader from '@monaco-editor/loader';
import type * as monacoEditor from 'monaco-editor';

loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.46.0/min/vs',
  },
});

const monacoReady = loader
  .init()
  .then((monaco) => {
    const hasGherkin = monaco.languages.getLanguages().some((lang) => lang.id === 'gherkin');
    if (!hasGherkin) {
      monaco.languages.register({ id: 'gherkin' });
      monaco.languages.setMonarchTokensProvider('gherkin', {
        tokenizer: {
          root: [
            [/^\s*#.*/, 'comment'],
            [/^\s*(Feature|Background|Scenario Outline|Scenario|Examples)\s*:/, 'keyword'],
            [/^\s*(Given|When|Then|And|But)\b/, 'keyword'],
            [/"[^"]*"/, 'string'],
            [/\<[^>]+\>/, 'type'],
            [/\b\d+\b/, 'number'],
          ],
        },
      });
    }

    monaco.editor.defineTheme('intention-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '93c5fd' },
        { token: 'comment', foreground: '64748b' },
        { token: 'string', foreground: 'facc15' },
        { token: 'type', foreground: '86efac' },
      ],
      colors: {
        'editor.background': '#0f172a',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#cbd5f5',
        'editorLineHighlightBackground': '#17255450',
      },
    });

    monaco.editor.setTheme('intention-dark');
    return monaco;
  })
  .catch((err) => {
    console.error('Failed to initialise Monaco', err);
    throw err;
  });

export type Monaco = typeof monacoEditor;
export type CodeEditor = monacoEditor.editor.IStandaloneCodeEditor;
export type EditorOptions = monacoEditor.editor.IStandaloneEditorConstructionOptions;

export async function getMonaco() {
  return monacoReady;
}

export async function createEditor(
  container: HTMLElement,
  options: EditorOptions,
) {
  const monaco = await monacoReady;
  return monaco.editor.create(container, {
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    renderWhitespace: 'none',
    wordWrap: 'on',
    smoothScrolling: true,
    ...options,
  });
}
