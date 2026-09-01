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
