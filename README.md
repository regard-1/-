# 多特倍斯运营中台 MVP

> 在线演示版通过 GitHub Pages 发布，使用浏览器内置演示数据；Python + SQLite 后端源码仍完整保留，供本地运行和后续生产集成。

这是依据《多特倍斯大健康平台私域运营中台系统设计方案 V1.1》实现的可运行版本，保持 SecondBrain 技术栈一致：

- Python 3 标准库；
- `ThreadingHTTPServer`；
- SQLite / WAL；
- 原生 HTML、CSS、JavaScript；
- 无前端框架、无 CDN、无 Python 第三方依赖；
- 可选接入 Ollama 或 OpenAI 兼容模型接口。

## 已实现功能

- Cookie 登录、PBKDF2 密码、会话持久化；
- 运营首页和核心经营指标；
- 用户资产总入口；
- NMN、麦角硫因、辅酶Q10、常规品四类独立用户列表；
- 客户基本信息、资产归属、购买、互动、会员和历史对话详情；
- 基于事实特征、规则标签和证据的 AI 历史画像；
- 手工画像刷新和画像版本留存；
- 从用户列表直接发起多轮 Agent 对话；
- 个性化主话术、备选话术、推荐理由、下一步和合规标记；
- 会员、营销活动、社群和用户资产分析页面；
- `/api/search`、`/api/chat` 兼容接口；
- LLM 不可用时确定性降级，不影响基本运营。

## 启动

需要 Python 3.10 或以上版本。

在本目录运行：

```powershell
python server.py
```

也可以右键使用 PowerShell 运行：

```powershell
.\start.ps1
```

浏览器打开：<http://localhost:8090>

演示账号：

```text
用户名：admin
密码：Dotbest@2026
```

默认账号仅用于本地演示。部署前必须通过环境变量 `ADMIN_PASSWORD` 修改初始密码，并删除已有的演示 `data.db` 后重新初始化。

## 模型配置（可选）

不配置模型时，画像和话术使用内置的可解释规则降级生成。配置 OpenAI 兼容接口后，Agent 会优先使用模型生成话术：

```powershell
$env:LLM_BASE_URL="http://localhost:11434/v1"
$env:LLM_MODEL="qwen2.5:7b"
$env:LLM_API_KEY=""
python server.py
```

远程兼容 API 示例：

```powershell
$env:LLM_BASE_URL="https://api.example.com/v1"
$env:LLM_MODEL="your-model"
$env:LLM_API_KEY="your-key"
python server.py
```

## 运行测试

```powershell
python -m unittest -v tests.test_core
```

本次交付验证结果：

- Python 编译与静态类型检查：通过，0 个错误；
- JavaScript 语法检查：通过；
- 核心单元测试：5/5 通过；
- 本地 HTTP 冒烟测试：首页、前端资源、总览、四类资产、NMN列表、客户画像、多轮Agent话术全部通过；
- 当前 Codex 桌面的浏览器控制运行资产缺失，因此未执行自动化可视截图验收。

## 数据与接口

- 数据库首次运行自动创建为 `data.db`，并写入 12 位演示用户；
- 设置 `DB_PATH` 可以指定其他数据库文件；
- 设置 `PORT` 可以修改端口；
- 所有新增 API 使用 `/api/v1/private/*`；
- 原兼容接口保留 `/api/search` 与 `/api/chat`。

核心接口：

```text
GET  /api/v1/private/dashboard
GET  /api/v1/private/user-assets/categories
GET  /api/v1/private/user-assets/:code/customers
GET  /api/v1/private/customers/:id
GET  /api/v1/private/customers/:id/ai-profile
POST /api/v1/private/customers/:id/ai-profile/refresh
POST /api/v1/private/customers/:id/agent-conversations
POST /api/v1/private/agent-conversations/:id/messages
GET  /api/v1/private/members
GET  /api/v1/private/campaigns
GET  /api/v1/private/communities
GET  /api/v1/private/analytics/overview
```

## 并入现有 SecondBrain

当前工作区未提供原 `server.py` 和 `templates/` 源码，因此本交付为可独立运行的兼容 MVP。正式合并时建议：

1. 保留现有 `server.py` 为入口；
2. 将本项目的表结构以迁移脚本并入现有 `init_db()`；
3. 将 `/api/v1/private/*` 路由并入现有 `Handler`；
4. 将 `build_agent_suggestion()` 调用改为复用原 `hybrid_search()`、`call_llm()` 和违禁词检查；
5. 将本项目页面作为 `private_admin.html`，继续共用原 Cookie 会话与 RBAC；
6. 用真实商品、订单、企微、会员和社群数据替换演示种子数据。

## 生产化提醒

该版本适合产品验收、内部试点和后续集成开发。生产上线前仍需接入真实数据源、HTTPS、CSRF、渠道签名回调、细粒度数据权限、任务 Worker、备份恢复和正式压测。
