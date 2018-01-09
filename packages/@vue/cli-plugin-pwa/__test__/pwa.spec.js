jest.setTimeout(30000)

const fs = require('fs')
const path = require('path')
const portfinder = require('portfinder')
const { createServer } = require('http-server')
const { defaults } = require('@vue/cli/lib/options')
const create = require('@vue/cli-test-utils/createTestProject')
const launchPuppeteer = require('@vue/cli-test-utils/launchPuppeteer')

let server, browser
test('pwa', async () => {
  // it's ok to mutate here since jest loads each test in a separate vm
  defaults.plugins['@vue/cli-plugin-pwa'] = {}
  const project = await create('pwa-build', defaults)
  expect(project.has('src/registerServiceWorker.js')).toBe(true)

  const { stdout } = await project.run('vue-cli-service build')
  expect(stdout).toMatch('Build complete.')

  const distDir = path.join(project.dir, 'dist')
  const hasFile = file => fs.existsSync(path.join(distDir, file))
  expect(hasFile('index.html')).toBe(true)
  expect(hasFile('favicon.ico')).toBe(true)
  expect(hasFile('js')).toBe(true)
  expect(hasFile('css')).toBe(true)

  // PWA specific files
  expect(hasFile('manifest.json')).toBe(true)
  expect(hasFile('img/icons/android-chrome-512x512.png')).toBe(true)

  // Make sure the base preload/prefetch are not affected
  const index = await project.read('dist/index.html')
  // should split and preload app.js & vendor.js
  expect(index).toMatch(/<link rel=preload [^>]+app[^>]+\.js>/)
  expect(index).toMatch(/<link rel=preload [^>]+vendor[^>]+\.js>/)
  // should not preload manifest because it's inlined
  expect(index).not.toMatch(/<link rel=preload [^>]+manifest[^>]+\.js>/)
  // should inline manifest and wepback runtime
  expect(index).toMatch('webpackJsonp')

  // PWA specific directives
  expect(index).toMatch(`<link rel=manifest href=/manifest.json>`)
  expect(index).toMatch(`<!--[if IE]><link rel="shortcut icon" href="/favicon.ico"><![endif]-->`)
  expect(index).toMatch(`<meta name=apple-mobile-web-app-capable content=yes>`)

  // should import service worker script
  const main = await project.read('src/main.js')
  expect(main).toMatch(`import './registerServiceWorker'`)

  const port = await portfinder.getPortPromise()
  server = createServer({ root: distDir })

  await new Promise((resolve, reject) => {
    server.listen(port, err => {
      if (err) return reject(err)
      resolve()
    })
  })

  const launched = await launchPuppeteer(`http://localhost:${port}/`)
  browser = launched.browser

  await new Promise(r => setTimeout(r, 500))
  const logs = launched.logs
  expect(logs.some(msg => msg.match(/Content is cached for offline use/))).toBe(true)
  expect(logs.some(msg => msg.match(/This web app is being served cache-first/))).toBe(true)
})

afterAll(async () => {
  await browser.close()
  server.close()
})