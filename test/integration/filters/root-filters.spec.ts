import { Liquid } from '../../../src/liquid'
import { createShopifyLiquid } from '../../../src/shopify'

// Final review C, I1: 1.1.0 must add no filter to the root engine. These are the names 1.0.1 registered (debutify-v1.0.1, src/filters).
const FILTERS_OF_1_0_1 = [
  'abs', 'append', 'array_to_sentence_string', 'at_least', 'at_most', 'base64_decode', 'base64_encode', 'capitalize', 'ceil', 'cgi_escape', 'compact', 'concat', 'date', 'date_to_long_string',
  'date_to_rfc822', 'date_to_string', 'date_to_xmlschema', 'default', 'divided_by', 'downcase', 'escape', 'escape_once', 'find', 'find_exp', 'find_index', 'find_index_exp', 'first', 'floor',
  'group_by', 'group_by_exp', 'has', 'has_exp', 'hmac_sha256', 'inspect', 'join', 'json', 'jsonify', 'last', 'lstrip', 'map', 'minus', 'modulo', 'newline_to_br', 'normalize_whitespace',
  'number_of_words', 'plus', 'pop', 'prepend', 'push', 'raw', 'reject', 'reject_exp', 'remove', 'remove_first', 'remove_last', 'replace', 'replace_first', 'replace_last', 'reverse', 'round',
  'rstrip', 'sample', 'sha256', 'shift', 'size', 'slice', 'slugify', 'sort', 'sort_natural', 'split', 'squish', 'strip', 'strip_html', 'strip_newlines', 'sum', 'times', 'to_integer', 'truncate',
  'truncatewords', 'uniq', 'unshift', 'upcase', 'uri_escape', 'url_decode', 'url_encode', 'where', 'where_exp', 'xml_escape'
]

describe('the filters of the root engine', () => {
  it('are the ones 1.0.1 registered: a helper exported from src/filters must not become a filter', () => {
    expect(Object.keys(new Liquid().filters).sort()).toEqual(FILTERS_OF_1_0_1)
  })
  it('leave the Shopify preset with the same names', () => {
    const names = Object.keys(createShopifyLiquid().filters)
    expect(names).not.toContain('stripTags')
    expect(names).not.toContain('strip_tags')
  })
  it('still reject stripTags and strip_tags as undefined filters', () => {
    const liquid = new Liquid({ strictFilters: true })
    expect(() => liquid.parseAndRenderSync('{{ "<b>x</b>" | stripTags }}')).toThrow(/undefined filter: stripTags/)
    expect(() => liquid.parseAndRenderSync('{{ "<b>x</b>" | strip_tags }}')).toThrow(/undefined filter: strip_tags/)
  })
  it('keep strip_html, which is LiquidJS own, stripping tags', () => {
    expect(new Liquid().parseAndRenderSync('{{ "<b>x</b><!-- c --><script>y</script>" | strip_html }}')).toBe('x')
  })
})

// The root entry is upstream LiquidJS (1.2.0 changed nothing in `date`): Shopify's named formats, the page's language and `date_formats` belong to the Shopify layer. The expected values below were taken from the 1.2.0 tree (e35853857), whose `date` is upstream's, and must hold here too.
describe('the date filter of the root engine', () => {
  const day = '2018-12-31T10:05:00Z'
  const render = (options: object, template: string) => new Liquid({ timezoneOffset: 0, ...options }).parseAndRenderSync(template, { day })

  it('prints a Shopify named format as the text it is, since it has no % directive', () => {
    const names = ['abbreviated_date', 'basic', 'date', 'date_at_time', 'default', 'on_date', 'short', 'long']
    for (const name of names) expect(render({}, `{{ day | date: '${name}' }}`)).toBe(name)
  })
  it('prints the default format with a date and no format', () => {
    expect(render({}, '{{ day | date }}')).toBe('Monday, December 31, 2018 at 10:05 am +0000')
  })
  it('names the day and the month in English with %A, %a, %B and %b', () => {
    expect(render({}, "{{ day | date: '%A|%a|%B|%b' }}")).toBe('Monday|Mon|December|Dec')
  })
  it('names them in the locale option\'s language, and not in the language of a page', () => {
    expect(render({ locale: 'zh-CN' }, "{{ day | date: '%A|%a|%B|%b' }}")).toBe('星期一|周一|十二月|12月')
    expect(render({ locale: 'de' }, "{{ day | date: '%A|%a|%B|%b' }}")).toBe('Montag|Mo|Dezember|Dez')
  })
  it('keeps date_to_string and date_to_long_string as upstream writes them', () => {
    expect(render({}, '{{ day | date_to_string }}|{{ day | date_to_long_string }}')).toBe('31 Dec 2018|31 December 2018')
  })
})
