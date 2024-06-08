import { z } from 'zod'

export const EditorContentSchema = z.string().max(10000)
export type EditorContent = z.infer<typeof EditorContentSchema>
