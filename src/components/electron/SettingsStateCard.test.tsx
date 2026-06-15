import { render, screen } from '@testing-library/react'
import { Sunrise } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { SettingsStateCard } from './SettingsStateCard'

describe('SettingsStateCard', () => {
  it('shows the feature title and the one-line status copy', () => {
    // Arrange / Act
    render(
      <SettingsStateCard
        icon={Sunrise}
        title="On launch"
        description="Loading startup window settings…"
      />,
    )

    // Assert: both the title and the status description render for the reader.
    expect(screen.getByText('On launch')).toBeInTheDocument()
    expect(
      screen.getByText('Loading startup window settings…'),
    ).toBeInTheDocument()
  })

  it('forwards className to the card so the parent keeps control of spacing', () => {
    // Arrange / Act
    const { container } = render(
      <SettingsStateCard
        icon={Sunrise}
        title="On launch"
        description="Startup window settings are only available in the desktop application."
        className="custom-outer-spacing"
      />,
    )

    // Assert: the parent-supplied class lands on the rendered card.
    expect(container.querySelector('.custom-outer-spacing')).not.toBeNull()
  })
})
