# 响应解析配置指南

本文档说明如何为新的 AI 平台配置响应解析规则和输入注入配置。

## 配置结构

在 `config/api_list.json` 中，每个平台都有 `response`、`uiParsing` 和 `input` 配置对象：

```json
{
  "name": "example",
  "hostname": "example.com",
  "api": ["/api/chat"],
  "promptPath": "prompt",
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content", "delta.text", "message"],
    "filterRules": {
      "pathField": "p",
      "excludePatterns": ["fragments/0/content"]
    }
  },
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".chat-message",
    "messageIndex": -1,
    "contentSelector": ".message-content"
  },
  "input": {
    "selector": "textarea, [contenteditable='true']",
    "submitKey": "Enter",
    "submitModifiers": [],
    "submitDelay": 1600
  }
}
```

## 配置字段说明

### `response` - 响应解析配置

#### `response.type`

响应类型，支持以下值：

- **`"sse"`** - Server-Sent Events 流式响应（最常见）
- **`"json"`** - 标准 JSON 响应
- **`"text"`** - 纯文本响应

#### `response.format`

仅用于 `type: "sse"`，描述 SSE 数据格式：

- **`"data: {json}"`** - 标准 SSE 格式（最常见）
  ```
  data: {"content":"你好"}
  
  data: {"content":"世界"}
  ```

- **`"event: {event}\ndata: {json}"`** - 带事件类型的 SSE
  ```
  event: message
  data: {"delta":"你好"}
  ```

#### `response.contentPaths`

一个**字符串数组**，定义从 JSON 中提取文本内容的路径，按优先级排列。

支持嵌套路径和数组索引，例如：
- `"content"` - 直接取 `obj.content`
- `"delta.text"` - 取 `obj.delta.text`
- `"choices.0.delta.content"` - 取 `obj.choices[0].delta.content`
- `"v"` - DeepSeek 使用的字段

插件会按顺序尝试每个路径，返回第一个找到的非空值。

#### `response.filterRules` (可选)

用于过滤 SSE 数据流中的特定内容，常用于跳过思考过程等非响应内容。

**字段说明：**

- **`pathField`** - 数据对象中表示路径的字段名（如 DeepSeek 的 `"p"` 字段）
- **`excludePatterns`** - 排除模式数组，路径包含这些字符串的数据会被跳过
- **`includePatterns`** - 包含模式数组（可选），只提取路径包含这些字符串的数据

**示例 1: DeepSeek 深度思考模式**

DeepSeek 在深度思考模式下，Fragment 0 是思考过程，Fragment 1+ 才是实际响应：

```json
{
  "response": {
    "filterRules": {
      "pathField": "p",
      "excludePatterns": ["fragments/0/content"]
    }
  }
}
```

SSE 数据示例：
```javascript
// 被排除（思考过程）
{"v": "我", "p": "response/fragments/0/content", "o": "APPEND"}

// 被提取（实际响应）
{"v": "你", "p": "response/fragments/1/content", "o": "APPEND"}
```

**示例 2: 同时使用排除和包含模式**

```json
{
  "response": {
    "filterRules": {
      "pathField": "type",
      "excludePatterns": ["system", "debug"],
      "includePatterns": ["message", "content"]
    }
  }
}
```

**工作原理：**
1. 检查数据对象中是否有 `pathField` 指定的字段
2. 如果路径值包含 `excludePatterns` 中的任何字符串 → 跳过
3. 如果配置了 `includePatterns`，且路径值不包含其中任何字符串 → 跳过
4. 否则正常提取内容

### `uiParsing` - UI DOM 解析配置（兜底方案）

当 API 解析失败或不可用时，从页面 DOM 直接提取最新消息内容。

#### `uiParsing.enabled`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否启用 UI DOM 解析功能

#### `uiParsing.priority`

- **类型**: `string`
- **可选值**: `"api"` | `"ui"`
- **默认值**: `"api"`
- **说明**: 解析优先级
  - `"api"` - API 优先，失败时才使用 DOM 解析
  - `"ui"` - UI 优先，直接从 DOM 提取（忽略 API）

#### `uiParsing.messageContainer`

- **类型**: `string`
- **说明**: 消息容器的 CSS 选择器，通常选择所有消息的父元素

**示例：**
- `".chat-message"` - 所有聊天消息
- `".message-list > div"` - 消息列表的直接子元素
- `"[data-message-id]"` - 带特定属性的元素

**如何找到：**
1. 打开浏览器开发者工具（F12）
2. 使用元素选择器（左上角箭头图标）
3. 点击页面上的最新消息
4. 在 Elements 面板查看该元素的 class 或 ID

#### `uiParsing.messageIndex`

- **类型**: `number`
- **默认值**: `-1`
- **说明**: 要提取的消息索引（支持负数）
  - `-1` - 最后一条消息（最常用）
  - `-2` - 倒数第二条
  - `0` - 第一条消息
  - `1` - 第二条消息

#### `uiParsing.contentSelector`

- **类型**: `string` (可选)
- **说明**: 在消息容器内进一步精确定位内容的选择器

