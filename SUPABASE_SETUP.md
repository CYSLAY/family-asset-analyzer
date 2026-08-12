# Supabase 连接步骤

只使用 **Publishable key**。不要把 Secret key、`service_role` 或数据库密码写入本项目。

## 1. 填写前端连接密钥

打开项目根目录的 `.env.local`，把：

```text
sb_publishable_your_key
```

替换为 Supabase 后台 `Settings → API Keys → Publishable key → default` 中复制的完整内容。

项目地址已经填写为：

```text
https://zwsjltgkpdiazhrpepla.supabase.co
```

## 2. 初始化数据库

1. 在 Supabase 左侧进入 `SQL Editor`。
2. 点击 `New query`。
3. 依次运行 `supabase/migrations/202608120001_initial_schema.sql` 和 `supabase/migrations/202608120002_username_workspace.sql`。
4. 每份脚本粘贴后点击 `Run`。
5. 两次都看到 `Success. No rows returned` 即表示完成。

这份脚本会建立客户资料与分析快照表，并开启 RLS。每个登录账号只能访问自己的资料。

## 3. 验证同步

重启本地应用后，输入白名单用户名 `jojo`。新建客户后会自动上传；另一台设备输入同一用户名后会合并最新资料。

当前入口只有用户名，没有密码或验证码，适合个人或受控环境使用，不属于强身份认证。
