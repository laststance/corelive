import { toast } from 'sonner'
// @ts-expect-error TODO replace @laststance version package later
import { createKeybindingsHandler } from 'tinykeys'

export const initListener = {
  type: 'Run/InitListener',
  effect: save,
}

const handler = createKeybindingsHandler({
  '$mod+S': async (e: KeyboardEvent) => {
    e.preventDefault()

    toast.success('Saved')
  },
})

// TODO more better name
function save() {
  window.addEventListener('keydown', handler)
}
