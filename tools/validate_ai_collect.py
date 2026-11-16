#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 情报站数据契约校验器（POC，留在 innovation 目录，不改生产代码）

纯标准库、只读。校验仓库既有契约（README.md 实读确认）：
  data/index.json        = {updated, dates:[{date,count}]}，dates 按日期降序
  data/YYYY-MM-DD.json   = {date, generated_at, items:[...]}
  item = {id, source, title, url, time, points, verdict, credibility, tags}

用法：
  python validate_ai_collect.py --base main        # 拉线上 main 校验
  python validate_ai_collect.py --dir <本地仓库>   # 校验本地目录
  python validate_ai_collect.py --sample           # 用今日移交样本演示「越界如何被抓出」

退出码：0=无 error；1=存在 error（warning 不影响退出码）。
"""
import argparse
import json
import os
import re
import sys
import urllib.request

SOURCE_ENUM = {"昇腾", "英伟达", "快讯", "创新", "其他"}
VERDICT_ENUM = {"值得", "观察", "不值得"}
REQUIRED = ["id", "source", "title", "url", "time", "points", "verdict", "credibility", "tags"]
KNOWN_BADGES = {"昇腾", "英伟达", "快讯", "创新", "其他"}  # assets/style.css 实读已定义
# 快讯移交样本里出现的「是否有用/有用」等口语取值 -> 契约值的合法映射（仅提示，不自动改）
VERDICT_ALIASES = {"有用": "值得", "是": "值得", "没用": "不值得", "否": "不值得"}
CRED_HINT = re.compile(r"(官方|论文|实测|社区|二手|转述|传闻|未证实|未查到)")
# 与《20261116-内容策略与栏目设计v1.md》第 3 节受控词表保持一致
CTRL_TAGS = {
    # 技术域
    "CANN", "MindSpore", "vLLM-Ascend", "TensorRT-LLM", "Triton", "CUDA",
    "并行策略", "算子融合", "量化", "KV Cache", "通信优化", "MoE",
    "推理", "训练", "Agent", "多模态", "评测", "开源", "行业动向",
    # 内容类型
    "Release Notes", "论文", "官方博客", "实测", "榜单", "破坏性变更", "周报", "专题", "精选",
    "热点仓库",
    # 状态标记
    "业界调优", "未证实", "未查到", "需复现", "可复用", "交架构师",
    # 站点公告（线上 main 开张条目已在用）
    "公告", "站点",
}
NAV_HOSTS = ("github.com/trending", "news.ycombinator.com", "huggingface.co/papers?")

errors, warnings = [], []


def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "AI-Collect-validator/1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8")


def load_doc(loader, path):
    try:
        return json.loads(loader(path))
    except FileNotFoundError:
        err("%s: 文件不存在" % path); return None
    except Exception as e:
        err("%s: 读取/解析失败：%s" % (path, e)); return None


def check_day(day, label):
    if not isinstance(day, dict):
        err("%s: 顶层必须是对象" % label); return
    for k in ("date", "generated_at", "items"):
        if k not in day:
            err("%s: 缺顶层字段 %s" % (label, k))
    date = day.get("date", "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(date)):
        err("%s: date 必须是 YYYY-MM-DD，实为 %r" % (label, date))
    items = day.get("items")
    if not isinstance(items, list):
        err("%s: items 必须是数组" % label); return
    for i, it in enumerate(items):
        tag = "%s items[%d]" % (label, i)
        if not isinstance(it, dict):
            err("%s: 必须是对象" % tag); continue
        for k in REQUIRED:
            if k not in it:
                err("%s: 缺字段 %s" % (tag, k))
        src = it.get("source")
        if src not in SOURCE_ENUM:
            err("%s: source=%r 越界（合法：%s）" % (tag, src, "/".join(sorted(SOURCE_ENUM))))
        elif src not in KNOWN_BADGES:
            warn("%s: source=%r 无 CSS badge（style.css 需补一行），badge 会无色" % (tag, src))
        v = it.get("verdict")
        if v not in VERDICT_ENUM:
            if v in VERDICT_ALIASES:
                err("%s: verdict=%r 越界，应按映射改成 %r" % (tag, v, VERDICT_ALIASES[v]))
            else:
                err("%s: verdict=%r 越界（合法：%s）" % (tag, v, "/".join(sorted(VERDICT_ENUM))))
        pts = it.get("points")
        if not isinstance(pts, list):
            err("%s: points 必须是数组" % tag)
        elif len(pts) != 3:
            err("%s: points 必须恰好 3 条（硬规矩①），实为 %d" % (tag, len(pts)))
        iid = str(it.get("id", ""))
        if not re.fullmatch(r"\d{8}-\d{3}", iid):
            err("%s: id=%r 应为 YYYYMMDD-NNN" % (tag, iid))
        elif re.sub(r"-", "", str(date)) != iid.split("-")[0]:
            err("%s: id 日期段 %s 与文件日期 %s 不一致" % (tag, iid.split("-")[0], date))
        url = str(it.get("url", ""))
        if not url.startswith("http"):
            err("%s: url=%r 不是可直达链接" % (tag, url))
        elif any(h in url for h in NAV_HOSTS):
            warn("%s: url 疑似导航/榜单/聚合页，硬规矩②要求原始来源：%s" % (tag, url))
        cred = it.get("credibility")
        if cred is not None and not CRED_HINT.search(str(cred)):
            warn("%s: credibility=%r 未含可信度依据关键词" % (tag, cred))
        tags = it.get("tags")
        if not isinstance(tags, list):
            err("%s: tags 必须是数组" % tag)
        elif len(tags) != len(set(tags)):
            warn("%s: tags 有重复" % tag)
        if tags:
            unknown = [t for t in tags if t not in CTRL_TAGS]
            # 技术域 tag 是开放集合，只提示、不算错
            if unknown:
                warn("%s: 受控词表外 tag（开放技术域，确认拼写即可）：%s" % (tag, ",".join(map(str, unknown))))
        # 未证实/未查到 必须进 tags，否则 app.js 搜不到（不索引 credibility）
        c = str(cred or "")
        if ("未证实" in c or "传闻" in c) and tags and "未证实" not in tags:
            err("%s: 可信度含『未证实/传闻』但 tags 缺 未证实（搜索框检索不到）" % tag)
        if "未查到" in c and tags and "未查到" not in tags:
            err("%s: 可信度含『未查到』但 tags 缺 未查到" % tag)


def check_index(index, loader, label):
    if not isinstance(index, dict):
        err("%s: index 必须是对象" % label); return
    dates = index.get("dates")
    if not isinstance(dates, list):
        err("%s: index.dates 必须是数组" % label); return
    seq = [d.get("date") for d in dates]
    if seq != sorted(seq, reverse=True):
        err("%s: index.dates 必须按日期降序（app.js 翻页依赖），实为 %s" % (label, seq))
    for d in dates:
        date, count = d.get("date"), d.get("count")
        day = load_doc(loader, "data/%s.json" % date)
        if day is None:
            continue
        n = len(day.get("items", [])) if isinstance(day.get("items"), list) else -1
        if count != n:
            err("%s: index.count=%r 与 data/%s.json 的 items 数 %d 不一致" % (label, count, date, n))
        check_day(day, "data/%s.json" % date)


SAMPLE = {
    "date": "2026-11-16",
    "generated_at": "2026-11-16T09:00:00+08:00",
    "items": [
        {"id": "20261116-001", "source": "其他", "title": "vLLM v0.33.0 发布",
         "url": "https://github.com/vllm-project/vllm/releases/tag/v0.33.0rc3",
         "time": "2026-11-02", "points": ["升 PyTorch 2.14", "CUDA 仅剩 13.0", "升级前必核部署链路"],
         "verdict": "有用", "credibility": "高（官方 release notes）", "tags": ["推理", "破坏性变更"]},
        {"id": "20261116-002", "source": "业界调优", "title": "FOAM 优化器",
         "url": "https://github.com/trending", "time": "2026-11-13",
         "points": ["半 optimizer state", "Muon 级速度"],
         "verdict": "观察", "credibility": "中（论文，未独立复现）", "tags": ["训练"]},
        {"id": "20261116-003", "source": "快讯", "title": "某传闻模型降价 60%",
         "url": "https://www.scmp.com/tech", "time": "2026-11-16",
         "points": ["公司口径称降本", "型号未给出", "正文未取到"],
         "verdict": "观察", "credibility": "低（传闻，未证实）", "tags": ["行业动向"]},
        {"id": "20261116-004", "source": "创新", "title": "对齐多智能体需设安全负责人",
         "url": "https://huggingface.co/papers/2611.17820", "time": "2026-11-13",
         "points": ["单体对齐不迁移到多 agent", "主因责任扩散", "指定 safety lead + 书面规格可恢复"],
         "verdict": "值得", "credibility": "中（论文，未独立复现）", "tags": ["Agent", "可复用", "交架构师"]},
    ],
}
SAMPLE_INDEX = {"updated": "2026-11-16T09:00:00+08:00",
                "dates": [{"date": "2026-11-16", "count": 4}]}


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--base", metavar="REF", help="拉线上分支/提交校验，如 main")
    g.add_argument("--dir", metavar="PATH", help="校验本地仓库目录")
    g.add_argument("--sample", action="store_true", help="用移交样本演示越界检测")
    g.add_argument("--items", metavar="PATH", help="校验单条供稿片段（裸数组或 {items:[...]}），入库合并前用")
    a = ap.parse_args()

    if a.items:
        print("=== --items %s（供稿片段，合并前校验）===" % a.items)
        with open(a.items, encoding="utf-8") as f:
            raw = json.load(f)
        frag = raw if isinstance(raw, list) else raw.get("items")
        if not isinstance(frag, list):
            err("片段必须是数组或含 items 数组的对象")
        else:
            # 去重口径（与策略 v1 第 4 节一致）：
            #  - 事实层（source != 创新）按 url 去重，先入为准 → 片段内 url 重复要提示
            #  - 判断层（source=创新）不参加 url 去重，只查 id 不撞车 → 复用事实层 url 合法
            #  - 门禁只查「片段内」重复，不跨条目查 url；跨条目去重由汇总人做
            ids = [str(x.get("id", "")) for x in frag if isinstance(x, dict)]
            dup = sorted({i for i in ids if ids.count(i) > 1})
            if dup:
                err("片段内 id 重复：%s" % ",".join(dup))
            fact_urls = [str(x.get("url", "")) for x in frag
                         if isinstance(x, dict) and x.get("source") != "创新"]
            dupu = sorted({u for u in fact_urls if u and fact_urls.count(u) > 1})
            if dupu:
                warn("事实层片段内 url 重复（按第 4 节应先入为准合并）：%s" % ",".join(dupu))
            judged = sum(1 for x in frag if isinstance(x, dict) and x.get("source") == "创新")
            if judged:
                print("  [口径] 判断层 %d 条（source=创新）不参加 url 去重，仅查 id；跨条目去重由汇总人做" % judged)
            m = re.match(r"(\d{4})(\d{2})(\d{2})", ids[0]) if ids else None
            date = "%s-%s-%s" % m.groups() if m else "2026-11-16"
            check_day({"date": date, "generated_at": "", "items": frag}, "fragment")
    elif a.sample:
        print("=== --sample：今日移交样本（故意含越界值）===")
        check_index(SAMPLE_INDEX, lambda p: json.dumps(SAMPLE), "sample")
    elif a.dir:
        print("=== --dir %s ===" % a.dir)
        def loader(p):
            with open(os.path.join(a.dir, p), encoding="utf-8") as f:
                return f.read()
        idx = load_doc(loader, "data/index.json")
        if idx is not None:
            check_index(idx, loader, "index.json")
    else:
        root = "https://raw.githubusercontent.com/ZhengDeL/AI-Collect/%s/" % a.base
        print("=== --base %s ===" % a.base)
        def loader(p):
            return fetch(root + p)
        idx = load_doc(loader, "data/index.json")
        if idx is not None:
            check_index(idx, loader, "index.json")

    print("\n--- 结果：%d error / %d warning ---" % (len(errors), len(warnings)))
    for m in errors:
        print("  [ERROR]   " + m)
    for m in warnings:
        print("  [WARN]    " + m)
    if not errors:
        print("  契约校验通过。")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
