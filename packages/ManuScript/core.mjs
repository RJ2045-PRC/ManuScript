import { readFile } from 'node:fs/promises'
export async function openSample(version='v5') {
  if (!['v3','v5'].includes(version)) throw Error('version must be v3 or v5')
  return {title:'ManuScript · 返修样稿', version, material:'synthetic', tex: await readFile(new URL('./sample/'+version+'.tex',import.meta.url),'utf8')}
}
