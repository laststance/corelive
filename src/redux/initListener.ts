import type { Action } from '@reduxjs/toolkit'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import axios from 'axios'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { toast } from 'sonner'
// @ts-expect-error TODO replace @laststance version package later
import { createKeybindingsHandler } from 'tinykeys'

import type { TODO } from '@/types/utility'

export const initListener = {
  type: 'Emit/InitializeListener',
  effect: save,
}

// TODO more better name
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function save(_action: Action, listenerApi: TODO): Promise<void> {
  const handler = createKeybindingsHandler({
    '$mod+S': async (e: KeyboardEvent) => {
      e.preventDefault()
      // const store = listenerApi.getState()

      // // const editorList = selectSimpleEditorText(store.Editor) Error: selectSlice returned undefined for an uninjected slice reducer
      // // const completed = selectCompleted(store.Editor) Error: selectSlice returned undefined for an uninjected slice reducer
      // // const editor = store.Editor
      // // const simpleEditorText = editor.simpleEditorText
      // // const completed = editor.completed
      // // const { data } = await axios.post('/api/save', {
      // //   simpleEditorText,
      // //   completed,
      // // })
      // toast.success(data.message)
    },
  })

  window.addEventListener('keydown', handler)
}
