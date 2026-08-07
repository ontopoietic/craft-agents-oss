import { describe, it, expect } from 'bun:test';
import { handleSetSessionStatus } from './set-session-status.ts';
import type { SessionToolContext } from '../context.ts';

type StatusEntry = { id: string; label: string; category: 'open' | 'closed' };

const STATUSES: StatusEntry[] = [
  { id: 'todo', label: 'Todo', category: 'open' },
  { id: 'in-progress', label: 'In Progress', category: 'open' },
  { id: 'needs-review', label: 'Needs Review', category: 'open' },
  { id: 'done', label: 'Done', category: 'closed' },
  { id: 'cancelled', label: 'Cancelled', category: 'closed' },
];

const OWN_SESSION_ID = 'session-self';

function createCtx(): { ctx: SessionToolContext; sets: Array<{ sessionId?: string; status: string }> } {
  const sets: Array<{ sessionId?: string; status: string }> = [];
  const ctx = {
    sessionId: OWN_SESSION_ID,
    setSessionStatus: (sessionId: string | undefined, status: string) => {
      sets.push({ sessionId, status });
    },
    resolveStatus: (input: string) => {
      const available = STATUSES.map((s) => s.id);
      const hit =
        STATUSES.find((s) => s.id === input) ??
        STATUSES.find((s) => s.label.toLowerCase() === input.toLowerCase());
      return hit ? { resolved: hit.id, available, category: hit.category } : { resolved: null, available };
    },
  } as unknown as SessionToolContext;
  return { ctx, sets };
}

describe('handleSetSessionStatus — closed-status guard', () => {
  it('allows an open status (needs-review)', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { status: 'needs-review' });
    expect(result.isError).toBeFalsy();
    expect(sets).toEqual([{ sessionId: undefined, status: 'needs-review' }]);
  });

  // ORCHA deviation from upstream: self-closure is allowed (swarm role
  // sessions set themselves `done` after delivering their handoff).
  it('allows a closed status (done) on the current session', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { status: 'done' });
    expect(result.isError).toBeFalsy();
    expect(sets).toEqual([{ sessionId: undefined, status: 'done' }]);
  });

  it('allows a closed status when sessionId explicitly names the own session', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { sessionId: OWN_SESSION_ID, status: 'done' });
    expect(result.isError).toBeFalsy();
    expect(sets).toEqual([{ sessionId: OWN_SESSION_ID, status: 'done' }]);
  });

  it('rejects a closed status (done) on another session and does not write it', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { sessionId: 'session-other', status: 'done' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('needs-review');
    expect(sets).toHaveLength(0);
  });

  it('rejects a closed status on another session resolved from a display label (Cancelled)', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { sessionId: 'session-other', status: 'Cancelled' });
    expect(result.isError).toBe(true);
    expect(sets).toHaveLength(0);
  });

  it('still allows an open status on another session', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { sessionId: 'session-other', status: 'in-progress' });
    expect(result.isError).toBeFalsy();
    expect(sets).toEqual([{ sessionId: 'session-other', status: 'in-progress' }]);
  });

  it('still rejects an unknown status', async () => {
    const { ctx, sets } = createCtx();
    const result = await handleSetSessionStatus(ctx, { status: 'banana' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Unknown status');
    expect(sets).toHaveLength(0);
  });
});
