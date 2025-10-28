# API 配置完全指南

本文档详细说明 `config/api_list.json` 中每个平台的配置选项。

## 配置文件结构

`api_list.json` 是一个数组,每个元素代表一个支持的 AI 平台:

```json
[
  {
    "name": "deepseek",
    "hostname": "chat.deepseek.com",
    "label": "DeepSeek官网",
    "api": ["/api/v0/chat/completion"],
    "enabled": true,
    "response": { /* 响应解析配置 */ },
    "uiParsing": { /* UI DOM 解析配置 */ },
    "input": { /* 输入注入配置 */ },
    "filterRules": { /* 数据过滤规则 */ }
  }
]
```

## 基础配置

### name (必需)

**类型:** `string`  
**说明:** 平台的唯一标识符,用于内部逻辑判断

**示例:**
```json
"name": "deepseek"
```

### hostname (必需)

**类型:** `string`  
**说明:** 平台的域名,用于匹配当前网站

**示例:**
```json
"hostname": "chat.deepseek.com"
```

**重要:** 只有当前网站的 hostname 与此匹配时,浮窗才会显示

### label (可选)

**类型:** `string`  
**说明:** 平台的显示名称,用于 UI 显示

**示例:**
```json
"label": "DeepSeek官网"
```

### api (必需)

**类型:** `string[]`  
**说明:** 需要拦截的 API 路径列表

**示例:**
```json
"api": [
  "/api/v0/chat/completion",
  "/api/v0/chat/edit_message"
]
```

### enabled (可选)

**类型:** `boolean`  
**默认值:** `true`  
**说明:** 是否启用该平台的 MCP 功能

**示例:**
```json
"enabled": true
```

### defaultAlwaysInject (可选)

**类型:** `boolean`  
**默认值:** `false`  
**说明:** 是否默认在每次请求中注入 System Prompt

**示例:**
```json
"defaultAlwaysInject": false
```

## Prompt 注入配置

用于配置如何将 MCP System Prompt 注入到请求体中。

### promptPath (必需)

**类型:** `string` | `string[]`  
**说明:** 请求体中提示词字段的路径,支持单个路径或多个路径

**单路径示例:**
```json
{
  "promptPath": "prompt"
}
```

**多路径示例:**
```json
{
  "promptPath": ["prompt", "systemPrompt", "messages.0.content"]
}
```

**路径格式:**
- `"prompt"` - 顶层字段 `body.prompt`
- `"messages.0.content"` - 嵌套路径 `body.messages[0].content`
- `"messages.0.content.parts.0"` - 深层嵌套 `body.messages[0].content.parts[0]`

**使用场景:**

**场景 1: 单个字段 (常见)**
```json
// 请求体:
{
  "prompt": "用户输入"
}

// 配置:
"promptPath": "prompt"

// 注入后:
{
  "prompt": "# MCP System Prompt\n...\n\n---\n\n用户输入"
}
```

**场景 2: 多个字段 (同时注入)**

某些平台将同一内容分散在多个字段,需要同时注入:

```json
// 请求体:
{
  "prompt": "用户输入",
  "systemPrompt": "默认系统提示",
  "messages": [
    {
      "role": "user",
      "content": "用户输入"
    }
  ]
}

// 配置:
"promptPath": ["prompt", "systemPrompt", "messages.0.content"]

// 注入后: 三个字段都会被添加 MCP System Prompt
{
  "prompt": "# MCP System Prompt\n...\n\n---\n\n用户输入",
  "systemPrompt": "# MCP System Prompt\n...\n\n---\n\n默认系统提示",
  "messages": [
    {
      "role": "user",
      "content": "# MCP System Prompt\n...\n\n---\n\n用户输入"
    }
  ]
}
```

**场景 3: 嵌套数组**

ChatGPT 等平台使用嵌套结构:

```json
// 请求体:
{
  "messages": [
    {
      "content": {
        "parts": ["用户输入"]
      }
    }
  ]
}

// 配置:
"promptPath": "messages.0.content.parts.0"

// 注入后:
{
  "messages": [
    {
      "content": {
        "parts": ["# MCP System Prompt\n...\n\n---\n\n用户输入"]
      }
    }
  ]
}
```

