---
name: "python-logging-standards"
description: "Logging conventions for pure-Python http.server projects (no FastAPI). Standard logging module, structured logs, request tracing, log levels, sensitive field masking, rotating file handler. Invoke when setting up logging, adding log calls to server.py, or modifying code that logs. Trigger words: 配日志/log/trace_id/脱敏/日志/Logger/logging. Do not invoke for non-logging code changes."
---

# 纯 Python http.server 日志规范

本项目使用 Python 标准库 `logging`，**不使用 FastAPI 中间件**。日志配置在 `server.py` 启动时初始化，业务代码通过模块 logger 输出。

---

## 一、日志配置（单点初始化）

### 1. 配置函数（启动时调用一次）

```python
import logging
import logging.handlers
from pathlib import Path

def setup_logging(log_file: str | None = None, level: str = "INFO"):
    """日志配置，启动时调用一次"""
    root = logging.getLogger()
    root.setLevel(level)
    
    formatter = logging.Formatter(
        '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s",'
        '"msg":"%(message)s","trace_id":"%(trace_id)s"}',
        datefmt="%Y-%m-%dT%H:%M:%S%z"
    )
    
    # 控制台输出（始终保留）
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)
    
    # 文件输出 + 滚动删除（可选）
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        # 按大小滚动：单文件 10MB，保留 10 份
        file_handler = logging.handlers.RotatingFileHandler(
            log_path, maxBytes=10*1024*1024, backupCount=10, encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
```

### 2. 启动时调用

```python
if __name__ == "__main__":
    setup_logging(log_file=os.environ.get("LOG_FILE"), level=os.environ.get("LOG_LEVEL", "INFO"))
    logger = logging.getLogger(__name__)
    logger.info("服务器启动", extra={"trace_id": "startup"})
    ...
```

### 3. 禁止行为
- 禁止业务代码用 `logging.basicConfig()`（会覆盖全局配置）
- 禁止用 `print()` 替代日志
- 禁止每个模块自己配置 handler（统一在 `setup_logging` 配）
- 禁止用 root logger 直接输出（用 `logging.getLogger(__name__)`）

---

## 二、trace_id 请求追踪

### 1. 生成与传播

纯 http.server 没有中间件，trace_id 在 handler 入口生成，用 `contextvars` 传播：

```python
import contextvars
import secrets

# 全局 trace_id 上下文
trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="")

class Handler(BaseHTTPRequestHandler):
    def _setup_trace(self):
        """请求入口生成 trace_id"""
        tid = self.headers.get("X-Trace-Id") or secrets.token_hex(8)
        trace_id_var.set(tid)
        # 响应头回写，便于前端/调用方关联
        self.send_header("X-Trace-Id", tid)
        return tid
```

### 2. 日志带上 trace_id

用 `extra={"trace_id": trace_id_var.get()}` 让 formatter 自动带入：

```python
logger.info("查询客户列表", extra={"trace_id": trace_id_var.get()})
```

### 3. 跨函数传播
- `contextvars` 自动在同线程内传播，不用手动传参
- 后台线程（如定时任务）入口需显式 `trace_id_var.set("background")`

### 4. 禁止行为
- 禁止用全局变量存 trace_id（多线程会串）
- 禁止 trace_id 用自增整数（用 `secrets.token_hex(8)`，防猜）
- 禁止不回写 `X-Trace-Id` 响应头（前端无法关联）

---

## 三、请求日志（入参出参）

### 1. 统一记录

每个 `_handle_xxx` 开头记录入参，结束记录出参：

```python
def _handle_list_customers(self):
    trace_id = trace_id_var.get()
    query = urlparse(self.path).query
    params = parse_qs(query)
    logger.info("入参 查询客户列表", extra={
        "trace_id": trace_id,
        "path": self.path,
        "params": _mask_sensitive(dict(params)),
    })
    
    # 业务逻辑
    ...
    
    logger.info("出参 查询客户列表", extra={
        "trace_id": trace_id,
        "total": total,
        "count": len(customers),
    })
    self._ok({"items": customers, "total": total})
```

### 2. 慢请求与异常
- 慢请求（>1s）：升级到 WARN
- 异常：ERROR + 完整堆栈（`logger.exception()` 自动带堆栈）
- 5xx：ERROR
- 4xx：INFO（业务异常，不是错误）

