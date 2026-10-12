import { LimitError } from './error'

export class Limiter {
  private message: string
  private base = 0
  private limit: number
  constructor (resource: string, limit: number) {
    this.message = `${resource} limit exceeded`
    this.limit = limit
  }
  use (count: number) {
    if (+count > 0) {
      if (!(this.base + +count <= this.limit)) throw new LimitError(this.message)
      this.base += +count
    }
  }
  check (count: number) {
    if (+count > 0) {
      if (!(+count <= this.limit)) throw new LimitError(this.message)
    }
  }
}
