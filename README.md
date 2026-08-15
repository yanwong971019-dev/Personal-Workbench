# Personal-Workbench
个人生活工作台

## AI 图片识别

前端部署在 GitHub Pages；餐食照片和购物小票识别由本仓库的 Vercel Functions 提供，模型默认使用阿里云百炼 `qwen3-vl-flash`。

1. 在 Vercel 导入本仓库。
2. 设置环境变量：`DASHSCOPE_API_KEY`、`AUTH_TOKEN`。
3. 可选设置：`DASHSCOPE_BASE_URL`、`QWEN_VISION_MODEL`、`QWEN_TEXT_MODEL`。
4. 部署后，在工作台“更多 → AI”中填写 Vercel 项目地址和同一个 `AUTH_TOKEN`。

密钥只保存在 Vercel 服务端环境变量中，不得写入仓库。AI 结果属于估算草稿，保存前请人工核对食物、金额和数量。
