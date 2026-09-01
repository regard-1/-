# AGENTS.md — 给 AI 助手的工作约定

本项目的代码与部署均由 AI 协助完成。所有 AI 助手（Codex / Cursor / Claude Code 等）在本项目工作前，必须先读本文件并遵守以下约定。

## 项目性质

- **多特倍斯私域运营中台 MVP**

- 后端：纯 Python 标准库 `http.server.BaseHTTPRequestHandler` + `sqlite3`（**不用 FastAPI/Flask/Django**）

- 前端：原生 HTML/CSS/JS（Gitee Pages 托管，push 后需手动触发部署）

- 测试：前端 `tests/frontend_smoke.js`（Node 冒烟）；后端建议补 unittest（见 `quality-gate` skill）

- 主入口：`server.py`（端口 8090），或 `py -m http.server 8091` 只跑前端静态

- 在线演示：<https://danchengweisong.gitee.io/dotbest（Gitee> Pages）

- Gitee 仓库：<https://gitee.com/danchengWeisong/Dotbest>

## 红线（必先执行）

1. **STOP — 改任何** **`.py`** **或部署前，必须先调用四个 skill 加载规范**。未调用 skill 直接改代码/部署 = 违规，必须停下补调。这四个 skill 必须按场景调用：

   - `python-http-standards`（`.agents/skills/python-http-standards/SKILL.md`）—— 统一响应、异常处理、sqlite3 规范、路由分发

   - `python-logging-standards`（`.agents/skills/python-logging-standards/SKILL.md`）—— logging 配置、trace\_id、脱敏、滚动删除

   - `quality-gate`（`.agents/skills/quality-gate/SKILL.md`）—— ruff + unittest + 快照测试，commit 前必跑

   - `deploy-gate`（`.agents/skills/deploy-gate/SKILL.md`）—— Gitee Pages 前端部署 + python server.py 后端部署 + 回滚

   触发场景：新增/修改任何 `.py`、配置日志、新增接口、部署/发布。

2. **commit 前必须跑完质量闸门**（详见 `quality-gate` skill）：

   - `ruff check .` 0 error

   - `python -m unittest discover -s tests -v` 全绿

   - 快照测试全绿（快照变化必须人工确认）

   任何一道失败都不许跳过、不许改测试/改配置来"通过"。
   前置：若项目未配 ruff，AI 必须先提示用户 `pip install ruff`，否则闸门无效。

3. **部署前必先调** **`deploy-gate`** **skill**：

   - 前端：push 到 main 后在 Gitee 后台「Gitee Pages」手动点「更新」触发部署（push 不自动部署）

   - 后端：`python server.py`（或 `.\start.ps1`）

   - 失败必须回滚，禁止"线上挂着等会修"

   - 部署前必查：`git status --short` 干净 + `git log -1 --oneline` 记 commit hash

4. **改完代码必须先提交 git 再部署。** 没 commit = 没回滚锚点。

   ```bash
   git add -A && git commit -m "<改动说明>"
   ```

## Git 工作流规范

单人开发 + AI 协作，主分支 `main` 直接开发。以下纪律必须守：

### 1. 改代码前先更新

```bash
git pull --rebase    # 有远程时
git status           # 确认工作区干净
```

工作区有未提交改动时，先问用户：提交、stash、还是丢弃，**不要**自作主张覆盖。

### 2. 小步提交

一个 commit 只做一件事，禁止攒一大坨。

### 3. 提交信息规范

- 格式：`<类型>: <说明>`，类型用 `feat/fix/refactor/docs/chore/test`

- 示例：`feat: 客户列表加搜索` / `fix: 登录空指针`

- 禁止：`update` / `修改` / `改动` 这种看不出内容的信息

### 4. 禁止自动 push

AI **不得**自动 `git push`，必须用户明确说"推送/push/部署"才执行。

### 5. 冲突必须停下问

`pull --rebase` 遇冲突，AI **禁止**自行选边覆盖。必须告诉用户：哪几个文件冲突、冲突点是什么、请用户定夺。

### 6. 危险操作必须先问

以下操作 AI **不得**自作主张执行，必须先问用户：

- `git reset --hard` / `git checkout .` / `git restore .`

- `git clean -fd`

- `git push --force` / `--force-with-lease`

- `git branch -D`

- 任何 `git rebase` 已提交的 commit

### 7. 敏感文件绝不手动 add

`data.db` / `logs/` / `__pycache__/` / `tests/__snapshots__/*.tmp` 已在 `.gitignore`。AI 禁止用 `git add -f` 强加。统一用 `git add -A` 或 `git add <具体源码文件>`。

## 不可触碰

- `data.db` —— 运行时数据库，绝不入库、绝不覆盖

- `.env`（如有）—— 密钥文件，不入库

- `logs/` —— 运行时日志，不入库

- `tests/__snapshots__/` —— 快照测试资产，**入库**，但 AI 禁止自行删除（除非人工确认预期变更）

## 现状备忘

- 后端入口：`server.py`（端口 8090，`python server.py` 或 `.\start.ps1` 启动）

- 前端：Gitee Pages，push 到 main 后需在 Gitee 后台手动点「更新」触发部署

- 数据库：SQLite（`data.db`），`init_db()` 函数初始化

- 测试：`tests/frontend_smoke.js`（前端冒烟，Node 跑）；后端暂无 unittest，AI 改后端时建议补（见 `quality-gate`）

- 演示账号：`demo_operator` / `demo`

