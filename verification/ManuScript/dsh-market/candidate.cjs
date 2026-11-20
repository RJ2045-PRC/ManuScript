const assert = require('node:assert/strict')
const {execFileSync, spawn} = require('node:child_process')
const {once} = require('node:events')
const {mkdirSync, mkdtempSync, readFileSync, realpathSync} = require('node:fs')
const {join, resolve} = require('node:path')
const {tmpdir} = require('node:os')
const {chromium} = require('playwright')

const [hostPath, packagePath, preparedHome, oldPackagePath] = process.argv.slice(2).map(p => resolve(p))
assert(hostPath && packagePath && preparedHome, 'Usage: candidate.cjs <dsh> <candidate.tgz> <prepared home> [v0.13.0.tgz]')
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'manuscript-market-')))
const env = {
  ...process.env,
  HOME: preparedHome,
  DSH_HOME: join(dir, 'dsh'),
  MANUSCRIPT_DATA_DIR: join(dir, 'projects'),
  DEEPSEEK_API_KEY: 'offline-test-key',
  DEEPSEEK_BASE_URL: 'http://127.0.0.1:9/anthropic',
}
delete env.MANUSCRIPT_PYTHON
delete env.LUNXU_PYTHON
const hostOptions = {cwd: dir, env}
const marker = 'ManuScript Market Verification'
const watchdog = setTimeout(() => {
  console.error('Timed out while verifying DSH marketplace package:', dir)
  process.exit(1)
}, 120000)
watchdog.unref()

function install(asset) {
  execFileSync(hostPath, ['plugin', '--profile', 'web', 'add', asset], {
    ...hostOptions, timeout: 60000, stdio: 'inherit',
  })
}

