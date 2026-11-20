# ManuScript

ManuScript 是面向论文、研究报告等结构化文档作者的本地写作工作台，支持 DSH 和 Codex。收到一份带批注的 Word 回稿时，你可以找到审阅人看到的那一版，核对原句和引用的 PDF 页，再把修改保存为下一版 Draft。

**v0.13.0 · 首次公开测试版**　[下载 Release](https://github.com/RJ2045-PRC/ManuScript/releases/tag/v0.13.0) · [复制给 Agent 安装](#复制给-agent-安装) · [平台支持](#平台支持) · [实机截图](#实机截图) · [完整示例导读](examples/杯盖与降温/README.md)

## 实机截图

以下画面来自 macOS 上的 DSH Web 0.2.2-rc.1，运行的是 ManuScript v0.13.0 发布包和内置的「杯盖与降温」项目。

**正文与证据。** 左侧目录已定位到「装置与方法」。作者能在同一份工作稿中看到固定来源的引文、装置图和降温速率公式，右下角显示当前为 Draft 02。

![DSH 正文编辑工作区的阅读模式：左侧章节目录，右侧为装置图、引文、公式与保存 Draft 入口。](docs/screenshots/manuscript.png)

<details>
<summary>再看两张：章节导图与 Word 返修对照</summary>

**章节导图。** 选中的「装置与方法」与正文中的章节对应。切换到导图后，可以看到两项研究的各节怎样挂在论文标题之下。

![章节导图中选中了装置与方法，旁边可见测量结果和交叉设计等章节。](docs/screenshots/outline.png)

**返修对照。** 上方是审阅人对杯子材质的追问，左列是被批注的首稿原句，右列是当前讨论段。

![返修对照显示已采纳的 Word 意见，旧稿原句和当前讨论段并排显示。](docs/screenshots/revision.png)

</details>

## 先看一条审阅意见

示例论文《杯盖能解释多少温差？》的首稿写道「杯盖减缓了降温。」审阅人追问：一只是玻璃杯，另一只是陶瓷杯，怎么确定差异来自杯盖？打开首稿可以看到这条 Word 批注。修订稿则解释了为什么要看同一只杯子换盖前后的温度。论文、数据和图均为原创模拟材料。[带批注的 Word 回稿](examples/杯盖与降温/稿件/Draft-01-审阅回稿.docx) · [修订稿 PDF](examples/杯盖与降温/稿件/Draft-02-修订稿.pdf)

| 你想怎样试用？ | 从这里开始 |
|---|---|
| 先在 GitHub 读论文、看图表与公式 | [在线阅读修订稿](examples/杯盖与降温/稿件/Draft-02.md) |
| 亲手从构思卡写到 Draft 02 | 安装后恢复起点项目，按[操作导读](examples/杯盖与降温/README.md#从选卡到第二版交付)保存首稿、接回审阅意见、核对出处并导出修订稿。 |
| 直接查看已经完成的项目 | 在工作台点「载入杯盖与降温示例」，查看两版快照、按页固定的引文和已采纳的审阅意见。也可从 [Release](https://github.com/RJ2045-PRC/ManuScript/releases/tag/v0.13.0) 下载含两个项目包的完整示例。 |

## 一份稿件怎样流转

在 DSH 中，可以从空白稿、构思卡或导入的稿件开始。工作稿会自动保存。准备交给别人阅读时，点「保存 Draft」留下编号快照，之后仍可回看审阅人当时看到的文字。

![从三种起稿方式进入工作稿，点击保存 Draft 后，首次或内容有变化时生成新编号。](docs/figures/manuscript-workflow/overview.svg)

使用 Archify 3.2.0（tt-a1i）制图。[流程详解、交互图与图源](docs/07-manuscript-workflow.md) · [Archify 项目](https://github.com/tt-a1i/archify)

- **组织正文**　在导图中排列章节或选择构思卡起草。结构阅读可按全文、段落和句内逻辑查看，并在「正文对照」定位到原句。[使用指南](docs/01-README.md#稿件怎样流转)
- **核对引文**　在正文里打开引文，查看当时固定的来源 PDF 和页码。稿件管理可按章查找图片、附件、公式和文献。[正文引文与图片](docs/01-README.md#正文引文与图片)
- **处理返修**　将 Word 审阅意见关联到送出的 Draft，记录采纳决定，再导出修订稿。导出项目 ZIP 可一并带走稿件、附件与版本历史。[示例中的返修步骤](examples/杯盖与降温/README.md#从选卡到第二版交付)

## 复制给 Agent 安装

复制下面整段给能操作本机终端的 Agent。若要指定宿主，可在末尾加上「使用 Codex」或「使用 DSH Web」。

```text
请在本机安装并验证 ManuScript v0.13.0。官方仓库是 https://github.com/RJ2045-PRC/ManuScript 。
先读仓库默认分支 README 的「平台支持」与「安装与启动」，识别本机系统、Shell 和我指定或当前使用的宿主。宿主不明确时，只问我要用 Codex 还是 DSH Web。
在独立目录检出官方标签 v0.13.0，按对应平台准备依赖，运行 npm run setup 和 npm run doctor。使用这个项目虚拟环境的 Python 启动宿主。
Codex 路径按 README 注册本地 marketplace 并安装 manuscript@manuscript-lab；macOS 的 DSH Web 路径启动独立试用实例。Windows 原生 DSH 遇到版本限制时，说明限制并停在该步骤。
用示例副本验证。报告实际完成的步骤、版本、打开入口，以及能否看到「杯盖与降温」的两个 Draft。需要我重启桌面应用时告诉我；保留我已有的项目、插件配置与凭据。
```

## 平台支持

| 系统 | Codex | DSH Web 独立试用 |
|---|---|---|
| macOS | 已验证本地插件包的 MCP App 入口。安装后重启 Codex，从「更多 / Explore」打开。 | 已在 DSH 0.2.2-rc.1 验证载入示例、保存 Draft 和导出 PDF。上方截图来自这一路径。 |
| Windows 原生 | 下方提供 PowerShell 环境检查与插件注册命令。v0.13.0 的 MCP 清单直接启动 `./server.mjs`，桌面宿主加载、读写与导出尚待 Windows 实机验证。 | v0.13.0 启动器会在 `win32` 退出。WSL 需要另备兼容的 Linux DSH 运行时，本版未验证这条路径。 |

## 安装与启动

准备 Git、Node.js 24.9 或以上、Python 3.11 或以上、Pandoc、Poppler（`pdftoppm`）和 LibreOffice（`soffice`）。DSH 与 Codex 分别存储项目，跨宿主使用时可以导出项目包再恢复。

### macOS 终端

```sh
git clone --branch v0.13.0 https://github.com/RJ2045-PRC/ManuScript.git
cd ManuScript
npm run setup
npm run doctor
export MANUSCRIPT_PYTHON="$PWD/.venv/bin/python3"
```

### Windows PowerShell

以下命令用于原生 Windows 的 Codex 试装。先让 `node`、`npm.cmd`、`pandoc`、`pdftoppm` 和 `soffice` 可从当前 PowerShell 调用。使用 Windows Python Launcher 找到 Python 3.11 或以上的解释器；只有 `python.exe` 时，可直接将其绝对路径赋给 `MANUSCRIPT_BOOTSTRAP_PYTHON`。

```powershell
git clone --branch v0.13.0 https://github.com/RJ2045-PRC/ManuScript.git
Set-Location ManuScript
$env:MANUSCRIPT_BOOTSTRAP_PYTHON = py -3 -c "import sys; print(sys.executable)"
npm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw "ManuScript setup failed" }
$env:MANUSCRIPT_PYTHON = (Resolve-Path ".venv/Scripts/python.exe").Path
npm.cmd run doctor
if ($LASTEXITCODE -ne 0) { throw "ManuScript doctor failed" }
```

环境检查通过后，按下方 Codex 步骤注册插件并验证宿主能否打开项目。

### DSH Web

在 macOS 安装兼容的 DSH 后，在完成环境检查的终端执行下列命令。它会从本机 DSH NEXT 提取运行时，为此轮试用创建独立配置，并将日志文件的位置显示在终端。打开日志中 `dsh web:` 后的本机地址，若新配置出现 DSH 的登录或 API Key 设置页，按宿主提示完成设置后，从侧栏选择 ManuScript。要先离线查看示例，可在打开本机地址后，在同一浏览器另开标签页，保留协议、主机和端口，将路径改为 `/api/manuscript.workspace`，点「载入杯盖与降温示例」。每次启动都会使用新的项目库，结束前可导出项目 ZIP。插件声明支持 DSH 0.2.1-rc.4 和 0.2.2-rc.1。已有完整运行时可通过 `MANUSCRIPT_DSH_RUNTIME` 指定目录。

```sh
node scripts/dsh-preview.mjs
```

### Codex

安装 Codex CLI 后，在仓库根目录注册本地插件市场并安装。macOS 终端使用以下命令。

```sh
codex plugin marketplace add "$PWD"
codex plugin add manuscript@manuscript-lab
```

Windows PowerShell 试装时，使用目录的完整字符串路径。

```powershell
codex plugin marketplace add (Get-Location).Path
codex plugin add manuscript@manuscript-lab
```

用 `codex plugin list --json` 核对安装记录。完整退出并从设置了 `MANUSCRIPT_PYTHON` 的环境重启 Codex，在「更多 / Explore」打开 ManuScript。点「载入杯盖与降温示例」，确认可以看到 Draft 01 和 Draft 02。若 Windows 宿主无法启动 MCP 进程，请在反馈中附上系统、Codex 版本和启动错误。

## 使用范围与反馈

- [使用指南](docs/01-README.md)说明如何编辑、留版、核对来源、处理返修与导出。[插件手册](packages/ManuScript/README.md)列出各宿主入口。
- Release 中的 `manuscript-0.13.0.tgz` 是已构建的插件包。源码树也包含工作台构建产物，修改源码后运行 `npm run build`，运行 `npm test` 验证 MCP App 入口。下载附件可对照 `SHA256SUMS.txt`。
- 示例的写作与返修练习可离线完成。调用模型对话或整理结构时，需要宿主配置可用的模型。扫描件 OCR、任意 Word 样式与复杂多文件 LaTeX 工程的无损往返尚未验证。

遇到问题时，请注明 ManuScript 版本、宿主及版本、操作步骤，以及预期和实际结果。可用随附的模拟稿复现。[提交 GitHub Issue](https://github.com/RJ2045-PRC/ManuScript/issues)

## 许可证

ManuScript 自有代码、文档和原创公开示例采用 [MIT](LICENSE)。第三方代码、引用样式和教学材料的出处及适用许可见[第三方说明](packages/ManuScript/THIRD-PARTY.md)。
