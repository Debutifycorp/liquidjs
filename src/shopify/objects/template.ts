import { Drop } from '../../drop'

/** Shopify's `template` object for a template path such as `page.contact` or `customers/login`. Printed on its own it is the name with its suffix (`page.contact`). https://shopify.dev/docs/api/liquid/objects/template (`directory`, `name`, `suffix`). */
export class TemplateDrop extends Drop {
  public readonly name: string
  public readonly suffix: string | null
  public readonly directory: string | null

  public constructor (templateName: string) {
    super()
    const slash = templateName.lastIndexOf('/')
    this.directory = slash === -1 ? null : templateName.slice(0, slash)
    const file = slash === -1 ? templateName : templateName.slice(slash + 1)
    const dot = file.indexOf('.')
    this.name = dot === -1 ? file : file.slice(0, dot)
    this.suffix = dot === -1 ? null : file.slice(dot + 1)
  }

  public valueOf () {
    return this.suffix ? `${this.name}.${this.suffix}` : this.name
  }
}
