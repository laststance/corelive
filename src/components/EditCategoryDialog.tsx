'use client'

import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deleteCategory } from '@/actions/deleteCategory'
import { Spacer } from '@/components/Spacer'
import { removeCategory, selectCategories } from '@/redux/categorySlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectUserId } from '@/redux/userSlice'

interface Props {}

export const EditCategoryDialog: React.FC<Props> = () => {
  const dispatch = useAppDispatch()
  const id = useAppSelector(selectUserId)!
  const categories = useAppSelector(selectCategories)

  return (
    <dialog id="edit_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-xl font-bold">New Category</h1>
        <Spacer size="h-3xs" />
        <section className="grid grid-cols-2 gap-2 p-4">
          {categories.map((category) => (
            <>
              <div key={category.id}>{category.name}</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const res = await deleteCategory(id, category.id)
                  dispatch(removeCategory(category.id))
                  toast.success(res.message)
                }}
              >
                <Trash2 />
              </button>
            </>
          ))}
        </section>

        <div className="modal-action">
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
