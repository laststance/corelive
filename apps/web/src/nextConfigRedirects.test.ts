// @vitest-environment node
import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config.js'

describe('next.config redirects', () => {
  it('sends the retired web LiveEditor routes to /home and keeps the floating-navigator redirect', async () => {
    // Arrange
    const expectedRedirects = [
      { source: '/braindump', destination: '/home', permanent: false },
      { source: '/write', destination: '/home', permanent: false },
      { source: '/live-editor', destination: '/home', permanent: false },
      {
        source: '/floating-navigator',
        destination: '/login-shell',
        permanent: true,
      },
    ]

    // Act
    if (!nextConfig.redirects) throw new Error('redirects() is not configured')
    const redirects = await nextConfig.redirects()

    // Assert
    expect(redirects).toEqual(expectedRedirects)
  })
})
