// Local product preview. Reuse the release workbench and seed a disposable project.
import {createServer} from 'node:http';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = process.argv[2] ? resolve(process.argv[2]) : join(root, 'packages/ManuScript');
const {version} = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'));
const dataDir = await mkdtemp(join(tmpdir(), 'manuscript-demo-'));
process.env.MANUSCRIPT_DATA_DIR = dataDir;
process.env.MANUSCRIPT_PYTHON ||= join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3');
const {python, openDesk, stopDesk} = await import(pathToFileURL(join(plugin, 'workbench/bridge.mjs')));
const archive = await readFile(join(root, 'examples/杯盖与降温/完成态项目.zip'));
const project = await python('codex', 'author', 'restore_package', {data:archive.toString('base64')});
const desk = await openDesk();
const entry = new URL(desk.url);
entry.searchParams.set('view', 'map');
entry.searchParams.set('project', project.id);

// Keep the workbench session URL out of static demo files and published links.
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if(req.headers.host !== '127.0.0.1:'+server.address().port ||
     req.headers['sec-fetch-site'] === 'cross-site' || req.method !== 'GET' || req.url !== '/') {
    res.writeHead(404);res.end();return;
  }
  res.writeHead(302, {Location:entry.href});res.end();
});
server.listen(0, '127.0.0.1', () => console.log('ManuScript '+version+' · 本机产品预览 http://127.0.0.1:'+server.address().port+'/'));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{server.close();stopDesk();});
