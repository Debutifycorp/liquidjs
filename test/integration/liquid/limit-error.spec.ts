import { Liquid, LimitError, LiquidError, RenderError, isLimitError } from '../../../src'

async function caught (run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (err) {
    return err
  }
  throw new Error('expected the render to throw')
}

describe('isLimitError', () => {
  it('should recognise a limit hit while rendering, which arrives wrapped in RenderError', async () => {
    const liquid = new Liquid({ memoryLimit: 3 })
    const err = await caught(() => liquid.parseAndRender('{{ "x" | append: "yyyyyy" }}')) as RenderError
    expect(err.name).toBe('RenderError')
    expect(LimitError.is(err)).toBe(false)
    expect(LimitError.is(err.originalError)).toBe(true)
    expect(isLimitError(err)).toBe(true)
  })
  it('should recognise a limit that inlineErrors does not write', async () => {
    const liquid = new Liquid({ memoryLimit: 3, inlineErrors: true })
    expect(isLimitError(await caught(() => liquid.parseAndRender('{{ "x" | append: "yyyyyy" }}')))).toBe(true)
  })
  it('should recognise a render limit', async () => {
    const liquid = new Liquid({ renderLimit: 0.01 })
    expect(isLimitError(await caught(() => liquid.parseAndRender('{% for i in (1..100000) %}{{ i }},{% endfor %}')))).toBe(true)
  })
  it('should recognise a parse limit, which is thrown as the LimitError itself', async () => {
    const liquid = new Liquid({ parseLimit: 5 })
    const err = await caught(() => liquid.parseAndRender('{{ a }}{{ b }}{{ c }}'))
    expect(LimitError.is(err)).toBe(true)
    expect(isLimitError(err)).toBe(true)
  })
  it('should be false for any other error', async () => {
    const liquid = new Liquid()
    liquid.registerFilter('boom', () => { throw new Error('boom') })
    const err = await caught(() => liquid.parseAndRender('{{ 1 | boom }}'))
    expect(LiquidError.is(err)).toBe(true)
    expect(isLimitError(err)).toBe(false)
  })
  it('should be false for a value that is not an error', () => {
    expect(isLimitError(undefined)).toBe(false)
    expect(isLimitError(null)).toBe(false)
    expect(isLimitError('memory alloc limit exceeded')).toBe(false)
  })
})
