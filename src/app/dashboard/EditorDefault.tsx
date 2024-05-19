'use client'

import { createBasicElementsPlugin } from '@udecode/plate-basic-elements'
import { createBasicMarksPlugin } from '@udecode/plate-basic-marks'
import { Plate, createPlugins } from '@udecode/plate-common'

import { createPlateUI } from '@/components/plate/create-plate-ui'
import { Editor } from '@/components/plate-ui/editor'
import { FloatingToolbar } from '@/components/plate-ui/floating-toolbar'
import { FloatingToolbarButtons } from '@/components/plate-ui/floating-toolbar-buttons'

export function EditorDefault() {
  const plugins = createPlugins(
    [createBasicElementsPlugin(), createBasicMarksPlugin()],
    { components: createPlateUI() },
  )

  return (
    <div className="mt-[72px] py-10">
      <Plate plugins={plugins}>
        <Editor placeholder="Type your message here." />

        <FloatingToolbar>
          <FloatingToolbarButtons />
        </FloatingToolbar>
      </Plate>
    </div>
  )
}
