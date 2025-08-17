import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './accordion'

const meta: Meta<typeof Accordion> = {
  title: 'UI/Accordion',
  component: Accordion,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Accordion>

export const Basic: Story = {
  render: () => (
    <div className="w-[420px]">
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>What is shadcn/ui?</AccordionTrigger>
          <AccordionContent>
            A set of unstyled, accessible components you can copy and paste into
            your apps.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Is it accessible?</AccordionTrigger>
          <AccordionContent>
            Yes. It uses Radix primitives under the hood and follows WAI-ARIA
            guidelines.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-3">
          <AccordionTrigger>Can I customize it?</AccordionTrigger>
          <AccordionContent>
            Absolutely. Components are headless and styled via Tailwind so you
            control the UI.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
}
