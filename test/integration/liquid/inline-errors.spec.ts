import { LimitError, Liquid, LiquidError, ParseError, RawBodyTag, Tag, UndefinedVariableError, liquidErrorText } from '../../../src'

const liquid = new Liquid({ inlineErrors: true, numberSemantics: 'ruby' })

describe('inlineErrors option', () => {
  it('writes the error inline and carries on', async () => expect(await liquid.parseAndRender('a{{ 1 | divided_by: 0 }}b')).toBe('aLiquid error (line 1): divided by 0b'))
  it('reports the line', async () => expect(await liquid.parseAndRender('x\n{{ 1 | divided_by: 0 }}')).toBe('x\nLiquid error (line 2): divided by 0'))
  it('keeps rendering after an error inside a block', async () => expect(await liquid.parseAndRender('{% if true %}{{ 1 | divided_by: 0 }}c{% endif %}d')).toBe('Liquid error (line 1): divided by 0cd'))
  it('collects errors for the caller', async () => {
    const errors: LiquidError[] = []
    await liquid.parseAndRender('{{ 1 | divided_by: 0 }}{{ 2 | divided_by: 0 }}', {}, { errors })
    expect(errors).toHaveLength(2)
  })
  it('names the partial the error came from', async () => {
    const engine = new Liquid({ inlineErrors: true, numberSemantics: 'ruby', extname: '.liquid', templates: { 'snippets/bad.liquid': '{{ 1 | divided_by: 0 }}' } })
    expect(await engine.parseAndRender("{% render 'snippets/bad' %}")).toBe('Liquid error (snippets/bad line 1): divided by 0')
  })
  it('collects errors from partials too', async () => {
    const engine = new Liquid({ inlineErrors: true, numberSemantics: 'ruby', extname: '.liquid', templates: { 'snippets/bad.liquid': '{{ 1 | divided_by: 0 }}' } })
    const errors: LiquidError[] = []
    await engine.parseAndRender("{% render 'snippets/bad' %}{{ 1 | divided_by: 0 }}", {}, { errors })
    expect(errors).toHaveLength(2)
  })
  it('renders synchronously too', () => expect(liquid.parseAndRenderSync('a{{ 1 | divided_by: 0 }}b')).toBe('aLiquid error (line 1): divided by 0b'))
  it('throws by default', async () => expect(new Liquid({ numberSemantics: 'ruby' }).parseAndRender('{{ 1 | divided_by: 0 }}')).rejects.toThrow(/divided by 0/))
  it('is off unless asked for', () => expect(new Liquid().options.inlineErrors).toBe(false))

  describe('limits', () => {
    // Ruby Liquid re-raises MemoryError instead of printing it (lib/liquid/block_body.rb, `rescue_render_node`), so a limit never turns into text
    const memory = new Liquid({ inlineErrors: true, memoryLimit: 10 })
    const big = '{{ "aaaaaaaaaaaa" | append: "b" }}'

    it('stops the render on the memory limit', async () => {
      await expect(memory.parseAndRender(big)).rejects.toThrow(/memory alloc limit exceeded/)
    })
    it('stops the render on the memory limit inside a block', async () => {
      await expect(memory.parseAndRender(`{% if true %}${big}{% endif %}x`)).rejects.toThrow(/memory alloc limit exceeded/)
    })
    it('stops the render on the memory limit inside a tag that prints nothing', async () => {
      await expect(memory.parseAndRender('{% assign a = "aaaaaaaaaaaa" | append: "b" %}x')).rejects.toThrow(/memory alloc limit exceeded/)
    })
    it('stops the render on the memory limit inside a partial', async () => {
      const engine = new Liquid({ inlineErrors: true, memoryLimit: 10, extname: '.liquid', templates: { 'snippets/big.liquid': big } })
      await expect(engine.parseAndRender("{% render 'snippets/big' %}x")).rejects.toThrow(/memory alloc limit exceeded/)
    })
    it('stops the render on the render time limit', async () => {
      const engine = new Liquid({ inlineErrors: true, renderLimit: 50 })
      await expect(engine.parseAndRender('{% for i in (1..50000000) %}{{ i }}{% endfor %}')).rejects.toThrow(/template render limit exceeded/)
    })
    it('stops the render on the render time limit inside a partial', async () => {
      const engine = new Liquid({ inlineErrors: true, renderLimit: 50, extname: '.liquid', templates: { 'snippets/slow.liquid': '{% for i in (1..50000000) %}{{ i }}{% endfor %}' } })
      await expect(engine.parseAndRender("{% render 'snippets/slow' %}")).rejects.toThrow(/template render limit exceeded/)
    })
    it('stops the render on the parse limit inside a partial', async () => {
      const engine = new Liquid({ inlineErrors: true, parseLimit: 50, extname: '.liquid', templates: { 'snippets/large.liquid': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' } })
      await expect(engine.parseAndRender("{% render 'snippets/large' %}")).rejects.toThrow(/parse length limit exceeded/)
    })
    it('treats a limit as catchAllErrors does without inlineErrors', async () => {
      const engine = new Liquid({ inlineErrors: true, catchAllErrors: true, memoryLimit: 10 })
      await expect(engine.parseAndRender(big)).rejects.toThrow(/1 error found/)
    })
    it('still prints the errors that are not limits', async () => {
      const engine = new Liquid({ inlineErrors: true, memoryLimit: 10, numberSemantics: 'ruby' })
      expect(await engine.parseAndRender('{{ 1 | divided_by: 0 }}')).toBe('Liquid error (line 1): divided by 0')
    })
  })

  describe('as Ruby Liquid prints them', () => {
    // lib/liquid/block_body.rb `rescue_render_node`: a tag that prints nothing (`blank?`) records its error without printing it
    it('records an error in assign without printing it', async () => {
      const errors: LiquidError[] = []
      expect(await liquid.parseAndRender('a{% assign x = 1 | divided_by: 0 %}b', {}, { errors })).toBe('ab')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toMatch(/^divided by 0/)
    })
    it('records an error in a tag of a liquid tag without printing it', async () => expect(await liquid.parseAndRender('a{% liquid\n  assign x = 1 | divided_by: 0\n%}b')).toBe('ab'))
    it('prints an error in a variable inside capture, into the captured text', async () => expect(await liquid.parseAndRender('{% capture x %}{{ 1 | divided_by: 0 }}{% endcapture %}{{ x }}')).toBe('Liquid error (line 1): divided by 0'))
    it('records an error in assign inside a block without printing it', async () => expect(await liquid.parseAndRender('{% if true %}{% assign x = 1 | divided_by: 0 %}{% endif %}a')).toBe('a'))
    it('records an error in the condition of a block that prints nothing', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}{% assign x = 1 %}  {% endif %}a')).toBe('a'))
    it('prints an error in the condition of a block that prints something', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}b{% endif %}a')).toBe('Liquid error (line 1): divided by 0a'))
    it('prints an error in the condition of a block whose body holds a variable', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}{{ x }}{% endif %}a')).toBe('Liquid error (line 1): divided by 0a'))
    it('prints an error in echo', async () => expect(await liquid.parseAndRender('{% echo 1 | divided_by: 0 %}')).toBe('Liquid error (line 1): divided by 0'))
    it('prints an error in a for loop that prints', async () => expect(await liquid.parseAndRender('{% for i in (1..2) %}{{ i | divided_by: 0 }}{% endfor %}')).toBe('Liquid error (line 1): divided by 0Liquid error (line 1): divided by 0'))

    // `UndefinedVariable` and `UndefinedFilter` are recorded and never printed
    it('records an undefined variable without printing it', async () => {
      const strict = new Liquid({ inlineErrors: true, strictVariables: true })
      const errors: LiquidError[] = []
      expect(await strict.parseAndRender('a{{ nope }}b', {}, { errors })).toBe('ab')
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(UndefinedVariableError)
    })
    it('records an undefined variable in a tag that prints without printing it', async () => {
      const strict = new Liquid({ inlineErrors: true, strictVariables: true })
      expect(await strict.parseAndRender('{% echo nope %}b')).toBe('b')
    })
    it('records an undefined filter without printing it', async () => {
      const strict = new Liquid({ inlineErrors: true, strictFilters: true, groupedExpressions: true })
      const errors: LiquidError[] = []
      expect(await strict.parseAndRender('{% if (1 | nofilter) %}a{% endif %}b', {}, { errors })).toBe('b')
      expect(errors).toHaveLength(1)
    })

    // tags/raw.rb `blank?` is `@body.empty?`, so raw only prints nothing when it holds nothing
    it('prints an error in the condition of a block that holds a raw tag with a body', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}{% raw %}hello{% endraw %}{% endif %}a')).toBe('Liquid error (line 1): divided by 0a'))
    it('records an error in the condition of a block that holds an empty raw tag', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}{% raw %}{% endraw %}{% endif %}a')).toBe('a'))
    // block.rb: a liquid tag is merged into the enclosing body in Ruby, so its tags decide whether the block is blank
    it('records an error in the condition of a block that holds only a liquid tag of blank tags', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}{% liquid assign x = 1 %}{% endif %}a')).toBe('a'))
    it('prints an error in the condition of a block that holds a liquid tag that prints', async () => expect(await liquid.parseAndRender('{% if 1 | divided_by: 0 %}{% liquid echo "x" %}{% endif %}a')).toBe('Liquid error (line 1): divided by 0a'))

    // errors.rb `message_prefix`: a SyntaxError reads "Liquid syntax error"
    it('calls a syntax error in a partial a syntax error', async () => {
      const engine = new Liquid({ inlineErrors: true, extname: '.liquid', templates: { 'snippets/bad.liquid': '{% nope %}' } })
      const errors: LiquidError[] = []
      expect(await engine.parseAndRender("a{% render 'snippets/bad' %}b", {}, { errors })).toBe('aLiquid syntax error (snippets/bad line 1): tag "nope" not foundb')
      expect(errors[0]).toBeInstanceOf(ParseError)
    })
  })

  describe('a tag that declares whether it is blank', () => {
    class FailTag extends Tag {
      render (): never { throw new Error('boom') }
    }
    class BlankPropertyTag extends FailTag {
      blank = true
    }
    class BlankMethodTag extends FailTag {
      blank () { return true }
    }
    class NotBlankTag extends FailTag {
      blank () { return false }
    }
    class QuietRawTag extends RawBodyTag {
      blank () { return true }
    }
    const engine = new Liquid({ inlineErrors: true, numberSemantics: 'ruby', rawTags: ['raw', 'quietraw'] })
    engine.registerTag('loud', FailTag)
    engine.registerTag('quiet', BlankPropertyTag)
    engine.registerTag('quietmethod', BlankMethodTag)
    engine.registerTag('notblank', NotBlankTag)
    engine.registerTag('quietraw', QuietRawTag)

    it('prints the error of a tag that does not declare it', async () => expect(await engine.parseAndRender('{% loud %}a')).toBe('Liquid error (line 1): booma'))
    it('records the error of a tag whose blank is true', async () => {
      const errors: LiquidError[] = []
      expect(await engine.parseAndRender('{% quiet %}a', {}, { errors })).toBe('a')
      expect(errors).toHaveLength(1)
    })
    it('records the error of a tag whose blank() returns true', async () => expect(await engine.parseAndRender('{% quietmethod %}a')).toBe('a'))
    it('prints the error of a tag whose blank() returns false', async () => expect(await engine.parseAndRender('{% notblank %}a')).toBe('Liquid error (line 1): booma'))
    it('lets a raw-body tag declare it', async () => expect(await engine.parseAndRender('{% if 1 | divided_by: 0 %}{% quietraw %}x{% endquietraw %}{% endif %}a')).toBe('a'))
    it('counts a declared blank tag towards a block that prints nothing', async () => expect(await engine.parseAndRender('{% if 1 | divided_by: 0 %}{% quiet %}{% endif %}a')).toBe('a'))
    it('counts a tag that is not blank towards a block that prints something', async () => expect(await engine.parseAndRender('{% if 1 | divided_by: 0 %}{% notblank %}{% endif %}a')).toBe('Liquid error (line 1): divided by 0a'))
  })
})

describe('error exports', () => {
  it('exports LimitError', () => expect(LimitError.is(new LimitError('memory alloc limit exceeded'))).toBe(true))
  it('exports the error text without its position', async () => {
    const errors: LiquidError[] = []
    await liquid.parseAndRender('{{ 1 | divided_by: 0 }}', {}, { errors })
    expect(liquidErrorText(errors[0])).toBe('divided by 0')
    let syntaxError: unknown
    try {
      liquid.parse('{% nosuchtag %}')
    } catch (err) {
      syntaxError = err
    }
    expect(ParseError.is(syntaxError)).toBe(true)
    expect(liquidErrorText(syntaxError as Error)).toBe('tag "nosuchtag" not found')
  })
})
