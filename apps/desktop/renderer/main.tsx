import { DurableEditorStore } from '@corelive/live-editor/store'
import { createRoot } from 'react-dom/client'

import { NativeEditor } from './NativeEditor'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Editor root is missing')
const api = window.liveEditorAPI
if (api?.workspace?.version === 1) {
  createRoot(root).render(
    <NativeEditor api={api} store={new DurableEditorStore(api.workspace)} />,
  )
} else {
  // A missing preload cannot fall back to remote editing or pretend that browser storage is durable.
  root.textContent =
    'LiveEditor could not open. Close this window and try again. Your saved writing is preserved.'
}
