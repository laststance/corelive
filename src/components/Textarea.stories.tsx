import type { Meta, StoryObj } from '@storybook/react'
import {
  MessageSquare,
  Send,
  Paperclip,
  Smile,
  Bold,
  Italic,
  Link,
  List,
  Code,
  Quote,
  FileText,
  AlertCircle,
  CheckCircle,
  Info,
  Lightbulb,
  Bug,
  Zap,
  GitCommit,
  Terminal,
  Hash,
  AtSign,
  Copy,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

const meta: Meta<typeof Textarea> = {
  title: 'CoreLive Design System/Components/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A multi-line text input component for longer text entries. Built with accessibility and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    rows: {
      control: 'number',
      description: 'Number of visible text rows',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => <Textarea placeholder="Type your message here." />,
}

export const WithLabel: Story = {
  args: {},
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea placeholder="Type your message here." id="message" />
    </div>
  ),
}

export const Disabled: Story = {
  args: {},
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="disabled" className="text-muted-foreground">
        Disabled textarea
      </Label>
      <Textarea
        placeholder="This textarea is disabled"
        id="disabled"
        disabled
      />
    </div>
  ),
}

export const WithHelperText: Story = {
  args: {},
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="bio">Bio</Label>
      <Textarea
        placeholder="Tell us a little bit about yourself"
        id="bio"
        className="min-h-[100px]"
      />
      <p className="text-muted-foreground text-sm">
        You can @mention other users and organizations.
      </p>
    </div>
  ),
}

export const CharacterCount: Story = {
  args: {},
  render: () => {
    const [text, setText] = useState('')
    const maxLength = 280

    return (
      <div className="grid w-full gap-1.5">
        <Label htmlFor="tweet">Compose tweet</Label>
        <Textarea
          placeholder="What's happening?"
          id="tweet"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, maxLength))}
          className="min-h-[100px]"
        />
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {text.length > 0 && `${text.length}/${maxLength} characters`}
          </p>
          <span
            className={`text-sm font-medium ${
              text.length > maxLength * 0.9
                ? 'text-warning'
                : text.length > maxLength * 0.8
                  ? 'text-warning/70'
                  : 'text-muted-foreground'
            }`}
          >
            {maxLength - text.length} remaining
          </span>
        </div>
      </div>
    )
  },
}

