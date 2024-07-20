'use client'

import { Spacer } from '@/components/Spacer'

interface Props {}

export const NewCategoryDialog: React.FC<Props> = () => {
  return (
    <dialog id="new_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-xl font-bold">New Category</h1>
        <Spacer size="3xs" />
        <form>
          <input
            type="text"
            placeholder="Enter category name"
            className="input input-bordered w-full max-w-xs"
          />
        </form>
        <div className="modal-action">
          <button className="btn btn-success">Create</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}
