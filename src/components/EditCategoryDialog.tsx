'use client'

import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Spacer } from '@/components/Spacer'
import { selectCategories, removeCategory } from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'

interface Props {}

export const EditCategoryDialog: React.FC<Props> = () => {
  const dispatch = useAppDispatch()
  const categories = useAppSelector(selectCategories)

  return (
    <dialog id="edit_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-xl font-bold">Edit Category</h1>
        <Spacer size="h-3xs" />
        <section className="grid grid-cols-2 gap-2 p-4">
          {categories.map((category) => (
            <div key={category.name}>
              <div>{category.name}</div>
              {/* @TODO replace <Button /> */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dispatch(removeCategory(category.name))
                  toast.success('Category removed')
                }}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </section>

        <div className="modal-action">
          {/* @TODO replace <Button /> */}
          <button
            className="btn btn-success"
            onClick={() => {
              document.getElementById('close_category_edit_modal')?.click()
            }}
          >
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button id="close_category_edit_modal">close</button>
      </form>
    </dialog>
  )
}
