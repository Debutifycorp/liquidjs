import { createHash, timingSafeEqual } from 'crypto'
import { redirect } from './handler'
import type { RouteHandler } from './handler'
import { pageForPath, renderPageResponse } from './pages'

const digest = (text: string) => createHash('sha256').update(text).digest()

/** `POST /password`, https://shopify.dev/docs/storefronts/themes/architecture/templates/password: the storefront password unlocks a protected store for this visitor. A wrong one renders the password page with the form's error. The two passwords are compared as digests, so the comparison takes the same time whatever their lengths. */
const password: RouteHandler = async ctx => {
  const given = typeof ctx.fields.password === 'string' ? ctx.fields.password : ''
  const wanted = ctx.options.password ?? ''
  if (wanted !== '' && timingSafeEqual(digest(given), digest(wanted))) return { response: redirect(ctx, '/'), state: { ...ctx.visitor, unlocked: true } }
  // the error text and status follow no recording (the parity store was recorded past its password page): they are Debutify's
  const page = pageForPath(ctx, `${ctx.routed.localePrefix}/password`)
  return { response: await renderPageResponse(ctx, page, 200, { type: 'storefront_password', posted: false, errors: { password: ['Incorrect password'] } }) }
}

export const FORM_HANDLERS: Record<string, RouteHandler> = { password }
