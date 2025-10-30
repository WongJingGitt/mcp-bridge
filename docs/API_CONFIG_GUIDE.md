# API 配置完全指南

## 目录

- [概述](#概述)
- [配置文件结构](#配置文件结构)
- [字段详解](#字段详解)
- [高级配置](#高级配置)
- [配置示例](#配置示例)
- [常见场景](#常见场景)
- [故障排除](#故障排除)

---

## 概述

`config/api_list.json` 是 MCP Bridge 的核心配置文件，定义了支持的 AI 平台及其行为。

### 配置的作用

1. **网络拦截**: 告诉扩展拦截哪些 API 请求
2. **Prompt 注入**: 指定在请求体的哪个字段注入 System Prompt
3. **响应解析**: 定义如何从响应中提取 AI 的回复内容
4. **工具调用检测**: 配置如何检测工具调用指令
5. **输入注入**: 指定输入框选择器和提交方式

---

## 配置文件结构

`api_list.json` 是一个 JSON 数组，每个元素代表一个 AI 平台的配置。

```json
[
  {
    "name": "platform_id",
    "hostname": "platform.example.com",
    "label": "平台显示名称",
    "api": ["/api/endpoint"],
    "promptPath": "path.to.prompt",
    "isJsonString": false,
    "enabled": true,
    "defaultAlwaysInject": true,
    "response": { /* 响应配置 */ },
    "uiParsing": { /* UI解析配置 */ },
    "input": { /* 输入配置 */ },
    "newConversationFlag": { /* 新对话判断 */ },
    "onLoadTip": { /* 页面加载提示 */ }
  }
]
```

---

## 字段详解

### 基础字段

#### `name`
- **类型**: `string`
- **必填**: ✅
- **说明**: 平台的唯一标识符，用于内部逻辑判断
- **命名规范**: 小写字母和下划线，如 `deepseek`, `chatgpt`, `claude_web`
- **示例**:
  ```json
  "name": "deepseek"
  ```

#### `hostname`
- **类型**: `string`
- **必填**: ✅
- **说明**: 平台的域名（不包含协议）
- **用途**: 
  - 匹配当前页面是否为此平台
  - 存储用户的站点偏好设置
- **示例**:
  ```json
  "hostname": "chat.deepseek.com"
  ```

#### `label`
- **类型**: `string`
- **必填**: ✅
- **说明**: 平台的显示名称，用于 UI 展示
- **示例**:
  ```json
  "label": "DeepSeek官网"
  ```

#### `api`
- **类型**: `string[]`
- **必填**: ✅
- **说明**: API 路径片段数组，用于匹配需要拦截的网络请求
- **匹配规则**: 只要请求 URL 包含数组中的任一字符串，就会被拦截
- **示例**:
  ```json
  "api": ["/api/v0/chat/completion", "/api/v0/chat/edit_message"]
  ```

#### `promptPath`
- **类型**: `string` 或 `string[]`
- **必填**: ✅
- **说明**: System Prompt 注入到请求体的路径
- **路径语法**: 使用点号 `.` 分隔，数字表示数组索引
- **支持多路径**: 可以是字符串数组，会向所有路径注入
- **示例**:
  ```json
  // 单路径
  "promptPath": "prompt"
  
  // 嵌套路径
  "promptPath": "messages.0.content"
  
  // 多路径（同时注入到两个字段）
  "promptPath": ["prompt", "displayPrompt"]
  ```

#### `isJsonString`
- **类型**: `boolean`
- **必填**: ✅
- **说明**: Prompt 字段的值是否是 JSON 字符串
- **何时为 true**: 当目标字段的值不是直接的字符串，而是包含字符串的 JSON 对象序列化后的字符串
- **示例**:
  ```json
  // isJsonString: false
  {
    "prompt": "用户消息"
  }
  
  // isJsonString: true
  {
    "messages": [
      {
        "content": "{\"text\": \"用户消息\"}"  // 这是 JSON 字符串
      }
    ]
  }
  // 配置: "promptPath": "messages.0.content.text", "isJsonString": true
  ```

#### `enabled`
- **类型**: `boolean`
- **必填**: ✅
- **说明**: 是否启用此平台的支持
- **用途**: 可以临时禁用某个平台而不删除配置
- **示例**:
  ```json
  "enabled": true
  ```

#### `defaultAlwaysInject`
- **类型**: `boolean`
- **必填**: ✅
- **说明**: 默认是否每次都注入 System Prompt
- **影响**: 用户首次访问此平台时的默认设置
- **用户可修改**: 在扩展设置页面可以修改此行为
- **示例**:
  ```json
  "defaultAlwaysInject": true
  ```

---

### 响应解析配置 (`response`)

用于从 AI 的响应中提取回复内容，以便检测工具调用。

```json
"response": {
  "type": "sse",
  "format": "data: {json}\n\n",
  "contentPaths": ["content", "choices.0.delta.content"],
  "filterRules": {
    "pathField": "type",
    "excludePatterns": ["metadata"]
  }
}
```

#### `response.type`
- **类型**: `string`
- **必填**: ✅
- **可选值**: 
  - `"sse"`: Server-Sent Events（流式响应）
  - `"json"`: 普通 JSON 响应
  - `"text"`: 纯文本响应
- **说明**: 响应数据的格式类型
- **示例**:
  ```json
  "type": "sse"
  ```

#### `response.format`
- **类型**: `string`
- **必填**: 仅当 `type` 为 `"sse"` 时
- **说明**: SSE 数据的格式模板，`{json}` 表示 JSON 数据的位置
- **常见格式**:
  ```json
  // 标准 SSE 格式
  "format": "data: {json}\n\n"
  
  // 仅 data 前缀
  "format": "data: {json}"
  
  // 无前缀（某些平台）
  "format": "{json}"
  ```

#### `response.contentPaths`
- **类型**: `string[]`
- **必填**: ✅
- **说明**: 从响应 JSON 中提取内容的路径数组
- **多路径策略**: 按顺序尝试，返回第一个成功提取的值
- **路径语法**: 使用点号 `.` 分隔
- **示例**:
  ```json
  // 尝试三个路径
  "contentPaths": [
    "choices.0.delta.content",  // 优先尝试
    "delta.content",            // 其次
    "content"                   // 最后
  ]
  ```

#### `response.filterRules` (可选)
- **类型**: `object`
- **说明**: 过滤规则，用于跳过某些不需要的数据
- **字段**:
  - `pathField`: 用于判断的字段路径
  - `excludePatterns`: 要排除的值数组
- **示例**:
  ```json
  "filterRules": {
    "pathField": "p",
    "excludePatterns": ["fragments/0/content"]
  }
  // 当响应中的 p 字段值为 "fragments/0/content" 时，跳过此数据
  ```

---

### UI 解析配置 (`uiParsing`)

当 API 解析失败时，从页面 DOM 中提取内容。

```json
"uiParsing": {
  "enabled": true,
  "priority": "api",
  "messageContainer": ".chat-message",
  "messageIndex": -1,
  "contentSelector": ".markdown-content"
}
```

#### `uiParsing.enabled`
- **类型**: `boolean`
- **必填**: ✅
- **说明**: 是否启用 UI 解析
- **推荐**: 始终启用，作为 API 解析的兜底方案
- **示例**:
  ```json
  "enabled": true
  ```

#### `uiParsing.priority`
- **类型**: `string`
- **必填**: ✅
- **可选值**:
  - `"api"`: API 优先，失败时才用 UI
  - `"ui"`: UI 优先，直接使用 DOM 内容
- **说明**: 解析优先级
- **建议**: 
  - API 解析成功率高的平台用 `"api"`
  - API 解析困难的平台用 `"ui"`
- **示例**:
  ```json
  "priority": "api"
  ```

#### `uiParsing.messageContainer`
- **类型**: `string`
- **必填**: ✅
- **说明**: 消息容器的 CSS 选择器
- **要求**: 选择器应该匹配所有消息元素
- **获取方法**:
  1. 打开 DevTools
  2. 使用元素选择工具点击消息
  3. 查看元素的 class 或其他属性
- **示例**:
  ```json
  "messageContainer": ".ds-message"
  ```

#### `uiParsing.messageIndex`
- **类型**: `number`
- **必填**: ✅
- **说明**: 要提取的消息索引
- **取值**:
  - `0`, `1`, `2`, ... : 从第一条开始的正向索引
  - `-1`, `-2`, `-3`, ... : 从最后一条开始的反向索引
- **常用值**: `-1`（最后一条消息，即 AI 的最新回复）
- **示例**:
  ```json
  "messageIndex": -1
  ```

#### `uiParsing.contentSelector` (可选)
- **类型**: `string`
- **说明**: 消息内容的选择器（在 messageContainer 内查找）
- **何时使用**: 如果消息容器包含很多其他元素（如头像、时间戳），使用此选择器精确定位内容区域
- **示例**:
  ```json
  "contentSelector": ".markdown-content"
  ```

---

### 输入配置 (`input`)

定义如何将工具结果注入到输入框并提交。

```json
"input": {
  "selector": "textarea, [contenteditable='true']",
  "submitKey": "Enter",
  "submitModifiers": [],
  "submitDelay": 1600
}
```

#### `input.selector`
- **类型**: `string`
- **必填**: ✅
- **说明**: 输入框的 CSS 选择器
- **支持**: 多选择器（逗号分隔），会使用第一个匹配的元素
- **常见选择器**:
  ```json
  // Textarea
  "selector": "textarea"
  
  // 特定 ID
  "selector": "#prompt-textarea"
  
  // Contenteditable div
  "selector": "[contenteditable='true']"
  
  // 多选择器
  "selector": "textarea, [contenteditable='true']"
  ```

#### `input.submitKey`
- **类型**: `string`
- **必填**: ✅
- **说明**: 提交按键
- **可选值**: 
  - `"Enter"`: 回车键
  - `"NumpadEnter"`: 数字键盘回车
  - 其他 [KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values) 值
- **示例**:
  ```json
  "submitKey": "Enter"
  ```

#### `input.submitModifiers`
- **类型**: `string[]`
- **必填**: ✅
- **说明**: 提交时需要的修饰键
- **可选值**:
  - `"Ctrl"`: Ctrl 键
  - `"Shift"`: Shift 键
  - `"Alt"`: Alt 键
  - `"Meta"`: Mac 的 Command 键，Windows 的 Win 键
- **示例**:
  ```json
  // 单独 Enter
  "submitModifiers": []
  
  // Ctrl + Enter
  "submitModifiers": ["Ctrl"]
  
  // Ctrl + Shift + Enter
  "submitModifiers": ["Ctrl", "Shift"]
  ```

#### `input.submitDelay`
- **类型**: `number`
- **必填**: ✅
- **说明**: 注入文本到提交之间的延迟（毫秒）
- **用途**: 等待页面 UI 更新，确保提交按钮可用
- **建议值**: 1600-2000ms
- **示例**:
  ```json
  "submitDelay": 1600
  ```

---

### 新对话判断 (`newConversationFlag`)

定义如何判断是否为新对话，以决定是否注入完整的 System Prompt。

```json
"newConversationFlag": {
  "from": "requestBody",
  "path": "conversation_id",
  "checkExists": false,
  "checkValue": "0",
  "valueType": "string"
}
```

#### `newConversationFlag.from`
- **类型**: `string`
- **必填**: ✅
- **可选值**: `"requestBody"`（未来可能支持 `"headers"`, `"url"` 等）
- **说明**: 从哪里获取判断字段
- **示例**:
  ```json
  "from": "requestBody"
  ```

#### `newConversationFlag.path`
- **类型**: `string`
- **必填**: ✅
- **说明**: 判断字段在请求体中的路径
- **示例**:
  ```json
  "path": "conversation_id"
  ```

#### `newConversationFlag.checkExists`
- **类型**: `boolean`
- **说明**: 检查字段是否存在
- **逻辑**:
  - `true`: 字段存在时为新对话
  - `false`: 字段不存在时为新对话
- **示例**:
  ```json
  // 有 chatModelExtInfo 字段时为新对话
  "checkExists": true,
  "path": "chatModelExtInfo"
  ```

#### `newConversationFlag.checkValue`
- **类型**: `any`
- **说明**: 检查字段的值
- **与 checkExists 配合**: 可以先检查存在，再检查值
- **示例**:
  ```json
  // conversation_id 为 "0" 时为新对话
  "checkValue": "0",
  "valueType": "string"
  ```

#### `newConversationFlag.valueType`
- **类型**: `string`
- **可选值**: `"string"`, `"number"`, `"boolean"`, `"null"`
- **说明**: 值的类型，用于精确比较
- **示例**:
  ```json
  "valueType": "string"
  ```

**完整示例**:

```json
// 示例 1: 检查字段是否存在
{
  "from": "requestBody",
  "path": "chatModelExtInfo",
  "checkExists": true  // 存在此字段时为新对话
}

// 示例 2: 检查字段的值
{
  "from": "requestBody",
  "path": "conversation_id",
  "checkValue": "0",
  "valueType": "string"  // conversation_id === "0" 时为新对话
}

// 示例 3: 检查字段不存在
{
  "from": "requestBody",
  "path": "conversation_id",
  "checkExists": false  // 不存在 conversation_id 时为新对话
}
```

---

### 页面加载提示 (`onLoadTip`)

在页面加载时显示提示对话框，用于重要信息通知。

```json
"onLoadTip": {
  "title": "提示",
  "message": ["第一行", "第二行"],
  "confirmText": "我知道了",
  "cancelText": "关闭",
  "type": "default",
  "delay": 500,
  "dontShowAgainText": "不再提示"
}
```

#### `onLoadTip.title` (可选)
- **类型**: `string`
- **默认值**: `"MCP Bridge 提示"`
- **说明**: 对话框标题
- **示例**:
  ```json
  "title": "重要提示"
  ```

#### `onLoadTip.message`
- **类型**: `string` 或 `string[]`
- **必填**: ✅
- **说明**: 提示消息内容
- **格式**:
  - 字符串: 单行消息
  - 字符串数组: 多行消息（每个元素一行）
- **示例**:
  ```json
  // 单行
  "message": "此平台暂不支持自动注入"
  
  // 多行
  "message": [
    "Google AI Studio 不支持自动注入 System Prompt",
    "",
    "请手动点击刷新按钮注入"
  ]
  ```

#### `onLoadTip.confirmText` (可选)
- **类型**: `string`
- **默认值**: `"我知道了"`
- **说明**: 确认按钮文本
- **示例**:
  ```json
  "confirmText": "我知道了"
  ```

#### `onLoadTip.cancelText` (可选)
- **类型**: `string`
- **默认值**: `"关闭"`
- **说明**: 取消按钮文本
- **示例**:
  ```json
  "cancelText": "关闭"
  ```

#### `onLoadTip.type` (可选)
- **类型**: `string`
- **可选值**: `"default"`, `"warning"`, `"info"`
- **默认值**: `"default"`
- **说明**: 对话框类型（影响样式）
- **示例**:
  ```json
  "type": "warning"
  ```

#### `onLoadTip.delay` (可选)
- **类型**: `number`
- **默认值**: `500`
- **说明**: 页面加载后延迟显示的毫秒数
- **示例**:
  ```json
  "delay": 1000
  ```

#### `onLoadTip.dontShowAgainText` (可选)
- **类型**: `string`
- **默认值**: `"不再提示"`
- **说明**: "不再显示"复选框的文本
- **示例**:
  ```json
  "dontShowAgainText": "不再显示此提示"
  ```

---

### 特殊配置

#### `skipRequestModification`
- **类型**: `boolean`
- **可选**: ✅
- **默认值**: `false`
- **说明**: 是否跳过请求修改，仅监听响应
- **使用场景**: 某些平台不允许修改请求，只能通过 UI 解析检测工具调用
- **示例**:
  ```json
  "skipRequestModification": true
  ```

---

## 高级配置

### 多路径注入

某些平台在请求体中使用多个字段存储用户消息，需要同时注入。

```json
{
  "name": "yuanbao",
  "promptPath": ["prompt", "displayPrompt"]
}
```

**实现原理**:
```javascript
// background.js
const promptPaths = Array.isArray(siteConfig.promptPath) 
  ? siteConfig.promptPath 
  : [siteConfig.promptPath];

for (const path of promptPaths) {
  setByPath(bodyJson, path, finalPrompt, siteConfig);
}
```

### 复杂的响应过滤

某些平台的 SSE 响应包含多种类型的数据，需要过滤。

```json
{
  "response": {
    "type": "sse",
    "contentPaths": ["v"],
    "filterRules": {
      "pathField": "p",
      "excludePatterns": ["fragments/0/content", "metadata"]
    }
  }
}
```

**工作原理**:
```javascript
// 解析 SSE 数据
const data = JSON.parse(chunk);

// 检查是否需要过滤
if (data.p && excludePatterns.includes(data.p)) {
  return; // 跳过此数据
}

// 提取内容
const content = data.v;
```

### JSON 字符串字段处理

某些平台将内容序列化为 JSON 字符串存储。

**请求体结构**:
```json
{
  "messages": [
    {
      "content": "{\"text\": \"用户消息\"}"
    }
  ]
}
```

**配置**:
```json
{
  "promptPath": "messages.0.content.text",
  "isJsonString": true
}
```

**处理逻辑**:
```javascript
// background.js: setByPath 函数
if (isJsonString) {
  // 1. 解析 JSON 字符串
  const innerObj = JSON.parse(target.content);
  
  // 2. 修改内部字段
  innerObj.text = newValue;
  
  // 3. 序列化回字符串
  target.content = JSON.stringify(innerObj);
}
```

### 智能提交键配置

不同平台的提交方式不同。

```json
// 单独 Enter
{
  "input": {
    "submitKey": "Enter",
    "submitModifiers": []
  }
}

// Ctrl + Enter
{
  "input": {
    "submitKey": "Enter",
    "submitModifiers": ["Ctrl"]
  }
}

// Shift + Enter
{
  "input": {
    "submitKey": "Enter",
    "submitModifiers": ["Shift"]
  }
}
```

---

## 配置示例

### DeepSeek 完整配置

```json
{
  "name": "deepseek",
  "hostname": "chat.deepseek.com",
  "label": "DeepSeek官网",
  "api": ["/api/v0/chat/completion", "/api/v0/chat/edit_message"],
  "promptPath": "prompt",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": true,
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
    "selector": "textarea, [contenteditable='true']",
    "submitKey": "Enter",
    "submitModifiers": [],
    "submitDelay": 1600
  }
}
```

### 腾讯元宝完整配置

```json
{
  "name": "yuanbao",
  "hostname": "yuanbao.tencent.com",
  "label": "腾讯元宝",
  "api": ["/api/chat/"],
  "promptPath": ["prompt", "displayPrompt"],
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": true,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["msg"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "ui",
    "messageContainer": ".hyc-content-md",
    "messageIndex": -1,
    "contentSelector": ".hyc-common-markdown"
  },
  "input": {
    "selector": "textarea, [contenteditable='true']",
    "submitKey": "Enter",
    "submitModifiers": [],
    "submitDelay": 2000
  },
  "newConversationFlag": {
    "from": "requestBody",
    "path": "chatModelExtInfo",
    "checkExists": true
  }
}
```

### Google AI Studio 配置

```json
{
  "name": "google_aistudio",
  "hostname": "aistudio.google.com",
  "label": "Google AI Studio",
  "api": ["/GenerateContent"],
  "promptPath": "message",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": true,
  "skipRequestModification": true,
  "response": {
    "type": "json",
    "format": "{json}",
    "contentPaths": ["content", "text", "message"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "ui",
    "messageContainer": "ms-chat-turn",
    "messageIndex": -1
  },
  "input": {
    "selector": "textarea, [contenteditable='true']",
    "submitKey": "Enter",
    "submitModifiers": ["Ctrl"],
    "submitDelay": 1600
  },
  "onLoadTip": {
    "message": [
      "Google AI Studio 不支持自动注入 System Prompt 功能",
      "",
      "请在每次新建对话后，在插件面板中点击刷新 System Prompt，手动注入 System Prompt 内容",
      "同时，该网站不支持自动读取模型的工具回复，需要在右下角浮窗中，点击时钟图标手动识别"
    ],
    "dontShowAgainText": "不再显示此提示"
  }
}
```

---

## 常见场景

### 场景 1: 平台使用 SSE 流式响应

**特征**: 响应以 `data: ` 开头，每行一个 JSON 对象

**配置**:
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}\n\n",
    "contentPaths": ["content"]
  }
}
```

### 场景 2: 平台使用普通 JSON 响应

**特征**: 一次性返回完整的 JSON 对象

**配置**:
```json
{
  "response": {
    "type": "json",
    "format": "{json}",
    "contentPaths": ["response.text"]
  }
}
```

### 场景 3: API 解析困难，UI 解析简单

**策略**: 优先使用 UI 解析

**配置**:
```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "ui",
    "messageContainer": ".message",
    "messageIndex": -1
  }
}
```

### 场景 4: 需要 Ctrl + Enter 提交

**配置**:
```json
{
  "input": {
    "selector": "textarea",
    "submitKey": "Enter",
    "submitModifiers": ["Ctrl"],
    "submitDelay": 1600
  }
}
```

### 场景 5: 输入框需要长时间加载

**问题**: 注入后输入框还未完全就绪

**解决**: 增加 `submitDelay`

**配置**:
```json
{
  "input": {
    "submitDelay": 3000  // 等待 3 秒
  }
}
```

---

## 故障排除

### 问题 1: System Prompt 未注入

**检查清单**:
- [ ] `promptPath` 是否正确？
- [ ] `api` 数组是否包含请求的 URL？
- [ ] 是否启用了"自动注入"？
- [ ] `newConversationFlag` 是否正确判断为新对话？

**调试方法**:
1. 打开 DevTools → Network
2. 发起对话
3. 查看请求体是否包含 MCP Prompt

### 问题 2: 工具调用未检测

**检查清单**:
- [ ] `response.contentPaths` 是否正确？
- [ ] `response.type` 和 `response.format` 是否匹配实际响应？
- [ ] AI 的回复中是否包含 `<tool_code>` 标签？

**调试方法**:
1. 打开 DevTools → Console
2. 查看是否有 `[MCP Bridge]` 开头的日志
3. 检查解析到的内容

### 问题 3: 工具结果未自动提交

**检查清单**:
- [ ] `input.selector` 是否能匹配到输入框？
- [ ] `input.submitKey` 和 `input.submitModifiers` 是否正确？
- [ ] `input.submitDelay` 是否足够长？

**调试方法**:
1. 打开 DevTools → Console
2. 执行:
   ```javascript
   document.querySelector('你的选择器')
   ```
3. 查看是否返回输入框元素

### 问题 4: UI 解析失败

**检查清单**:
- [ ] `uiParsing.messageContainer` 是否正确？
- [ ] 页面 DOM 结构是否变化？

**调试方法**:
1. 打开 DevTools → Elements
2. 查找最后一条消息的容器
3. 更新 `messageContainer` 选择器

---

## 最佳实践

### 1. 渐进式配置

从最小配置开始，逐步添加高级功能。

```json
// 第一步: 最小配置
{
  "name": "new_platform",
  "hostname": "platform.com",
  "label": "新平台",
  "api": ["/api/chat"],
  "promptPath": "prompt",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": true,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content"]
  },
  "input": {
    "selector": "textarea",
    "submitKey": "Enter",
    "submitModifiers": [],
    "submitDelay": 1600
  }
}

// 第二步: 添加 UI 解析（如果 API 解析不稳定）
// 第三步: 添加 newConversationFlag（如果需要）
// 第四步: 添加 onLoadTip（如果有特殊说明）
```

### 2. 充分测试

在多种场景下测试配置:
- 新对话
- 继续对话
- 刷新页面后
- 切换模型后

### 3. 文档化配置

为复杂配置添加注释（在项目文档中，而非 JSON 文件）。

### 4. 版本控制

配置变更时记录版本和更改原因。

---

## 参考资源

- [Chrome Extension 官方文档](https://developer.chrome.com/docs/extensions/)
- [CSS 选择器参考](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
- [KeyboardEvent.key 值列表](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

**需要帮助？** 在 [GitHub Issues](https://github.com/WongJingGitt/mcp_bridge/issues) 提问。