**场景 4: 根对象是数组**

某些平台的请求体本身就是一个数组:

```json
// 请求体 (根对象是数组):
[
  {
    "content": "{\"text\":\"给我讲个笑话吧。\"}",
    "content_type": 2001,
    "attachments": [],
    "references": []
  }
]

// 配置:
{
  "promptPath": "0.content.text",
  "isJsonString": true
}

// 处理流程:
// 1. 访问根数组的第一个元素: arr[0]
// 2. 访问 content 字段: arr[0].content (这是一个 JSON 字符串)
// 3. 因为 isJsonString: true, 解析 content 为对象
// 4. 访问解析后的 text 字段并修改
// 5. 重新序列化为 JSON 字符串写回

// 注入后:
[
  {
    "content": "{\"text\":\"# MCP System Prompt\\n...\\n\\n---\\n\\n给我讲个笑话吧。\"}",
    "content_type": 2001,
    "attachments": [],
    "references": []
  }
]
```

**路径解析说明:**
- `0` - 访问数组的第一个元素
- `0.content` - 访问第一个元素的 content 字段
- `0.content.text` - 结合 `isJsonString: true`,访问 JSON 字符串内部的 text 字段

### isJsonString (可选)

**类型:** `boolean`  
**默认值:** `false`  
**说明:** 目标字段是否是 JSON 字符串形式 (双层编码)

**示例:**

某些平台 (如豆包) 的请求体中,某些字段本身是 JSON 字符串:

```json
// 请求体:
{
  "messages": [
    {
      "content": "{\"text\":\"用户输入\"}"  // 注意:这是一个字符串,不是对象
    }
  ]
}

// 配置:
{
  "promptPath": "messages.0.content.text",
  "isJsonString": true
}

// 处理流程:
// 1. 解析 messages[0].content 字符串为对象
// 2. 修改对象中的 text 字段
// 3. 重新序列化为 JSON 字符串
// 4. 写回 messages[0].content

// 注入后:
{
  "messages": [
    {
      "content": "{\"text\":\"# MCP System Prompt\\n...\\n\\n---\\n\\n用户输入\"}"
    }
  ]
}
```

**何时使用:**
- 当 `isJsonString: false` 时,直接修改对象属性
- 当 `isJsonString: true` 时,先解析 JSON 字符串,修改后再序列化

## 响应解析配置 (response)

用于从 API 响应中提取 AI 回复内容。

### type (必需)

**类型:** `"sse"` | `"json"`  
**说明:** 响应类型

**示例:**
```json
{
  "response": {
    "type": "sse"
  }
}
```

### format (SSE 必需)

**类型:** `string`  
**说明:** SSE 数据格式模板

**常见格式:**
- `"data: {json}"` - DeepSeek, ChatGPT
- `"{json}"` - 某些平台直接返回 JSON

**示例:**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}"
  }
}
```

### contentPaths (必需)

**类型:** `string[]`  
**说明:** 从解析的 JSON 中提取内容的路径

**示例:**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["v"]
  }
}
```

**路径格式:**
- `"v"` - 顶层字段 `data.v`
- `"content"` - `data.content`
- `"delta.text"` - 嵌套字段 `data.delta.text`

**多路径支持:**
```json
"contentPaths": ["v", "content", "delta.text"]
```
系统会按顺序尝试,使用第一个找到的非空值。

### filterRules (可选)

**类型:** `object`  
**说明:** 过滤特定的 SSE 数据片段

**完整示例:**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["v"],
    "filterRules": {
      "pathField": "p",
      "excludePatterns": ["fragments/0/content"],
      "includePatterns": []
    }
  }
}
```

**字段说明:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `pathField` | string | JSON 中表示路径的字段名 |
| `excludePatterns` | string[] | 排除包含这些模式的数据 |
| `includePatterns` | string[] | 只包含匹配这些模式的数据 |

**工作原理:**
```javascript
// 假设 SSE 数据为:
// data: {"v": "tool", "p": "response/fragments/0/content"}

