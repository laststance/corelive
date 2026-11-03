/**
 * An in-memory stand-in for the dashboard's category endpoints, used by sync tests (#216).
 *
 * It mirrors `category.syncApply` / `category.syncReceipts` semantics (CAS `expected`, adoption by
 * name path, receipts replayed by operation id with a payload digest, delete rescue + deletion
 * records) and exposes "web" mutations for the other side of a merge. Test support only.
 *
 * @module fakeDashboard
 */
import type {
  CategoryWireOperation,
  SyncOutcome,
} from '@corelive/desktop-contract/category-sync'
import {
  normalizeCategoryName,
  validateCategoryAction,
  validateCategorySet,
} from '@corelive/desktop-contract/category-validator'
import type { EditorCategory } from '@corelive/desktop-contract/offline-workspace'

type CategoryReceipt = Extract<SyncOutcome, { kind: 'category' }>
type Color = EditorCategory['color']
type ReceiptBody = CategoryReceipt extends infer T
  ? T extends unknown
    ? Omit<T, 'kind' | 'operationId'>
    : never
  : never

/** A fake account's categories with receipts and deletion records. */
export function createFakeDashboard(initial: EditorCategory[]) {
  const categories = new Map(initial.map((c) => [c.id, { ...c }]))
  const deletions: { sourceId: number; destinationId: number }[] = []
  const receipts = new Map<
    string,
    { digest: string; outcome: CategoryReceipt }
  >()
  let nextServerId = Math.max(0, ...initial.map((c) => c.id)) + 1
  /** Operation ids the next apply call drops the response of (a lost response). */
  const loseResponseFor = new Set<string>()
  const applied: CategoryWireOperation[] = []
  let offline = false
  let requests = 0

  const list = (): EditorCategory[] =>
    [...categories.values()].map((c) => ({ ...c }))
  const asRows = () =>
    list().map((c) => ({
      id: c.id,
      name: c.name,
      isDefault: c.isDefault,
      parentId: c.parentId,
    }))

  const outcome = (
    operationId: string,
    rest: ReceiptBody,
  ): CategoryReceipt => ({ kind: 'category', operationId, ...rest })

  const applyOne = (operation: CategoryWireOperation): CategoryReceipt => {
    const id = operation.operationId
    const digest = JSON.stringify(operation)
    const stored = receipts.get(id)
    if (stored)
      return stored.digest === digest
        ? stored.outcome
        : outcome(id, { result: 'digest-mismatch' })
    const result = mutate(operation)
    receipts.set(id, { digest, outcome: result })
    if (result.result === 'applied' || result.result === 'adopted')
      applied.push(operation)
    return result
  }

  // fallow-ignore-next-line complexity -- test fake mirroring the server's switch
  const mutate = (operation: CategoryWireOperation): CategoryReceipt => {
    const id = operation.operationId
    switch (operation.type) {
      case 'create': {
        if (operation.parentId !== null) {
          const parent = categories.get(operation.parentId)
          if (!parent || parent.parentId !== null)
            return outcome(id, { result: 'invalid-parent' })
        }
        const name = normalizeCategoryName(operation.name)
        const twin = list().find(
          (c) =>
            c.parentId === operation.parentId &&
            normalizeCategoryName(c.name) === name,
        )
        if (twin)
          return outcome(id, {
            result: 'adopted',
            serverId: twin.id,
            current: {
              name: twin.name,
              color: twin.color,
              parentId: twin.parentId,
            },
          })
        const created: EditorCategory = {
          id: nextServerId++,
          name,
          color: operation.color,
          isDefault: false,
          parentId: operation.parentId,
          removed: false,
        }
        categories.set(created.id, created)
        return outcome(id, { result: 'applied', serverId: created.id })
      }
      case 'rename': {
        const target = categories.get(operation.serverId)
        if (!target || target.isDefault)
          return outcome(id, { result: 'forbidden' })
        if (target.name !== operation.expected.name)
          return outcome(id, {
            result: 'conflict',
            current: { name: target.name },
          })
        const name = normalizeCategoryName(operation.name)
        if (name !== target.name) {
          const verdict = validateCategoryAction(asRows(), {
            type: 'rename',
            id: target.id,
            name,
          })
          if (!verdict.ok) return outcome(id, { result: 'name-taken' })
          target.name = name
        }
        return outcome(id, { result: 'applied', serverId: target.id })
      }
      case 'recolor': {
        const target = categories.get(operation.serverId)
        if (!target) return outcome(id, { result: 'forbidden' })
        if (target.color !== operation.expected.color)
          return outcome(id, {
            result: 'conflict',
            current: { color: target.color },
          })
        target.color = operation.color
        return outcome(id, { result: 'applied', serverId: target.id })
      }
      case 'reparent': {
        const target = categories.get(operation.serverId)
        if (!target || target.isDefault)
          return outcome(id, { result: 'forbidden' })
        if (target.parentId !== operation.expected.parentId)
          return outcome(id, {
            result: 'conflict',
            current: { parentId: target.parentId },
          })
        if (target.parentId !== operation.parentId) {
          const verdict = validateCategoryAction(asRows(), {
            type: 'reparent',
            id: target.id,
            parentId: operation.parentId,
          })
          if (!verdict.ok)
            return outcome(id, {
              result:
                verdict.reason === 'name-taken-local'
                  ? 'name-taken'
                  : 'invalid-parent',
            })
          target.parentId = operation.parentId
        }
        return outcome(id, { result: 'applied', serverId: target.id })
      }
      case 'delete': {
        const target = categories.get(operation.serverId)
        if (!target) {
          return deletions.some((d) => d.sourceId === operation.serverId)
            ? outcome(id, { result: 'applied', serverId: operation.serverId })
            : outcome(id, { result: 'forbidden' })
        }
        if (target.isDefault) return outcome(id, { result: 'forbidden' })
        const verdict = validateCategoryAction(asRows(), {
          type: 'delete',
          id: target.id,
          destinationId: operation.destinationId,
        })
        if (!verdict.ok) {
          if (verdict.reason === 'name-taken-local' && verdict.childName)
            return outcome(id, {
              result: 'delete-blocked',
              reason: 'child-name-taken',
              childName: verdict.childName,
            })
          return outcome(id, { result: 'invalid-parent' })
        }
        webDelete(target.id, operation.destinationId)
        return outcome(id, { result: 'applied', serverId: target.id })
      }
      case 'renameSet': {
        const items = operation.items
        for (const item of items) {
          const target = categories.get(item.serverId)
          if (!target || target.isDefault)
            return outcome(id, { result: 'forbidden' })
          if (target.name !== item.expected.name)
            return outcome(id, {
              result: 'conflict',
              current: { name: target.name },
            })
        }
        const finals = new Map(
          items.map((item) => [
            item.serverId,
            normalizeCategoryName(item.name),
          ]),
        )
        const merged = asRows().map((row) => ({
          ...row,
          name: finals.get(row.id) ?? row.name,
        }))
        if (validateCategorySet(merged).length)
          return outcome(id, { result: 'name-taken' })
        for (const item of items)
          categories.get(item.serverId)!.name = finals.get(item.serverId)!
        return outcome(id, { result: 'applied', serverId: items[0]!.serverId })
      }
    }
  }

  /** Web/other-Mac delete: children become roots, a deletion record keeps the destination. */
  const webDelete = (sourceId: number, destinationId: number): void => {
    categories.delete(sourceId)
    for (const child of categories.values())
      if (child.parentId === sourceId) child.parentId = null
    deletions.push({ sourceId, destinationId })
  }

  return {
    categories: list,
    deletions: () => [...deletions],
    applied: () => [...applied],
    loseResponseFor,
    bootstrap: (accountId: string) => ({
      accountId,
      categories: list(),
      deletions: [...deletions],
    }),
    /** `category.syncApply`; a lost response commits but throws like a dropped connection. */
    apply: (
      operations: CategoryWireOperation[],
    ): { receipts: SyncOutcome[] } => {
      requests++
      if (offline)
        throw Object.assign(new Error('offline'), { code: 'NETWORK' })
      const out = operations.map(applyOne)
      if (operations.some((o) => loseResponseFor.has(o.operationId))) {
        for (const o of operations) loseResponseFor.delete(o.operationId)
        throw Object.assign(new Error('connection lost'), { code: 'NETWORK' })
      }
      return { receipts: out }
    },
    /** While offline every request throws before reaching the server. */
    setOffline: (value: boolean): void => {
      offline = value
    },
    /** Number of `apply` requests that reached the transport. */
    requestCount: (): number => requests,
    receiptsFor: (operationIds: string[]): { receipts: SyncOutcome[] } => ({
      receipts: offline
        ? []
        : operationIds.flatMap((id) =>
            receipts.has(id) ? [receipts.get(id)!.outcome] : [],
          ),
    }),
    webRename: (id: number, name: string): void => {
      categories.get(id)!.name = name
    },
    webRecolor: (id: number, color: Color): void => {
      categories.get(id)!.color = color
    },
    webCreate: (
      name: string,
      parentId: number | null = null,
      color: Color = 'blue',
    ): number => {
      const id = nextServerId++
      categories.set(id, {
        id,
        name,
        color,
        isDefault: false,
        parentId,
        removed: false,
      })
      return id
    },
    webDelete,
  }
}

export type FakeDashboard = ReturnType<typeof createFakeDashboard>