**示例：**
```json
{
  "uiParsing": {
    "messageContainer": ".chat-message",
    "contentSelector": ".markdown-body"
  }
}
```

这会先找到所有 `.chat-message`，然后在最后一条消息内查找 `.markdown-body` 元素。

**完整示例（DeepSeek）：**

```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".main-inner",
    "messageIndex": -1,
    "contentSelector": ".markdown-body"
  }
}
```

**调试技巧：**

在浏览器控制台测试选择器：
```javascript
// 测试消息容器
document.querySelectorAll('.main-inner')

// 测试获取最后一条消息
const containers = document.querySelectorAll('.main-inner');
const last = containers[containers.length - 1];

// 测试内容选择器
last.querySelector('.markdown-body').innerText
```

### `input` - 输入注入配置

#### `input.selector`

CSS 选择器，用于查找输入框元素。支持：

- **单个选择器**：`"textarea"`
- **多个选择器（逗号分隔）**：`"textarea, [contenteditable='true']"`
- **ID 选择器**：`"#prompt-textarea"`
- **类选择器**：`".input-box"`

**常用选择器：**
- `textarea` - 标准文本框
- `[contenteditable='true']` - 可编辑的 div
- `input[type='text']` - 文本输入框
- `#prompt-textarea` - 特定 ID 的元素

#### `input.submitKey`

触发发送的按键，支持：

- **`"Enter"`** - 回车键（最常见）
- **`"Tab"`** - Tab 键
- **`"Escape"`** - ESC 键
- **`"Space"`** - 空格键

#### `input.submitModifiers`

修饰键数组，用于组合键：

- **`[]`** - 无修饰键（单独按键）
- **`["Shift"]`** - Shift + 按键
- **`["Ctrl"]`** 或 **`["Control"]`** - Ctrl + 按键
- **`["Alt"]`** - Alt + 按键
- **`["Meta"]`** 或 **`["Cmd"]`** - Meta/Cmd + 按键
- **`["Shift", "Ctrl"]`** - 多个修饰键组合

**常见组合：**
- `submitKey: "Enter", submitModifiers: []` - 单独回车
- `submitKey: "Enter", submitModifiers: ["Shift"]` - Shift + Enter
- `submitKey: "Enter", submitModifiers: ["Ctrl"]` - Ctrl + Enter

#### `input.submitDelay`

文本注入后到自动提交的总延迟时间（毫秒）：

- **类型**: `number`
- **默认值**: `1600` (毫秒)
- **说明**: 总延迟时间会按比例分配到各个步骤

**延迟分配比例**:
```
总延迟时间 = submitDelay (默认 1600ms)

1. 聚焦后延迟:   12.5%  (默认 200ms)  - 等待输入框聚焦完成
2. 输入后延迟:   31.25% (默认 500ms)  - 等待框架响应（React/Vue）
3. 提交前延迟:   50%    (默认 800ms)  - 让用户看到输入内容
4. 提交后延迟:   6.25%  (默认 100ms)  - 等待提交完成
```

**示例**:
```json
{
    "input": {
        "selector": "textarea",
        "submitKey": "Enter",
        "submitModifiers": [],
        "submitDelay": 2000  // 更慢的提交速度（2秒）
    }
}
```

**调试技巧**: 如果输入内容没有正确提交，可以尝试增加 `submitDelay` 值。

---

## 如何抓包配置

### 步骤 1: 打开开发者工具

1. 访问目标 AI 平台网站
2. 按 `F12` 打开开发者工具
3. 切换到 **Network（网络）** 标签
4. 勾选 **Preserve log（保留日志）**

### 步骤 2: 发起对话

1. 在 AI 聊天框中输入一条消息
2. 观察 Network 标签中新增的请求

### 步骤 3: 找到聊天 API 请求

1. 在请求列表中找到**正在传输数据的请求**（通常有进度条或 EventStream 标记）
2. 点击该请求
3. 查看 **Headers** 标签页

#### 关键信息：

**请求 URL：**
```
https://example.com/api/v1/chat/completions
                     ^^^^^^^^^^^^^^^^^^^
                     这部分配置到 "api" 字段
```

**响应头（Response Headers）：**
```
Content-Type: text/event-stream
              ^^^^^^^^^^^^^^^^^
              如果包含 "event-stream" → type: "sse"
              如果是 "application/json" → type: "json"
```

### 步骤 4: 查看响应格式

切换到 **Response** 或 **EventStream** 标签，查看数据格式。

#### 示例 1: 标准 SSE 格式

```
data: {"id":"1","content":"你"}

data: {"id":"2","content":"好"}

data: [DONE]
```

**配置：**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content", "delta", "text"]
  }
}
```

#### 示例 2: OpenAI 风格 SSE

```
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

**配置：**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["choices.0.delta.content"]
  }
}
```

#### 示例 3: 带类型字段的 SSE

```
data: {"type":"ready"}

data: {"type":"message","content":"你好"}

data: {"type":"close"}
```

**配置：**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content", "text", "message"]
  }
}
```