// 如果 excludePatterns 包含 "fragments/0/content"
// 则这条数据会被跳过,不参与工具检测
```

**使用场景:**
- DeepSeek 在深度思考模式下会发送大量 fragment 数据
- 这些数据不包含工具调用,但会触发大量解析
- 使用过滤规则可以跳过这些无用数据,提升性能

## UI DOM 解析配置 (uiParsing)

当 API 解析失败时,从页面 DOM 提取内容的兜底方案。

### enabled (必需)

**类型:** `boolean`  
**说明:** 是否启用 UI 解析功能

**示例:**
```json
{
  "uiParsing": {
    "enabled": true
  }
}
```

### priority (可选)

**类型:** `"ui"` | `"api"`  
**默认值:** `"api"`  
**说明:** 解析优先级

**值说明:**
- `"api"` - 优先使用 API 解析,失败时才用 UI 解析
- `"ui"` - 直接使用 UI 解析,跳过 API 解析

**示例:**
```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "ui"
  }
}
```

**使用场景:**
- 当 API 解析不稳定时,设置 `priority: "ui"` 强制使用 DOM 解析
- 深度思考模式可能导致 API 解析混乱,这时 UI 解析更可靠

### messageContainer (必需)

**类型:** `string` (CSS 选择器)  
**说明:** 消息容器的 CSS 选择器

**示例:**
```json
{
  "uiParsing": {
    "enabled": true,
    "messageContainer": ".ds-message"
  }
}
```

**如何获取:**
1. 打开浏览器开发者工具 (F12)
2. 使用元素选择器 (点击工具栏左上角图标)
3. 点击一条 AI 消息
4. 查看元素的 class 或其他属性
5. 构造唯一的 CSS 选择器

**常见选择器:**
- `.ds-message` - DeepSeek
- `.message` - 通用
- `[data-message-id]` - 带属性选择器

### messageIndex (必需)

**类型:** `number`  
**说明:** 要提取的消息索引

**值说明:**
- `0` - 第一条消息
- `1` - 第二条消息
- `-1` - 最后一条消息 (常用)
- `-2` - 倒数第二条消息

**示例:**
```json
{
  "uiParsing": {
    "enabled": true,
    "messageContainer": ".ds-message",
    "messageIndex": -1
  }
}
```

**常用配置:** `-1` (始终提取最新的回复)

### contentSelector (可选)

**类型:** `string` (CSS 选择器)  
**说明:** 从消息容器内进一步提取内容的选择器

**示例:**
```json
{
  "uiParsing": {
    "enabled": true,
    "messageContainer": ".ds-message",
    "messageIndex": -1,
    "contentSelector": ".ds-markdown"
  }
}
```

**使用场景:**
- 消息容器包含很多其他元素 (头像、时间戳、按钮等)
- 需要精确提取文本内容部分
- 如果不设置,会提取整个容器的 `innerText`

**常见选择器:**
- `.markdown-body` - Markdown 渲染的内容
- `.message-text` - 纯文本内容
- `.content` - 通用内容区域

### 完整示例

```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "ui",
    "messageContainer": ".ds-message",
    "messageIndex": -1,
    "contentSelector": ".ds-markdown"
  }
}
```

**调试技巧:**

在浏览器控制台测试选择器:

```javascript
// 测试消息容器
const containers = document.querySelectorAll('.ds-message');
console.log('消息数量:', containers.length);

// 测试最后一条消息
const last = containers[containers.length - 1];
console.log('最后一条消息:', last);

// 测试内容提取
const content = last.querySelector('.ds-markdown');
console.log('内容:', content?.innerText);
```

## 输入注入配置 (input)

用于将工具结果注入到 AI 的输入框并自动发送。

### selector (必需)

**类型:** `string` (CSS 选择器)  
**说明:** 输入框的 CSS 选择器

**示例:**
```json
{
  "input": {
    "selector": "textarea"
  }
}
```

**常见选择器:**
- `textarea` - 普通文本域
- `[contenteditable='true']` - 富文本编辑器
- `#chat-input` - 带 ID 的输入框
- `.input-box` - 带 class 的输入框

