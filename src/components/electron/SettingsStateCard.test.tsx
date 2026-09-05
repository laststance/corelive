import { render, screen } from '@testing-library/react'
import { Brain } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { SettingsStateCard } from './SettingsStateCard'

describe('SettingsStateCard', () => {
  it('shows the feature title and the one-line status copy', () => {
    // Arrange / Act
    render(
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="Loading LiveEditor settings…"
      />,
    )

    // Assert: both the title and the status description render for the reader.
    expect(screen.getByText('LiveEditor Note')).toBeInTheDocument()
    expect(screen.getByText('Loading LiveEditor settings…')).toBeInTheDocument()
  })

  it('forwards className to the card so the parent keeps control of spacing', () => {
    // Arrange / Act
    const { container } = render(
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="LiveEditor Note is only available in the desktop application."
        className="custom-outer-spacing"
      />,
    )

    // Assert: the parent-supplied class lands on the rendered card.
    expect(container.querySelector('.custom-outer-spacing')).not.toBeNull()
  })
})
