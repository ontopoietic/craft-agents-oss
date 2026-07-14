// ORCHA §bg-child-sessions (p9): pure helpers for rendering child sessions
// (SessionMeta.parentSessionId) as nested, expandable rows under their parent
// in the session list. Kept free of React so they're unit-testable.

import type { SessionMeta } from "@/atoms/sessions"

export interface SessionListRow {
  item: SessionMeta
  /** Nesting depth (0/undefined = top-level, 1+ = nested child row) */
  depth?: number
  /** Row has nested child sessions (renders the chevron + count chip) */
  hasChildren?: boolean
  /** Number of nested child sessions under this row */
  childCount?: number
  /** Whether the child rows are currently expanded */
  isExpanded?: boolean
}

export interface ChildPartition {
  /** parentId → children (sorted by lastMessageAt desc). Only parents present in `items`. */
  childrenByParent: Map<string, SessionMeta[]>
  /** ids of all items that render nested under a parent (never as top-level rows) */
  nestedChildIds: Set<string>
}

/**
 * Partition `items` into nested children (parentSessionId resolves to another
 * item in the same list view) and everything else. Children whose parent is
 * missing from the view (deleted, archived-out, other workspace) are NOT
 * treated as nested — they fall back to normal top-level handling (orphans).
 */
export function buildChildPartition(items: SessionMeta[]): ChildPartition {
  const itemIds = new Set(items.map(i => i.id))
  const childrenByParent = new Map<string, SessionMeta[]>()
  const nestedChildIds = new Set<string>()
  for (const item of items) {
    const pid = item.parentSessionId
    if (!pid || pid === item.id || !itemIds.has(pid)) continue
    const arr = childrenByParent.get(pid) ?? []
    arr.push(item)
    childrenByParent.set(pid, arr)
    nestedChildIds.add(item.id)
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
  }
  return { childrenByParent, nestedChildIds }
}

/**
 * Expand a top-level row into [parentRow, ...nestedChildRows] according to the
 * expansion state. Recursive so grandchildren nest one level deeper; `seen`
 * guards against cycles and duplicate emission across groups.
 */
export function emitRowWithChildren(
  row: SessionListRow,
  depth: number,
  childrenByParent: Map<string, SessionMeta[]>,
  isParentExpanded: (id: string) => boolean,
  out: SessionListRow[],
  seen: Set<string>,
): void {
  if (seen.has(row.item.id)) return
  seen.add(row.item.id)
  const kids = childrenByParent.get(row.item.id)
  if (!kids || kids.length === 0) {
    out.push(depth > 0 ? { ...row, depth } : row)
    return
  }
  const expanded = isParentExpanded(row.item.id)
  out.push({
    ...row,
    ...(depth > 0 ? { depth } : {}),
    hasChildren: true,
    childCount: kids.length,
    isExpanded: expanded,
  })
  if (!expanded) return
  for (const kid of kids) {
    emitRowWithChildren({ item: kid }, depth + 1, childrenByParent, isParentExpanded, out, seen)
  }
}
