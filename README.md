# DeepSeek HTML 单文件版

[<img src="https://elfinc.github.io/deepseek-single-html/favicon.webp" width="240" />](https://elfinc.github.io/deepseek-single-html)

## Google Drive 存档同步

1. 在 Google Cloud 项目中启用 Google Drive API，并配置 OAuth 同意屏幕。
2. 创建“Web 应用”类型的 OAuth 2.0 客户端，把开发和部署站点加入“已获授权的 JavaScript 来源”（本地开发默认为 `http://localhost:3000`）。
3. 复制 `.env.example` 为 `.env.local`，填写 `VITE_GOOGLE_CLIENT_ID` 后重新构建。

用户可在“存档管理”中登录 Google Drive。应用只申请 `drive.appdata` 权限，存档位于该应用专属的隐藏目录；登录期间，每次 AI 回复完整接收后会上传一次最新存档。访问令牌仅保存在页面内存中；页面刷新后会尝试自动恢复连接，Google 会话失效、授权窗口被拦截或令牌过期时需要重新登录。

隐私政策公开地址：<https://elfinc.github.io/deepseek-single-html/privacy.html>
