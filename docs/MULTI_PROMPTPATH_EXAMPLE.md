# 多路径 PromptPath 使用示例

## 功能说明

从此版本开始,`promptPath` 支持配置为数组,可以同时向请求体的多个字段注入 MCP System Prompt。

## 使用场景

### 场景 1: 平台使用多个字段存储同一内容

某些 AI 平台的后端需要在多个字段中保持一致的内容:

```json
// 请求体结构
{
  "prompt": "用户输入",           // 主要提示词字段
  "systemPrompt": "系统提示",    // 系统提示词字段
  "context": "上下文"             // 上下文字段
}
```

**配置方式:**

```json
{
  "name": "example_platform",
  "hostname": "example.com",
  "promptPath": ["prompt", "systemPrompt", "context"],
  "isJsonString": false
}
```

**注入结果:**

```json
{
  "prompt": "# MCP System Prompt\n...\n\n---\n\n用户输入",
  "systemPrompt": "# MCP System Prompt\n...\n\n---\n\n系统提示",
  "context": "# MCP System Prompt\n...\n\n---\n\n上下文"
}
```

### 场景 2: 嵌套结构的多个位置

```json
// 请求体结构
{
  "messages": [
    {
      "role": "user",
      "content": "用户输入"
    }
  ],
  "systemMessage": {
    "content": "系统消息"
  }
}
```

**配置方式:**

```json
{
  "promptPath": [
    "messages.0.content",
    "systemMessage.content"
  ]
}
```

**注入结果:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "# MCP System Prompt\n...\n\n---\n\n用户输入"
    }
  ],
  "systemMessage": {
    "content": "# MCP System Prompt\n...\n\n---\n\n系统消息"
  }
}
```

### 场景 3: 根对象是数组

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

// 配置 (isJsonString: true 用于解析 content 字段):
{
  "promptPath": "0.content.text",
  "isJsonString": true
}

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
- `0` - 访问数组的第一个元素 (根对象[0])
- `content` - 访问该元素的 content 字段
- `text` - 由于 `isJsonString: true`,会先解析 content 为 JSON 对象,再访问 text 字段

### 场景 4: 数组中的多个元素

如果需要同时注入数组的多个元素:

```json
// 请求体:
{
  "messages": [
    {"role": "system", "content": "系统提示"},
    {"role": "user", "content": "用户输入"}
  ]
}

// 配置:
{
  "promptPath": ["messages.0.content", "messages.1.content"]
}

// 注入后:
{
  "messages": [
    {"role": "system", "content": "# MCP System Prompt\n...\n\n---\n\n系统提示"},
    {"role": "user", "content": "# MCP System Prompt\n...\n\n---\n\n用户输入"}
  ]
}
```

### 场景 5: 兼容旧版配置 (单路径)

**旧版配置 (仍然支持):**

```json
{
  "promptPath": "prompt"
}
```

**等效于:**

```json
{
  "promptPath": ["prompt"]
}
```

代码会自动将单个字符串转换为数组,无需修改现有配置。

## 实现原理

### 代码逻辑 (background.js)

```javascript
// 支持单个路径或多个路径
const promptPaths = Array.isArray(siteConfig.promptPath) 
    ? siteConfig.promptPath 
    : [siteConfig.promptPath];