async function withHost(run, hostEnv = {}) {
  const child = spawn(hostPath, ['web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
    ...hostOptions, env: {...env, ...hostEnv}, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stderr.on('data', part => { output += part })
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DSH did not print a URL')), 30000)
      child.once('error', reject)
      child.once('exit', code => { clearTimeout(timer); reject(new Error('DSH exited: ' + code)) })
      child.stdout.on('data', part => {
        output += part
        const match = output.match(/dsh web: (http:\/\/\S+)\s/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    await run(url)
  } catch (error) {
    throw new Error(error.message.replace(/token=[^\s]+/g, 'token=[test]') + '\n' +
      output.replace(/token=[^\s]+/g, 'token=[test]'))
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
    child.stdout.destroy()
    child.stderr.destroy()
  }
}

async function loadHost(context, url) {
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  await page.goto(url)
  const notice = page.getByRole('button', {name: 'Continue', exact: true})
  if (await notice.waitFor({timeout: 3000}).then(() => true, () => false)) await notice.click()
  return page
}

async function act(page, op, args = {}) {
  const response = await page.request.post(new URL('/api/manuscript.action', page.url()).href, {data: {op, args}})
  const payload = await response.json()
  assert(response.ok() && !payload.error, op + ': ' + payload.error)
  return payload.result
}

async function findDrafts(frame, expected) {
  await frame.getByRole('button', {name: '查看 Draft 版本'}).click()
  const draftDialog = frame.locator('dialog[open]').filter({has: frame.locator('.draftVersions')})
  await draftDialog.locator('[data-draft-version]').first().waitFor()
  assert.deepEqual(await draftDialog.locator('.draftVersions strong').allTextContents(), expected)
  return draftDialog
}

async function inspectEvidence(frame) {
  await frame.getByRole('button', {name: '切换到阅读模式'}).click()
  await frame.getByRole('button', {name: '展开2 Method'}).click()
  await frame.getByRole('button', {name: /2\.2 固定杯具/}).click()
  await frame.locator('button[data-ref="CupLog"][data-pid]:visible').first().click()
  const source = frame.locator('iframe[title="本地论文原件"]')
  await source.waitFor({state: 'attached'})
  assert.match(await source.getAttribute('src'), /#page=1$/)
  await frame.locator('dialog[open]').last().evaluate(dialog => dialog.close())
  await frame.getByRole('button', {name: '切换到编辑模式'}).click()
}

async function inspectFeedback(frame) {
  await frame.locator('.workspaceTools summary').click()
  await frame.getByRole('button', {name: '返修意见', exact: true}).click()
  const tools = frame.frameLocator('iframe[title="项目工具"]')
  await tools.getByText('杯盖减缓了降温。', {exact: false}).first().waitFor()
  assert.match(await tools.locator('#view').innerText(), /两只杯子的材质也不同/)
  await frame.locator('[data-tools-close]').click()
  await frame.locator('dialog.projectToolsDialog').waitFor({state: 'detached'})
}

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.MANUSCRIPT_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })
  try {
    const context = await browser.newContext({locale: 'en-US', viewport: {width: 1440, height: 900}})
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
    let old, project, backup
    if (oldPackagePath) {
      install(oldPackagePath)
      await withHost(async url => {
        const page = await loadHost(context, url)
        const example = await act(page, 'example')
        old = await act(page, 'state', {project: example.id})
        await page.close({runBeforeUnload: false})
      }, {MANUSCRIPT_PYTHON: join(preparedHome, '.manuscript/runtime/current/bin/python3')})
    }
    install(packagePath)
    const manifestPath = join(env.DSH_HOME, 'profiles/web/node_modules/manuscript/package.json')
    assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).version, '0.13.1')
    await withHost(async url => {
      const page = await loadHost(context, url)
      if (old) {
        const upgraded = await act(page, 'state', {project: old.id})
        for (const field of ['blocks', 'versions', 'assets', 'feedback', 'notes']) {
          assert.deepEqual(upgraded[field], old[field], field)
        }
      }
      await page.getByRole('button', {name: 'ManuScript', exact: true}).click()
      await page.getByRole('button', {name: '载入杯盖与降温示例', exact: true}).click()
      const folder = join(dir, '示例项目')
      mkdirSync(folder)
      await page.getByLabel('文件夹绝对路径').fill(folder)
      await page.getByRole('button', {name: '进入项目', exact: true}).click()
      const frame = page.frameLocator('#manuscript-project-frame')
      const drafts = await findDrafts(frame, ['Draft 02', 'Draft 01'])
      await drafts.getByRole('button', {name: /Draft 01/}).click()
      await drafts.getByRole('heading', {name: /Draft 01 · 只读快照/}).waitFor()
      await drafts.evaluate(dialog => dialog.close())
      project = (await act(page, 'dsh_library')).find(p => p.path === folder).id
      console.log('PASS sidebar, sample binding and Draft history')

      await inspectEvidence(frame)
      console.log('PASS fixed PDF citation')
      await inspectFeedback(frame)
      console.log('PASS Word feedback')
      const more = frame.locator('.studioCommands [data-paper-menu="更多"]')
      await more.locator('summary').click()
      await more.locator('[data-source-mode]').click()
      const textarea = frame.locator('.studio textarea:visible').first()
      const previous = await textarea.inputValue()
      await textarea.fill(previous + '\n\n' + marker + '\n')
      await frame.getByRole('button', {name: '保存 Draft', exact: true}).click()
      await frame.getByText('已保存 Draft 03', {exact: true}).first().waitFor()
      backup = await act(page, 'package', {project})
      await page.close()
    })
    await withHost(async url => {
      const page = await loadHost(context, url)
      await page.getByRole('button', {name: 'ManuScript', exact: true}).click()
      await page.getByRole('button', {name: /^打开 杯盖与降温/}).first().click()
      const frame = page.frameLocator('#manuscript-project-frame')
      await frame.getByRole('button', {name: '正文编辑', exact: true}).click()
      const drafts = await findDrafts(frame, ['Draft 03', 'Draft 02', 'Draft 01'])
      await drafts.getByRole('button', {name: /Draft 03/}).click()
      await drafts.getByText(marker, {exact: false}).waitFor()
      await drafts.getByRole('button', {name: '导出此 Draft'}).click()
      const download = page.waitForEvent('download', {timeout: 45000})
      await frame.getByRole('button', {name: 'PDF', exact: true}).click()
      const pdf = join(dir, 'draft-03.pdf')
      await (await download).saveAs(pdf)
      assert.match(execFileSync('pdftotext', [pdf, '-'], {encoding: 'utf8'}), new RegExp(marker))
      await page.screenshot({path: join(dir, 'manuscript.png')})
      await page.close()
    })
    await withHost(async url => {
      const page = await loadHost(context, url)
      assert.deepEqual(await act(page, 'list'), [])
      const restored = await act(page, 'restore_package', {data: backup.data})
      const drafts = await act(page, 'draft_info', {project: restored.id})
      assert.deepEqual(drafts.drafts.map(d => d.id), ['Draft 01', 'Draft 02', 'Draft 03'])
      assert(restored.assets.some(asset => asset.name.endsWith('.docx')))
      assert(restored.feedback.length)
      assert(restored.blocks.some(block => block.text.includes(marker)))
      await page.close()
    }, {MANUSCRIPT_DATA_DIR: join(dir, 'restored')})
    await context.close()
    console.log('PASS standard installation, sample, citations, Word feedback, Draft save/restart/PDF and archive restoration', dir)
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
