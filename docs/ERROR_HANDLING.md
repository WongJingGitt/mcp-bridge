# 错误处理机制

MCP Bridge 提供了完善的错误处理机制,确保工具执行失败时能够向 AI 模型提供足够的信息来分析和解决问题。

## 错误处理流程

```
工具执行失败
    ↓
桥接服务捕获异常
    ↓
返回详细错误信息 (错误类型 + 消息 + 堆栈)
    ↓
浏览器扩展解析错误
    ↓
格式化错误信息
    ↓
注入到 AI 输入框 + 浮窗显示
    ↓
AI 模型分析错误并尝试修正
```

## 错误信息结构

### 桥接服务端返回

当工具执行失败时,桥接服务 (mcp_bridge.py) 会返回详细的错误对象:

```json
{
  "detail": {
    "error": "Invalid date format: 2025-13-45",
    "type": "ValueError",
    "traceback": "Traceback (most recent call last):\n  File \"/path/to/mcp_server.py\", line 123, in get_tickets\n    date = parse_date(params['date'])\n  File \"/path/to/utils.py\", line 45, in parse_date\n    raise ValueError(f\"Invalid date format: {date_str}\")\nValueError: Invalid date format: 2025-13-45"
  }
}
```

**字段说明:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `error` | string | 错误消息,`str(e)` 的结果 |
| `type` | string | 错误类型名称,如 `ValueError`, `TypeError`, `RuntimeError` |
| `traceback` | string | 完整的 Python 调用堆栈,使用 `traceback.format_exc()` 生成 |

### 浏览器扩展处理

浏览器扩展 (api_client.js) 会解析 FastAPI 的错误响应:

```javascript
// 解析 detail 字段
if (typeof errorData.detail === 'object') {
    // 详细错误对象
    errorMessage = errorData.detail.error;
    error.details = errorData.detail;  // 保存完整对象
} else {
    // 字符串错误
    errorMessage = errorData.detail;
}
```

## 错误展示

### 1. 浮窗显示

在右下角的状态浮窗中显示详细的错误信息:

```
状态: ❌ 工具 get-interline-tickets 执行失败

错误详情:
错误类型: ValueError
错误信息: Invalid date format: 2025-13-45

调用堆栈:
  File "/path/to/mcp_server.py", line 123, in get_tickets
    date = parse_date(params['date'])
  File "/path/to/utils.py", line 45, in parse_date
    raise ValueError(f"Invalid date format: {date_str}")
ValueError: Invalid date format: 2025-13-45
```

### 2. 注入到 AI 输入框

格式化后的错误信息会自动注入到 AI 的输入框并发送:

```markdown
# 工具执行失败

**工具名称**: `get-interline-tickets`
**错误信息**: [ValueError] Invalid date format: 2025-13-45

调用堆栈:
  File "/path/to/mcp_server.py", line 123, in get_tickets
    date = parse_date(params['date'])
  File "/path/to/utils.py", line 45, in parse_date
    raise ValueError(f"Invalid date format: {date_str}")
ValueError: Invalid date format: 2025-13-45

请分析错误原因。你可以尝试修正参数后重新调用该工具，或者选择其他工具，或者直接告诉用户无法完成任务。
```

**调用堆栈优化:**
- 为避免输入框内容过长,只保留最后 10 行堆栈信息
- 通常最后几行包含了最关键的错误来源

## 常见错误类型

### 1. 参数错误 (ValueError/TypeError)

**原因:** 传递的参数格式不正确或类型不匹配

**示例:**
```
ValueError: Invalid date format: 2025-13-45
```

**AI 可以做什么:**
- 修正参数格式后重新调用
- 向用户询问正确的参数值

### 2. 权限错误 (PermissionError)

**原因:** 工具尝试访问受限资源

**示例:**
```
PermissionError: [Errno 13] Permission denied: '/etc/passwd'
```

**AI 可以做什么:**
- 使用其他方式获取信息
- 告知用户需要特定权限

### 3. 网络错误 (ConnectionError/TimeoutError)

