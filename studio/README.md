# 多特倍斯中台话术中心

状态：本地真实模型已接通，正在使用匿名合成咨询验证；未通过小组业务验收，不能宣布正式可用。公开站尚未替换。

## 范围

- 话术中心嵌入原中台内容区，共用原左侧导航。`/script-studio` 直达同一个中台外壳，不跳转至另一套应用；`/?page=scripts` 也是入口。两类人群、八种场景、对话输入、资料选择、可编辑回复、下一步及后续接法。
- 内嵌工具使用独立同源文档 `/script-studio/index.html` 隔离样式、客户输入与原演示接口，只有内容工具栏，没有第二套品牌或主导航。原壳仍加载原演示资产，但不会传入生成器。话术接口始终访问真实后端，演示登录不能获得生成权限。团队资料、用量和试用账号在工具内切换；原工作台资料不自动迁移。
- 导航在原页面内切换，支持前进/后退并忽略已离开页面的迟到响应。离开话术中心会销毁本次客户内容；同源 Cookie 允许返回时恢复话术服务身份。退出整个中台也会吊销话术会话，单独退出话术服务不会跳转主页面。
- 只处理本次粘贴的咨询，不读取客户档案。旧会话工作台保留，旧模板位于 `/?page=script-templates`，不是 AI 生成兜底。
- 公共资料由管理员确认后添加，分为活动、搭配、知识；支持人群、产品、日期、停用与版本。无默认产品资料，不迁移浏览器旧资料。
- `needs_input` 不提供可复制的最终回复；资料版本变化、过期、无权访问、模型异常均失败关闭。
- 点击复制仅复制回复正文；只有“采用并继续接话”把编辑后的回复放入本次内存历史。新咨询、退出、刷新清空客户内容。

## 本地启动

需要 Node 24（本机 SQLite 适配器使用 `node:sqlite`）及 pnpm。仓库锁定依赖；仅批准 esbuild 的安装脚本。

```sh
pnpm install --frozen-lockfile
pnpm build:studio
pnpm dev:studio
```

控制台打印随机空闲端口，仅监听 `127.0.0.1`。首次打开页面创建自己的管理员，无默认口令。账户、公共资料和汇总存入被 Git 忽略的 `.studio-local/studio.db`，不读取旧 `data.db`。

只有本机回环地址启用首次创建接口；线上没有公开注册。修改源码后重新 build，服务端修改需重启本地服务。

仅静态托管的 GitHub Pages 不能承载真实 API：入口展示不可用提示和显式线上链接，不自动跳走，也不跨站嵌入登录 Cookie。同源服务部署并完成业务验收后，托管中台使用原导航内嵌工具。

## 线上配置

复用现有 Sites 项目及域名。`.openai/hosting.json` 声明 Worker、逻辑 D1 `DB`；平台创建实际资源。Vite `sites()` 复制迁移与元数据；客户端放在 `dist/client`，Worker 入口 `dist/server/index.js`。

在 Sites 的运行环境管理中配置，不写业务代码、Git 或浏览器：

| 环境变量 | 用途 |
| --- | --- |
| `STUDIO_LLM_API_KEY` | 百炼工作空间 API 密钥 |
| `STUDIO_LLM_BASE_URL` | 支持该固定模型的北京官方兼容 API 基址，含 `/compatible-mode/v1` |
| `STUDIO_BOOTSTRAP_USERNAME` | 首位管理员账号 |
| `STUDIO_BOOTSTRAP_PASSWORD_HASH` | `node studio/admin-hash.mjs` 交互生成的哈希，不是明文密码 |

首位管理员登录时执行一次条件插入；已有账号时不覆盖。成功创建后移除 bootstrap 环境变量。不要在线上设置 `STUDIO_LOCAL_SETUP`。本地允许通过进程环境或 Git 忽略的 `.env` 配置模型值；没有任何密钥时生成不可用，不显示假回复。

