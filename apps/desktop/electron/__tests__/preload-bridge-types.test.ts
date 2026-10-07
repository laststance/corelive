import type {
  AuthBridge,
  OAuthBridge,
} from '@corelive/desktop-contract/electron-api'
import { expectTypeOf, test } from 'vitest'

import type {
  createAuthBridge,
  createOAuthBridge,
} from '../preload-shared/auth-oauth-bridge'

test('the shared authentication contract preserves the inferred native factory surface', () => {
  // Arrange / Act / Assert: equality catches widened/narrowed methods in either consumer.
  expectTypeOf<
    ReturnType<typeof createAuthBridge>
  >().toEqualTypeOf<AuthBridge>()
})

test('the shared OAuth contract preserves native failure and event callback shapes', () => {
  // Arrange / Act / Assert: no provider sign-in or Electron runtime is needed.
  expectTypeOf<
    ReturnType<typeof createOAuthBridge>
  >().toEqualTypeOf<OAuthBridge>()
})
