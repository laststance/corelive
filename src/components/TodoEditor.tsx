import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export const TodoEditor: React.FC<ComponentProps<'section'>> = (props) => {
  return (
    <section className={cn('', props.className)}>
      <div className="mockup-phone">
        <div className="camera"></div>
        <div className="display">
          <div className="artboard artboard-demo phone-1">
            TodoEditor Still getting ready.
          </div>
        </div>
      </div>
    </section>
  )
}
