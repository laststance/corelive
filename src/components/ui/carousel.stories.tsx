import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './carousel'

const meta: Meta<typeof Carousel> = {
  title: 'UI/Carousel',
  component: Carousel,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Carousel>

function DemoSlides() {
  return (
    <div className="w-[360px]">
      <Carousel className="relative">
        <CarouselContent className="h-48">
          {Array.from({ length: 5 }).map((_, i) => (
            <CarouselItem
              key={i}
              className="bg-accent text-accent-foreground flex items-center justify-center rounded-md"
            >
              <div className="text-sm">Slide {i + 1}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  )
}

export const Basic: Story = {
  render: () => <DemoSlides />,
}

export const Vertical: Story = {
  render: () => (
    <div className="w-[360px]">
      <Carousel orientation="vertical" className="relative">
        <CarouselContent className="h-64">
          {Array.from({ length: 5 }).map((_, i) => (
            <CarouselItem
              key={i}
              className="bg-accent text-accent-foreground flex items-center justify-center rounded-md"
            >
              <div className="text-sm">Panel {i + 1}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}
