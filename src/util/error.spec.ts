import { Template } from '../template'
import { NumberToken } from '../tokens'
import { LiquidErrors, LiquidError, ParseError, RenderError, AssertionError, LimitError } from './error'

describe('LiquidError', () => {
  describe('.is()', () => {
    it('should return true for a LiquidError instance', () => {
      const err = new Error('intended')
      const token = new NumberToken('3', 0, 1)
      expect(LiquidError.is(new ParseError(err, token))).toBeTruthy()
    })
    it('should return false for null', () => {
      expect(LiquidError.is(null)).toBeFalsy()
    })
  })
})

describe('LiquidErrors', () => {
  describe('.is()', () => {
    it('should return true for a LiquidErrors instance', () => {
      const err = new Error('intended')
      const token = new NumberToken('3', 0, 1)
      const error = new ParseError(err, token)
      expect(LiquidErrors.is(new LiquidErrors([error]))).toBeTruthy()
    })
  })
})

describe('RenderError', () => {
  describe('.is()', () => {
    it('should return true for a RenderError instance', () => {
      const err = new Error('intended')
      const tpl = {
        token: new NumberToken('3', 0, 1),
        render: () => ''
      } as any as Template
      expect(RenderError.is(new RenderError(err, tpl))).toBeTruthy()
    })
  })
})

describe('LimitError', () => {
  it('is an AssertionError by name and message', () => {
    const err = new LimitError('memory alloc limit exceeded')
    expect(err).toBeInstanceOf(AssertionError)
    expect(err.name).toBe('AssertionError')
    expect(err.message).toBe('memory alloc limit exceeded')
  })
  describe('.is()', () => {
    it('should return true for a LimitError', () => {
      expect(LimitError.is(new LimitError('limit'))).toBeTruthy()
    })
    it('should return false for any other error', () => {
      expect(LimitError.is(new AssertionError('limit'))).toBeFalsy()
      expect(LimitError.is(new Error('limit'))).toBeFalsy()
    })
    it('should return false for null', () => {
      expect(LimitError.is(null)).toBeFalsy()
    })
  })
})
