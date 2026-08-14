# Codex 工作规范：部署与 Supabase

处理本仓库的安装、部署、迁移、云端同步或故障排查前，必须先完整阅读：

1. `docs/GITHUB_SUPABASE_DEPLOYMENT.md`
2. `DATA_SAFETY.md`
3. `supabase/migrations/` 中全部 SQL 文件
4. `.github/workflows/deploy-pages.yml`

## 不可突破的安全边界

- 浏览器和 Vite 代码只能使用 `VITE_SUPABASE_URL` 与 Supabase Publishable key。
- 不得把 Supabase Secret key、`service_role`、数据库密码、管理员明文密码、Personal Access Token 写入代码、文档、终端日志或 Git 历史。
- 不得提交 `.env.local`。提交前执行 `git status --short` 和 `git diff --cached`。
- Publishable key 最终会进入浏览器构建产物；安全性必须来自 RLS、权限收敛和受控 RPC，不能依赖隐藏这个 key。
- 不得删除、重建或覆盖现有客户数据。数据库变更必须使用新的增量 migration；除非用户明确要求，不运行破坏性 SQL。

## 标准执行顺序

1. 检查 Node、pnpm、Git、仓库状态和现有配置，不覆盖用户未提交的修改。
2. 确认是“部署现有项目”还是“复制到朋友自己的 GitHub/Supabase”。后者必须使用新的 Supabase 项目和新的 GitHub Secrets。
3. 从 `.env.example` 创建本机 `.env.local`，只让用户在安全界面填值；不要要求用户把完整密钥发到聊天。
4. 按时间顺序应用 `supabase/migrations/*.sql`。成熟团队优先使用 Supabase CLI；首次图形化安装可以在 SQL Editor 逐份执行。
5. 在 Supabase 数据库中单独创建顾问用户名与密码哈希；明文密码不得进入 migration。
6. 运行 `pnpm install --frozen-lockfile`、`pnpm run test`、`pnpm run build`。
7. 在 GitHub 仓库配置 Actions Secrets：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`；配置 Actions Variable：`VITE_ALLOWED_USERNAMES`。
8. 确认 Pages Source 为 GitHub Actions，然后推送 `main`，检查 Actions 与线上资源版本。
9. 分别验证顾问模式、客户自测模式、本地预保存、云端同步、第二设备读取、删除二次确认。

## 自动化权限原则

- 可以自动执行只读检查、测试、构建、Git 提交和已获授权的推送。
- 创建 Supabase 项目、设置 GitHub Secrets、执行远端 migration 等会改变外部状态的操作，应先确认目标项目和账号；任何高权限凭据只通过平台 Secret UI 或本机受保护环境传递。
- 不把数据库 migration 自动绑在每次前端 push 上。数据库发布应是独立、可审计、一次只由一个执行者运行的流程。

## 完成交付标准

- 测试与构建通过。
- GitHub Actions 部署成功且线上页面可访问。
- 浏览器构建产物中不存在 Secret key、`service_role` 或数据库密码。
- Supabase 表已启用 RLS，基础表未直接授权给 `anon`；公开能力仅通过审核过的 RPC 暴露。
- 用第二个浏览器或设备完成真实同步验证。
