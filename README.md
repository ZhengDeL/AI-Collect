# AI 情报站

每天一份 AI 技术情报，自动汇总、人工判断、公开可查。

- 内容：昇腾生态 / 英伟达生态 / 通用 AI 动态 / 创新选题
- 站点：纯静态，仓库根目录即站点根目录

## 目录结构

```
index.html            站点入口（纯静态，无构建）
assets/style.css      样式
assets/app.js         前端逻辑
data/index.json       期数索引（日期 + 条数）
data/YYYY-MM-DD.json  每日内容
```

## 内容格式

`data/YYYY-MM-DD.json`：

```json
{
  "date": "2026-11-16",
  "generated_at": "2026-11-16T09:00:00+08:00",
  "items": [
    {
      "id": "20261116-001",
      "source": "昇腾",
      "title": "标题",
      "url": "https://…",
      "time": "2026-11-15",
      "points": ["要点一", "要点二", "要点三"],
      "verdict": "值得",
      "credibility": "高（官方 release notes）",
      "tags": ["CANN", "推理"]
    }
  ]
}
```

- `source` 取值：`昇腾` / `英伟达` / `快讯` / `创新` / `其他`
- `verdict` 取值：`值得` / `观察` / `不值得`
- `credibility` 写清依据：官方发布、论文、社区实测、二手转述

新增一期时，除了写入 `data/YYYY-MM-DD.json`，还要在 `data/index.json` 的 `dates` 数组头部插入该日期，并更新 `updated`。

## 本地预览

纯静态，任意静态服务器即可：

```bash
python -m http.server 8080
# 打开 http://localhost:8080
```

## 发布

推送到 `main` 分支后，GitHub Pages 以仓库根目录为站点源，无需构建。
