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

### 方式一：npm 发布版（推荐，装完即用）

```sh
dsh plugin --profile web add dsh-usage-lens
```

包内已含构建产物，无需任何额外步骤。**绝大多数用户请使用本方式。**

### 方式二：GitHub 仓库（仅适合开发者）

```sh
dsh plugin --profile web add github:yokesky/dsh-usage-lens
```

git 安装不含构建产物，需要手动构建，且过程依赖较多，**仅供开发者调试源码使用**。

#### 步骤 1：放行构建脚本

首次安装会报 `ERR_PNPM_IGNORED_BUILDS`。把报错提示的**完整 key**（形如 `dsh-usage-lens@https://codeload.github.com/yokesky/dsh-usage-lens/tar.gz/<commit-SHA>`）加入 `$DSH_HOME\profiles\web\pnpm-workspace.yaml` 的 `allowBuilds`（值设 `true`），重新执行安装命令。

> ⚠️ key 里的 commit-SHA 会随仓库提交变化，每次更新插件后 key 都需重新放行。

#### 步骤 2：手动构建

```sh
# Windows PowerShell
cd $env:DSH_HOME\profiles\web\node_modules\dsh-usage-lens
npm install
npm install -D tsx
pnpm exec tsdown --config-loader tsx
```

> 必须用 `npm install`（pnpm 不会为 git 包安装 devDependencies）；tsdown 读取位于 `node_modules` 下的 TS 配置文件时需要 `--config-loader tsx`（Node 24.11.1 之前的已知限制）。

#### 安装后

重启 web 服务，打开设置面板即可看到「用量统计」。

> 从本地源码目录安装（开发调试）：`dsh plugin --profile web add <本仓库路径>`，同样需先构建（`pnpm install && pnpm build`）。

## 数据说明

- 所有数据来自你本机的 DSH 会话记录，只在本地处理，不会上传到任何地方。
- 面板自动跟随 DSH 的亮色 / 暗色主题。

## License

MIT © 2026 yokesky
