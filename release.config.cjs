/* eslint-disable no-template-curly-in-string */
const { upstreamLiquidjs } = require('./package.json')

// Appends the LiquidJS release this fork is based on to every release's notes, so the GitHub release, CHANGELOG.md and the release commit all name it. semantic-release joins the notes of every generateNotes plugin, so the release-notes-generator's sections, including BREAKING CHANGES, stay as they are.
const upstreamNotes = {
  generateNotes: () => `### Upstream\n\nBased on [LiquidJS ${upstreamLiquidjs}](https://github.com/harttle/liquidjs/releases/tag/v${upstreamLiquidjs}).`
}

module.exports = {
  branches: ['master'],
  tagFormat: 'debutify-v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    upstreamNotes,
    '@semantic-release/changelog',
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'dist/*.umd.js', label: 'liquid.js' },
          { path: 'dist/*.min.js', label: 'liquid.min.js' },
          { path: 'dist/*.min.js.map', label: 'liquid.min.js.map' }
        ]
      }
    ]
  ]
}
