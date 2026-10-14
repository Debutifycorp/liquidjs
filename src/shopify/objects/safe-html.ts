import { Drop } from '../../drop'

/** Markup a filter wrote, printed as itself, that `escape` passes through unchanged: Shopify's `escape` leaves an HTML-safe string as it is (liquid-spec shopify_production_recordings `RecordedTest#ScratchpadTest#test_do_not_double_escape_replaced_last_html_safe_string_when_no_replacement_is_needed`), and `image_tag`'s output is one. A filter that reads it as a string (`strip`, `replace`) gets plain text, as `strip` makes an HTML-safe string plain on Shopify (`RecordedTest#test_strip_on_html_safe_string_…`). */
export class SafeHtmlDrop extends Drop {
  public constructor (public readonly html: string) {
    super()
  }

  public get length () {
    return this.html.length
  }

  /** `{{ tag.size }}`, as for the string it stands for. */
  public get size () {
    return this.html.length
  }

  public valueOf () {
    return this.html
  }

  public toString () {
    return this.html
  }

  public toJSON () {
    return this.html
  }
}
