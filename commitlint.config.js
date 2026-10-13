module.exports = {
  extends: ['@commitlint/config-conventional'],
  // the fork writes one line per paragraph, never hard-wrapped, and names products in subjects (Shopify, LiquidJS)
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'header-max-length': [2, 'always', 150],
    'subject-case': [0]
  }
}
