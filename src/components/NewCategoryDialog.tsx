'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'

import { createCategory } from '@/actions/createCategory'
import { Spacer } from '@/components/Spacer'
import { toggleDrawer } from '@/redux/drawerSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectUserId } from '@/redux/userSlice'

interface Props {}

export const NewCategoryDialog: React.FC<Props> = () => {
  const dispatch = useAppDispatch()
  const id = useAppSelector(selectUserId)!
  const createCategoryWithUserId = createCategory.bind(null, id)
  const [state, action] = useActionState(createCategoryWithUserId, {
    success: false,
    errors: undefined,
  })
  const { pending } = useFormStatus()

  useEffect(() => {
    if (state.success) {
      document.getElementById('close_category_modal')?.click()
      dispatch(toggleDrawer())
      toast.success('Category created successfully!')
    }
  }, [state.success])

  return (
    <dialog id="new_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-xl font-bold">New Category</h1>
        <Spacer size="h-3xs" />
        <form action={action}>
          <input
            type="text"
            name="category"
            placeholder="Enter category name"
            className="input input-bordered w-full max-w-xs"
          />
          {state.errors?.category && (
            <p className="pl-2 pt-2 text-error">
              {state.errors?.category[0] as string}
            </p>
          )}
          <div className="modal-action">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-success"
            >
              Create
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button id="close_category_modal">close</button>
      </form>
    </dialog>
  )
}
