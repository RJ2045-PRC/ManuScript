// Repository development entrypoint. Never uses a host's private Python cache.
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join, delimiter} from 'node:path'
import {spawnSync} from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const localPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3')
const python = process.env.MANUSCRIPT_PYTHON || localPython
const env = {...process.env, PYTHONDONTWRITEBYTECODE: '1', MANUSCRIPT_PYTHON: python,
  PATH: [process.env.PATH, '/opt/homebrew/bin', '/Applications/LibreOffice.app/Contents/MacOS'].filter(Boolean).join(delimiter)}
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {cwd: root, env, stdio: 'inherit', ...options})
  if (r.error) throw r.error
  if (r.status !== 0) throw Error(`${command} ${args.join(' ')} exited ${r.status}`)
  return r
}
function node(script, ...args) { return run(process.execPath, [script, ...args]) }
function npm(args, cwd = root) {
  // npm CLI is JS; invoking it through Node also handles paths with spaces.
  if (process.env.npm_execpath) return run(process.execPath, [process.env.npm_execpath, ...args], {cwd})
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {cwd, shell: process.platform === 'win32'})
}
function requirePython() {
  run(python, ['-c', 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ required"'])
}
function doctor() {
  const checks = [
    ['Python 3.11+、包版本与 SQLite FTS5', python, ['scripts/check-environment.py']],
    ['Pandoc', 'pandoc', ['--version']], ['Poppler', 'pdftoppm', ['-v']],
    ['LibreOffice', 'soffice', ['--version']],
    ['编辑器依赖', process.execPath, ['--input-type=module', '-e', "await import('./scripts/manuscript-editor/node_modules/esbuild/lib/main.js')"]],
  ]
  let failures = 0
  for (const [label, command, args] of checks) {
    const r = spawnSync(command, args, {cwd: root, env, encoding: 'utf8'})
    const ok = !r.error && r.status === 0
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${(r.error?.message || r.stdout || r.stderr || '').trim().split('\n').slice(0, 3).join(' ')}`)
    if (!ok) failures++
  }
  if (failures) throw Error('环境未就绪；按 docs/01-README.md「新电脑与新 Codex 项目」安装缺项，再运行 doctor。')
}
try {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 24 || major === 24 && minor < 9) throw Error('需要 Node >=24.9.0；已验证 Node 24。')
  const [command = 'help', ...args] = process.argv.slice(2)
  if (command === 'setup') {
    const base = process.env.MANUSCRIPT_BOOTSTRAP_PYTHON || 'python3'
    run(base, ['-c', 'import sys; assert sys.version_info >= (3,11), "Set MANUSCRIPT_BOOTSTRAP_PYTHON to Python 3.11+"'])
    if (!existsSync(localPython)) run(base, ['-m', 'venv', join(root, '.venv')])
    run(localPython, ['-m', 'pip', 'install', '-r', 'requirements-dev.lock'])
    npm(['ci', '--no-audit', '--no-fund'])
    npm(['ci', '--no-audit', '--no-fund'], join(root, 'scripts/manuscript-editor'))
    console.log('依赖已安装。运行 npm run doctor 检查系统转换工具。')
  } else if (command === 'doctor') doctor()
  else if (command === 'build') {
    node('scripts/manuscript-editor/build-live.mjs')
    node('scripts/manuscript-brand.mjs')
    node('scripts/build-manuscript-case.mjs')
    node('scripts/build-manuscript-map.mjs', '--workbench-only')
    console.log('PASS 完整页面构建（包含实时编辑器）')
  } else throw Error('支持 setup、doctor 与 build')
} catch (e) { console.error(e.message); process.exitCode = 1 }