> **提示**：如果响应包含 `type` 字段，插件会自动跳过非内容数据。

#### 示例 4: 嵌套结构

```
data: {"message":{"content":{"parts":["你好"]}}}
```

**配置：**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["message.content.parts.0", "content"]
  }
}
```

### 步骤 5: 测试配置

1. 编辑 `config/api_list.json`
2. 添加或修改配置
3. 重新加载扩展（`chrome://extensions/` → 刷新按钮）
4. 刷新 AI 网站页面
5. 发送测试消息
6. 打开浏览器控制台，查看日志：

```javascript
[MCP Bridge] SSE Progress: { parsedLength: 150, hasToolCode: false }
```

---

## 常见问题

### Q: 如何知道应该配置哪些 contentPaths？

A: 在控制台中运行以下代码来探索响应结构：

```javascript
// 复制一条 SSE 数据行
const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
const json = JSON.parse(line.substring(6));
console.log(json); // 查看完整结构
```

### Q: 响应是纯文本，没有 JSON 怎么办？

A: 配置为 `type: "text"`，不需要 `contentPaths`：

```json
{
  "response": {
    "type": "text"
  }
}
```

### Q: 多个路径都可能有内容怎么办？

A: 按优先级排列，插件会返回第一个找到的值：

```json
{
  "contentPaths": [
    "choices.0.delta.content",  // 优先尝试这个
    "delta.content",             // 然后这个
    "content"                    // 最后这个
  ]
}
```

---

## 完整配置示例

```json
[
  {
    "name": "my_ai_platform",
    "hostname": "ai.example.com",
    "label": "我的AI平台",
    "api": ["/api/v1/chat/completions"],
    "promptPath": "messages.0.content",
    "isJsonString": false,
    "enabled": true,
    "defaultAlwaysInject": false,
    "response": {
      "type": "sse",
      "format": "data: {json}",
      "contentPaths": [
        "choices.0.delta.content",
        "content",
        "text"
      ]
    }
  }
]
```

---

## 调试技巧

启用详细日志：打开控制台，观察以下日志：

```javascript
[MCP Bridge] Monitoring SSE XHR for: ... Config: {...}
[MCP Bridge] SSE Progress: { parsedLength: 150, parsedPreview: "..." }
```

如果 `parsedLength` 始终为 0，说明 `contentPaths` 配置有误。

---

## 手动输入功能

当自动检测失败时，可以使用右下角浮窗的手动输入功能。

### 使用方法

1. **发现自动检测失败** - AI 回复包含工具调用，但扩展没有响应
2. **复制完整回复** - 选中并复制 AI 的完整回复内容（包含 `<tool_code>` 标签）
3. **打开浮窗** - 点击右下角的 "MCP Bridge" 浮窗展开
4. **粘贴内容** - 在输入框中粘贴复制的内容
5. **点击发送** - 点击"发送到 MCP"按钮
6. **等待执行** - 系统会自动解析并执行工具调用

### 浮窗功能

右下角常驻浮窗提供以下功能：

- **状态显示** - 实时显示工具调用状态
- **刷新按钮** - 重新获取最新的 System Prompt
- **展开/收起** - 点击右上角箭头控制面板显示
- **手动输入** - 在输入框粘贴内容手动触发工具调用

### 示例

AI 回复内容：
```
我将为你执行这个操作。

<tool_code>
{
  "tool_name": "read_file",
  "arguments": {
    "path": "/path/to/file.txt"
  }
}
</tool_code>

请稍等...
```

复制上述完整内容 → 粘贴到浮窗 → 点击发送 → 工具自动执行

---

## 配置优先级和兜底机制

系统提供三层保障机制：

### 1. API 解析（主要方案）
从 XHR/Fetch 拦截的 SSE 流中解析内容
- ✅ 最准确、最快速
- ✅ 支持流式检测（回复过程中实时检测）
- ⚠️ 依赖正确的 `response` 配置

### 2. UI DOM 解析（自动兜底）
从页面 DOM 直接提取最新消息
- ✅ 不依赖 API 配置
- ✅ 在 API 解析失败时自动启用
- ⚠️ 只在响应完成后才能检测
- ⚠️ 需要正确配置 `uiParsing` 选择器

### 3. 手动输入（用户兜底）
用户主动复制粘贴触发
- ✅ 100% 可靠的最终方案
- ✅ 不依赖任何配置
- ⚠️ 需要用户手动操作

### 配置建议

**推荐配置（API + UI 双保险）：**
```json
{
  "response": {
    "type": "sse",
    "contentPaths": ["content"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".message",
    "messageIndex": -1
  }
}
```

**仅 API 模式（性能优先）：**
```json
{
  "response": {
    "type": "sse",
    "contentPaths": ["content"]
  },
  "uiParsing": {
    "enabled": false
  }
}
```

**UI 优先模式（兼容性优先）：**
```json
{
  "response": {
    "type": "sse",
    "contentPaths": ["content"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "ui",
    "messageContainer": ".message",
    "messageIndex": -1
  }
}
```