**原因:** 工具尝试访问外部服务失败

**示例:**
```
ConnectionError: Failed to connect to api.example.com:443
```

**AI 可以做什么:**
- 稍后重试
- 使用备用数据源
- 告知用户网络问题

### 4. 工具未找到 (ValueError)

**原因:** 请求的工具不存在

**示例:**
```
ValueError: 工具 unknown_tool 不存在于任何服务中
```

**AI 可以做什么:**
- 先调用 `list_tools_in_service` 查看可用工具
- 使用正确的工具名称

### 5. 达到调用上限 (ValueError)

**原因:** 同一工具连续失败 3 次

**示例:**
```
ValueError: 工具 get_tickets 已达到最大调用次数 (3次)
```

**AI 可以做什么:**
- 分析为什么连续失败
- 尝试其他工具
- 告知用户无法完成任务

## 错误恢复策略

### 自动恢复

MCP Bridge 实现了简单的熔断机制:

```python
# 桥接服务中的逻辑
call_key = f"{target_server}:{tool_name}"
call_count = self.tool_call_history.get(call_key, 0)

if call_count >= 3:
    raise ValueError(f"工具 {tool_name} 已达到最大调用次数 (3次)")

try:
    result = await target_session.call_tool(tool_name, args)
    # 成功后重置计数
    self.tool_call_history[call_key] = 0
    return result
except Exception as e:
    # 失败后增加计数
    self.tool_call_history[call_key] = call_count + 1
    raise
```

### 手动恢复

用户可以通过以下方式重置调用历史:

1. **重启桥接服务** - 所有计数器归零
2. **调用重置 API** - `POST http://localhost:3849/reset-history`
3. **浏览器扩展选项页** - 点击"重置调用历史"按钮

## 调试技巧

### 1. 查看完整错误

打开浏览器控制台 (F12):

```javascript
// 查看详细错误对象
[MCP Bridge] Tool error details: {
  error: "Invalid date format",
  type: "ValueError",
  traceback: "..."
}
```

### 2. 测试 API 直接调用

使用 curl 或 Postman 直接测试桥接服务:

```bash
curl -X POST http://localhost:3849/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get-tickets",
    "arguments": {"date": "2025-13-45"}
  }'
```

### 3. 查看桥接服务日志

桥接服务的控制台会显示详细的错误日志:

```
[2025-10-25 10:30:15] 工具执行错误: {
  "error": "Invalid date format: 2025-13-45",
  "type": "ValueError",
  "traceback": "..."
}
```

### 4. 检查 MCP 服务输出

如果是 stdio 类型的 MCP 服务,可以单独运行它来测试:

```bash
python /path/to/your/mcp_server.py
# 手动输入 JSON-RPC 请求测试
```

## 最佳实践

### 1. 编写清晰的错误消息

在 MCP 服务中:

```python
# ❌ 不好
raise ValueError("Invalid")

# ✅ 好
raise ValueError(f"Invalid date format: {date_str}. Expected YYYY-MM-DD")
```

### 2. 使用合适的异常类型

```python
# 参数问题
raise ValueError("...")

# 类型问题
raise TypeError("...")

# 权限问题
raise PermissionError("...")

# 未找到资源
raise FileNotFoundError("...")
```

### 3. 在工具描述中说明可能的错误

```json
{
  "name": "get_weather",
  "description": "获取天气信息。参数 city 必须是有效的城市名称,否则会抛出 ValueError。",
  "parameters": {...}
}
```

### 4. 提供错误恢复建议

```python
try:
    result = fetch_data(url)
except ConnectionError as e:
    raise ConnectionError(
        f"无法连接到 {url}. "
        f"请检查网络连接或稍后重试。"
    ) from e
```

## 相关文档

- [README.md](../README.md) - 项目总览
- [FALLBACK_GUIDE.md](./FALLBACK_GUIDE.md) - 兜底机制使用指南
- [桥接服务 README](../../mcp_bridge_server/README.md) - 服务端文档
