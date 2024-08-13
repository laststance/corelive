'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { toast } from 'sonner'
import z from 'zod'

import { Button } from '@/components/Button'
import { Spacer } from '@/components/Spacer'
import { toggleDrawer } from '@/redux/drawerSlice'
import { addCategory } from '@/redux/editorSlice'
import { useAppDispatch } from '@/redux/hooks'

const schema = z.object({
  category: z
    .string()
    .min(1, 'Category name is required')
    .max(20, 'Category name must be less than 20 characters'),
})

export const NewCategoryDialog: React.FC = () => {
  const dispatch = useAppDispatch()

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = (data) => {
    dispatch(addCategory(data.category))
    document.getElementById('new_category_modal')?.click()
    dispatch(toggleDrawer())
    toast.success('Category created')
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: '',
    },
  })

  return (
    <dialog id="new_category_modal" className="modal">
      <div className="modal-box">
        <h1 className="text-xl font-bold">New Category</h1>
        <Spacer size="h-3xs" />
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Enter category name"
            className="input input-bordered w-full max-w-xs"
            {...register('category')}
          />
          {errors?.category && (
            <p className="pl-2 pt-2 text-error">{errors.category.message}</p>
          )}
          <div className="modal-action">
            <Button
              type="submit"
              className="btn-success"
              pending={isSubmitting}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button id="close_category_modal">close</button>
      </form>
    </dialog>
  )
}
