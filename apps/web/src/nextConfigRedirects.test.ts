// @vitest-environment node
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server'
import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config.js'

describe('next.config redirects', () => {
  it.each(['/write', '/live-editor', '/braindump'])(
    'leaves the retired editor URL %s without a redirect',
    async (pathname) => {
      // Arrange
      const url = `https://corelive.app${pathname}`

      // Act
      const response = await unstable_getResponseFromNextConfig({
        url,
        nextConfig,
      })

      // Assert
      expect(response.headers.get('location')).toBeNull()
    },
  )

  it('redirects the old Electron sign-in window to the login shell', async () => {
    // Arrange
    const url = 'https://corelive.app/floating-navigator'

    // Act
    const response = await unstable_getResponseFromNextConfig({
      url,
      nextConfig,
    })

    // Assert
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'https://corelive.app/login-shell',
    )
  })
})