### 3. 禁止行为
- 禁止记录完整请求体（可能含密码、身份证）
- 禁止记录完整响应体（数据量大、可能含敏感）
- 禁止用 `print` 打印请求（不走日志系统）
- 禁止在循环内打 INFO 日志（量大刷屏）

---

## 四、日志级别

| 级别 | 场景 | 示例 |
|------|------|------|
| DEBUG | 详细诊断，生产关闭 | SQL 语句、入参出参详情 |
| INFO | 关键业务节点、正常请求 | 客户查询、消息发送、任务创建 |
| WARNING | 异常但可恢复、慢请求 | 慢查询>1s、重试成功、降级 |
| ERROR | 业务异常、第三方调用失败 | 飞书下发失败、AI 接口超时 |
| CRITICAL | 系统不可用 | 数据库连不上、启动失败 |

### 规则
- `logger.exception()` 用于 except 块，自动带堆栈
- `logger.error()` 不带堆栈，如需堆栈用 `exc_info=True`
- 第三方调用前后成对日志（调用前 INFO，成功 INFO，失败 ERROR）
- 禁止用 ERROR 记录业务异常（业务异常是 WARN 或 INFO）

---

## 五、敏感字段脱敏

### 1. 脱敏函数

```python
SENSITIVE_FIELDS = {"password", "token", "secret", "id_card", "phone", "bank_card"}

def _mask_sensitive(data: dict) -> dict:
    """脱敏敏感字段"""
    masked = {}
    for k, v in data.items():
        if k.lower() in SENSITIVE_FIELDS:
            masked[k] = _mask_value(v)
        elif isinstance(v, dict):
            masked[k] = _mask_sensitive(v)
        else:
            masked[k] = v
    return masked

def _mask_value(v: str) -> str:
    """值脱敏：保留首尾，中间用*"""
    if not v or len(v) <= 2:
        return "***"
    if len(v) <= 6:
        return v[0] + "***" + v[-1]
    return v[:3] + "***" + v[-4:]

def mask_phone(phone: str) -> str:
    """手机号脱敏：138****1234"""
    if len(phone) == 11:
        return phone[:3] + "****" + phone[-4:]
    return _mask_value(phone)

def mask_idcard(idcard: str) -> str:
    """身份证脱敏：310***********1234"""
    if len(idcard) >= 15:
        return idcard[:3] + "*" * (len(idcard) - 7) + idcard[-4:]
    return _mask_value(idcard)
```

### 2. 禁止记录的字段
- 密码、加密盐值
- 完整 token、session_id
- 完整身份证、银行卡号
- 完整手机号（用 mask_phone）
- Cookie 头、Authorization 头

### 3. 禁止行为
- 禁止 `logger.info(f"用户登录: {password}")`（密码明文）
- 禁止记录完整 ORM 实体（含敏感字段）
- 禁止把脱敏前的数据序列化进日志

---

## 六、业务埋点

### 1. 关键节点必记

| 场景 | 级别 | 必记字段 |
|------|------|---------|
| 用户登录 | INFO | user_id, 登录方式, trace_id |
| 消息发送 | INFO | customer_id, 渠道, 模板, trace_id |
| AI 调用 | INFO | 模型, 耗时, token 数, trace_id |
| 触达任务执行 | INFO | task_id, customer_id, 结果, trace_id |
| 异常 | ERROR | 异常类型, 消息, 堆栈, trace_id |

### 2. 结构化字段

用 `extra` 传结构化字段，formatter 自动序列化：

```python
logger.info("AI 话术生成", extra={
    "trace_id": trace_id_var.get(),
    "customer_id": customer_id,
    "scene": "objection",
    "model": "deepseek-chat",
    "duration_ms": 1230,
    "tokens": 256,
})
```

### 3. 禁止行为
- 禁止用 f-string 拼长日志（`f"用户{user}下单{order}..."`），用 `extra`
- 禁止埋点遗漏 trace_id（无法关联请求）
- 禁止关键节点不打日志（出问题无法排查）

---

## 七、文件日志与滚动删除

### 1. 配置（已在 setup_logging）

```python
# 按大小滚动：单文件 10MB，保留 10 份，总上限约 110MB
logging.handlers.RotatingFileHandler(
    log_file, maxBytes=10*1024*1024, backupCount=10, encoding="utf-8"
)
```

