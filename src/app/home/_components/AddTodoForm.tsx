import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, StickyNote, ChevronDown, ChevronRight } from 'lucide-react'
import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// Form schema definition
const todoFormSchema = z.object({
  text: z.string().trim().min(1, 'Please enter a task'),
  notes: z.string().trim().optional(),
})

type TodoFormValues = z.infer<typeof todoFormSchema>

interface AddTodoFormProps {
  onAddTodo: (text: string, notes?: string) => void
}

export function AddTodoForm({ onAddTodo }: AddTodoFormProps) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)

  const form = useForm<TodoFormValues>({
    resolver: zodResolver(todoFormSchema),
    defaultValues: {
      text: '',
      notes: '',
    },
  })

  const handleSubmit = (values: TodoFormValues) => {
    onAddTodo(values.text, values.notes || undefined)
    form.reset()
    setIsNotesOpen(false)
  }

  const notesValue = form.watch('notes')

  return (
    <Card>
      <CardContent className="p-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="Enter a new todo..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className={`${notesValue ? 'border-primary text-primary' : ''}`}
                  >
                    <StickyNote className="h-4 w-4" />
                    {isNotesOpen ? (
                      <ChevronDown className="ml-1 h-3 w-3" />
                    ) : (
                      <ChevronRight className="ml-1 h-3 w-3" />
                    )}
                    <span className="sr-only">Add notes</span>
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {form.formState.isSubmitting ? 'Adding...' : 'Add'}
              </Button>
            </div>
            <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
              <CollapsibleContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder="Add notes (optional)..."
                          className="min-h-[80px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
