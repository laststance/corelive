import { render } from '@testing-library/react'

import { useIsFirstRender } from './useIsFirstRender'

describe('useIsFirstRender', () => {
  it('should return true on first render and false on subsequent renders', () => {
    const values: boolean[] = []

    function Probe() {
      values.push(useIsFirstRender())
      return null
    }

    const { rerender } = render(<Probe />)

    expect(values).toEqual([true, false])

    rerender(<Probe />)

    expect(values.at(-1)).toBe(false)
    expect(values.filter(Boolean)).toEqual([true])
  })
})