### submitKey (必需)

**类型:** `"Enter"` | `string`  
**说明:** 提交消息的按键

**示例:**
```json
{
  "input": {
    "selector": "textarea",
    "submitKey": "Enter"
  }
}
```

### submitModifiers (可选)

**类型:** `string[]`  
**默认值:** `[]`  
**说明:** 提交时需要按住的修饰键

**可选值:**
- `"Control"` - Ctrl 键
- `"Shift"` - Shift 键
- `"Alt"` - Alt 键
- `"Meta"` - Command 键 (Mac) / Windows 键

**示例:**
```json
{
  "input": {
    "selector": "textarea",
    "submitKey": "Enter",
    "submitModifiers": ["Control"]
  }
}
```

**常见组合:**
- `[]` + `Enter` - 直接回车发送
- `["Shift"]` + `Enter` - Shift+Enter 发送
- `["Control"]` + `Enter` - Ctrl+Enter 发送

### 完整示例

```json
{
  "input": {
    "selector": "textarea.ds-scroll-area",
    "submitKey": "Enter",
    "submitModifiers": []
  }
}
```

## 完整配置示例

### DeepSeek (所有功能)

```json
{
  "name": "deepseek",
  "hostname": "chat.deepseek.com",
  "label": "DeepSeek官网",
  "api": [
    "/api/v0/chat/completion",
    "/api/v0/chat/edit_message"
  ],
  "promptPath": "prompt",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": false,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["v"],
    "filterRules": {
      "pathField": "p",
      "excludePatterns": ["fragments/0/content"]
    }
  },
  "uiParsing": {
    "enabled": true,
    "priority": "ui",
    "messageContainer": ".ds-message",
    "messageIndex": -1,
    "contentSelector": ".ds-markdown"
  },
  "input": {
    "selector": "textarea.ds-scroll-area",
    "submitKey": "Enter",
    "submitModifiers": []
  }
}
```

### ChatGPT (基础配置)

```json
{
  "name": "chatgpt",
  "hostname": "chatgpt.com",
  "label": "ChatGPT",
  "api": ["/backend-api/conversation"],
  "enabled": true,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["message.content.parts.0"]
  },
  "input": {
    "selector": "#prompt-textarea",
    "submitKey": "Enter",
    "submitModifiers": []
  }
}
```

### 通义千问 (自定义配置)

```json
{
  "name": "qwen",
  "hostname": "tongyi.aliyun.com",
  "label": "通义千问",
  "api": ["/api/chat/stream"],
  "enabled": true,
  "response": {
    "type": "sse",
    "format": "{json}",
    "contentPaths": ["data.text", "delta.content"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".message-item",
    "messageIndex": -1
  },
  "input": {
    "selector": "textarea[placeholder*='输入']",
    "submitKey": "Enter",
    "submitModifiers": ["Control"]
  }
}
```

### 多路径注入示例

某些平台将同一内容存储在多个字段:

```json
{
  "name": "example_platform",
  "hostname": "example.com",
  "label": "示例平台",
  "api": ["/api/chat"],
  "promptPath": [
    "prompt",
    "systemPrompt",
    "messages.0.content"
  ],
  "isJsonString": false,
  "enabled": true,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content"]
  },
  "input": {
    "selector": "textarea",
    "submitKey": "Enter"
  }
}
```

**说明:**
- 使用数组配置多个路径
- 每次请求会同时在三个字段注入 MCP System Prompt
- 适用于后端需要多个字段保持一致的场景

### 数组根对象配置

某些平台的请求体本身是数组而非对象:

```json
{
  "name": "array_root_platform",
  "hostname": "example.com",
  "label": "数组根平台",
  "api": ["/api/chat"],
  "promptPath": "0.content.text",
  "isJsonString": true,
  "enabled": true
}
```

