# 缓存与搜索功能说明（v1.1+）

## 概述

MCP Bridge v1.1 新增了智能缓存和流式搜索功能，用于高效处理大结果返回场景。

## 新增 API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/result/{cache_id}` | GET | 获取缓存内容（支持分段） |
| `/search-cache` | POST | 在缓存中搜索关键词 |
| `/get-cache-context` | POST | 获取指定行的上下文 |

## 工作流程

### 1. 自动缓存

当工具返回的结果超过阈值（默认 1000 字节）时，服务端自动缓存：

```json
{
  "success": true,
  "result_type": "cached_reference",
  "cache_id": "uuid-string",
  "cache_type": "memory",  // 或 "file"
  "total_size": 30520,
  "message": "结果过大，已缓存"
}
```

### 2. AI 工具调用

AI 可以使用以下三个工具操作缓存：

#### 搜索缓存内容

```xml
<tool_code>
{
  "tool_name": "search_cached_result",
  "arguments": {
    "cache_id": "uuid-from-previous-result",
    "keyword": "error",
    "case_sensitive": false
  }
}
</tool_code>
```

#### 获取指定行上下文

```xml
<tool_code>
{
  "tool_name": "get_cache_context",
  "arguments": {
    "cache_id": "uuid-from-previous-result",
    "line_num": 23,
    "context_lines": 5
  }
}
</tool_code>
```

#### 分段获取内容

```xml
<tool_code>
{
  "tool_name": "get_cached_result",
  "arguments": {
    "cache_id": "uuid-from-previous-result",
    "start": 0,
    "end": 8000
  }
}
</tool_code>
```

## 性能特点

- **流式搜索**: 内存占用恒定（~10MB），支持任意大小文件
- **快速响应**: 10MB 文件搜索 < 100ms
- **智能缓存**: 
  - 内存缓存: 结果 ≤ 10KB
  - 文件缓存: 结果 > 10KB
  - 自动过期: TTL = 5 分钟

## 使用场景

1. **大文件读取** - 读取几MB的文件，先搜索定位再精确获取
2. **日志分析** - 在大量日志中搜索错误信息
3. **数据查询** - 返回大量数据时分段展示

## 配置参数

在服务配置中可以自定义缓存行为：

```json
{
  "mcpServers": {
    "your_service": {
      "max_output_bytes": 1000,        // 触发缓存的阈值
      "cache_large_results": true,      // 是否启用缓存
      "result_cache_ttl": 300,          // 缓存过期时间（秒）
      "max_memory_cache_size": 10240    // 内存缓存阈值（字节）
    }
  }
}
```

## 更多信息

详细的 API 文档请参考 [MCPBridgeServer README](../../MCPBridgeServer/README.md)