### 2. 部署模式选择
- **GitHub Pages 演示**：不落盘，只 stdout（`LOG_FILE` 不设）
- **本机开发**：`LOG_FILE=logs/server.log`，按大小滚动
- **生产部署**：`LOG_FILE=logs/server.log` + 外部日志收集（如 Docker logging driver）

### 3. 禁止行为
- 禁止业务代码直接 `open("xxx.log", "a")`（绕过滚动机制）
- 禁止日志文件放源码目录（放 `logs/`，已在 .gitignore）
- 禁止只落盘不滚动（磁盘塞满）

---

## 八、AI 自检清单

- [ ] 日志配置走 `setup_logging`，不在业务代码 `basicConfig`
- [ ] 业务代码用 `logging.getLogger(__name__)`，不用 root logger
- [ ] trace_id 在 handler 入口生成，用 `contextvars` 传播
- [ ] 响应头回写 `X-Trace-Id`
- [ ] 请求日志记录入参出参（脱敏后）
- [ ] 慢请求（>1s）升级 WARN，异常 ERROR
- [ ] 敏感字段脱敏（密码/token/身份证/手机号）
- [ ] 关键业务节点有埋点（登录/消息发送/AI 调用）
- [ ] 文件日志用 RotatingFileHandler，不直接 open
- [ ] 日志文件放 `logs/`，不放入库目录

---

## 九、5xx 系统异常飞书告警

### 1. 适用边界

飞书告警只用于**5xx 系统异常**，让值班人员及时介入；它不是业务失败通知群。

应推送：

- `do_GET` / `do_POST` 兜底分支 `except Exception`
- `sqlite3.Error`、数据库连接、迁移或事务异常
- 第三方接口失败，如 AI 服务、飞书下发服务不可用
- 其他导致 handler 返回 500 的系统异常

不推送：

- 400 参数校验失败
- 401 未登录或授权失败
- 403 权限不足
- 404 数据不存在或资源不存在
- `KeyError` 归类为业务缺失时的正常分支

原则：4xx 属于正常业务流，只按日志规范记录；不要打扰群成员，也不要把告警群变成排障噪音源。

### 2. 推送函数与防刷屏

`webhook` 必须从环境变量读取，禁止写入代码、数据库或仓库内 `.env`。演示环境未配置 `FEISHU_BOT_WEBHOOK` 时直接跳过。

```python
import json
import os
import re
import time
import threading
import traceback
import urllib.request

_feishu_alert_cache: dict[tuple[str, str], float] = {}
_feishu_alert_lock = threading.Lock()
_FEISHU_ALERT_COOLDOWN_SECONDS = 60


def _mask_alert_text(text: str) -> str:
    """对自由文本中的敏感值做兜底脱敏。"""
    masked = text
    masked = re.sub(
        r"(?i)(password|passwd|token|secret|access_token)\s*[:=]\s*([^\s&,'\"]+)",
        r"\1=***",
        masked,
    )
    masked = re.sub(
        r"(?<!\d)(1[3-9]\d{9})(?!\d)",
        lambda match: mask_phone(match.group(1)),
        masked,
    )
    masked = re.sub(
        r"(?<!\d)(\d{15}|\d{17}[0-9Xx])(?!\d)",
        lambda match: mask_idcard(match.group(1)),
        masked,
    )
    return masked


def _notify_feishu(exc: BaseException, trace_id: str, path: str) -> None:
    """推送 5xx 系统异常摘要；告警失败不能影响主请求。"""
    try:
        webhook = os.environ.get("FEISHU_BOT_WEBHOOK", "").strip()
        if not webhook:
            return

        alert_key = (type(exc).__name__, path)
        now = time.time()
        with _feishu_alert_lock:
            last_sent_at = _feishu_alert_cache.get(alert_key, 0)
            if now - last_sent_at < _FEISHU_ALERT_COOLDOWN_SECONDS:
                return
            # 先占位再发起网络请求，避免并发异常同时进入并触发雪崩。
            _feishu_alert_cache[alert_key] = now

        stack_summary = "\n".join(traceback.format_exc().splitlines()[-5:])
        detail = _mask_sensitive({
            "message": _mask_alert_text(str(exc)),
            "stack": _mask_alert_text(stack_summary),
        })
        occurred_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")

        payload = {
            "msg_type": "text",
            "content": {
                "text": "\n".join([
                    "[5xx 系统异常]",
                    f"类型：{type(exc).__name__}",
                    f"消息：{detail['message']}",
                    f"trace_id：{trace_id}",
                    f"路径：{path}",
                    f"时间：{occurred_at}",
                    "堆栈摘要：",
                    detail["stack"],
                ])
            },
        }
        request = urllib.request.Request(
            webhook,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=3):
            return
    except Exception as alert_exc:  # noqa: BLE001 - 告警边界自身不能造成 500
        print(f"飞书异常告警失败：{type(alert_exc).__name__}: {alert_exc}")
```

