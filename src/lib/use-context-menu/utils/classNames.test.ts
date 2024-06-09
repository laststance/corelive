// src/lib/use-context-menu/utils/classNames.test.ts
import classNames from './classNames'

// Normal tests
describe('classNames function', () => {
  // Test 1: It should return an empty string when no arguments are passed
  test('returns an empty string when no arguments are passed', () => {
    expect(classNames()).toBe('')
  })

  // Test 2: It should return the single class name when one argument is passed
  test('returns the single class name when one argument is passed', () => {
    expect(classNames('foo')).toBe('foo')
  })

  // Test 3: It should join multiple class names with a space
  test('joins multiple class names with a space', () => {
    expect(classNames('foo', 'bar')).toBe('foo bar')
  })

  // Test 4: It should filter out falsy values
  test('filters out falsy values', () => {
    expect(classNames('foo', false, 'bar', undefined, 0, 'baz', null)).toBe(
      'foo bar baz',
    )
  })

  // Test 5: It should handle non-string values
  test('handles non-string values', () => {
    expect(classNames('foo', true, 42, { bar: 'baz' })).toBe(
      'foo true 42 [object Object]',
    )
  })

  // Test 6: It should handle an array as an argument
  test('handles an array as an argument', () => {
    expect(classNames('foo', ['bar', 'baz'])).toBe('foo bar baz')
  })
})

// Complex tests
describe('classNames function with complex inputs', () => {
  // Test 7: It should handle a mix of string, boolean, number, and object values
  test('handles a mix of string, boolean, number, and object values', () => {
    expect(
      classNames(
        'foo',
        true,
        42,
        { bar: 'baz' },
        false,
        'bar',
        undefined,
        null,
        0,
      ),
    ).toBe('foo true 42 [object Object] bar')
  })

  // Test 8: It should handle nested arrays as arguments
  test('handles nested arrays as arguments', () => {
    expect(classNames('foo', ['bar', ['baz', 'qux']])).toBe('foo bar baz qux')
  })

  // Test 9: It should handle an empty array as an argument
  test('handles an empty array as an argument', () => {
    expect(classNames('foo', [])).toBe('foo')
  })

  // Test 10: It should handle a mix of string, boolean, number, object, and array values
  test('handles a mix of string, boolean, number, object, and array values', () => {
    expect(
      classNames(
        'foo',
        true,
        42,
        { bar: 'baz' },
        false,
        'bar',
        undefined,
        null,
        0,
        ['baz', 'qux'],
      ),
    ).toBe('foo true 42 [object Object] bar baz qux')
  })
})
