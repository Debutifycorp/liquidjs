/** `str` without its tags, comments and script and style blocks: the text `strip_html` returns, for callers outside a render. It lives here, not in `src/filters/html.ts`, because every export of a filter module is registered as a filter (final review C, I1). */
export function stripTags (str: string) {
  const blocks = new Map([['<script', '</script>'], ['<style', '</style>'], ['<!--', '-->'], ['<', '>']])
  let out = ''
  let i = 0
  while (i < str.length) {
    const lt = str.indexOf('<', i)
    if (lt < 0) return out + str.slice(i)
    out += str.slice(i, lt)
    for (const [opener, closer] of blocks) {
      if (!str.startsWith(opener, lt)) continue
      const e = str.indexOf(closer, lt + opener.length)
      if (e >= 0) { i = e + closer.length; break }
      blocks.delete(opener)
    }
    if (i <= lt) return out + str.slice(lt)
  }
  return out
}
