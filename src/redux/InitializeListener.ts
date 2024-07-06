import type { Action } from '@reduxjs/toolkit'
import axios from 'axios'
import { toast } from 'sonner'
// @ts-expect-error TODO replace @laststance version package later
import { createKeybindingsHandler } from 'tinykeys'

import type { AppListenerEffectAPI } from '@/redux/store'

export const InitializeListener = {
  type: 'Emit/InitializeListener',
  effect: save,
}

async function save(
  _action: Action,
  listenerApi: AppListenerEffectAPI,
): Promise<void> {
  const handler = createKeybindingsHandler({
    '$mod+S': async (e: KeyboardEvent) => {
      e.preventDefault()
      const store = listenerApi.getState()

      const editorList = store.Editor.editorList
      const completed = store.Editor.currentCategory

      const { data } = await axios.post('/api/save', {
        editorList,
        completed,
      })
      toast.success(data.message)
    },
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handler)
  }
}
