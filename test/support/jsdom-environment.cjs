// jsdom 30 depends on an ES module that Jest's sandboxed require cannot load, so the specs that need a DOM get jsdom's JSDOM class from the outer Node realm through this environment instead of importing it.
const { TestEnvironment } = require('jest-environment-node')

module.exports = class JsdomLibraryEnvironment extends TestEnvironment {
  async setup () {
    await super.setup()
    this.global.JSDOM = (await import('jsdom')).JSDOM
  }
}
