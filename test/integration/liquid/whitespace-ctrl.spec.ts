import { Liquid } from '../../../src/liquid'

const liquid = new Liquid()

const cases = [
  {
    text: `
      <div>
        <p>
          {{ 'John' }}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          John
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>


          {{- 'John' -}}


        </p>
      </div>
    `,
    expected: `
      <div>
        <p>John</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>


          {%- if true -%}
          yes
          {%- endif -%}


        </p>
      </div>
    `,
    expected: `
      <div>
        <p>yes</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {% if true %}
          yes
          {% endif %}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          
          yes
          
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {% if false %}
          no
          {% endif %}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          
        </p>
      </div>
    `
  }, {
    text: '<p>{{- \'John\' -}}</p>',
    expected: '<p>John</p>'
  }, {
    text: '<p>{%- if true -%}yes{%- endif -%}</p>',
    expected: '<p>yes</p>'
  }, {
    text: '<p>{%- if false -%}no{%- endif -%}</p>',
    expected: '<p></p>'
  }, {
    text: '<p> {%- if true %} yes {% endif -%} </p>',
    expected: '<p> yes </p>'
  }, {
    text: '<p> {%- if false %} no {% endif -%} </p>',
    expected: '<p></p>'
  }, {
    text: '<p> {% if true -%} yes {%- endif %} </p>',
    expected: '<p> yes </p>'
  }, {
    text: '<p> {% if false -%} no {%- endif %} </p>',
    expected: '<p>  </p>'
  }, {
    text: '<p> {% if true -%} yes {% endif -%} </p>',
    expected: '<p> yes </p>'
  }, {
    text: '<p> {% if false -%} no {% endif -%} </p>',
    expected: '<p> </p>'
  }, {
    text: '<p> {%- if true %} yes {%- endif %} </p>',
    expected: '<p> yes </p>'
  }, {
    text: '<p> {%- if false %} no {%- endif %} </p>',
    expected: '<p> </p>'
  }, {
    text: `
      <div>
        <p>
          {{- 'John' }}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>John
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if true %}
          yes
          {%- endif %}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          yes
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if false %}
          no
          {%- endif %}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {{ 'John' -}}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          John</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {% if true -%}
          yes
          {% endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          yes
          </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {% if false -%}
          no
          {% endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if true %}
          yes
          {% endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          yes
          </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if false %}
          no
          {% endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p></p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {% if true -%}
          yes
          {%- endif %}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          yes
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {% if false -%}
          no
          {%- endif %}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>
          
        </p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {{- 'John' -}}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>John</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if true -%}
          yes
          {%- endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>yes</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if false -%}
          no
          {%- endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p></p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {{- 'John' -}},
          {{- '30' -}}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>John,30</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if true -%}
          yes
          {%- endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p>yes</p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {%- if false -%}
          no
          {%- endif -%}
        </p>
      </div>
    `,
    expected: `
      <div>
        <p></p>
      </div>
    `
  }, {
    text: `
      <div>
        <p>
          {{- 'John' -}}
          {{- '30' -}}
        </p>
        <b>
          {{ 'John' -}}
          {{- '30' }}
        </b>
        <i>
          {{- 'John' }}
          {{ '30' -}}
        </i>
      </div>
    `,
    expected: `
      <div>
        <p>John30</p>
        <b>
          John30
        </b>
        <i>John
          30</i>
      </div>
    `
  }, {
    text: `
      <div>
        {%- if true -%}
          {%- if true -%}
            <p>
              {{- 'John' -}}
            </p>
          {%- endif -%}
        {%- endif -%}
      </div>
    `,
    expected: `
      <div><p>John</p></div>
    `
  }, {
    text: `
      <div>
        {% raw %}
          {%- if true -%}
            <p>
              {{- 'John' -}}
            </p>
          {%- endif -%}
        {% endraw %}
      </div>
    `,
    expected: `
      <div>
        
          {%- if true -%}
            <p>
              {{- 'John' -}}
            </p>
          {%- endif -%}
        
      </div>
    `
  }
]

describe('Whitespace Control', function () {
  cases.forEach(item => it(
    item.text,
    async () => {
      const html = await liquid.parseAndRender(item.text)
      expect(html).toBe(item.expected)
    }
  ))
})

// Shopify/liquid lib/liquid/block_body.rb `whitespace_handler`: a `{%-` or `{{-` right-strips the text before it, and with `bug_compatible_whitespace_trimming` a text stripped to nothing keeps its first character. Without the option the cases are test/integration/trim_mode_test.rb `test_pre_trim_blank_preceding_text`, with it `test_bug_compatible_pre_trim`.
describe('bugCompatibleWhitespaceTrimming', function () {
  const bugCompatible = new Liquid({ bugCompatibleWhitespaceTrimming: true })
  it('is off by default, as in Ruby Liquid', async () => {
    expect(await liquid.parseAndRender('\n{%- raw %}{% endraw %}')).toBe('')
    expect(await liquid.parseAndRender('\n{%- if true %}{% endif %}')).toBe('')
    expect(await liquid.parseAndRender("{{ 'B' }} \n{%- if true %}C{% endif %}")).toBe('BC')
  })
  it('keeps the first character of a text that a left trim strips to nothing', async () => {
    expect(await bugCompatible.parseAndRender('\n {%- raw %}{% endraw %}')).toBe('\n')
    expect(await bugCompatible.parseAndRender('\n {%- if true %}{% endif %}')).toBe('\n')
    expect(await bugCompatible.parseAndRender("{{ 'B' }} \n{%- if true %}C{% endif %}")).toBe('B C')
    expect(await bugCompatible.parseAndRender('B\n {%- raw %}{% endraw %}')).toBe('B')
    expect(await bugCompatible.parseAndRender('B\n {%- if true %}{% endif %}')).toBe('B')
  })
  // the same `whitespace_handler` runs for `{{-` and for `{%- liquid`, and a text a `-%}` or `-}}` already left-stripped to nothing has no first character to keep
  it('treats output tags and the liquid tag the same way, and keeps nothing of a text a right trim emptied', async () => {
    expect(await bugCompatible.parseAndRender("{{ 'B' }} \n{{- 'C' }}")).toBe('B C')
    expect(await bugCompatible.parseAndRender("{{ 'B' }}\n  {%- liquid echo 'C' %}")).toBe('B\nC')
    expect(await bugCompatible.parseAndRender("{{ 'B' -}} \n{%- if true %}C{% endif %}")).toBe('BC')
    expect(await bugCompatible.parseAndRender("{{ 'B' }}x \n{%- if true %}C{% endif %}")).toBe('BxC')
  })
  it('leaves the body of a raw tag untouched', async () => {
    expect(await bugCompatible.parseAndRender('{% raw %} \n{%- if true -%}{% endraw %}')).toBe(' \n{%- if true -%}')
  })
})
