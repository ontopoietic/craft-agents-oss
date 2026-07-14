// ORCHA §bg-child-sessions (p9): tests for nested child-session row helpers
import { describe, it, expect } from 'bun:test'
import { buildChildPartition, emitRowWithChildren, type SessionListRow } from '../session-list-nesting'
import type { SessionMeta } from '@/atoms/sessions'

function makeSession(id: string, opts: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id,
    workspaceId: 'ws-1',
    lastMessageAt: Date.parse('2026-07-01T10:00:00.000Z'),
    ...opts,
  } as SessionMeta
}

describe('buildChildPartition', () => {
  it('nests children under parents present in the list', () => {
    const parent = makeSession('p1')
    const childA = makeSession('c1', { parentSessionId: 'p1', lastMessageAt: 100 })
    const childB = makeSession('c2', { parentSessionId: 'p1', lastMessageAt: 200 })
    const { childrenByParent, nestedChildIds } = buildChildPartition([parent, childA, childB])

    expect(nestedChildIds).toEqual(new Set(['c1', 'c2']))
    // sorted by lastMessageAt desc
    expect(childrenByParent.get('p1')!.map(s => s.id)).toEqual(['c2', 'c1'])
  })

  it('treats children of missing parents as top-level (orphans)', () => {
    const orphan = makeSession('c1', { parentSessionId: 'gone' })
    const { childrenByParent, nestedChildIds } = buildChildPartition([orphan])
    expect(nestedChildIds.size).toBe(0)
    expect(childrenByParent.size).toBe(0)
  })

  it('ignores self-referencing parent ids', () => {
    const weird = makeSession('s1', { parentSessionId: 's1' })
    const { nestedChildIds } = buildChildPartition([weird])
    expect(nestedChildIds.size).toBe(0)
  })
})

describe('emitRowWithChildren', () => {
  const parent = makeSession('p1')
  const child = makeSession('c1', { parentSessionId: 'p1' })
  const grandchild = makeSession('g1', { parentSessionId: 'c1' })

  it('collapsed parent emits a single row with chevron metadata', () => {
    const { childrenByParent } = buildChildPartition([parent, child])
    const out: SessionListRow[] = []
    emitRowWithChildren({ item: parent }, 0, childrenByParent, () => false, out, new Set())

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ hasChildren: true, childCount: 1, isExpanded: false })
    expect(out[0].depth).toBeUndefined()
  })

  it('expanded parent emits nested child rows with increasing depth', () => {
    const { childrenByParent } = buildChildPartition([parent, child, grandchild])
    const out: SessionListRow[] = []
    emitRowWithChildren({ item: parent }, 0, childrenByParent, () => true, out, new Set())

    expect(out.map(r => r.item.id)).toEqual(['p1', 'c1', 'g1'])
    expect(out[1].depth).toBe(1)
    expect(out[2].depth).toBe(2)
    expect(out[1]).toMatchObject({ hasChildren: true, childCount: 1, isExpanded: true })
  })

  it('guards against cycles via the seen set', () => {
    const a = makeSession('a', { parentSessionId: 'b' })
    const b = makeSession('b', { parentSessionId: 'a' })
    const { childrenByParent } = buildChildPartition([a, b])
    const out: SessionListRow[] = []
    emitRowWithChildren({ item: a }, 0, childrenByParent, () => true, out, new Set())

    expect(out.map(r => r.item.id)).toEqual(['a', 'b'])
  })

  it('does not re-emit rows already seen (cross-group dedupe)', () => {
    const { childrenByParent } = buildChildPartition([parent, child])
    const seen = new Set<string>(['p1'])
    const out: SessionListRow[] = []
    emitRowWithChildren({ item: parent }, 0, childrenByParent, () => true, out, seen)
    expect(out).toHaveLength(0)
  })
})
