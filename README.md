# ManuScript

ManuScript 是在本机管理稿件、证据与返修的写作工作台。可以从构思卡或已有稿开始，保存带编号的 Draft，将 Word 批注定位到旧稿原句，再核对来源和导出修订稿。

**0.13.0 · 首次公开测试版**　[Release 与下载](https://github.com/RJ2045-PRC/ManuScript/releases/tag/v0.13.0) · [稿件流转图](docs/07-manuscript-workflow.md) · [完整功能示例](examples/杯盖与降温/README.md)

## 从一篇论文开始

[杯盖与降温](examples/杯盖与降温/README.md)是一篇原创模拟研究。起点和完成态项目可以分别恢复，也可以先读[修订稿 PDF](examples/杯盖与降温/稿件/Draft-02-修订稿.pdf)。工作台上的「载入杯盖与降温示例」会建立完成态副本。想亲手走完两轮修订，从示例导读里的起点包开始。基础练习可离线完成。

## 安装与启动

以下步骤在 macOS 终端执行。准备 Node.js 24.9 或以上、Python 3.11 或以上、Pandoc、Poppler 与 LibreOffice。DSH 与 Codex 分别存储项目。跨宿主使用时可导出项目包再恢复。

```sh
git clone --branch v0.13.0 https://github.com/RJ2045-PRC/ManuScript.git
cd ManuScript
npm run setup
npm run doctor
export MANUSCRIPT_PYTHON="$PWD/.venv/bin/python3"
```

**DSH Web**　安装兼容的 DSH 后，在上面的终端执行下列命令。它会从本机 DSH NEXT 提取运行时，为此轮试用创建独立配置，并将日志文件的位置显示在终端。打开日志中 `dsh web:` 后的本机地址，若新配置出现 DSH 的登录或 API Key 设置页，按宿主提示完成设置后，从侧栏选择 ManuScript。要先离线查看示例，可在打开本机地址后，在同一浏览器另开标签页，保留协议、主机和端口，将路径改为 `/api/manuscript.workspace`，点「载入杯盖与降温示例」。每次启动都会使用新的项目库，结束前可导出项目 ZIP。插件声明支持 DSH 0.2.1-rc.4 和 0.2.2-rc.1。已有完整运行时可通过 `MANUSCRIPT_DSH_RUNTIME` 指定目录。

```sh
node scripts/dsh-preview.mjs
```

**Codex**　在仓库根目录执行下列命令。本机宿主进程需要能使用上面配置的 Python 环境。完整退出并重启 Codex 后，从「更多 / Explore」打开 ManuScript。

```sh
codex plugin marketplace add "$PWD"
codex plugin add manuscript@manuscript-lab
```

## 文件与验证

- [使用指南](docs/01-README.md)说明如何编辑、留版、核对来源、处理返修与导出。[插件手册](packages/ManuScript/README.md)列出各宿主入口。
- Release 中的 `manuscript-0.13.0.tgz` 是已构建的插件包。源码树也包含工作台构建产物，修改源码后运行 `npm run build`，运行 `npm test` 验证 MCP App 入口。下载附件可对照 `SHA256SUMS.txt`。
- 真实模型对话依赖宿主配置。扫描件 OCR、任意 Word 样式与复杂多文件 LaTeX 工程的无损往返尚未验证。

## 许可证

ManuScript 自有代码、文档和原创公开示例采用 [MIT](LICENSE)。第三方代码、引用样式和教学材料的出处及适用许可见[第三方说明](packages/ManuScript/THIRD-PARTY.md)。
