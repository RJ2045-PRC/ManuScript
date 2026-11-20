// Compare the public teaching example with the released workbench restored from the same archive.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const [demo, product] = process.argv.slice(2);
if (!demo || !product) throw Error('Usage: node structure.cjs <static demo URL> <local release workbench URL>');
const publicSite = new URL(demo).protocol === 'https:';
const revised='要估计单独加盖的温差，应看研究二中同一只杯子的两次终点读数。';
const original='杯盖减缓了降温。';
async function level(surface,n) {
  await surface.locator('.msScaleLevels [data-scale-level="'+n+'"]').click();
  await surface.locator('.msScales[data-scale="'+n+'"]').waitFor();
}
async function comparePane(surface){
  if(await surface.locator('.msScales').getAttribute('data-compare')!=='true')
    await surface.locator('[data-scale-compare]').click();
  await surface.locator('.msCompareScroll').waitFor();
}
async function parity(browser) {
  const native=await browser.newPage(), page=await browser.newPage();
  page.on('pageerror',e=>console.error(e.message));
  page.on('requestfailed',r=>console.error(r.failure().errorText,new URL(r.url()).pathname));
  native.setDefaultTimeout(7000);
  page.setDefaultTimeout(publicSite ? 30000 : 7000);
  page.setDefaultNavigationTimeout(60000);
  await native.goto(product);
  await native.locator('.documentStudio').waitFor();
  await native.locator('[data-workspace-view=scales]').click();
  await page.goto(demo+'#structure/4.1/02/overview/1/1');
  const frame=page.frameLocator('#structure-workbench');
  for(const n of [1,2,3]) {
    await level(native,n);await level(frame,n);
    // The install starts with the unanalysed archive. Compare its controls, chapter order and source;
    // the public demo intentionally adds a prepared reading to those same chapter cards.
    for(const css of n===1?['.msScaleLevels','.msOutlineLocation']:['.msScaleSectionHead h3']) {
      const checklist=await native.locator(css).allTextContents();
      assert(checklist.length>0);assert.deepEqual(await frame.locator(css).allTextContents(),checklist);
    }
  }
  await comparePane(native);await comparePane(frame);
  assert.deepEqual(await frame.locator('.msCompareParagraph').allTextContents(),await native.locator('.msCompareParagraph').allTextContents());
  console.log('Release parity: scale controls, chapter order across three scales and complete comparison text.');
  await native.close();await page.close();
}
async function tour(browser,width,lang) {
  const page=await browser.newPage({viewport:{width,height:880},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')errors.push(r.failure()?.errorText)});
  page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+new URL(r.url()).pathname)});
  page.setDefaultTimeout(publicSite ? 30000 : 6000);
  page.setDefaultNavigationTimeout(60000);
  const l=s=>page.locator(s), f=page.frameLocator('#structure-workbench');
  await page.goto(demo+'?lang='+lang+'#map');
  await l('[data-view=structure]').click();
  const overview=f.locator('.msScaleOverview h3');
  await overview.filter({hasText:'两套杯具的终温差能说明加盖的作用吗'}).waitFor();
  assert(await overview.evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('.msReadingScroll').getBoundingClientRect().bottom));
  await f.locator('.msOutlineRoute summary').click();
  assert((await f.locator('.msOutlineRoute').innerText()).includes('回到同杯数据解释盖子'));
  await l('[data-view=map]').click();
  for(const sel of ['[data-expand="2"]','[data-select="2.2"]','[data-more]','[data-locate]'])await l(sel).click();
  for(const [key,num] of [['2.2',1],['3.1',2]]) {
    await l('.doc-section[data-key="'+key+'"] .citation').first().click();
    await l('dialog[open] img[src$="source-'+num+'.png"]').evaluate(el=>el.decode());
    assert((await l('dialog[open] a[target]').getAttribute('href')).endsWith('#page='+num));
    await page.keyboard.press('Escape');
  }
  assert.equal(await l('.doc-section table').count(),3);
  assert((await l('.doc-section math').count())>0);
  for (const img of await l('.doc-section img').all())await img.evaluate(el=>el.decode());
  await l('.document-guide summary').click();
  await page.goto(demo+'?lang='+lang+'#read/3.3/02');
  if(!await l('.document-guide').evaluate(el=>el.open))await l('.document-guide summary').click();
  await l('[data-action=structure]').click();
  await level(f,1);
  const cards=f.locator('.msOutlineCard');
  assert.equal(await cards.count(),22);
  await cards.filter({hasText:'4.1 两套装置'}).locator('.msOutlineOpen').click();
  const sec=f.locator('.msScaleSection').filter({has:f.locator('h3',{hasText:'4.1 两套装置'})});
  const second=sec.locator('.msScaleParagraph').nth(1);
  await second.locator('h4').filter({hasText:'收窄首稿的因果判断'}).waitFor();
  await second.locator('button[data-scale-level="3"]').click();
  const nodes=second.locator('.msGraphNode');
  assert.equal(await nodes.count(),2);
  assert.equal(await second.locator('.msGraphEdge').count(),1);
  await nodes.first().click();
  await f.locator('.msScaleSourceDetails blockquote').filter({hasText:'研究一中，有盖玻璃杯的平均降温速率较低。'}).waitFor();
  await l('.structure-guide q').filter({hasText:'研究一中，有盖玻璃杯的平均降温速率较低。'}).waitFor();
  await f.locator('[data-scale-unit-close]').click();
  await nodes.last().click();
  await f.locator('.msScaleSourceDetails blockquote').filter({hasText:revised}).waitFor();
  // On a small screen the lower half of the embedded reader is below the page fold.
  await l('#structure-workbench').evaluate(el=>el.scrollIntoView({block:'center'}));
  await f.locator('.msScaleSourceDetails [data-scale-source]').click();
  await l('.structure-guide q').filter({hasText:revised}).waitFor();
  await l('.structure-guide [data-position^="read/"]').click();
  assert.equal(await l('article .source-match').innerText(),revised);
  await l('article [data-position^="review/"]').click();
  assert.equal(await l('.compare section p').first().innerText(),original);
  await l('[data-position^="structure/"]').click();
  await f.locator('.msScales').waitFor();
  await l('#structure-version').selectOption('01');
  await l('.structure-guide q').filter({hasText:original}).waitFor();
  await level(f,3);
  await sec.locator('.msGraphNode').filter({hasText:'杯盖减缓降温'}).click();
  assert.equal(await f.locator('.msScaleSourceDetails blockquote').innerText(),original);
  await f.locator('[data-scale-unit-close]').click();
  await comparePane(f);
  await f.locator('[data-scroll-sync]').uncheck();await f.locator('[data-scroll-sync]').check();
  const sourceParagraph=f.locator('.msCompareParagraph').filter({hasText:original}).first();
  await sourceParagraph.evaluate(el=>{
    const walker=document.createTreeWalker(el.querySelector('.msScaleProse p'),NodeFilter.SHOW_TEXT);
    let node;while((node=walker.nextNode()) && !node.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  });
  await f.locator('[data-compare-note]').click();
  await f.locator('dialog textarea').fill('核对这句判断的实验条件');
  await f.locator('dialog [data-ok]').click();
  await f.locator('.msCompareNotes').waitFor();
  await f.locator('[data-scroll-sync]').uncheck();
  await l('#structure-workbench').evaluate(el=>el.scrollIntoView({block:'end'}));
  await f.locator('.msCompareNotes summary').click();
  assert((await f.locator('.msCompareNotes').innerText()).includes('核对这句判断的实验条件'));
  await f.locator('[data-scale-translate]').click();
  assert(await f.locator('[data-translation-start]').isDisabled());
  await f.locator('dialog [data-x]').click();
  await f.locator('[data-work-open]').click();assert(await f.locator('[data-work-start]').isDisabled());await f.locator('dialog [data-x]').click();
  await f.locator('[data-scale-settings]').click();await f.locator('[data-logic-style]').selectOption('visual');
  await f.locator('[data-logic-save]').click();await f.locator('.msScales[data-style=visual]').waitFor();
  await f.locator('.msCompare [data-ref="CupLog"]').first().click();
  await l('dialog[open] img[src$="source-1.png"]').waitFor();await page.keyboard.press('Escape');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await f.locator('html').evaluate(el=>el.scrollWidth<=innerWidth));
  // Edit in the product editor; inspect the new saved snapshot in all three reader scales.
  await page.goto(demo+'?lang='+lang+'#read/4.1/work');
  await l('[data-toggle-mode]').click();await l('.cm-content').waitFor();
  await l('.doc-more summary').click();await l('[data-doc-source]').click();
  const source=l('.doc-body textarea'),raw=await source.inputValue();
  await source.fill(raw.replace(revised,'新稿保留了同杯比较。'));
  await l('[data-toggle-mode]').click();await l('[data-checkpoint]').click();
  await l('[data-checkpoint]').click();assert.equal(await l('#draft option[value="04"]').count(),0);
  await page.goto(demo+'?lang='+lang+'#structure/4.1/03/cards/2/2');
  await sec.locator('.msScaleParagraph').nth(1).filter({hasText:'新稿保留了同杯比较。'}).waitFor();
  assert.equal(await sec.locator('.msScaleRoles').count(),0);
  await sec.locator('.msScaleWarning').waitFor();
  await level(f,1);await f.locator('.msScaleWarning').filter({hasText:'全文材料已变化'}).waitFor();
  await level(f,2);
  assert.equal(await l('.structure-guide [data-position^="review/"]').count(),0);
  await l('.structure-guide [data-position^="read/"]').click();assert.equal(await l('article .source-match').innerText(),'新稿保留了同杯比较。');
  await page.reload();assert.equal(await l('article .source-match').innerText(),'新稿保留了同杯比较。');
  await page.goto(demo+'?lang='+lang+'#structure/4.1/02/cards/2/2');await sec.locator('.msScaleParagraph h4').filter({hasText:'收窄首稿的因果判断'}).waitFor();
  assert.deepEqual(errors,[]);console.log('Walkthrough, native controls, assets, live draft and frozen snapshots:',width,lang);
  await page.close();
}
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
 await parity(browser);
 for(const [w,lang] of [[1400,'zh'],[390,'zh'],[1100,'en'],[360,'en']])await tour(browser,w,lang);
}finally{await browser.close()}})().catch(e=>{console.error(String(e).replace(/\/desk\/[^/\s]+/g,'/desk/[local]'));process.exitCode=1});
