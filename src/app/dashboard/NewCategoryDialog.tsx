'use client'

interface Props {}

export const NewCategoryDialog: React.FC<Props> = () => {
  return (
    <dialog id="new_category_modal" className="modal">
      <div className="modal-box">
        <h3 className="text-lg font-bold">New Category</h3>
        <p className="py-4">Press ESC key or click outside to close</p>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}
