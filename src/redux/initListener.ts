import type { Action } from '@reduxjs/toolkit'
import { toast } from 'sonner'
// @ts-expect-error TODO replace @laststance version package later
import { createKeybindingsHandler } from 'tinykeys'

import { selectCompleted, selectSimpleEditorText } from '@/redux/editorSlice'
import { RTKQuery } from '@/redux/RTKQuery'

export const initListener = {
  type: 'Run/InitListener',
  effect: save,
}

// TODO more better name
async function save(_action: Action, listenerApi: TODO): Promise<void> {
  const handler = createKeybindingsHandler({
    '$mod+S': async (e: KeyboardEvent) => {
      e.preventDefault()
      const store = listenerApi.getState()
      const simpleEditorText = selectSimpleEditorText(store.Editor)
      const completed = selectCompleted(store.Editor)
      const { data } = await store.dispatch(
        RTKQuery.endpoints.save.initiate({ simpleEditorText, completed }),
      )
      toast.success(data.message)
    },
  })

  window.addEventListener('keydown', handler)
}