export const CommentBox: Story = {
  args: {},
  render: () => {
    const [comment, setComment] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = () => {
      setIsSubmitting(true)
      setTimeout(() => {
        setIsSubmitting(false)
        setComment('')
      }, 1000)
    }

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Leave a comment
          </CardTitle>
          <CardDescription>
            Share your thoughts with the community
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea
              placeholder="Write your comment here..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[120px]"
            />

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Bold className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Italic className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Link className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <List className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Code className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Smile className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!comment.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    'Posting...'
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Post
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const FeedbackForm: Story = {
  args: {},
  render: () => {
    const [type, setType] = useState('bug')

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Send Feedback</CardTitle>
          <CardDescription>
            Help us improve by sharing your experience
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={type} onValueChange={setType}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="bug">
                <Bug className="mr-2 h-4 w-4" />
                Bug
              </TabsTrigger>
              <TabsTrigger value="feature">
                <Lightbulb className="mr-2 h-4 w-4" />
                Feature
              </TabsTrigger>
              <TabsTrigger value="improvement">
                <Zap className="mr-2 h-4 w-4" />
                Improvement
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bug" className="space-y-4">
              <div>
                <Label htmlFor="bug-title">What went wrong?</Label>
                <input
                  type="text"
                  id="bug-title"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Brief description of the issue"
                />
              </div>
              <div>
                <Label htmlFor="bug-details">Steps to reproduce</Label>
                <Textarea
                  id="bug-details"
                  placeholder="1. Go to...
2. Click on...
3. See error..."
                  className="mt-1 min-h-[120px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="feature" className="space-y-4">
              <div>
                <Label htmlFor="feature-title">Feature idea</Label>
                <input
                  type="text"
                  id="feature-title"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="What would you like to see?"
                />
              </div>
              <div>
                <Label htmlFor="feature-details">Description</Label>
                <Textarea
                  id="feature-details"
                  placeholder="Describe how this feature would work and why it would be useful..."
                  className="mt-1 min-h-[120px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="improvement" className="space-y-4">
              <div>
                <Label htmlFor="improvement-area">Area to improve</Label>
                <input
                  type="text"
                  id="improvement-area"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="What could be better?"
                />
              </div>
              <div>
                <Label htmlFor="improvement-details">Suggestions</Label>
                <Textarea
                  id="improvement-details"
                  placeholder="How would you improve this? Share your ideas..."
                  className="mt-1 min-h-[120px]"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline">Cancel</Button>
            <Button>Send Feedback</Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const NotesEditor: Story = {
  args: {},
  render: () => {
    const [notes, setNotes] = useState('')

    return (
      <Card className="w-[600px]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Meeting Notes
            </span>
            <Badge variant="outline">Auto-saved</Badge>
          </CardTitle>
          <CardDescription>March 15, 2024 • Team Standup</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2 border-b pb-2">
              <Button variant="ghost" size="sm">
                <Hash className="mr-2 h-4 w-4" />
                Heading
              </Button>
              <Button variant="ghost" size="sm">
                <List className="mr-2 h-4 w-4" />
                List
              </Button>
              <Button variant="ghost" size="sm">
                <Quote className="mr-2 h-4 w-4" />
                Quote
              </Button>
              <Button variant="ghost" size="sm">
                <Code className="mr-2 h-4 w-4" />
                Code
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <Button variant="ghost" size="sm">
                <AtSign className="mr-2 h-4 w-4" />
                Mention
              </Button>
            </div>

            <Textarea
              placeholder="Start typing your notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />

            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>
                {notes.split(' ').filter((word) => word).length} words
              </span>
              <span>Last saved: Just now</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CodeReview: Story = {
  args: {},
  render: () => (
    <Card className="w-[600px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCommit className="h-5 w-5" />
          Code Review
        </CardTitle>
        <CardDescription>
          Review changes in components/Button.tsx
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="bg-muted rounded-md p-3 font-mono text-sm">
            <div className="text-danger">- {'  '}background: #007bff;</div>
            <div className="text-success">
              + {'  '}background: var(--primary);
            </div>
            <div>{'  '}color: white;</div>
            <div>{'  '}padding: 8px 16px;</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review">Add a comment</Label>
            <Textarea
              id="review"
              placeholder="Leave your feedback about this change..."
              className="min-h-[100px]"
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <MessageSquare className="mr-2 h-4 w-4" />
              Comment
            </Button>
            <Button size="sm" className="bg-success hover:bg-success/90">
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button size="sm" variant="destructive">
              <AlertCircle className="mr-2 h-4 w-4" />
              Request changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const MarkdownEditor: Story = {
  args: {},
  render: () => {
    const [markdown, setMarkdown] = useState(`# Welcome to CoreLive

This is a **markdown** editor with *live preview*.

## Features
- Real-time preview
- Syntax highlighting
- Easy formatting

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\``)

    return (
      <div className="w-full max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Markdown Editor</CardTitle>
            <CardDescription>
              Write in markdown, see the preview instantly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="write" className="w-full">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="write" className="space-y-4">
                <div className="flex gap-1 border-b pb-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Quote className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Code className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <List className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Link className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Write your markdown here..."
                />
              </TabsContent>

              <TabsContent value="preview" className="min-h-[400px]">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: markdown
                        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                        .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*)\*/g, '<em>$1</em>')
                        .replace(
                          /```[\w]*\n([\s\S]*?)```/g,
                          '<pre><code>$1</code></pre>',
                        )
                        .replace(/`([^`]+)`/g, '<code>$1</code>')
                        .replace(/^- (.*$)/gim, '<li>$1</li>')
                        .replace(/\n\n/g, '</p><p>')
                        .replace(/^/, '<p>')
                        .replace(/$/, '</p>'),
                    }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const SupportTicket: Story = {
  args: {},
  render: () => (
    <Card className="w-[500px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Submit a Support Ticket
        </CardTitle>
        <CardDescription>We'll get back to you within 24 hours</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option>Technical Issue</option>
              <option>Billing Question</option>
              <option>Feature Request</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <Label htmlFor="priority">Priority</Label>
            <div className="mt-1 flex gap-2">
              <Badge variant="outline" className="cursor-pointer">
                Low
              </Badge>
              <Badge
                variant="outline"
                className="border-warning text-warning cursor-pointer"
              >
                Medium
              </Badge>
              <Badge
                variant="outline"
                className="border-danger text-danger cursor-pointer"
              >
                High
              </Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Please describe your issue in detail..."
              className="mt-1 min-h-[150px]"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Include any error messages, steps to reproduce, or relevant
              details
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline">Save as Draft</Button>
            <Button>Submit Ticket</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Textarea States</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="default">Default state</Label>
              <Textarea
                id="default"
                placeholder="Default textarea"
                className="mt-1"
                style={{
                  borderColor: 'var(--component-textarea-border)',
                  backgroundColor: 'var(--component-textarea-background)',
                }}
              />
            </div>

            <div>
              <Label htmlFor="focused">Focus state</Label>
              <Textarea
                id="focused"
                placeholder="Click to see focus ring"
                className="focus:ring-primary mt-1 focus:ring-2"
              />
            </div>

            <div>
              <Label htmlFor="disabled" className="text-muted-foreground">
                Disabled state
              </Label>
              <Textarea
                id="disabled"
                placeholder="Disabled textarea"
                disabled
                className="mt-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="error">Error state</Label>
              <Textarea
                id="error"
                placeholder="Invalid input"
                className="border-danger focus:ring-danger mt-1"
              />
              <p className="text-danger mt-1 text-sm">This field is required</p>
            </div>

            <div>
              <Label htmlFor="success">Success state</Label>
              <Textarea
                id="success"
                placeholder="Valid input"
                defaultValue="Great feedback!"
                className="border-success focus:ring-success mt-1"
              />
              <p className="text-success mt-1 flex items-center gap-1 text-sm">
                <CheckCircle className="h-3 w-3" />
                Looks good!
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Size Variations</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="small">Small (3 rows)</Label>
            <Textarea
              id="small"
              placeholder="Small textarea"
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="medium">Medium (5 rows)</Label>
            <Textarea
              id="medium"
              placeholder="Medium textarea"
              rows={5}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="large">Large (8 rows)</Label>
            <Textarea
              id="large"
              placeholder="Large textarea"
              rows={8}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Usage</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-info/20 bg-info/5">
            <CardHeader>
              <CardTitle className="text-info flex items-center gap-2">
                <Info className="h-4 w-4" />
                Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Additional information..."
                className="bg-info/5 border-info/20 focus:border-info"
              />
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardHeader>
              <CardTitle className="text-warning flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Warning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Important notes..."
                className="bg-warning/5 border-warning/20 focus:border-warning"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <textarea
                className="w-full resize-none rounded-md px-3 py-2 text-sm transition-colors"
                placeholder="Custom styled textarea"
                rows={4}
                style={{
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--component-textarea-border)',
                  backgroundColor: 'var(--component-textarea-background)',
                  color: 'var(--component-textarea-text)',
                  minHeight: 'var(--component-textarea-min-height)',
                }}
              />

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-textarea-border
                  <br />
                  --component-textarea-background
                  <br />
                  --component-textarea-text
                  <br />
                  --component-textarea-placeholder
                  <br />
                  --component-textarea-min-height
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Examples</h3>
        <Card>
          <CardHeader>
            <CardTitle>Terminal Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Terminal className="h-4 w-4" />
                <code>npm run dev</code>
              </div>
              <Textarea
                value={`> corelive@1.0.0 dev
> next dev

ready - started server on 0.0.0.0:3000, url: http://localhost:3000
event - compiled client and server successfully in 2.1s (173 modules)
wait  - compiling...
event - compiled successfully in 132ms (173 modules)`}
                readOnly
                className="border-0 bg-black font-mono text-sm text-green-400"
                rows={8}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button size="sm" variant="outline">
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of textarea variations using CoreLive Design System tokens for consistent multi-line text input across different contexts.',
      },
    },
  },
}
