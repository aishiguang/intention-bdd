import https from 'https';

function httpJsonPost(host: string, pathName: string, apiKey: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        path: pathName,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        let chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(text);
            if (res.statusCode && res.statusCode >= 400) {
              const msg = json?.error?.message || `HTTP ${res.statusCode}`;
              return reject(new Error(`OpenAI error: ${msg}`));
            }
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Link-based generation using OpenAI web tools; no on-disk clone used
export async function generateGherkinFromLink(
  repoUrl: string,
  onInfo?: (message: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_SECRET as string;
  if (!apiKey) throw new Error('Missing OPENAI_API_SECRET');
  const model = process.env.OPENAI_API_MODEL || 'gpt-4.1-mini';

  const allow = String(process.env.OPENAI_ALLOW_WEB || '').toLowerCase() === 'true';
  if (!allow) throw new Error('OPENAI_ALLOW_WEB not enabled');

  onInfo?.(`Using OpenAI link-based analyzer (model: ${model})`);

  // Step 1: Plan — get a concise repo understanding and test seams
  const planPrompt = [
    'You are a senior QA engineer and TypeScript expert. Visit the repository and produce a concise plan for testability.',
    'Summarize main modules, key classes/functions, external boundaries (APIs/DB/fs/network), and seams for unit tests.',
    'List candidate units to test and notable edge cases. Keep it under 400 words as bullets.',
  ].join(' ');

  const planText = await responsesCallWithPolling(
    model,
    [{ type: 'input_text', text: `${planPrompt}\n\nRepository URL: ${repoUrl}` }],
    apiKey,
    onInfo,
  );

  if (planText) {
    onInfo?.(`Planning completed (${planText.length} chars)`);
    // Structured info for UI panel
    onInfo?.(`::plan::\n${planText}`);
  }

  // Step 2: Generate Gherkin — unit-leaning E2E-style steps suitable for Jest
  const genPrompt = [
    'Generate ONLY valid Gherkin for this repository, leaning towards unit-testable steps that map well to Jest.',
    'Organize the output into THREE clearly separated Features with tags and optional brief comments (# lines):',
    "1) Feature: End-to-End Summary @e2e @summary — 3-6 scenarios that summarize the core user-visible flows.",
    "2) Feature: Execution Details @unit @insights — 5-10 scenarios per key module/class/function with fine-grained Given/When/Then that a Jest test can drive directly (dependencies mocked). Prepend short # Insight comments when helpful.",
    "3) Feature: Edge Cases & Diagnostics @unit @edge @debug — 6-10 scenarios covering invalid inputs, timeouts, retries, boundaries, and logging/observability hooks.",
    'Strict formatting rules for demo values and parameters:',
    '- Every Scenario MUST be a Scenario Outline with an Examples table (even if there is only one row).',
    '- Place ALL demo/input/expected/config values ONLY in the Examples table as strictly valid, compact JSON (minified, single-line).',
    "- Reference example columns in steps using angle-bracket placeholders like <input>, <config>, <params>, <expected>.",
    "- Choose clear column names: input, params, config, expected, context, etc.",
    '- If a value is scalar, still wrap it as JSON (e.g., "true", "\"mode\"", "123").',
    '- Prefer multiple rows when natural; otherwise provide at least one row with JSON values.',
    'Guidelines:',
    "- Use steps like: 'Given module X with dependency Y mocked', 'And input <input>', 'When calling function X.fn with <params>', 'Then it returns <expected>/throws/updates state/calls Y with <params>'.",
    '- Prefer small, verifiable steps over vague prose.',
    '- Do NOT use markdown fences or code blocks; comments with # are allowed inside Gherkin.',
  ].join('\n');

  const contextSnippet = planText ? `\n\nPlanning context:\n${planText}` : '';

  const gherkinInitial = await responsesCallWithPolling(
    model,
    [{ type: 'input_text', text: `${genPrompt}${contextSnippet}\n\nRepository URL: ${repoUrl}` }],
    apiKey,
    onInfo,
    true,
  );

  if (!gherkinInitial) throw new Error('OpenAI link-based response was empty');

  // Step 3: Refine — ensure structure and ordering are as requested (no web tools needed)
  onInfo?.('Refining Gherkin organization and structure');
  const refinePrompt = [
    'Reorganize and validate the following Gherkin to strictly follow this order and labeling:',
    "1) Feature: End-to-End Summary @e2e @summary",
    "2) Feature: Execution Details @unit @insights",
    "3) Feature: Edge Cases & Diagnostics @unit @edge @debug",
    'Enforce these constraints:',
    '- Every Scenario MUST be a Scenario Outline with an Examples table, even for a single example.',
    '- ALL demo/input/expected/config values MUST be strictly valid, compact JSON and live ONLY in the Examples table.',
    '- Steps MUST reference example values via <...> placeholders (e.g., <input>, <config>, <expected>).',
    '- Keep steps concise and unit-testable; # Insight comments allowed sparingly.',
    'Output ONLY Gherkin.',
    '\n\nGherkin to reorganize:',
    gherkinInitial,
  ].join('\n');

  const gherkinRefined = await responsesCallWithPolling(
    model,
    [{ type: 'input_text', text: refinePrompt }],
    apiKey,
    onInfo,
    false,
  );

  return (gherkinRefined || gherkinInitial).trim();
}

// Call OpenAI Responses API with web tools and poll until completion.
async function responsesCallWithPolling(
  model: string,
  contentParts: Array<{ type: string; text: string }>,
  apiKey: string,
  onInfo?: (m: string) => void,
  useWebTools: boolean = true,
): Promise<string | null> {
  const bodyObj: any = {
    model,
    input: [
      {
        role: 'user',
        content: contentParts,
      },
    ],
    ...(useWebTools ? { tools: [{ type: 'web_search' }], tool_choice: 'auto' } : {}),
    temperature: 0.2,
  };
  let data = await httpJsonPost('api.openai.com', '/v1/responses', apiKey, JSON.stringify(bodyObj));
  if (data?.status && data.status !== 'completed' && data.id) {
    onInfo?.(`OpenAI status: ${data.status}. Polling for completion...`);
    const start = Date.now();
    const timeoutMs = Number(process.env.OPENAI_POLL_TIMEOUT_MS || 45000);
    const intervalMs = 1500;
    while (Date.now() - start < timeoutMs) {
      await sleep(intervalMs);
      const latest = await httpJsonGet('api.openai.com', `/v1/responses/${data.id}`, apiKey);
      if (latest?.status) data.status = latest.status;
      if (latest?.output) data.output = latest.output;
      if (latest?.output_text) data.output_text = latest.output_text;
      if (latest?.error) data.error = latest.error;
      if (data.status === 'completed') break;
      if (data.status === 'failed' || data.status === 'expired' || data.status === 'cancelled') break;
    }
  }
  const text = extractResponseText(data);
  return text ? text.trim() : null;
}

function extractResponseText(resp: any): string | null {
  if (!resp) return null;
  if (typeof resp.output_text === 'string' && resp.output_text.trim()) return resp.output_text;
  // Some variants return an `output` array with content parts
  const out = resp.output;
  if (Array.isArray(out)) {
    const parts: string[] = [];
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
          else if (typeof c?.text === 'string') parts.push(c.text);
        }
      }
    }
    if (parts.length) return parts.join('\n').trim();
  }
  // Fall back to chat-style structure (defensive)
  const choice = resp?.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) return choice;
  return null;
}

function httpJsonGet(host: string, pathName: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        path: pathName,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(text);
            if (res.statusCode && res.statusCode >= 400) {
              const msg = json?.error?.message || `HTTP ${res.statusCode}`;
              return reject(new Error(`OpenAI error: ${msg}`));
            }
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
