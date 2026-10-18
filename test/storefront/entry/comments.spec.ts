import { storefrontSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { harness, harnessTheme } from './harness'

// https://shopify.dev/docs/api/liquid/objects/article (`comments`, `comments_count`, `comments_enabled?`, `moderated?`, `comment_post_url`), https://shopify.dev/docs/api/liquid/objects/comment and the `new_comment` form of https://shopify.dev/docs/api/liquid/tags/form; the parity store's blog takes no comments, so none of this is recorded
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString()
const ARTICLE = '/blogs/news/making-liquid'
const ARTICLE_TEMPLATE = '{%- form "new_comment", article -%}{%- if form.errors -%}E:{%- for field in form.errors -%}{{ field }}={{ form.errors.messages[field] }},{%- endfor -%}{%- endif -%}{%- if form.posted_successfully? -%}POSTED{%- endif -%}|author={{ form.author }}|email={{ form.email }}|body={{ form.body }}{%- endform -%}|count={{ article.comments_count }}|enabled={{ article["comments_enabled?"] }}|moderated={{ article["moderated?"] }}|post={{ article.comment_post_url }}|list={%- for c in article.comments -%}<{{ c.id }}:{{ c.author }}:{{ c.content }}:{{ c.status }}:{{ c.url }}>{%- endfor -%}|comment={{ comment.status }}:{{ comment.content }}'

function store (commentable: 'no' | 'moderate' | 'yes' | undefined, extra: Partial<StoreData['blogs'] extends Array<infer B> | undefined ? B : never> = {}) {
  const data = structuredClone(storefrontSampleData) as StoreData
  const blog = data.blogs![0]
  if (commentable) blog.commentable = commentable
  Object.assign(blog, extra)
  const files: Record<string, string> = { ...harnessTheme().files, 'templates/article.liquid': ARTICLE_TEMPLATE }
  delete files['templates/article.json']
  return harness({ data, theme: { files } })
}

const GOOD = form({ form_type: 'new_comment', utf8: '✓', 'comment[author]': 'Cornelius', 'comment[email]': 'c@example.com', 'comment[body]': 'Wow, this is going to save me a fortune!' })

describe('blog comments', () => {
  it('has no comments and no form that works on a blog that takes none', async () => {
    const { send } = store(undefined)
    const page = await send('GET', ARTICLE)
    expect(page.text).toContain('count=0|enabled=false|moderated=false|post=/blogs/news/making-liquid/comments|list=|comment=:')
    const posted = await send('POST', `${ARTICLE}/comments`, GOOD)
    expect(posted.status).toBe(404)
    expect((await send('GET', ARTICLE)).text).toContain('count=0')
  })

  it('lists the published comments of the data, and counts them', async () => {
    const { send } = store('yes')
    const data = structuredClone(storefrontSampleData) as StoreData
    data.blogs![0].commentable = 'yes'
    data.blogs![0].articles[0].comments = [{ id: 129089273921, author: 'Cornelius', email: 'c@example.com', content: 'Wow!', created_at: '2022-06-05T19:33:57-04:00' }]
    const files: Record<string, string> = { ...harnessTheme().files, 'templates/article.liquid': ARTICLE_TEMPLATE }
    delete files['templates/article.json']
    const answer = await harness({ data, theme: { files } }).send('GET', ARTICLE)
    expect(answer.text).toContain('count=1|enabled=true|moderated=false')
    expect(answer.text).toContain('list=<129089273921:Cornelius:Wow!:published:/blogs/news/making-liquid#129089273921>')
    expect((await send('GET', ARTICLE)).text).toContain('count=0')
  })

  it('publishes a comment at once on a blog that publishes them, and keeps it for the visitor', async () => {
    const { send } = store('yes')
    const posted = await send('POST', `${ARTICLE}/comments`, GOOD)
    expect([posted.status, posted.headers.get('location')]).toEqual([302, `${ARTICLE}?comment=700000000001#comment_form`])
    const after = await send('GET', `${ARTICLE}?comment=700000000001`)
    expect(after.text).toContain('POSTED|')
    expect(after.text).toContain('count=1|')
    expect(after.text).toContain('list=<700000000001:Cornelius:Wow, this is going to save me a fortune!:published:/blogs/news/making-liquid#700000000001>')
    expect(after.text).toContain('comment=published:Wow, this is going to save me a fortune!')
    // the comment stays in the list on a later visit, and the form is no longer posted
    const later = await send('GET', ARTICLE)
    expect(later.text).not.toContain('POSTED')
    expect(later.text).toContain('count=1|')
  })

  it('holds a comment for approval on a blog that moderates them: posted, unapproved, not listed', async () => {
    const { send } = store('moderate')
    const posted = await send('POST', `${ARTICLE}/comments`, GOOD)
    expect(posted.headers.get('location')).toBe(`${ARTICLE}?comment=700000000001#comment_form`)
    const after = await send('GET', `${ARTICLE}?comment=700000000001`)
    expect(after.text).toContain('POSTED|')
    expect(after.text).toContain('count=0|enabled=true|moderated=true')
    expect(after.text).toContain('list=|comment=unapproved:Wow, this is going to save me a fortune!')
    expect((await send('GET', ARTICLE)).text).toContain('list=|comment=:')
  })

  it('numbers the visitor\'s comments one after the other, and ignores a comment id that is not theirs', async () => {
    const { send } = store('yes')
    await send('POST', `${ARTICLE}/comments`, GOOD)
    const second = await send('POST', `${ARTICLE}/comments`, GOOD)
    expect(second.headers.get('location')).toContain('comment=700000000002')
    const foreign = await send('GET', `${ARTICLE}?comment=1`)
    expect(foreign.text).not.toContain('POSTED')
    expect(foreign.text).toContain('count=2|')
  })

  it('shows the errors of an incomplete comment with what was posted, and keeps nothing', async () => {
    const { send } = store('yes')
    const answer = await send('POST', `${ARTICLE}/comments`, form({ form_type: 'new_comment', 'comment[author]': '', 'comment[email]': 'nope', 'comment[body]': 'Hi' }))
    expect(answer.status).toBe(200)
    expect(answer.text).toContain('E:author=can\'t be blank,email=is invalid,')
    expect(answer.text).toContain('|author=|email=nope|body=Hi')
    expect(answer.text).not.toContain('POSTED')
    expect((await send('GET', ARTICLE)).text).toContain('count=0')
  })

  it('answers the 404 page for an article or a blog the store lacks', async () => {
    const { send } = store('yes')
    expect((await send('POST', '/blogs/news/nothing/comments', GOOD)).status).toBe(404)
    expect((await send('POST', '/blogs/nothing/making-liquid/comments', GOOD)).status).toBe(404)
  })

  it('escapes what a visitor writes, since a theme prints comment.content as it is', async () => {
    const { send } = store('yes')
    await send('POST', `${ARTICLE}/comments`, form({ form_type: 'new_comment', 'comment[author]': '<script>alert(1)</script>', 'comment[email]': 'c@example.com', 'comment[body]': '<img src=x onerror=alert(1)>\nSecond line' }))
    const page = await send('GET', `${ARTICLE}?comment=700000000001`)
    expect(page.text).not.toMatch(/<script>alert|<img/)
    expect(page.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(page.text).toContain('&lt;img src=x onerror=alert(1)&gt;<br />Second line')
  })

  it('answers under a base path and a locale prefix', async () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    data.blogs![0].commentable = 'yes'
    const files: Record<string, string> = { ...harnessTheme().files, 'templates/article.liquid': ARTICLE_TEMPLATE }
    delete files['templates/article.json']
    const { send } = harness({ data, theme: { files } }, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    const posted = await send('POST', `/p/tok${ARTICLE}/comments`, GOOD)
    expect(posted.headers.get('location')).toBe(`/p/tok${ARTICLE}?comment=700000000001#comment_form`)
    expect((await send('GET', `/p/tok${ARTICLE}?comment=700000000001`)).text).toContain('post=/p/tok/blogs/news/making-liquid/comments')
  })
})
