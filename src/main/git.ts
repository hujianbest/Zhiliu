import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TimelineEntry } from '../shared/api';

const execFileAsync = promisify(execFile);

const GIT_FLAGS = ['-c', 'user.name=知流', '-c', 'user.email=zhiliu@localhost', '-c', 'commit.gpgsign=false'];

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', [...GIT_FLAGS, ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: '知流',
      GIT_AUTHOR_EMAIL: 'zhiliu@localhost',
      GIT_COMMITTER_NAME: '知流',
      GIT_COMMITTER_EMAIL: 'zhiliu@localhost',
    },
  });
}

export class VaultGit {
  constructor(private readonly root: () => string | null) {}

  async ensure(): Promise<void> {
    const cwd = this.root();
    if (!cwd) {
      return;
    }
    try {
      await git(cwd, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      await git(cwd, ['init']);
    }
    await git(cwd, ['config', 'user.name', '知流']);
    await git(cwd, ['config', 'user.email', 'zhiliu@localhost']);
    await git(cwd, ['config', 'commit.gpgsign', 'false']);
  }

  async commit(summary: string): Promise<void> {
    const cwd = this.root();
    if (!cwd) {
      return;
    }
    await this.ensure();
    await git(cwd, ['add', '-A']);
    const { stdout } = await git(cwd, ['status', '--porcelain']);
    if (stdout.trim() === '') {
      return;
    }
    await git(cwd, ['commit', '-m', summary]);
  }

  async history(): Promise<TimelineEntry[]> {
    const cwd = this.root();
    if (!cwd) {
      return [];
    }
    await this.ensure();
    try {
      const { stdout } = await git(cwd, ['log', '--format=%H%x1f%s%x1f%cI', '-n', '100']);
      return stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [id, summary, at] = line.split('\x1f');
          return { id: id ?? '', summary: summary ?? '', at: at ?? '' };
        })
        .filter((entry) => entry.id);
    } catch {
      return [];
    }
  }

  async rollback(id: string): Promise<void> {
    const cwd = this.root();
    if (!cwd) {
      throw new Error('还没有打开知识库');
    }
    if (!/^[0-9a-f]{7,40}$/i.test(id)) {
      throw new Error('无法回滚：无效的历史记录');
    }
    await this.ensure();
    await git(cwd, ['reset', '--hard', id]);
  }
}
