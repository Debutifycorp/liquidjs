import { Token } from './token'
import { TokenKind } from '../parser'

export class NumberToken extends Token {
  public content: number
  /** Whether the literal was written with a decimal point (`10.0`, `2.5`). */
  public readonly isFloat: boolean
  constructor (
    public input: string,
    public begin: number,
    public end: number,
    public file?: string
  ) {
    super(TokenKind.Number, input, begin, end, file)
    const text = this.getText()
    this.content = Number(text)
    this.isFloat = text.includes('.')
  }
}
