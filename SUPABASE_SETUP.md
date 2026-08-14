# Supabase 连接步骤（当前项目快速版）

完整的 GitHub Pages 自动部署、朋友 Fork、Codex 接手、安全机制与故障排查，请阅读 [GitHub Pages + Supabase 标准部署手册](./docs/GITHUB_SUPABASE_DEPLOYMENT.md)。

只使用 **Publishable key**。不要把 Secret key、`service_role` 或数据库密码写入本项目。

## 1. 填写前端连接密钥

从模板创建本地文件：

```bash
cp .env.example .env.local
```

然后填写朋友自己的 Supabase 项目地址与 Publishable key：

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_ALLOWED_USERNAMES=jojo
```

## 2. 初始化数据库

1. 在 Supabase 左侧进入 `SQL Editor`。
2. 点击 `New query`。
3. 按文件名顺序运行 `supabase/migrations/` 中全部四份 SQL，包括 `202608130001_public_intake.sql`。
4. 每份脚本粘贴后点击 `Run`。
5. 每次都看到 `Success. No rows returned` 即表示完成。

这些脚本会建立顾问档案、客户自填档案、密码验证函数与 RLS/权限规则。基础表不直接暴露给匿名浏览器，前端通过受控 RPC 工作。

## 3. 设置顾问密码

在 Supabase SQL Editor 单独执行以下 SQL，不要把真实密码保存进仓库：

```sql
insert into public.workspace_users (username, active, access_hash)
values ('jojo', true, crypt('CHANGE_TO_A_STRONG_PASSWORD', gen_salt('bf', 12)))
on conflict (username) do update
set active = excluded.active,
    access_hash = excluded.access_hash;
```

## 4. 验证同步

重启应用后，输入白名单用户名和访问密码。输入先保存在本机；点击“保存并同步”后才上传当前客户。另一台设备使用相同凭据即可读取已同步资料。