北京工作空间兼容基址形如 `https://ws-<工作空间标识>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，完整标识取自百炼工作空间，不使用账号数字 ID 代替。密钥与该工作空间匹配；本地私有配置文件应只允许本人读写。修改环境配置后重启服务。模型列表可访问不代表生成权限有效，须以实际生成请求验证。

当前固定模型 `qwen3.8-max-0902`，JSON Schema 输出、关闭思考和联网；请求最长25秒。固定北京文本输入/输出计费按每百万 token 12/36 元估算，缓存输入按原价保守计算。价格或模型版本变化须重新审核并调整预算单价。

官方参考：[模型及计费](https://help.aliyun.com/zh/model-studio/qwen3-8-max)、[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。模型支持并不等于本业务已经验收。

## 安全与隐私

- 独立服务端会话，随机256位令牌只存 SHA-256 摘要，Cookie 为 HttpOnly、SameSite=Strict、线上 Secure，12小时过期；POST/PUT 校验同源和 CSRF。
- 密码使用随机盐 PBKDF2-SHA256（100000轮，Workers WebCrypto 兼容）；至少12位且包含字母数字。登录按账号和IP限速；新建/重置强制改密；停用/改密吊销会话。无演示账号后门。
- 请求输入、临时资料、生成回复不写数据库、localStorage、sessionStorage、IndexedDB 或应用日志。异常只记录随机追踪ID。迁移仅结构，无客户/资料种子。
- 客户内容发送前及服务端再次脱敏；大陆手机号仅后四位，证件与常见令牌/密码字段隐藏。自由文本仍可能含未识别的姓名、病史等敏感信息，销售不得粘贴无关敏感资料。
- 模型服务会接收脱敏后的本次输入。应用端不留存不等于服务商不留存；上线前管理员必须确认百炼账户的数据处理、地域及留存设置与团队授权。
- 公共资料是会持久化的共享内容，不得写入客户咨询、凭据或个人健康档案。销售补充只在本次内存中使用，不覆盖管理员资料。
- 资料和客户消息放在数据消息内，不可覆盖系统规则。引用必须匹配资料原文及版本，数字/称呼/常见危险承诺另有校验。语义正确性和所有提示注入变体不能靠正则保证，必须完成真实样例和人工核对。

## 预算

金额用整数微元（1元=1000000微元），上海时区自然月，上限300元。D1 事务批量执行条件更新与调用账本插入，多人并发共享上限；每个账号最多一个未结算调用。

按输入 UTF-8 字节数、协议余量与最大输出1800 token 保守预占，实际 token 使用量结算。超时或用量不明确时按完整预占金额计入，不因重试释放未知费用；超过120秒未结算的请求也按该方式处理。可用预算不足停止新调用。用量页达到80%显示提醒；不发送群通知、不创建自动任务。

预算只包含本工具的模型调用，不包含其他百炼应用或托管费用。平台账单为准，保守计费可能提前停用；不能靠删除账本或释放未知费用继续调用。月末在途调用仍结算至开始时预占的月份。

## 接口

响应统一为 `{success,data}` 或 `{success:false,error:{code,message,trace_id}}`；错误不回传输入。全部 API 使用 `Cache-Control: no-store`。

| 路径（前缀 `/api/studio`） | 权限 |
| --- | --- |
| `GET /status`、`POST /login` | 公共服务状态/登录，无团队资料 |
| `GET /me`、`POST /logout`、`POST /password` | 登录账号 |
| `GET /materials` | 登录账号只读 |
| `POST /materials`、`PUT /materials/:id`、`GET /materials/:id/versions` | 管理员 |
| `POST /generations` | 已改密登录账号，预算/速率限制 |
| `POST /feedback` | 本人 ready 结果，direct/edited/unusable |
| `GET /usage` | 本人统计，管理员看团队汇总 |
| `GET/POST /users`、`PUT /users/:id` | 管理员；至少保留一位有效管理员 |

生成输入见 `normalizeInput`：人群、场景、user/assistant消息、称呼、需求、目标、资料ID/版本、补充、改写要求和冲突确认；不接客户档案ID。输出含 `ready/needs_input`、reply、next_step、followups、missing_fields、conflicts、inferred、used_sources、facts 及用量标识。`rewrite` 只表示未发送草稿，不进已采用历史。

## 验证与发布闸门

```sh
pnpm test:studio
pnpm test:frontend
python3 -B -m unittest discover -s tests -v
pnpm build:studio
pnpm test:browser
pnpm eval:studio
```

浏览器测试默认使用 Playwright Chromium；可设置 `STUDIO_BROWSER_CHANNEL=chrome` 使用本机 Chrome 的隔离测试进程。测试专用内存库和注入的合成模型不进入开发/生产服务。

32条匿名合成咨询覆盖两类人群和八类场景，自动测试另覆盖连续接话、恶意资料、过期活动、账号权限、并发预算、错误输出与不留存。`eval:studio` 默认只校验输入契约，明确输出真实模型未运行。

管理员已在本机创建后，可通过 `node --env-file=.studio-local/model.env studio/verify-live.mjs --confirm-cost --limit=32` 执行有费用的技术检查。仅使用合成咨询，走正式生成校验及本机预算账本，不打印或保存消息、临时资料或回复；输出状态、响应时长、格式诊断和计费汇总。此脚本不是登录接口，也不创建登录凭据。状态符合用例不等于回复可采用，更不代表人工核实了零事实编造。

2026-09-09 本机真实模型技术检查（不含人工业务验收）：32次均收到上游 HTTP 200；27次完成且状态符合样例预期，5次被应用校验拦截（3次 `UNSAFE_REPLY`、2次 `UNSUPPORTED_NUMBER`）。19条返回 `ready` 的结果均在10秒内完成；其余完成项为需要补充商家事实。该轮账本计费0.682356元，不含此前探测调用，实际费用以百炼账单为准。不能把被拦截结果算作可用回复，也不能据此认定剩余回复无事实错误。尚需排查用药否定表述与危险承诺校验的边界、后续接法中的数字依据，并重新做真实模型和人工评测。同期26项新服务单元/接口测试、20项 Python 测试、旧前端烟雾及隔离浏览器操作测试通过；浏览器测试使用合成模型。

真实验收：服务先配置凭据和管理员资料，设置试用账号环境 `STUDIO_EVAL_ORIGIN`、`STUDIO_EVAL_USERNAME`、`STUDIO_EVAL_PASSWORD`（不进Git/命令参数），运行 `pnpm eval:studio --live --confirm-cost`。由业务人员逐条核对和评价，记录聚合统计，不持久化回复正文。需至少80%可用/小改可用、至少80%完整回复十秒内完成、至少30例完成且关键事实编造为零。合成样例通过后仍须小组使用已确认的真实产品资料验收。

尚未完成：管理员确认的产品资料、小组质量及延迟验收、线上凭据配置与 D1/Worker 实际部署验证。在这些条件通过前，不同步发布 GitHub/Gitee，不替换现有公开站。

上线时同步已验证源码至两个主仓库及 Sites 源码副本，排除所有本机数据库、环境文件、截图测试产物与凭据。以同一源码构建/打包，保留 Worker 与 Drizzle 迁移。正式发布需确认维持公开站访问级别，团队 API 仍受账号保护。迁移一经部署不可改写；之后追加迁移。不得恢复已取消的自动任务。
