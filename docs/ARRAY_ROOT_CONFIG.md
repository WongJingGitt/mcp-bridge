# 根对象为数组的配置示例

## 场景说明

某些 AI 平台的请求体本身就是一个数组,而不是对象。例如:

```json
[
  {
    "content": "{\"text\":\"给我讲个笑话吧。\"}",
    "content_type": 2001,
    "attachments": [],
    "references": []
  }
]
```

## 配置方法

### 基础配置 (单个元素)

```json
{
  "name": "array_root_platform",
  "hostname": "example.com",
  "label": "根对象为数组的平台",
  "api": ["/api/chat"],
  "promptPath": "0.content.text",
  "isJsonString": true,
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

**配置说明:**

- `"promptPath": "0.content.text"` - 访问路径:
  - `0` - 数组的第一个元素 `arr[0]`
  - `content` - 该元素的 content 字段 `arr[0].content`
  - `text` - 由于 `isJsonString: true`,会先解析 content,再访问 text

- `"isJsonString": true` - 表示 `content` 字段是 JSON 字符串

### 多个元素同时注入

如果数组有多个元素都需要注入:

```json
{
  "promptPath": ["0.content.text", "1.content.text", "2.content.text"],
  "isJsonString": true
}
```

**请求体示例:**

```json
[
  {
    "content": "{\"text\":\"消息1\"}",
    "content_type": 2001
  },
  {
    "content": "{\"text\":\"消息2\"}",
    "content_type": 2001
  },
  {
    "content": "{\"text\":\"消息3\"}",
    "content_type": 2001
  }
]
```

**注入后:**

```json
[
  {
    "content": "{\"text\":\"# MCP System Prompt\\n...\\n\\n---\\n\\n消息1\"}",
    "content_type": 2001
  },
  {
    "content": "{\"text\":\"# MCP System Prompt\\n...\\n\\n---\\n\\n消息2\"}",
    "content_type": 2001
  },
  {
    "content": "{\"text\":\"# MCP System Prompt\\n...\\n\\n---\\n\\n消息3\"}",
    "content_type": 2001
  }
]
```

## 路径解析详解

### 数组索引访问

JavaScript 中数组也是对象,可以用字符串形式的数字索引:

```javascript
const arr = [{ name: "test" }];

// 以下三种方式等效:
arr[0]        // 数字索引
arr["0"]      // 字符串索引
getByPath(arr, "0")  // 点分隔路径
```

### 完整路径解析

对于路径 `"0.content.text"`:

```javascript
path.split('.')  // ["0", "content", "text"]

// 等效于:
obj["0"]["content"]["text"]
// 即:
obj[0].content.text  // (如果 content 不是 JSON 字符串)
```

### isJsonString 的影响

当 `isJsonString: true` 时:

```javascript
// 路径: "0.content.text"
// 步骤 1: 访问到 "0.content"
const jsonString = obj[0].content;  // "{\"text\":\"原始值\"}"

// 步骤 2: 解析 JSON 字符串
const innerObj = JSON.parse(jsonString);  // {text: "原始值"}

// 步骤 3: 修改 text 字段
innerObj.text = "# MCP Prompt\n\n---\n\n" + innerObj.text;

// 步骤 4: 重新序列化
obj[0].content = JSON.stringify(innerObj);  // "{\"text\":\"# MCP Prompt\\n...\"}"
```

## 实际抓包示例

### 如何确定路径配置

1. **打开开发者工具** (F12)
2. **进入 Network 标签**
3. **发送一条消息**
4. **找到聊天 API 请求**
5. **查看 Payload/Request 标签**

假设看到:

```json
Request Payload:
[
  {
    "content": "{\"text\":\"你好\"}",
    "content_type": 2001,
    "attachments": [],
    "references": []
  }
]
```

**分析:**
- ✅ 根对象是数组 (外层是 `[...]`)
- ✅ 第一个元素是对象
- ✅ `content` 字段是 JSON 字符串 (有转义符 `\"`)
- ✅ 字符串内部有 `text` 字段

**配置:**
```json
{
  "promptPath": "0.content.text",
  "isJsonString": true
}
```

### 验证配置

在控制台测试:

```javascript
// 模拟请求体
const body = [
  {
    content: '{"text":"测试"}',
    content_type: 2001
  }
];

// 测试路径访问
function getByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

console.log(getByPath(body, "0"));           // {content: '...', content_type: 2001}
console.log(getByPath(body, "0.content"));   // '{"text":"测试"}'

// 测试 JSON 解析
const content = getByPath(body, "0.content");
const parsed = JSON.parse(content);
console.log(parsed.text);  // "测试"
```

## 常见问题

### Q1: 数组有多少个元素需要注入?

**A:** 通常只注入第一个元素 (`0`),因为大多数平台只看第一条消息。如果确实需要多个,可以用数组配置:

```json
"promptPath": ["0.content.text", "1.content.text"]
```

### Q2: 如何知道是否需要 isJsonString?

**A:** 查看抓包的 Payload,如果字段值有转义符 `\"`,就需要 `isJsonString: true`:

```json
// 需要 isJsonString: true
"content": "{\"text\":\"值\"}"

// 不需要 isJsonString
"content": {"text": "值"}
```

### Q3: 如果数组是嵌套的怎么办?

**A:** 路径可以多层嵌套:

```json
// 请求体:
{
  "data": {
    "messages": [
      {"text": "消息"}
    ]
  }
}

// 配置:
"promptPath": "data.messages.0.text"
```

### Q4: 能同时配置数组元素和对象字段吗?

**A:** 可以,使用数组形式的 promptPath:

```json
{
  "promptPath": [
    "0.content.text",        // 数组第一个元素
    "systemPrompt",          // 顶层对象字段
    "context.messages.0.text" // 嵌套路径
  ]
}
```

## 调试技巧

### 1. 控制台测试路径

```javascript
// 在浏览器控制台运行
const body = [你的请求体];
function getByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// 测试每一级路径
console.log(getByPath(body, "0"));
console.log(getByPath(body, "0.content"));
console.log(getByPath(body, "0.content.text"));  // 如果这个失败,可能需要 isJsonString
```

### 2. 检查 Network 请求

修改配置后:
1. 重新加载扩展
2. 刷新 AI 页面
3. 发送消息
4. 在 Network 中查看实际发送的请求体
5. 确认 MCP Prompt 已注入到正确位置

### 3. 查看 Background 日志

在扩展管理页面:
1. 找到 MCP Bridge 扩展
2. 点击 "Service Worker" 或 "背景页"
3. 查看控制台日志
4. 搜索 `[MCP Bridge]` 相关日志

## 相关文档

- [多路径注入示例](MULTI_PROMPTPATH_EXAMPLE.md) - 完整的多路径配置指南
- [API 配置完全指南](API_CONFIG_GUIDE.md) - 所有配置字段说明
- [开发者指南](DEVELOPER_GUIDE.md) - 代码实现细节
