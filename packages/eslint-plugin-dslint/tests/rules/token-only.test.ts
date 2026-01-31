import { describe, it, expect } from 'vitest'
import {
  parseClassString,
  hasArbitraryValue,
  isCSSVariableValue,
  isCalcExpression,
} from '../../src/utils/class-parser.js'

describe('class-parser utilities', () => {
  describe('parseClassString', () => {
    it('should parse simple class string', () => {
      expect(parseClassString('flex items-center gap-2')).toEqual([
        'flex',
        'items-center',
        'gap-2',
      ])
    })

    it('should handle arbitrary values', () => {
      expect(parseClassString('bg-[#fff] text-sm w-[100px]')).toEqual([
        'bg-[#fff]',
        'text-sm',
        'w-[100px]',
      ])
    })

    it('should handle empty string', () => {
      expect(parseClassString('')).toEqual([])
    })

    it('should handle extra whitespace', () => {
      expect(parseClassString('  flex   items-center  ')).toEqual([
        'flex',
        'items-center',
      ])
    })
  })

  describe('hasArbitraryValue', () => {
    it('should detect arbitrary values', () => {
      expect(hasArbitraryValue('bg-[#fff]')).toBe(true)
      expect(hasArbitraryValue('w-[100px]')).toBe(true)
      expect(hasArbitraryValue('text-[rgb(255,0,0)]')).toBe(true)
    })

    it('should return false for regular classes', () => {
      expect(hasArbitraryValue('bg-primary')).toBe(false)
      expect(hasArbitraryValue('text-sm')).toBe(false)
      expect(hasArbitraryValue('flex')).toBe(false)
    })
  })

  describe('isCSSVariableValue', () => {
    it('should detect CSS variable values', () => {
      expect(isCSSVariableValue('bg-[var(--chart-1)]')).toBe(true)
      expect(isCSSVariableValue('text-[var(--custom-color)]')).toBe(true)
    })

    it('should return false for other arbitrary values', () => {
      expect(isCSSVariableValue('bg-[#fff]')).toBe(false)
      expect(isCSSVariableValue('w-[100px]')).toBe(false)
    })
  })

  describe('isCalcExpression', () => {
    it('should detect calc expressions', () => {
      expect(isCalcExpression('w-[calc(100%-16px)]')).toBe(true)
      expect(isCalcExpression('h-[calc(100vh-64px)]')).toBe(true)
    })

    it('should return false for other arbitrary values', () => {
      expect(isCalcExpression('w-[100px]')).toBe(false)
      expect(isCalcExpression('bg-[#fff]')).toBe(false)
    })
  })
})
