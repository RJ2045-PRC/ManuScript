// Empty disposable DSH profile; no personal configuration, database or plugin copy.
import {existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, openSync, closeSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join, resolve, delimiter} from 'node:path'
import {tmpdir} from 'node:os'
import {spawn, spawnSync} from 'node:child_process'

const repo = fileURLToPath(new URL('../', import.meta.url))
try {
  if (process.platform === 'win32') throw Error('DSH 隔离启动目前验证 macOS；Windows 请在 WSL 配置运行时，不宣称原生支持。')
  const runtime = resolve(process.env.MANUSCRIPT_DSH_RUNTIME || join(repo, '.scratch/dsh-runtime'))
  const bin = join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  const py = process.env.MANUSCRIPT_PYTHON || join(repo, '.venv/bin/python3')
  if (!existsSync(py)) throw Error('先运行 npm run setup，或显式设置 MANUSCRIPT_PYTHON。')
  if (!existsSync(bin)) {
    if (process.env.MANUSCRIPT_DSH_RUNTIME) throw Error('MANUSCRIPT_DSH_RUNTIME 必须指向含 node_modules/@deepseek-ai/dsh 的完整运行时目录。')
    const archive = process.env.MANUSCRIPT_DSH_ASAR || '/Applications/DSH NEXT.app/Contents/Resources/app.asar'
    if (!existsSync(archive)) throw Error('未找到 DSH 安装包。设置 MANUSCRIPT_DSH_ASAR，或 MANUSCRIPT_DSH_RUNTIME；见开发说明。')
    console.log('从指定安装包提取独立运行时（不读取用户配置）…')
    const extraction = spawnSync(py, [join(repo, 'scripts/extract-dsh.py'), archive, runtime], {stdio: 'inherit'})
    if (extraction.status !== 0) throw Error('DSH 运行时提取失败；检查目标目录并使用新的提取路径。')
  }
  const version = JSON.parse(readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'))).version
  if (!['0.2.1-rc.4', '0.2.2-rc.1'].includes(version)) throw Error(`未验证的 DSH 运行时 ${version}；核对宿主 API 后再更新支持范围。`)
  const dir = mkdtempSync(join(tmpdir(), 'lx-cucrzr-probe.'))
  const profile = join(dir, 'home/profiles/web')
  mkdirSync(join(profile, 'node_modules'), {recursive: true, mode: 0o700})
  const plugin = resolve(process.env.LX_TEST_PLUGIN || join(repo, 'packages/ManuScript'))
  if (!existsSync(join(plugin, 'package.json'))) throw Error('缺少插件目录')
  symlinkSync(plugin, join(profile, 'node_modules', 'manuscript'))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({name:'manuscript-isolated-test', private:true,
    dependencies:{manuscript:'link:'+plugin},
    dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','manuscript']}}}, null, 2))
  writeFileSync(join(profile, 'cordis.yml'), '[]\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
  mkdirSync(join(repo, '.scratch/manuscript'), {recursive:true})
  writeFileSync(join(repo, '.scratch/manuscript/current-continuity-host'), dir, {mode:0o600})
  writeFileSync(join(dir, 'test-host.json'), JSON.stringify({runtime, version, plugin, repo, emptyStore:true}, null, 2), {mode:0o600})
  console.log(`DSH ${version}\n被测源码：${plugin}\n空白测试环境：${dir}\n日志：${join(dir,'private.log')}\n从此日志的 dsh web: 行打开本机地址。保持本命令运行，Ctrl+C 停止。`)
  if (process.argv.includes('--prepare-only')) process.exit(0)
  const log = openSync(join(dir, 'private.log'), 'a', 0o600)
  const env = {...process.env, LX_VERIFY_DIR:dir, DSH_HOME:join(dir,'home'), MANUSCRIPT_DATA_DIR:join(dir,'manuscript'), MANUSCRIPT_PYTHON:py,
    PATH:[process.env.PATH,'/opt/homebrew/bin','/Applications/LibreOffice.app/Contents/MacOS'].filter(Boolean).join(delimiter), PYTHONDONTWRITEBYTECODE:'1'}
  const child = spawn(process.execPath, [bin, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {cwd:dir,env,stdio:['ignore',log,log]})
  closeSync(log)
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', e => {console.error(e.message); process.exitCode=1})
  child.on('exit', code => {process.exitCode=code || 0})
} catch (e) { console.error(e.message); process.exitCode=1 }
