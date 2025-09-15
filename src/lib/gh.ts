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
