'use client'

interface Props {}

export const NewCategoryDialog: React.FC<Props> = () => {
  return (
    <dialog id="new_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-lg font-bold">New Category</h1>
        <p className="py-4">Press ESC key or click outside to close</p>
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
