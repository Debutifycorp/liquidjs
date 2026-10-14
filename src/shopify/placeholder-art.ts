/**
 * Debutify's own line drawings for `placeholder_svg_tag`, one for each placeholder name https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag lists. They are not Shopify's artwork: only the markup follows the page's example, an `<svg>` with `xmlns` and the `0 0 525.5 525.5` viewBox holding `<path>` elements with no fill and no background, so the drawing takes the theme's CSS `fill` and sits on the theme's own placeholder background.
 *
 * Each drawing is a list of strokes in a 525.5 square, each stroke a letter and its numbers: `l x y x y …` a line through the points, `p x y x y …` a closed outline, `r x y w h [radius]` a rectangle, `c x y r` a circle, `e x y rx ry` an ellipse, `a x y r from to` an arc in degrees (0 points right, 90 down) and `d x y r` a dot. Every stroke becomes a filled outline of one line width in a single `<path>`: shapes run clockwise and the holes of rings counter-clockwise, so with the default nonzero fill rule overlapping strokes join and paint once.
 */

const HALF = 1.6
const DRAWINGS: Record<string, string> = {
  'product-1': 'r 170 200 150 170 18; a 320 285 45 -80 80; l 212 180 204 165 212 150 204 135; l 247 180 239 165 247 150 239 135; l 282 180 274 165 282 150 274 135; l 130 392 360 392',
  'product-2': 'r 240 110 46 34 6; p 246 144 280 144 280 180 318 214 318 410 208 410 208 214 246 180; r 222 260 82 90 4; l 238 290 288 290; l 238 312 274 312',
  'product-3': 'p 200 130 326 130 360 240 166 240; l 263 240 263 380; e 263 392 70 14; l 300 240 300 290; d 300 296 6',
  'product-4': 'p 200 304 326 304 308 410 218 410; r 190 282 146 22 4; l 263 282 263 200; e 222 225 42 15; e 304 200 42 15; e 263 160 15 40',
  'product-5': 'c 263 263 70; l 263 263 263 220; l 263 263 293 278; d 263 263 6; r 228 120 70 70 8; r 228 336 70 70 8; r 333 255 14 16 3; d 263 207 4; d 319 263 4; d 263 319 4; d 207 263 4',
  'product-6': 'r 170 250 186 150 4; r 158 214 210 36 4; l 263 214 263 400; e 236 196 28 16; e 290 196 28 16',
  'collection-1': 'l 110 300 415 300; l 110 410 415 410; r 130 210 60 90 6; c 245 262 36; p 300 300 290 250 305 215 335 215 350 250 340 300; r 140 340 40 70 4; r 190 320 40 90 4; r 240 350 40 60 4; a 345 370 40 0 180',
  'collection-2': 'p 170 200 356 200 376 410 150 410; a 263 200 50 180 360; l 170 232 356 232; r 300 300 40 26 4',
  'collection-3': 'r 130 130 120 120 4; r 275 130 120 120 4; r 130 275 120 120 4; r 275 275 120 120 4; c 190 190 26; l 290 230 320 190 340 210 360 180 380 230; l 150 330 230 330; l 150 350 210 350; l 150 370 220 370; d 335 335 20',
  'collection-4': 'p 170 410 160 300 175 240 175 180 205 180 205 240 220 300 210 410; c 280 350 60; r 265 268 30 26 4; p 345 410 340 340 395 340 390 410; l 120 410 420 410',
  'collection-5': 'r 140 170 50 230 4; r 196 200 40 200 4; r 242 150 56 250 4; p 310 400 352 190 392 198 350 408; l 150 200 180 200; l 150 370 180 370; l 252 180 288 180; l 252 370 288 370; l 120 410 410 410',
  'collection-6': 'r 140 250 90 150 14; r 134 228 102 24 6; r 158 300 54 50 3; r 250 290 80 110 12; r 244 268 92 24 6; r 350 320 50 80 10; r 345 302 60 20 5; l 120 410 420 410',
  'lifestyle-1': 'c 360 170 34; l 90 380 190 230 250 310 300 250 435 380; l 80 380 445 380; a 175 185 22 180 360; a 212 175 30 180 360; l 150 185 245 185',
  'lifestyle-2': 'r 150 210 140 100 18; r 140 300 160 50 10; l 160 350 155 400; l 280 350 285 400; r 320 300 90 12 3; l 335 312 335 400; l 395 312 395 400; p 340 230 390 230 400 270 330 270; l 365 270 365 300; l 110 400 430 400; r 190 120 70 50 3',
  image: 'r 120 150 286 226 14; l 140 350 220 260 270 310 310 270 386 350; c 330 210 24',
  'product-apparel-1': 'p 200 135 236 135 263 160 290 135 326 135 395 185 370 232 340 215 340 400 186 400 186 215 156 232 131 185; l 186 215 186 232; l 340 215 340 232',
  'product-apparel-2': 'p 195 130 331 130 345 410 285 410 263 220 241 410 181 410; l 194 160 332 160; l 210 160 225 200; l 316 160 301 200',
  'product-apparel-3': 'a 263 300 95 180 360; l 168 300 358 300; p 330 300 418 300 442 318 330 318; d 263 205 7; l 263 205 263 300; a 303.1 300 103.1 180 247.1; a 222.9 300 103.1 292.9 360',
  'product-apparel-4': 'p 140 330 150 250 200 250 240 290 330 300 395 320 405 350 140 350; r 140 350 266 16 6; l 205 268 222 256; l 218 282 236 270; l 232 294 250 282',
  'collection-apparel-1': 'a 263 140 18 180 450; l 263 158 263 180; p 263 180 396 262 130 262; p 160 262 220 262 263 292 306 262 366 262 366 410 160 410',
  'collection-apparel-2': 'r 150 320 226 60 8; r 160 260 206 60 8; r 170 200 186 60 8; l 233 200 263 225 293 200',
  'collection-apparel-3': 'l 110 150 415 150; l 120 150 120 410; l 405 150 405 410; l 95 410 145 410; l 380 410 430 410; l 180 150 180 175; p 180 175 225 200 135 200; r 140 200 80 150 6; l 263 150 263 175; p 263 175 308 200 218 200; r 223 200 80 170 6; l 346 150 346 175; p 346 175 391 200 301 200; r 306 200 80 130 6',
  'collection-apparel-4': 'c 195 270 55; c 331 270 55; a 263 270 22 200 340; l 140 255 105 240; l 386 255 421 240',
  'hero-apparel-1': 'p 90 140 435 140 415 185 110 185; a 140.5 185 30.5 0 180; a 201.5 185 30.5 0 180; a 262.5 185 30.5 0 180; a 323.5 185 30.5 0 180; a 384.5 185 30.5 0 180; r 120 230 285 180 6; p 243 260 283 260 290 300 320 390 206 390 236 300; l 243 260 248 243; l 283 260 278 243; l 90 410 435 410',
  'hero-apparel-2': 'p 200 140 326 140 390 180 405 330 360 335 350 230 350 405 176 405 176 230 166 335 121 330 136 180; l 263 175 263 405; l 225 140 263 175 301 140; l 196 320 236 320; l 290 320 330 320',
  'hero-apparel-3': 'r 110 300 190 110 6; r 100 280 210 24 5; l 160 330 250 330; p 300 360 306 300 340 300 368 330 420 338 428 362 300 362; r 300 362 128 14 5; l 322 312 336 304; l 334 324 350 314',
  'blog-apparel-1': 'p 263 170 130 150 130 380 263 400; p 263 170 396 150 396 380 263 400; l 155 200 240 210; l 155 230 240 240; l 155 260 220 268; l 155 290 236 300; r 290 190 85 70 4; l 290 290 375 285; l 290 320 360 316',
  'blog-apparel-2': 'r 130 200 266 170 18; c 263 290 58; c 263 290 32; r 175 175 60 25 5; r 330 182 40 18 4; d 360 230 8',
  'blog-apparel-3': 'r 160 160 110 22 4; r 160 360 110 22 4; r 180 182 70 178; l 180 210 250 220; l 180 240 250 250; l 180 270 250 280; l 180 300 250 310; l 180 330 250 340; l 320 140 370 400; e 324 162 4 12; l 250 230 300 260 324 178',
  'detailed-apparel-1': 'c 263 263 90; c 263 263 70; c 240 240 9; c 286 240 9; c 240 286 9; c 286 286 9; l 240 240 286 286; l 286 240 240 286; l 100 110 130 110; l 150 110 180 110; l 200 110 230 110; l 250 110 280 110; l 300 110 330 110; l 350 110 380 110; l 400 110 425 110; l 100 420 130 420; l 150 420 180 420; l 200 420 230 420; l 250 420 280 420; l 300 420 330 420; l 350 420 380 420; l 400 420 425 420'
}

