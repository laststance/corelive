'use client'

import { CATEGORY_COLORS } from '@corelive/desktop-contract/category'
import type { WorkspaceCommand } from '@corelive/desktop-contract/offline-workspace-v2'
import { Button } from '@corelive/live-editor/ui/button'
import { useId, useState } from 'react'

import {
  DEFAULT_CATEGORY_DESCRIPTION,
  categoryRefusalCopy,
  type CategoryCommandOutcome,
} from './categoryCopy'

/** The slice of a category the form needs. */
export interface ManagedCategory {
  id: string
  name: string
  color: string
  isDefault: boolean
  parentId: string | null
  removed?: boolean
}

export type CategoryPanelMode =
  { kind: 'create'; initialName: string } | { kind: 'edit'; categoryId: string }

export interface CategoryManagementPanelProps {
  mode: CategoryPanelMode
  categories: ManagedCategory[]
  /** Sends one command through main; resolves with the outcome, never throws for a refusal. */
  onCommand: (command: WorkspaceCommand) => Promise<CategoryCommandOutcome>
  /** Closes the form (also after a successful save). */
  onDone: () => void
}

/**
 * Create / edit / delete form for one category, shown in the picker footer (D4, DA8).
 *
 * Works offline: each field becomes a main-process command. A refusal renders inline under the
 * form with `role="alert"`, keeps the form open and keeps the typed value. The default category
 * hides rename, move and delete and shows its description instead.
 *
 * @param props - Mode, the category list, the command sender and the close callback.
 * @example
 * <CategoryManagementPanel mode={{ kind: 'create', initialName: '' }} categories={list} onCommand={send} onDone={close} />
 */
export function CategoryManagementPanel({
  mode,
  categories,
  onCommand,
  onDone,
}: CategoryManagementPanelProps) {
  const target =
    mode.kind === 'edit'
      ? categories.find((category) => category.id === mode.categoryId)
      : undefined
  const formId = useId()
  const [name, setName] = useState(
    mode.kind === 'create' ? mode.initialName : (target?.name ?? ''),
  )
  const [color, setColor] = useState(target?.color ?? 'blue')
  const [parentId, setParentId] = useState<string | null>(
    target?.parentId ?? null,
  )
  const [destinationId, setDestinationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const live = categories.filter((category) => !category.removed)
  const roots = live.filter(
    (category) => category.parentId === null && category.id !== target?.id,
  )
  const isDefault = target?.isDefault === true
  const hasChildren = live.some((category) => category.parentId === target?.id)
  const destinations = live.filter((category) => category.id !== target?.id)

  const send = async (
    commands: WorkspaceCommand[],
    typedName: string,
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      for (const command of commands) {
        const outcome = await onCommand(command)
        if (!outcome.ok) {
          // Inline, form stays open, typed value kept (DA8).
          setError(
            categoryRefusalCopy(outcome.reason, typedName, outcome.detail),
          )
          return
        }
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const submit = (): void => {
    const commandId = (): string => crypto.randomUUID()
    if (mode.kind === 'create') {
      void send(
        [
          {
            type: 'categoryCreate',
            commandId: commandId(),
            categoryId: crypto.randomUUID(),
            name,
            color: color as (typeof CATEGORY_COLORS)[number],
            parentId,
          },
        ],
        name,
      )
      return
    }
    if (!target) return
    const commands: WorkspaceCommand[] = []
    if (!isDefault && name !== target.name)
      commands.push({
        type: 'categoryRename',
        commandId: commandId(),
        categoryId: target.id,
        name,
      })
    if (color !== target.color)
      commands.push({
        type: 'categoryRecolor',
        commandId: commandId(),
        categoryId: target.id,
        color: color as (typeof CATEGORY_COLORS)[number],
      })
    if (!isDefault && parentId !== target.parentId)
      commands.push({
        type: 'categoryReparent',
        commandId: commandId(),
        categoryId: target.id,
        parentId,
      })
    if (!commands.length) {
      onDone()
      return
    }
    void send(commands, name)
  }

  const remove = (): void => {
    if (!target || !destinationId) return
    void send(
      [
        {
          type: 'categoryDelete',
          commandId: crypto.randomUUID(),
          categoryId: target.id,
          destinationId,
        },
      ],
      target.name,
    )
  }

  return (
    <form
      aria-label={mode.kind === 'create' ? 'Create category' : 'Edit category'}
      className="flex flex-col gap-2 p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {isDefault ? (
        <p id={`${formId}-default`} className="text-muted-foreground">
          {DEFAULT_CATEGORY_DESCRIPTION}
        </p>
      ) : (
        <>
          <label htmlFor={`${formId}-name`}>Name</label>
          <input
            id={`${formId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error !== null}
            className="h-8 rounded-md border bg-background px-2"
          />
        </>
      )}
      <label htmlFor={`${formId}-color`}>Color</label>
      <select
        id={`${formId}-color`}
        value={color}
        onChange={(event) => setColor(event.target.value)}
        className="h-8 rounded-md border bg-background px-2"
      >
        {CATEGORY_COLORS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {!isDefault && !hasChildren && (
        <>
          <label htmlFor={`${formId}-parent`}>Inside</label>
          <select
            id={`${formId}-parent`}
            value={parentId ?? ''}
            onChange={(event) => setParentId(event.target.value || null)}
            className="h-8 rounded-md border bg-background px-2"
          >
            <option value="">Top level</option>
            {roots.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {mode.kind === 'create' ? 'Create' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {mode.kind === 'edit' && target && !isDefault && (
        <div className="mt-2 flex flex-col gap-2 border-t pt-2">
          <label htmlFor={`${formId}-destination`}>
            Move its writing to, then delete
          </label>
          <select
            id={`${formId}-destination`}
            value={destinationId ?? ''}
            onChange={(event) => setDestinationId(event.target.value || null)}
            className="h-8 rounded-md border bg-background px-2"
          >
            <option value="">Choose a category</option>
            {destinations.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !destinationId}
            onClick={remove}
          >
            Delete category
          </Button>
        </div>
      )}
    </form>
  )
}
