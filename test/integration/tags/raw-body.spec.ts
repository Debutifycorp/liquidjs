import { Liquid, LiquidOptions, RawBodyTag, Tokenizer, TokenizationError, ParseError, defaultOptions } from '../../../src'

class VerbatimTag extends RawBodyTag {}
class SilentTag extends RawBodyTag {
  render () { return '' }
}

const liquid = new Liquid({ rawTags: ['raw', 'comment', 'verbatim', 'silent'] })
liquid.registerTag('verbatim', VerbatimTag)
liquid.registerTag('silent', SilentTag)
const render = (src: string) => liquid.parseAndRender(src)

async function rejection (promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (err) {
    return err as Error
  }
  throw new Error('expected the render to reject')
}

describe('rawTags option', () => {
  describe('raw-body tags', () => {
    it('keeps Liquid inside a raw-body tag as text', async () => expect(await render('{% verbatim %}{{ a {% if %}{% endverbatim %}')).toBe('{{ a {% if %}'))
    it('lets a subclass decide the output', async () => expect(await render('a{% silent %}{"x": "{{ y"}{% endsilent %}b')).toBe('ab'))
    it('still supports raw', async () => expect(await render('{% raw %}{{ x }}{% endraw %}{% raw %}{{ y {% endraw %}ok')).toBe('{{ x }}{{ y ok'))
    it('supports sync rendering', () => expect(liquid.parseAndRenderSync('{% verbatim %}{{ a {% endverbatim %}')).toBe('{{ a '))

    it('reports an unclosed raw-body tag as a tokenization error naming the tag', async () => {
      const err = await rejection(render('{% verbatim %}x'))
      expect(err).toBeInstanceOf(TokenizationError)
      expect(err.message).toMatch(/^verbatim "\{% verbatim %\}x" not closed, line:1, col:\d+/)
    })
  })

  describe('comment', () => {
    it('nests', async () => expect(await render('a{% comment %}x{% comment %}y{% endcomment %}z{% endcomment %}b')).toBe('ab'))
    it('nests to any depth', async () => expect(await render('{% comment %}a{% comment %}b{% comment %}c{% endcomment %}d{% endcomment %}e{% endcomment %}f')).toBe('f'))
    it('does not parse the body', async () => expect(await render('{% comment %}{{ unclosed {% endcomment %}ok')).toBe('ok'))
    it('counts a nested comment opened with a whitespace marker', async () => expect(await render('{% comment %}{%- comment %}y{% endcomment %}z{% endcomment %}b')).toBe('b'))
    it('reports a nested comment left open', async () => {
      const err = await rejection(render('{% comment %}{% comment %}{% endcomment %}x'))
      expect(err).toBeInstanceOf(TokenizationError)
      expect(err.message).toMatch(/^comment "\{% comment %\}\{% comment %\}\{% \.\.\." not closed, line:1, col:14$/)
    })
    it('honours custom tag delimiters', async () => {
      const custom = new Liquid({ rawTags: ['raw', 'comment'], tagDelimiterLeft: '<%', tagDelimiterRight: '%>' })
      expect(await custom.parseAndRender('a<% comment %>x<% comment %>y<% endcomment %>z<% endcomment %>b')).toBe('ab')
    })
    it('nests inside a liquid tag', async () => expect(await render('{% liquid\ncomment\n  comment\n    x\n  endcomment\n  still in the outer comment\nendcomment\necho "A"\n%}')).toBe('A'))
  })

  describe('whitespace control', () => {
    it('closes on an end tag with whitespace control', async () => expect(await render('a  {%- comment -%} x {%- endcomment -%}  b')).toBe('ab'))
    it.each([
      ['{% raw %}x{%- endraw %}', 'x'],
      ['{% raw %}x{%-endraw%}', 'x'],
      ['{% raw %}x{% endraw-%} y', 'xy'],
      ['{% raw %}x{%endraw-%} y', 'xy'],
      ['{% comment %}x{% endcomment-%} b', 'b'],
      ['{% comment %}x{%endcomment-%} b', 'b'],
      ['a {%- comment -%} x {%-endcomment-%} b', 'ab'],
      ['{% verbatim %}x{%- endverbatim -%} y', 'xy']
    ])('closes %j', async (src, expected) => expect(await render(src)).toBe(expected))
  })

  describe('defaults', () => {
    const upstream = new Liquid()

    it('lists raw only', () => expect(upstream.options.rawTags).toEqual(['raw']))
    it('reads a raw body as text', async () => expect(await upstream.parseAndRender('{% raw %}{{ x }}{% endraw %}{% raw %}{{ y {% endraw %}ok')).toBe('{{ x }}{{ y ok'))
    it('reports an unclosed raw', async () => {
      const err = await rejection(upstream.parseAndRender('{% raw %}x'))
      expect(err).toBeInstanceOf(TokenizationError)
      expect(err.message).toMatch(/^raw "\{% raw %\}x" not closed, line:1, col:\d+/)
    })
    it('leaves comment unnested', async () => {
      const err = await rejection(upstream.parseAndRender('a{% comment %}x{% comment %}y{% endcomment %}z{% endcomment %}b'))
      expect(err).toBeInstanceOf(ParseError)
      expect(err.message).toMatch(/^tag "endcomment" not found/)
    })
    it('leaves a comment inside a liquid tag unnested', async () => {
      const err = await rejection(upstream.parseAndRender('{% liquid\ncomment\n  comment\n  endcomment\n  still in the outer comment\nendcomment\n%}'))
      expect(err).toBeInstanceOf(ParseError)
      expect(err.message).toMatch(/^tag "still" not found/)
    })
    it('still parses a comment body', async () => {
      const err = await rejection(upstream.parseAndRender('{% comment %}{{ unclosed {% endcomment %}ok'))
      expect(err).toBeInstanceOf(TokenizationError)
      expect(err.message).toMatch(/^output "\{\{ unclosed \{% endcomment %\}ok" not closed/)
    })
    it.each([
      '{% raw %}x{%- endraw %}',
      '{% raw %}x{%- endraw -%} y',
      '{% raw %}x{%-endraw%}',
      '{% raw %}x{% endraw-%} y',
      '{% raw %}x{%endraw-%} y'
    ])('does not close raw on an end tag written as %j, as upstream', async (src) => {
      const err = await rejection(upstream.parseAndRender(src))
      expect(err).toBeInstanceOf(TokenizationError)
      expect(err.message).toMatch(/^raw "\{% raw %\}x.*" not closed, line:1, col:10$/)
    })
    it('closes such an end tag once rawTags is set, even to the default list', async () => {
      const explicit = new Liquid({ rawTags: ['raw'] })
      expect(await explicit.parseAndRender('{% raw %}x{%- endraw %}')).toBe('x')
      expect(await explicit.parseAndRender('{% raw %}x{% endraw-%} y')).toBe('xy')
    })
    it.each([undefined, null])('behaves as upstream when rawTags is passed as %p', async (rawTags) => {
      const engine = new Liquid({ rawTags } as LiquidOptions)
      expect(engine.options.rawTags).toBe(defaultOptions.rawTags)
      expect(await engine.parseAndRender('{% raw %}{{ x }}{% endraw %}ok')).toBe('{{ x }}ok')
      const err = await rejection(engine.parseAndRender('{% raw %}x{%- endraw %}'))
      expect(err).toBeInstanceOf(TokenizationError)
      expect(err.message).toMatch(/^raw "\{% raw %\}x.*" not closed/)
    })
    it('cannot be changed through the default list', () => {
      expect(Object.isFrozen(defaultOptions.rawTags)).toBe(true)
      expect(() => upstream.options.rawTags.push('verbatim')).toThrow(TypeError)
      expect(new Liquid().options.rawTags).toEqual(['raw'])
    })
  })

  describe('Tokenizer', () => {
    it('reads the raw tags from the options given to readTopLevelTokens', () => {
      const html = '{% comment %}{{ unclosed {% endcomment %}'
      const tokens = new Tokenizer(html).readTopLevelTokens({ ...defaultOptions, rawTags: ['raw', 'comment'] })
      expect(tokens.map(token => token.getText())).toEqual(['{% comment %}', '{{ unclosed ', '{% endcomment %}'])
      expect(() => new Tokenizer(html).readTopLevelTokens()).toThrow(/output "\{\{ unclosed/)
    })
    it('keeps the body of a raw-body tag out of the whitespace control of its own tags', () => {
      const html = 'a {%- verbatim -%}  x  {%- endverbatim -%} b'
      const tokens = new Tokenizer(html).readTopLevelTokens({ ...defaultOptions, rawTags: ['raw', 'verbatim'] })
      expect(tokens.length).toBe(5)
      expect([0, 2, 4].map(i => (tokens[i] as any).getContent())).toEqual(['a', '  x  ', 'b'])
    })
  })
})
