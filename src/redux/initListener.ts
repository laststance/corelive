import type { Action } from '@reduxjs/toolkit'
import axios from 'axios'
import { toast } from 'sonner'
// @ts-expect-error TODO replace @laststance version package later
import { createKeybindingsHandler } from 'tinykeys'

import { selectCompleted, selectSimpleEditorText } from '@/redux/editorSlice'

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

      // const simpleEditorText = selectSimpleEditorText(store.Editor) Error: selectSlice returned undefined for an uninjected slice reducer
      // const completed = selectCompleted(store.Editor) Error: selectSlice returned undefined for an uninjected slice reducer
      const editor = store.Editor
      const simpleEditorText = editor.simpleEditorText
      const completed = editor.completed
      const { data } = await axios.post('/api/save', {
        simpleEditorText,
        completed,
      })
      toast.success(data.message)
    },
  })

  window.addEventListener('keydown', handler)
}
