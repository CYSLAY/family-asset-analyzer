# 发布检查清单

- [ ] Supabase 已按顺序成功运行 `supabase/migrations/` 中全部迁移。
- [ ] 顾问用户名已启用且 `access_hash` 已配置。
- [ ] `.env.local` 已填写 Project URL 与 Publishable key，未填写任何 Secret key。
- [x] `jojo` 可进入，名单外用户名被拒绝。
- [x] 临时客户可上传、读取并从本机和云端删除。
- [ ] 另一台真实设备输入 `jojo` 后能够读取正式客户。
- [ ] `pnpm run test` 与 `pnpm run build` 通过。
- [ ] 电脑与 iPad 尺寸下完成关键路径检查。
- [ ] GitHub Actions Secrets 已配置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。
- [ ] GitHub Actions Variable 已配置 `VITE_ALLOWED_USERNAMES`。
- [ ] GitHub Pages Source 已选择 GitHub Actions，最新部署成功。
- [ ] 推送前再次检查 `.env.local` 未被跟踪，暂存区不含密钥、客户导出或无关文件。
- [ ] Supabase 表的 RLS、角色 grant、RPC execute 权限与 Security Advisor 已复核。
- [ ] 顾问模式和客户自测模式均完成真实云端同步验证。
