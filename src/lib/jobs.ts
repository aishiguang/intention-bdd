import type express from 'express';

export type JobStatus = 'pending' | 'running' | 'done' | 'error';
export type Job = {
  id: string;
  status: JobStatus;
  logs: string[];
  gherkin?: string;
  subscribers: express.Response[];
};

export const jobs = new Map<string, Job>();

export class SSEmanager {
  static log(job: Job, message: string) {
    console.log(message);
    const line = `${new Date().toISOString()} ${message}`;
    job.logs.push(line);
    for (const res of job.subscribers) {
      try {
        res.write(`event: log\n`);
        res.write(`data: ${JSON.stringify({ message: line })}\n\n`);
      } catch {
        // ignore broken pipe
      }
    }
  }

  static sendStatus(job: Job) {
    for (const res of job.subscribers) {
      try {
        res.write(`event: status\n`);
        res.write(`data: ${JSON.stringify({ status: job.status })}\n\n`);
      } catch { }
    }
  }

  static sendDone(job: Job) {
    for (const res of job.subscribers) {
      try {
        res.write(`event: done\n`);
        res.write(`data: ${JSON.stringify({ gherkin: job.gherkin || '' })}\n\n`);
      } catch { }
    }
  }
}
