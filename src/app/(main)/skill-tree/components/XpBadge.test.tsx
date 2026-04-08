import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { XpBadge } from './XpBadge'

describe('<XpBadge>', () => {
  it('shows Dormant for 0 xp', () => {
    render(<XpBadge xp={0} />)
    expect(screen.getByText(/dormant/i)).toBeInTheDocument()
    expect(screen.getByText(/0 \/ 5/)).toBeInTheDocument()
  })

  it('shows level 3 with progress 10/20', () => {
    render(<XpBadge xp={40} />)
    expect(screen.getByText(/level 3/i)).toBeInTheDocument()
    expect(screen.getByText(/10 \/ 20/)).toBeInTheDocument()
  })

  it('shows Mastered at 75+', () => {
    render(<XpBadge xp={75} />)
    expect(screen.getByText(/mastered/i)).toBeInTheDocument()
  })
})
