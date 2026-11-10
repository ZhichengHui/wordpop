# WordPop 划词词典

WordPop 是一个英汉划词词典，有 Firefox 扩展和 Zotero 插件两个版本。选中英文单词或短语后，立即弹出释义：先查离线的柯林斯英汉词典，查不到时再查有道在线词典。

## 功能

- **离线优先**：内置约 3.7 万词条的柯林斯英汉词典，常用词不联网也能秒查。
- **在线补充**：柯林斯查不到的词（美式拼写、专业术语、派生词、短语）改查有道，显示基本释义、词形变化、按领域分组的专业释义；选中的是句子时显示机器翻译。
- **两种查词规则**，在设置里切换：
  - 精确（默认）：柯林斯有这个词本身 → 有道 → 柯林斯词形还原的结果。比如 soundness 显示有道的释义，而不是词根 sound 的释义。
  - 宽松：柯林斯有这个词本身，或能还原出原形（running → run） → 有道。
- **Firefox 里的 PDF**：Firefox 不允许扩展在它自带的 PDF 阅读器里运行，所以扩展内置了一份 [pdf.js](https://github.com/mozilla/pdf.js) 阅读器，在线 PDF 会自动在这个阅读器里打开，可以在 PDF 里划词。右下角的按钮可以切回 Firefox 自带阅读器。
- **Zotero**：释义显示在 PDF 阅读器选中文字后出现的弹窗里，弹窗宽度和高度可调。

## 安装

本仓库不包含柯林斯词库（有版权），也不提供构建好的安装包，需要自己构建：

```sh
npm install
tools/fetch-data.sh   # 从 addons.mozilla.org 下载 ODH Revival 扩展并提取柯林斯词库到 data/
tools/build.sh        # 生成 dist/wordpop-firefox-<版本>.zip 和 dist/wordpop-zotero.xpi
```

- **Zotero**（7 及以上）：工具 → 插件 → 齿轮 → 从文件安装，选 `dist/wordpop-zotero.xpi`。Zotero 不要求插件签名。
- **Firefox**（142 及以上）：正式版 Firefox 只能安装经 Mozilla 签名的扩展。用自己的 [AMO API key](https://addons.mozilla.org/developers/addon/api/key/) 以 unlisted 方式签名后安装：

  ```sh
  export WEB_EXT_API_KEY=...  WEB_EXT_API_SECRET=...
  npx web-ext sign --source-dir dist/firefox --artifacts-dir dist --channel=unlisted
  ```

  签好的 `.xpi` 在 `about:addons` → 齿轮 → 从文件安装。注意：扩展 ID 是 `wordpop@s2982359.local`，在 AMO 上已经被占用；自己签名前要把 `firefox/manifest.json` 里的 `browser_specific_settings.gecko.id` 改成你自己的 ID。
  只想试用的话，也可以在 `about:debugging` 里临时加载 `dist/firefox/manifest.json`，重启 Firefox 后失效。

安装 Firefox 扩展后，如果设置页提示没有访问网站的权限，点"授权"。查有道和打开在线 PDF 都需要这个权限。

## 使用

- 在网页或 PDF 里选中英文（默认最多 5 个单词），释义就会弹出。点别处、按 Esc 或滚动页面关闭。
- 本地 PDF 不会自动在扩展的阅读器里打开：点工具栏上的 WordPop 按钮打开阅读器，再把文件拖进去。
- 设置：Firefox 在 `about:addons` → WordPop → 选项；Zotero 在 编辑 → 设置 → WordPop 划词词典。

## 已知限制

- 需要登录才能下载的 PDF（比如通过学校权限访问的论文）可能在扩展的阅读器里打不开，这时用右下角的按钮切回 Firefox 自带阅读器。
- 有道部分是解析 `dict.youdao.com` 的网页，有道改版后可能失效。
- Zotero 版用到了阅读器的一个内部状态做端到端测试，不影响使用，但新版 Zotero 可能需要调整测试。

## 开发

架构、开发流程和测试方法见 [AGENTS.md](AGENTS.md)。

## 许可

本仓库的代码使用 [MIT 许可证](LICENSE)。`vendor/pdfjs/` 是 Mozilla 的 pdf.js 发行版，使用 Apache-2.0 许可证（见 `vendor/pdfjs/LICENSE`）。柯林斯词库数据来自 [ODH Revival](https://addons.mozilla.org/firefox/addon/odh-revival/)，版权归原权利人所有，本仓库不包含这些数据。