// 对每个路径都进行注入
for (const path of promptPaths) {
    const originalPrompt = getByPath(bodyJson, path) || '';
    const finalPrompt = (isNewConversation 
        ? initialPrompt + '\n\n---\n\n' 
        : reminderPrompt + '\n\n---\n\n') + originalPrompt;
    setByPath(bodyJson, path, finalPrompt, siteConfig);
}
```

**工作流程:**

1. **检测类型** - 判断 `promptPath` 是字符串还是数组
2. **统一格式** - 将字符串转换为单元素数组
3. **遍历注入** - 对每个路径执行以下操作:
   - 读取原始内容 (`getByPath`)
   - 构建完整提示词 (MCP Prompt + 原始内容)
   - 写回到对应路径 (`setByPath`)

### 路径解析

使用点分隔符访问嵌套对象:

```javascript
function getByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}
```

**示例:**

| 路径 | 访问结果 |
|------|---------|
| `"prompt"` | `obj.prompt` |
| `"messages.0.content"` | `obj.messages[0].content` |
| `"data.user.message"` | `obj.data.user.message` |

## 完整配置示例

### 示例 1: DeepSeek (单路径 - 向后兼容)

```json
{
  "name": "deepseek",
  "hostname": "chat.deepseek.com",
  "label": "DeepSeek官网",
  "api": ["/api/v0/chat/completion"],
  "promptPath": "prompt",
  "isJsonString": false,
  "enabled": true,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["v"]
  },
  "input": {
    "selector": "textarea",
    "submitKey": "Enter"
  }
}
```

### 示例 2: 多字段平台 (多路径)

```json
{
  "name": "multi_field_platform",
  "hostname": "example.com",
  "label": "多字段示例",
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

### 示例 3: 混合 isJsonString (高级)

如果某个字段是 JSON 字符串形式,可以这样配置:

```json
{
  "name": "complex_platform",
  "hostname": "complex.example.com",
  "promptPath": [
    "prompt",                      // 普通字段
    "messages.0.content.text"      // JSON 字符串内部字段
  ],
  "isJsonString": true,            // 影响所有路径
  "enabled": true
}
```

**注意:** 目前 `isJsonString` 是全局配置,影响所有路径。如果需要混合处理(部分路径是 JSON 字符串,部分不是),需要分别配置为不同的站点条目。

## 调试技巧

### 1. 查看注入结果

在浏览器控制台 (F12) 的 Network 标签:

1. 刷新页面并发送消息
2. 找到聊天 API 请求
3. 查看 "Payload" 或 "Request" 标签
4. 确认多个字段都已注入 MCP Prompt

### 2. 控制台日志

在 `background.js` 中添加调试日志:

```javascript
for (const path of promptPaths) {
    const originalPrompt = getByPath(bodyJson, path) || '';
    console.log(`[MCP Bridge] Injecting to path: ${path}`);
    console.log(`[MCP Bridge] Original content:`, originalPrompt);
    
    const finalPrompt = (isNewConversation ? initialPrompt + '\n\n---\n\n' : reminderPrompt + '\n\n---\n\n') + originalPrompt;
    setByPath(bodyJson, path, finalPrompt, siteConfig);
    
    console.log(`[MCP Bridge] After injection:`, getByPath(bodyJson, path));
}
```

### 3. 验证路径是否存在

测试路径是否正确:

```javascript
// 在控制台测试
const testBody = {
  "prompt": "test",
  "messages": [{ "content": "test2" }]
};

// 测试路径
function getByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

console.log(getByPath(testBody, "prompt"));              // "test"
console.log(getByPath(testBody, "messages.0.content"));  // "test2"
console.log(getByPath(testBody, "invalid.path"));        // undefined
```

## 常见问题

### Q1: 旧配置需要修改吗?

**A:** 不需要。单个字符串路径仍然完全支持,会自动转换为数组处理。

### Q2: 如果路径不存在会怎样?

**A:** `getByPath` 会返回 `undefined`,然后使用 `|| ''` 转换为空字符串,不会报错。但注入会失败,建议配置前先抓包确认路径。

### Q3: 可以注入不同的内容到不同路径吗?

**A:** 目前不支持。所有路径注入的内容相同(都是 MCP System Prompt + 原始内容)。如果需要差异化注入,需要修改代码逻辑。

### Q4: 性能影响如何?

**A:** 影响极小。即使配置 10 个路径,也只是循环 10 次对象访问和字符串拼接,耗时可忽略不计 (< 1ms)。

### Q5: isJsonString 会影响所有路径吗?

**A:** 是的。目前 `isJsonString` 是站点级别的配置,会影响该站点的所有 `promptPath`。如果需要混合处理,建议将不同类型的路径拆分为独立的配置条目。

## 相关文档

- [API 配置完全指南](API_CONFIG_GUIDE.md) - 完整的配置字段说明
- [开发者指南](DEVELOPER_GUIDE.md) - 代码结构和开发指南
- [架构设计文档](ARCHITECTURE.md) - 系统架构说明
