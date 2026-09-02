# 新电脑 Codex 接力说明

## 项目身份

- 项目：多特倍斯私域运营中台 MVP
- 脱敏公开仓库：<https://gitee.com/danchengWeisong/Dotbest.git>
- 本接力包基线提交：`cfe581cb29399bf5df0ec4146499959d026d1f32`
- 基线提交说明：`feat: publish sanitized operations center demo`
- 打包日期：2026-09-02

本压缩包是从上述提交的已跟踪文件生成的便携副本，不包含 `.git` 目录。它适合直接上传到新电脑上的 Codex 任务，并在任务工作区中继续开发。

## 当前状态

这是一个可本地运行的运营中台 MVP。当前主要前端入口为 `index.html`，交互代码在 `assets/app.js`，演示数据和静态接口适配在 `assets/demo-api.js`。`server.py` 提供 Python/SQLite 服务骨架，但它与较新的演示前端接口并非全部一一对应；继续开发前，应先明确是维持纯静态演示，还是让后端接口与前端完整对齐。

现有能力包括今日工作台、用户资产、会话与回复生成、触达任务、每日优化、用户判断、历史话术学习、新客与老客话术链路、活人感 Agent 演示，以及合规和权限说明。详细范围见 `README.md`。

## 数据安全边界

本项目已经脱敏，只包含合成演示数据。不得恢复或提交真实客户姓名、手机号、健康信息、订单、员工资料、经营统计、密码、访问令牌、数据库或日志。继续开发前请完整阅读 `DATA_PRIVACY.md`。

公开演示凭据为：

- 用户名：`demo_operator`
- 密码：`demo`

它们只能用于演示。生产运行时必须通过环境变量设置独立密码。

## 恢复检查

新任务收到本压缩包后，先执行以下步骤，不要立即修改代码：

1. 将压缩包解压到当前工作区，并以其中的 `Dotbest` 文件夹作为项目根目录。
2. 阅读 `START_HERE.md`、`README.md`、`DATA_PRIVACY.md`。
3. 检查 `index.html`、`assets/app.js`、`assets/demo-api.js`、`server.py` 和 `tests`。
4. 运行下面的验证命令并报告结果。
5. 总结当前功能、架构差异、风险和建议下一步，等待用户确认后再修改文件。

```powershell
node tests/frontend_smoke.js
py -B -m unittest discover -s tests -v
```

如果新电脑没有 `py` 命令，可以改用：

```powershell
python -B -m unittest discover -s tests -v
```

本地预览可运行：

```powershell
py -m http.server 8091
```

然后访问 <http://localhost:8091/>。

## Git 继续方式

由于本包不含 `.git` 历史，如需继续提交到 Gitee，推荐在新电脑先克隆仓库，再把本包作为上下文资料：

```powershell
git clone https://gitee.com/danchengWeisong/Dotbest.git
cd Dotbest
git rev-parse HEAD
```

正常情况下 HEAD 应为本页记录的基线提交或其后续提交。认证时使用 Gitee 用户名和个人访问令牌，不要把令牌发到聊天、写进源码或提交到 Git。