**请求体示例:**
```json
[
  {
    "content": "{\"text\":\"用户消息\"}",
    "content_type": 2001
  }
]
```

**路径解析:**
- `0` - 访问数组第一个元素
- `content` - 访问该元素的 content 字段
- `text` - 因为 `isJsonString: true`，会解析 JSON 字符串后访问 text

### skipRequestModification (可选)

**类型:** `boolean`  
**默认值:** `false`  
**说明:** 是否跳过请求体修改，仅监听响应

**使用场景:** 某些网站的请求体使用加密或特殊编码，无法直接修改

**示例:**
```json
{
  "name": "encrypted_site",
  "hostname": "encrypted.example.com",
  "api": ["/api/chat"],
  "skipRequestModification": true,
  "enabled": true,
  "response": {
    "type": "sse",
    "contentPaths": ["content"]
  }
}
```

**注意:** 启用此选项后：
- ✅ 仍然可以检测工具调用
- ✅ 仍然可以执行工具
- ❌ 无法自动注入 System Prompt
- ⚠️ 需要用户手动在网站设置中配置 System Prompt

## 高级配置场景

### 场景 1: 多路径 + JSON 字符串

```json
{
  "promptPath": ["prompt", "messages.0.content.text"],
  "isJsonString": true
}
```

**说明:** `isJsonString` 会影响所有路径。如果只有部分路径需要 JSON 解析，建议拆分为独立配置。

### 场景 2: 嵌套数组访问

```json
{
  "promptPath": "messages.0.parts.0.text"
}
```

**请求体:**
```json
{
  "messages": [
    {
      "parts": [
        {"text": "用户输入"}
      ]
    }
  ]
}
```

### 场景 3: 新会话标识

某些平台需要特殊标识来区分新会话:

```json
{
  "newConversationFlag": {
    "field": "conversation_id",
    "defaultValue": null,
    "isNewWhen": "null"
  }
}
```

**说明:**
- `field` - 请求体中标识字段的路径
- `defaultValue` - 新会话时的默认值
- `isNewWhen` - 何时判定为新会话 (`"null"` | `"empty"` | `"undefined"`)

**示例:**
```json
// 新会话
{"conversation_id": null}  // 注入完整 System Prompt

// 继续会话
{"conversation_id": "abc123"}  // 注入提醒 Prompt
```

## 常见问题

### Q1: 如何知道 API 路径？

**A:** 打开浏览器开发者工具 (F12) → Network 标签 → 发送一条消息 → 查找 XHR/Fetch 请求

### Q2: contentPaths 怎么确定？

**A:** 
1. 在 Network 中找到 API 请求
2. 查看 Response 内容
3. 找到包含 AI 回复文本的字段路径

### Q3: 为什么 UI 解析不工作？

**A:** 检查:
1. CSS 选择器是否正确
2. 在控制台测试: `document.querySelectorAll('.your-selector')`
3. 消息是否已经渲染到 DOM 中

### Q4: 如何测试配置？

**A:** 
1. 修改 `api_list.json`
2. 重新加载扩展
3. 刷新 AI 网站页面
4. 打开控制台查看日志
5. 发送包含工具调用的请求测试

### Q5: 多路径配置的性能影响？

**A:** 几乎无影响。即使配置 10 个路径，也只是循环进行对象访问和字符串拼接，耗时 < 1ms。

### Q6: skipRequestModification 适用哪些网站？

**A:** 适用于:
- 请求体加密的网站
- 使用 Protobuf 等二进制格式的网站
- 无法识别请求体结构的网站

不适用于:
- 可以正常抓包看到 JSON 请求体的网站

## 相关文档

- [README.md](../README.md) - 项目总览
- [FALLBACK_GUIDE.md](./FALLBACK_GUIDE.md) - 兜底机制详解
- [RESPONSE_CONFIG_GUIDE.md](./RESPONSE_CONFIG_GUIDE.md) - 响应配置详解
- [ONLOAD_TIP_GUIDE.md](./ONLOAD_TIP_GUIDE.md) - 页面加载提示配置
