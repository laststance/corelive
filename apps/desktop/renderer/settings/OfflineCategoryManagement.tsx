import { Button } from '@corelive/live-editor/ui/button'
import { useState } from 'react'

import {
  CategoryManagementPanel,
  type CategoryPanelMode,
} from '../editor/CategoryManagementPanel'

import { useSettings } from './SettingsProvider'

/**
 * Category management inside Settings, working fully offline (D4, DA8).
 *
 * Lists the device workspace's live categories, with children indented under their parent, and
 * reuses the editor's {@link CategoryManagementPanel} so create / rename / recolor / move / delete
 * share one form and one set of inline refusal messages. Every change is a step-4b worker command
 * sent through {@link SettingsProvider}; sync to the dashboard happens later, quietly.
 * Rendered by {@link ElectronSettingsPage} in the Categories section.
 *
 * @example <OfflineCategoryManagement />
 */
export function OfflineCategoryManagement() {
  const { snapshot, sendCategoryCommand } = useSettings()
  const [mode, setMode] = useState<CategoryPanelMode | null>(null)
  if (snapshot.phase !== 'ready')
    return (
      <p className="type-small leading-5 text-muted-foreground" role="status">
        Categories are available once LiveEditor has opened.
      </p>
    )
  const live = snapshot.categories.filter(
    (category) => !category.removed && !category.historical,
  )
  const roots = live.filter((category) => category.parentId === null)
  const rows = roots.flatMap((root) => [
    { category: root, depth: 0 },
    ...live
      .filter((child) => child.parentId === root.id)
      .map((child) => ({ category: child, depth: 1 })),
  ])
  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {rows.map(({ category, depth }) => (
          <li
            key={category.id}
            className="flex items-center justify-between gap-3 py-1"
            style={{ paddingInlineStart: depth * 16 }}
          >
            <span className="min-w-0 truncate" title={category.name}>
              {category.name}
              <span className="type-small ml-2 text-muted-foreground">
                {category.color}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${category.name}`}
              onClick={() => setMode({ kind: 'edit', categoryId: category.id })}
            >
              Edit
            </Button>
          </li>
        ))}
      </ul>
      {mode ? (
        <CategoryManagementPanel
          key={mode.kind === 'edit' ? mode.categoryId : 'create'}
          mode={mode}
          categories={live}
          onCommand={sendCategoryCommand}
          onDone={() => setMode(null)}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setMode({ kind: 'create', initialName: '' })}
        >
          New category
        </Button>
      )}
    </div>
  )
}
