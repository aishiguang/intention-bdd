import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// Helpers for parsing repo inputs and building repo URLs

export function parseRepoInput(input: string): { owner: string; repo: string; branch: string } {
  let owner = '';
  let repo = '';
  let branch = 'main';
  const trimmed = input.trim();
  try {
    if (trimmed.startsWith('http')) {
      const u = new URL(trimmed);
      const parts = u.pathname.split('/').filter(Boolean);
      owner = parts[0];
      repo = parts[1];
      const treeIdx = parts.indexOf('tree');
      if (treeIdx !== -1 && parts[treeIdx + 1]) branch = parts[treeIdx + 1];
    } else {
      const branchSep = trimmed.includes('#') ? '#' : trimmed.includes('@') ? '@' : null;
      if (branchSep) {
        const [r, b] = trimmed.split(branchSep);
        branch = b || branch;
        const [o, rp] = r.split('/');
        owner = o;
        repo = rp;
      } else {
        const [o, rp] = trimmed.split('/');
        owner = o;
        repo = rp;
      }
    }
  } catch {
    // ignore, validated below
  }
  if (!owner || !repo) {
    throw new Error('Invalid repository. Use owner/repo or GitHub URL.');
  }
  return { owner, repo, branch };
}

// Note: downloading/expanding repos has been removed for concurrency and safety.

export function buildRepoUrl(owner: string, repo: string, branch?: string): string {
  if (branch && branch !== 'main' && branch !== 'master') {
    return `https://github.com/${owner}/${repo}/tree/${branch}`;
  }
  return `https://github.com/${owner}/${repo}`;
}

export function downloadRepo(url: string): string {
  const { owner, repo, branch } = parseRepoInput(url);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  const targetPath = path.join(tempRoot, repo);
  const branchSpecified = url.includes('/tree/') || url.includes('#') || url.includes('@');
  const cloneArgs = ['clone', '--depth', '1', '--single-branch'] as string[];
  if (branch && (branchSpecified || (branch !== 'main' && branch !== 'master'))) {
    cloneArgs.push('--branch', branch);
  }
  cloneArgs.push(`https://github.com/${owner}/${repo}.git`, targetPath);
  try {
    execFileSync('git', cloneArgs, { stdio: 'ignore' });
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download repository ${owner}/${repo}@${branch}: ${message}`);
  }
  return targetPath;
}

export function buildRepoCategory(pathTemp: string): string {
  const category = '';
  return category;
}

export function learnCodeFile(paths: string[]): string {
  const ret = [''];
  return ret.join('\n');
}