const n = (value: number) => String(Math.round(value * 10) / 10)
const pt = (x: number, y: number) => `${n(x)} ${n(y)}`

/** A circle, clockwise (`sweep` 1) or counter-clockwise (0). */
function circle (cx: number, cy: number, r: number, sweep: 0 | 1): string {
  return `M${pt(cx - r, cy)}A${n(r)} ${n(r)} 0 1 ${sweep} ${pt(cx + r, cy)}A${n(r)} ${n(r)} 0 1 ${sweep} ${pt(cx - r, cy)}Z`
}

function ellipse (cx: number, cy: number, rx: number, ry: number, sweep: 0 | 1): string {
  return `M${pt(cx - rx, cy)}A${n(rx)} ${n(ry)} 0 1 ${sweep} ${pt(cx + rx, cy)}A${n(rx)} ${n(ry)} 0 1 ${sweep} ${pt(cx - rx, cy)}Z`
}

/** A rounded rectangle, clockwise or, for a hole, counter-clockwise. */
function box (x: number, y: number, w: number, h: number, r: number, clockwise: boolean): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const corner = (tx: number, ty: number) => r ? `A${n(r)} ${n(r)} 0 0 ${clockwise ? 1 : 0} ${pt(tx, ty)}` : ''
  return clockwise
    ? `M${pt(x + r, y)}H${n(x + w - r)}${corner(x + w, y + r)}V${n(y + h - r)}${corner(x + w - r, y + h)}H${n(x + r)}${corner(x, y + h - r)}V${n(y + r)}${corner(x + r, y)}Z`
    : `M${pt(x + r, y)}${corner(x, y + r)}V${n(y + h - r)}${corner(x + r, y + h)}H${n(x + w - r)}${corner(x + w, y + h - r)}V${n(y + r)}${corner(x + w - r, y)}Z`
}

