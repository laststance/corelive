import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SkillNodeCircle } from './SkillNodeCircle'

/**
 * Wrap the node in an SVG so native <g>/<circle> have a valid parent.
 */
function svgWrap(ui: React.ReactNode) {
  return (
    <svg viewBox="0 0 100 100" width="100" height="100">
      {ui}
    </svg>
  )
}

describe('<SkillNodeCircle>', () => {
  const baseProps = {
    id: 1,
    name: 'APIs',
    cx: 50,
    cy: 50,
    xp: 0,
  }

  it('renders with an accessible label at Dormant state', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} />))
    expect(
      screen.getByRole('button', {
        name: /apis.*dormant|apis.*level 0/i,
      }),
    ).toBeInTheDocument()
  })

  it('shows level 3 in the label when XP is 40', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} xp={40} />))
    expect(
      screen.getByRole('button', { name: /apis.*level 3/i }),
    ).toBeInTheDocument()
  })

  it('reports Mastered when XP is 75', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} xp={75} />))
    expect(
      screen.getByRole('button', { name: /apis.*mastered/i }),
    ).toBeInTheDocument()
  })

  it('is keyboard focusable (tabIndex=0)', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} />))
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0')
  })
})
