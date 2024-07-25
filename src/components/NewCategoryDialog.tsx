'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { createCategory } from '@/actions/category'
import { Spacer } from '@/components/Spacer'
import { useAppSelector } from '@/redux/hooks'
import { selectUserId } from '@/redux/userSlice'

interface Props {}

export const NewCategoryDialog: React.FC<Props> = () => {
  const id = useAppSelector(selectUserId)!
  const createCategoryWithUserId = createCategory.bind(null, id)
  const [state, action] = useActionState(createCategoryWithUserId, {
    success: false,
    errors: undefined,
  })
  const { pending } = useFormStatus()

  return (
    <dialog id="new_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-xl font-bold">New Category</h1>
        <Spacer size="h-3xs" />
        <form method="dialog" action={action}>
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
        <button>close</button>
      </form>
    </dialog>
  )
}
