***

name: "deploy-gate"
description: "Deployment gate for pure-Python http.server project: pre-deploy checks (git clean, quality gate passed), GitHub Pages frontend deploy, python server.py backend deploy, rollback on failure. Invoke when deploying code, pushing to production, or recovering from failed deploy. Trigger words: 部署/发布/上线/回滚/deploy/rollback/推送到生产/GitHub Pages. Failure must rollback, never leave production broken."
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# 发布闸门（AI 部署前必跑）

本项目无 CI/CD，由 AI 协作部署。核心目标：**每次部署可追溯、可回滚、失败不污染线上**。

部署方式分两部分：

- **前端**：GitHub Pages（`index.html` 静态托管）

- **后端**：`python server.py`（端口 8090）

***

## 前置：基础设施

部署依赖：

- GitHub 仓库（前端通过 GitHub Pages 自动部署）

- 后端运行机（`python server.py` 启动）

- `tests/` 测试（部署前必跑）

若缺测试或 ruff，AI 必须提示用户先配置（见 `quality-gate` skill）。

***

## 部署前检查（必跑）

### 1. 确认工作区干净

```bash
git status --short    # 必须空输出
```

- 有未提交改动 → 先 commit 或问用户

- 改后端代码的 commit 必须先过 `quality-gate` 四道闸门

### 2. 记下当前 commit

```bash
git log -1 --oneline
```

- 没 commit = 没回滚锚点，禁止部署

### 3. 跑质量闸门

```bash
ruff check .
python -m unittest discover -s tests -v
```

- 不通过禁止部署

### 4. 确认是最新代码

```bash
git pull --rebase    # 有远程时
```

***

## 前端部署（GitHub Pages）

### 机制

GitHub Pages 通过 GitHub 仓库的 `main` 分支自动部署，**push 到 main 即触发部署**。

### 步骤

```bash
# 1. 确认改动已 commit
git status --short

# 2. push 到 main
git push origin main

# 3. 等待 GitHub Actions 部署（约 1-2 分钟）
# 4. 访问 https://regard-1.github.io/- 验证
```

### 验证

- 访问 <https://regard-1.github.io/->

- 检查页面加载正常

- 检查演示账号 `demo_operator` / `demo` 能登录

### 失败处理

- GitHub Actions 构建失败 → 检查 Actions 日志

- 页面 404 → 确认 GitHub Pages 设置指向 main 分支

- 回滚 → `git revert <commit>` + push，GitHub Pages 自动重新部署

***

## 后端部署（python server.py）

### 本机部署（开发/演示）

```powershell
# 1. 停止旧服务（如运行中）
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. 拉取最新代码
git pull --rebase

# 3. 启动服务
.\start.ps1
# 或
python server.py
```

### 远程部署（如需）

```bash
# 1. 同步代码到远程
scp -r ./* user@host:~/pdp-server/

# 2. SSH 重启服务
ssh user@host "cd ~/pdp-server && pkill -f 'python server.py' && nohup python server.py > logs/server.log 2>&1 &"

# 3. 健康检查
curl http://host:8090/api/health
```

### 部署后验证

```bash
# 健康检查
curl http://localhost:8090/api/health
# 期望返回 {"code":200,"msg":"操作成功","data":{"status":"ok"},...}

# 检查端口监听
netstat -an | findstr 8090

# 查日志（如配置了文件日志）
tail -20 logs/server.log
```

***

## 失败回滚（必跑）

### 前端回滚

```bash
# 方式1：revert 问题 commit（推荐，保留历史）
git revert <问题commit>
git push origin main

# 方式2：reset 回退（破坏性，先问用户）
git reset --hard <上一个commit>
git push --force origin main  # 危险！必须用户明确同意
```

### 后端回滚

```bash
# 1. 停止当前服务
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. 回退代码
git reset --hard <上一个commit>

# 3. 重启服务
.\start.ps1

# 4. 健康检查
curl http://localhost:8090/api/health
```

### 铁律

- 部署失败**必须回滚**，禁止"线上挂着我等会再修"

- 回滚后报告用户：失败原因、回滚到哪个 commit、当前线上状态

- 回滚操作涉及 `git reset --hard` / `git push --force` 必须先问用户

***

## 部署纪律

| 禁止                   | 应该                         |
| -------------------- | -------------------------- |
| 带未提交改动部署             | 先 commit 或问用户              |
| 跳过质量闸门直接部署           | commit 必须先过 `quality-gate` |
| 部署失败不回滚              | 失败立刻回滚                     |
| 自动 `git push` 部署     | 用户明确说"部署/push"才执行          |
| force push 到 main 不问 | 永远先问用户                     |
| 部署后不验证               | 必须健康检查 + 页面访问              |

***

## AI 自检清单（部署前逐项核对）

- [ ] `git status --short` 空输出（工作区干净）

- [ ] `git log -1 --oneline` 已记下 commit hash

- [ ] `ruff check .` 0 error

- [ ] `python -m unittest discover -s tests -v` 全绿

- [ ] 前端：push 到 main 后等 GitHub Pages 部署，访问验证

- [ ] 后端：启动 `python server.py`，健康检查通过

- [ ] 失败时已回滚并报告用户

- [ ] 回滚涉及 `reset --hard` / `push --force` 已先问用户

