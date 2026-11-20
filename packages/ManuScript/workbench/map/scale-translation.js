window.ManuscriptScaleTranslation = (() => {
  function mount({ api, project }) {
    let activeDialog
    let preferredRoute

    async function open(target, trigger) {
      if (activeDialog?.open) return
      const d = activeDialog = modal('翻译原文', `
        <p data-translation-scope></p>
        <label>翻译模型<select data-translation-model disabled><option>正在读取模型…</option></select></label>
        <details>
          <summary>本机术语库</summary>
          <p data-translation-glossary></p>
          <button type="button" data-glossary-export disabled>导出 Markdown</button>
          <button type="button" data-glossary-import>导入 Markdown</button>
          <input type="file" accept=".md,.markdown,text/markdown" data-glossary-file hidden>
          <p data-glossary-status role="status"></p>
        </details>
        <p>译为简体中文。选定模型会读取原文和命中的术语，并按需维护术语库。</p>
        <button type="button" data-translation-start disabled>开始翻译</button>
        <p data-translation-status role="status"></p>
        <div data-translation-result></div>`)
      d.classList.add('msTranslationDialog')
      const status = d.querySelector('[data-translation-status]')
      const start = d.querySelector('[data-translation-start]')
      const select = d.querySelector('[data-translation-model]')
      d.querySelector('[data-translation-scope]').textContent =
        (target.selection ? '选中原文 · ' : '当前章节 · ') + target.title
      d.addEventListener('close', () => {
        if (activeDialog === d) activeDialog = null
        if (trigger?.isConnected) trigger.focus({ preventScroll:true })
      }, { once:true })

      let rows = [], translating = false, transferring = false, glossaryExists = false
      const exportButton = d.querySelector('[data-glossary-export]')
      const importButton = d.querySelector('[data-glossary-import]')
      const fileInput = d.querySelector('[data-glossary-file]')
      const transferStatus = d.querySelector('[data-glossary-status]')
      function updateButtons() {
        start.disabled = select.disabled = translating || transferring || !rows.length
        exportButton.disabled = translating || transferring || !glossaryExists
        importButton.disabled = translating || transferring
      }
      const showGlossary = async () => {
        const box = d.querySelector('[data-translation-glossary]')
        try {
          const glossary = await api('reading_glossary', {})
          glossaryExists = glossary.exists
          box.textContent = glossary.exists
            ? glossary.path + ' · ' + glossary.count + ' 条术语 · 各项目共用'
            : '首次成功翻译后，AI 会建立术语库。也可导入已有文件。'
        } catch (e) { box.textContent = e.message }
        updateButtons()
      }
      async function transfer(action) {
        transferring = true
        transferStatus.textContent = ''
        updateButtons()
        try { await action() }
        catch (e) { transferStatus.textContent = e.message }
        finally {
          transferring = false
          if (d.open) await showGlossary()
        }
      }
      exportButton.onclick = () => transfer(async () => {
        const { markdown } = await api('reading_glossary_export', {})
        const blob = new Blob([markdown],{type:'text/markdown;charset=utf-8'})
        downloadSch(blob,'translation-glossary.md')
        transferStatus.textContent = '已导出术语库'
      })
      importButton.onclick = () => fileInput.click()
      fileInput.onchange = () => {
        const file = fileInput.files?.[0]
        fileInput.value = ''
        if (!file) return
        return transfer(async () => {
          if (file.size > 128*1024) throw Error('术语库超过 128 KiB')
          const markdown = new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())
          const result = await api('reading_glossary_import',{markdown})
          transferStatus.textContent = '已导入 '+result.added+' 条'+(result.conflicts.length
            ? '。沿用本机译法：'+result.conflicts.join('、') : '')
        })
      }
      void showGlossary()
      try {
        rows = (await api('team_catalog', {})).rows || []
        if (!d.open) return
        select.replaceChildren(...rows.map((r, i) => new Option(r.name || r.model, i)))
        if (!rows.length) {
          select.add(new Option('没有可用模型'))
          status.textContent = '请先在宿主配置可用模型，再打开翻译。'
          return
        }
        const index = rows.findIndex(r => r.provider === preferredRoute?.provider && r.model === preferredRoute?.model)
        select.selectedIndex = Math.max(0, index)
        updateButtons()
      } catch (error) { status.textContent = error.message }

      start.onclick = async () => {
        const route = rows[select.selectedIndex]
        if (!route) return
        preferredRoute = route
        translating = true
        updateButtons()
        const resultBox = d.querySelector('[data-translation-result]')
        resultBox.replaceChildren()
        status.textContent = '正在翻译…'
        try {
          const result = await api('reading_translate', { project, ...target, route })
          if (!d.open) return
          status.textContent = '模型译文，供阅读核对 · ' + result.model + ' · ' + result.version
          if (result.terms.length) {
            const glossary = document.createElement('details')
            const label = document.createElement('summary')
            label.textContent = '本次使用的术语 · ' + result.terms.length
            const list = document.createElement('ul')
            for (const term of result.terms) {
              const item = document.createElement('li')
              item.textContent = term.source + ' → ' + term.target
              list.append(item)
            }
            glossary.append(label, list)
            resultBox.append(glossary)
          }
          if (result.changes.length) {
            const changes = document.createElement('details')
            const label = document.createElement('summary')
            label.textContent = 'AI 更新术语库 · '+result.changes.length+' 条'
            const list = document.createElement('ul')
            for (const change of result.changes) {
              const item = document.createElement('li')
              const action = {add:'新增',update:'修订',remove:'移除'}[change.action]
              const target = change.previous && change.target
                ? change.previous+' → '+change.target : change.target || change.previous
              item.textContent = action+' '+change.source+' · '+target+'。'+change.reason
              list.append(item)
            }
            changes.append(label,list)
            resultBox.append(changes)
          }
          for (const paragraph of result.paragraphs) {
            const text = document.createElement('p')
            text.textContent = paragraph.translation
            const original = document.createElement('details')
            const label = document.createElement('summary')
            label.textContent = '对照原文'
            const source = document.createElement('p')
            source.textContent = paragraph.source
            original.append(label, source)
            resultBox.append(text, original)
          }
          start.textContent = '重新翻译'
        } catch (error) { if (d.open) status.textContent = error.message }
        finally {
          if (d.open) {
            translating = false
            updateButtons()
            void showGlossary()
          }
        }
      }
    }
    return { open, destroy() { activeDialog?.close() } }
  }
  return { mount }
})()
