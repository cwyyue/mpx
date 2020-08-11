const NodeTargetPlugin = require('webpack/lib/node/NodeTargetPlugin')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
const LimitChunkCountPlugin = require('webpack/lib/optimize/LimitChunkCountPlugin')
const hash = require('hash-sum')
const path = require('path')
const WxsPlugin = require('./WxsPlugin')
const ChildCompileDependency = require('../dependency/ChildCompileDependency')
const getMainCompilation = require('../utils/get-main-compilation')
const parseRequest = require('../utils/parse-request')
const toPosix = require('../utils/to-posix')
const fixRelative = require('../utils/fix-relative')
const config = require('../config')
const loaderUtils = require('loader-utils')

module.exports = function () {
  const nativeCallback = this.async()
  const mainCompilation = getMainCompilation(this._compilation)
  const mpx = mainCompilation.__mpx__
  const assetsInfo = mpx.assetsInfo
  const mode = mpx.mode
  const wxsMap = mpx.wxsMap
  const packageName = mpx.currentPackageRoot || 'main'
  const pagesMap = mpx.pagesMap
  const componentsMap = mpx.componentsMap[packageName]
  const staticResourceMap = mpx.staticResourceMap[packageName]
  const rootName = mainCompilation._preparedEntrypoints[0].name
  // 可能存在问题，issuer不可靠，但是目前由于每一个组件模板都是在独立的子编译中输出的，所以此处issuer没有遇到问题，可以考虑通过query传递issuerResource
  const issuerResourcePath = parseRequest(this._module.issuer.resource).resourcePath
  const issuerName = pagesMap[issuerResourcePath] || componentsMap[issuerResourcePath] || staticResourceMap[issuerResourcePath] || rootName
  const issuerDir = path.dirname(issuerName)

  const callback = (err) => {
    if (err) return nativeCallback(err)
    let relativePath = toPosix(path.relative(issuerDir, wxsMap[resourcePath].filename))
    relativePath = fixRelative(relativePath, mode)
    nativeCallback(null, `module.exports = ${JSON.stringify(relativePath)};`)
  }

  const getName = (raw) => {
    const match = /^(.*?)(\.[^.]*)?$/.exec(raw)
    return match[1]
  }

  let resourcePath = parseRequest(this.resource).resourcePath
  const wxsModule = loaderUtils.parseQuery(this.resourceQuery || '?').wxsModule

  if (wxsModule) {
    resourcePath = `${resourcePath}~${wxsModule}`
  }

  if (wxsMap[resourcePath]) {
    wxsMap[resourcePath].modules.push(this._module)
    return callback()
  }

  const name = path.parse(resourcePath).name + hash(resourcePath)
  let filename = path.join(/^\.([^.]+)/.exec(config[mode].wxs.ext)[1], `${name}${config[mode].wxs.ext}`)
  filename = toPosix(filename)
  wxsMap[resourcePath] = {
    filename,
    dep: null,
    modules: [this._module]
  }
  const outputOptions = {
    filename
  }
  // wxs文件必须经过pre-loader
  const request = `!${this.remainingRequest}`
  const plugins = [
    new WxsPlugin({ mode }),
    new NodeTargetPlugin(),
    new SingleEntryPlugin(this.context, request, getName(filename)),
    new LimitChunkCountPlugin({ maxChunks: 1 })
  ]

  const childCompiler = mainCompilation.createChildCompiler(request, outputOptions, plugins)

  let entryModule
  childCompiler.hooks.thisCompilation.tap('MpxWebpackPlugin ', (compilation) => {
    compilation.hooks.succeedEntry.tap('MpxWebpackPlugin', (entry, name, module) => {
      entryModule = module
      const dep = new ChildCompileDependency(entryModule)
      wxsMap[resourcePath].dep = dep
    })
  })

  childCompiler.hooks.afterCompile.tapAsync('MpxWebpackPlugin', (compilation, callback) => {
    Object.keys(compilation.assets).forEach((name) => {
      // 因为子编译会合并assetsInfo会互相覆盖，使用全局mpx对象收集完之后再合并到主assetsInfo中
      const assetInfo = assetsInfo.get(name) || { modules: [] }
      assetInfo.modules.push(entryModule)
      assetsInfo.set(name, assetInfo)
    })
    callback()
  })

  childCompiler.runAsChild((err, entries, compilation) => {
    if (err) return callback(err)
    if (compilation.errors.length > 0) {
      return callback(compilation.errors[0])
    }

    compilation.fileDependencies.forEach((dep) => {
      this.addDependency(dep)
    }, this)
    compilation.contextDependencies.forEach((dep) => {
      this.addContextDependency(dep)
    }, this)
    callback()
  })
}
