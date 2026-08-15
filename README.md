# dsh-usage-lens

DeepSeek Harness（DSH）Web UI 的**用量统计面板**。安装后，设置面板会新增「用量统计」页面，直观展示你的使用情况。

## 预览

<p align="center">
  <img src="assets/preview/预览1.png" width="45%" alt="预览1" />
  <img src="assets/preview/预览2.png" width="45%" alt="预览2" />
</p>

## 功能

- **总览卡片**：tokens 用量、会话数量、消息数量、活跃天数、当前连续天数、最常用模型。
- **活跃热力图**：GitHub 风格的 280 天活跃热力图，一眼看清使用节奏。
- **每日 Token 趋势**：按天查看 token 消耗，可切换「模型 / 厂商」视角。
- **模型用量双环饼图**：支持「汇总 / 厂商 / 模型」三种查看方式。

## 安装

两种方式对应两种人群，按需选择。

### 方式一：npm 发布版（普通用户，装完即用）

```sh
dsh plugin --profile web add dsh-usage-lens
```

包内已含构建产物，一行命令装完即用，无需任何额外步骤。

### 方式二：源码本地安装（开发者，便于复现与改代码）

```sh
git clone https://github.com/yokesky/dsh-usage-lens.git
cd dsh-usage-lens
pnpm install
pnpm build
dsh plugin --profile web add link:<本仓库绝对路径>
```

安装后重启 web 服务，打开设置面板即可看到「用量统计」。

> 说明：`link:` 方式指向本地源码，修改代码后只需重新 `pnpm build` 并重启 web 服务即可生效，无需重新安装。也可以直接从本仓库路径安装：`dsh plugin --profile web add <本仓库路径>`。

> 为什么不建议 `github:` 协议安装：git 安装需要 pnpm 现场执行构建脚本，会触发 pnpm 11 的构建脚本安全拦截（`ERR_PNPM_IGNORED_BUILDS`），需要按报错提示在 `pnpm-workspace.yaml` 手动放行（key 形如 `dsh-usage-lens@https://codeload.github.com/.../tar.gz/<commit-SHA>`，且随提交变化）；`link:` 方式没有这些步骤。

## 数据说明

- 所有数据来自你本机的 DSH 会话记录，只在本地处理，不会上传到任何地方。
- 面板自动跟随 DSH 的亮色 / 暗色主题。

## License

MIT © 2026 yokesky
