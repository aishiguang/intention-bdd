import type express from 'express';
import { jobs, type Job, SSEmanager } from '../lib/jobs';
import { parseRepoInput, buildRepoUrl } from '../lib/gh';
import { generateGherkinFromLink } from '../lib/analyze';

export function registerGenerate(app: express.Express) {
  app.post('/api/generate', async (req, res) => {
    const { repo, branch } = req.body || {};
    if (!repo || typeof repo !== 'string') {
      return res.status(400).json({ error: 'Missing repo. Provide owner/repo or GitHub URL.' });
    }
    let parsed;
    try {
      parsed = parseRepoInput(repo);
      if (branch && typeof branch === 'string') parsed.branch = branch;
    } catch (e: any) {
      return res.status(400).json({ error: e.message || 'Invalid repo' });
    }

    const id = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : Math.random().toString(36).slice(2);
    const job: Job = { id, status: 'pending', logs: [], subscribers: [] };
    jobs.set(id, job);

    // process asynchronously
    (async () => {
      try {
        job.status = 'running';
        SSEmanager.sendStatus(job);
        const url = buildRepoUrl(parsed.owner, parsed.repo, parsed.branch);
        SSEmanager.log(job, `Analyzing via OpenAI link-based analyzer on ${url}`);
        const gherkin = await generateGherkinFromLink(url, (msg) => SSEmanager.log(job, msg));
        job.gherkin = gherkin;
        job.status = 'done';
        SSEmanager.sendStatus(job);
        SSEmanager.log(job, 'Generation complete.');
        SSEmanager.sendDone(job);
      } catch (err: any) {
        job.status = 'error';
        SSEmanager.sendStatus(job);
        SSEmanager.log(job, `Error: ${err?.message || String(err)}`);
        SSEmanager.sendDone(job);
      }
    })();

    res.json({ jobId: id });
  });

  app.get('/api/progress/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).end();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    job.subscribers.push(res);
    // send initial state
    res.write(`event: status\n`);
    res.write(`data: ${JSON.stringify({ status: job.status })}\n\n`);
    for (const line of job.logs) {
      res.write(`event: log\n`);
      res.write(`data: ${JSON.stringify({ message: line })}\n\n`);
    }
    if (job.status === 'done' || job.status === 'error') {
      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify({ gherkin: job.gherkin || '' })}\n\n`);
    }
    const ping = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      const idx = job.subscribers.indexOf(res);
      if (idx >= 0) job.subscribers.splice(idx, 1);
    });
  });
}
