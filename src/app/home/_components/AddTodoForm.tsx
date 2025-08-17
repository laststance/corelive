import { Plus, StickyNote, ChevronDown, ChevronRight } from 'lucide-react'
import React, { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface AddTodoFormProps {
  onAddTodo: (text: string, notes?: string) => void
}

export function AddTodoForm({ onAddTodo }: AddTodoFormProps) {
  const [inputValue, setInputValue] = useState('')
  const [notes, setNotes] = useState('')
  const [isNotesOpen, setIsNotesOpen] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      onAddTodo(inputValue.trim(), notes.trim() || undefined)
      setInputValue('')
      setNotes('')
      setIsNotesOpen(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter a new todo..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1"
            />
            <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className={`${notes ? 'text-primary border-primary' : ''}`}
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
            <Button type="submit" disabled={!inputValue.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
            <CollapsibleContent>
              <Textarea
                placeholder="Add notes (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px] resize-none"
              />
            </CollapsibleContent>
          </Collapsible>
        </form>
      </CardContent>
    </Card>
  )
}
