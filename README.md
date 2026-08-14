# 家庭资产分析工具

面向电脑与 iPad 的家庭资产负债、收支储蓄和目标分析 Web 应用。客户档案先保存到本机 IndexedDB；连接 Supabase 后，可按白名单用户名进行多设备同步。

## 已实现

- 按姓名建立客户与家庭成员档案；同名客户使用独立 UUID，不会互相覆盖。
- 资产、负债、收入、支出和教育目标的结构化录入。
- 9 项动态指标、风险优先级、结构图表与随数值变化的解释文案。
- 本机自动保存、归档、搜索、永久删除。
- 用户名与访问密码保护、独立云端空间和本地/云端同步；默认用户名为 `jojo`，密码哈希只保存在 Supabase。
- 输入先自动保存在本机，点击“保存并同步”后才上传当前客户。
- AES-256 密码加密备份与恢复。
- 可安装网页应用、基础离线缓存、报告打印或保存 PDF。
- 响应式电脑/iPad 布局和深色模式。

## 本地运行

需要 Node.js 20+ 与 pnpm。

```bash
pnpm install
pnpm run dev
```

生产检查：

```bash
pnpm run test
pnpm run build
pnpm run preview
```

## Supabase

按 [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) 完成 Publishable key、数据库迁移和顾问密码配置。`.env.local` 已被 Git 忽略，不会上传到 GitHub。

需要从零复制到朋友自己的 GitHub 与 Supabase，或让 Codex 接手自动部署时，请使用完整的 [GitHub Pages + Supabase 标准部署手册](./docs/GITHUB_SUPABASE_DEPLOYMENT.md)。仓库根目录的 [AGENTS.md](./AGENTS.md) 定义了 Codex 必须遵守的安全和发布流程。

数据库迁移位于 `supabase/migrations/`。前端只能使用 Publishable key；Secret key、`service_role` 和数据库密码不得写入浏览器代码。

用户名和访问密码由 Supabase 验证。当前使用六位访问密码，适合个人或受控范围；如扩大使用范围，应升级为更长密码、限流或企业身份认证。

## 分析说明

公式、区间、动态文案和使用边界见 [METHODOLOGY.md](./METHODOLOGY.md)。本工具提供财务整理与风险提示，不替代持牌专业人士的个性化建议。

数据升级、保存与删除边界见 [DATA_SAFETY.md](./DATA_SAFETY.md)。

## 发布说明

当前仓库通过 `.github/workflows/deploy-pages.yml` 自动测试、构建并发布到 GitHub Pages。每次推送 `main` 都会触发部署。仓库需设置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ALLOWED_USERNAMES`（GitHub Actions Variable，逗号分隔，默认 `jojo`）

不要提交 `.env.local`，也不要在任何前端环境变量中使用 Secret key、`service_role` 或数据库密码。