/** A line from one point to another with round ends, clockwise. */
function segment (x1: number, y1: number, x2: number, y2: number): string {
  const length = Math.hypot(x2 - x1, y2 - y1)
  if (!length) return circle(x1, y1, HALF, 1)
  const nx = (y2 - y1) / length * HALF
  const ny = -(x2 - x1) / length * HALF
  const cap = `A${n(HALF)} ${n(HALF)} 0 0 1`
  return `M${pt(x1 + nx, y1 + ny)}L${pt(x2 + nx, y2 + ny)}${cap} ${pt(x2 - nx, y2 - ny)}L${pt(x1 - nx, y1 - ny)}${cap} ${pt(x1 + nx, y1 + ny)}Z`
}

/** An arc of a circle from `from` to `to` degrees, as a band with round ends, clockwise. */
function arc (cx: number, cy: number, r: number, from: number, to: number): string {
  const at = (radius: number, degrees: number) => pt(cx + radius * Math.cos(degrees * Math.PI / 180), cy + radius * Math.sin(degrees * Math.PI / 180))
  const large = to - from > 180 ? 1 : 0
  const outer = r + HALF
  const inner = r - HALF
  const cap = `A${n(HALF)} ${n(HALF)} 0 0 1`
  return `M${at(outer, from)}A${n(outer)} ${n(outer)} 0 ${large} 1 ${at(outer, to)}${cap} ${at(inner, to)}A${n(inner)} ${n(inner)} 0 ${large} 0 ${at(inner, from)}${cap} ${at(outer, from)}Z`
}

function polyline (values: number[], closed: boolean): string {
  const points: Array<[number, number]> = []
  for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i], values[i + 1]])
  if (closed) points.push(points[0])
  let d = ''
  for (let i = 0; i + 1 < points.length; i++) d += segment(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
  return d
}

function stroke (command: string): string {
  const [kind, ...rest] = command.trim().split(/\s+/)
  const v = rest.map(Number)
  switch (kind) {
    case 'l': return polyline(v, false)
    case 'p': return polyline(v, true)
    case 'r': return box(v[0] - HALF, v[1] - HALF, v[2] + 2 * HALF, v[3] + 2 * HALF, (v[4] ?? 0) + HALF, true) + box(v[0] + HALF, v[1] + HALF, v[2] - 2 * HALF, v[3] - 2 * HALF, (v[4] ?? 0) - HALF, false)
    case 'c': return circle(v[0], v[1], v[2] + HALF, 1) + circle(v[0], v[1], v[2] - HALF, 0)
    case 'e': return ellipse(v[0], v[1], v[2] + HALF, v[3] + HALF, 1) + ellipse(v[0], v[1], v[2] - HALF, v[3] - HALF, 0)
    case 'a': return arc(v[0], v[1], v[2], v[3], v[4])
    case 'd': return circle(v[0], v[1], v[2], 1)
    default: return ''
  }
}

const built = new Map<string, string>()

/** The `<svg>` of a placeholder name, the `image` drawing for a name the page does not list (what Shopify prints then is not pinned). Each drawing is built once and kept. */
export function placeholderArt (name: string): string {
  const key = Object.prototype.hasOwnProperty.call(DRAWINGS, name) ? name : 'image'
  let svg = built.get(key)
  if (!svg) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525.5 525.5"><path d="${DRAWINGS[key].split(';').map(stroke).join('')}"/></svg>`
    built.set(key, svg)
  }
  return svg
}