注意：`_mask_sensitive` 已对结构化字段做键级脱敏；因为异常消息和堆栈是自由文本，所以先经过 `_mask_alert_text`，再交给 `_mask_sensitive` 兜底。不要把完整请求体塞进告警 payload。

### 3. 调用位置

只在 `do_GET` / `do_POST` 的 500 兜底分支调用；调用顺序固定为“先落日志和堆栈，再触发告警，最后返回 500”。

```python
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        ...
        except Exception as exc:  # noqa: BLE001 - handler boundary returns a JSON 500
            traceback.print_exc()
            _notify_feishu(exc, trace_id_var.get(), urlparse(self.path).path)
            return self.json_response(500, error={"code": "INTERNAL_ERROR", "message": str(exc)})
        finally:
            conn.close()

    def do_POST(self):
        ...
        except (ValueError, json.JSONDecodeError) as exc:
            # 4xx：业务异常，只记录日志，不调用 _notify_feishu。
            return self.json_response(400, error={"code": "VALIDATION_ERROR", "message": str(exc)})
        except KeyError:
            # 4xx：数据不存在，不调用 _notify_feishu。
            return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户不存在"})
        except Exception as exc:  # noqa: BLE001 - handler boundary returns a JSON 500
            traceback.print_exc()
            _notify_feishu(exc, trace_id_var.get(), urlparse(self.path).path)
            return self.json_response(500, error={"code": "INTERNAL_ERROR", "message": str(exc)})
        finally:
            conn.close()
```

`sqlite3.Error`、第三方接口失败等如果已被内层 `except` 捕获并转换成 500，也应在外层 500 分支统一告警；不要在内层重复推送。

### 4. 防刷屏规则

- 告警键固定为 `(异常类型, 请求路径)`，不要包含每次都不同的错误消息、trace_id 或堆栈内容
- 同一告警键 60 秒内最多推送一次
- 模块级 `_feishu_alert_cache` 只保存时间戳，不保存异常详情、请求体、数据库内容或 webhook
- 并发线程先检查并写入缓存，再发起网络请求，避免多个线程同时推送
- 告警失败只 `print` 警告，不重试、不抛出、不阻塞主流程

### 5. 禁止行为

- 禁止推送 4xx 业务异常，包括参数校验、登录失败、权限不足、数据不存在和业务 `KeyError`
- 禁止推送完整堆栈；只保留最后 5 行摘要
- 禁止推送密码、token、身份证、手机号等敏感字段明文
- 禁止推送完整请求体、响应体、数据库行、客户名单或经营统计数据
- 禁止把 webhook URL 硬编码到代码、测试、配置文件或数据库中
- 禁止把 webhook URL 写入日志或告警失败警告中
- 禁止引入 `requests`；只使用已导入的标准库 `urllib.request`
- 禁止同步等待超过 3 秒；必须设置 `timeout=3`
- 禁止让告警失败影响原请求响应状态或抛出新异常
- 禁止绕过防刷屏缓存直接推送

### 6. 自检项

- [ ] `FEISHU_BOT_WEBHOOK` 未配置时函数直接跳过，不报错
- [ ] 只有 5xx 系统异常调用 `_notify_feishu`
- [ ] `do_GET` 和 `do_POST` 的 4xx 分支不触发飞书推送
- [ ] 推送内容包含异常类型、消息、`trace_id`、请求路径、时间和最后 5 行堆栈摘要
- [ ] 异常消息和堆栈已脱敏；不包含密码、token、身份证、手机号明文
- [ ] 相同 `(异常类型, 请求路径)` 60 秒内只推送一次
- [ ] `_feishu_alert_cache` 是模块级字典，且不保存敏感内容
- [ ] 使用 `urllib.request`、`timeout=3`，未引入 `requests`
- [ ] 推送函数整体被 `try/except` 包裹，失败只打印警告
- [ ] webhook URL 不存在于源码、日志、数据库或仓库内 `.env`
