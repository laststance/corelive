import React, { type ComponentProps } from 'react'

import { cn } from '@/lib/utils'

namespace Flex {
  export type Props = ComponentProps<'div'>
}

export const Flex: React.FC<Flex.Props> = ({ children, ...props }) => {
  return (
    <div data-react-name="Flex" className={cn('flex', props.className)}>
      {children}
    </div>
  )
}
