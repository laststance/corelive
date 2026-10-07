/**
 * Wallaby session for the web unit suite.
 *
 * Cursor loads this once when Wallaby starts. `autoDetect` follows Vitest,
 * and `configFile` pins `vitest.config.ts` (happy-dom, `src/**`) so the
 * Electron Vitest config is not picked up instead.
 *
 * Named `wallaby.conf.js` because the global gitignore excludes `wallaby.js`.
 *
 * @returns Wallaby automatic-configuration overrides.
 * @example
 * // Wallaby: Start → reads this file → runs src unit tests
 */
export default function wallaby() {
  return {
    autoDetect: ['vitest'],
    testFramework: {
      configFile: './vitest.config.ts',
    },
  }
}
