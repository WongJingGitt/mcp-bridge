# 兜底机制使用指南

当自动工具检测失败时，MCP Bridge 提供了多层兜底方案确保功能可用。

## 四层保障机制

### 🥇 第一层：API 解析（主要方案）

**工作原理：** 从网络请求的 SSE 流中实时解析工具调用

**优点：**
- ✅ 最快速、最准确
- ✅ 流式检测（AI 回复过程中实时触发）
- ✅ 不依赖页面 DOM 结构

**配置：**
```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["v", "content", "delta.text"]
  }
}
```

**失败原因：**
- ❌ `contentPaths` 配置错误
- ❌ SSE 数据格式与预期不符
- ❌ 网络请求被其他扩展拦截

---

### 🥈 第二层：UI DOM 解析（自动兜底）

**工作原理：** 当 API 解析失败时，自动从页面 DOM 提取最新消息内容

**优点：**
- ✅ 不依赖 API 配置
- ✅ 自动触发，无需用户操作
- ✅ 适合所有有明显消息结构的页面

**缺点：**
- ⚠️ 只在响应完成后才能检测
- ⚠️ 需要正确配置 CSS 选择器
- ⚠️ 页面结构变化时可能失效

**配置示例：**
{
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".chat-message",
    "messageIndex": -1,
    "contentSelector": ".markdown-body"
  }
}
```

**字段说明：**

| 字段 | 说明 | 示例 |
|------|------|------|
| `enabled` | 是否启用 | `true` / `false` |
| `priority` | 优先级 | `"api"` - API 失败时用<br>`"ui"` - 始终优先用 UI |
| `messageContainer` | 消息容器选择器 | `".chat-message"` |
| `messageIndex` | 消息索引 | `-1` (最后一条)<br>`-2` (倒数第二条) |
| `contentSelector` | 内容选择器（可选） | `".markdown-body"` |

**如何配置：**

#### 步骤 1：找到消息容器

1. 打开目标 AI 网站
2. 按 `F12` 打开开发者工具
3. 点击左上角的元素选择器图标 🔍
4. 点击页面上的一条消息
5. 在 Elements 面板查看该元素

**示例：**
```html
<div class="chat-message" data-id="123">
  <div class="message-content">
    <div class="markdown-body">
      这是消息内容
    </div>
  </div>
</div>
```

从这个结构可以看出：
- 消息容器：`.chat-message`
- 内容元素：`.markdown-body`

#### 步骤 2：测试选择器

在浏览器控制台运行：

```javascript
// 1. 测试能否找到所有消息
const messages = document.querySelectorAll('.chat-message');
console.log('找到消息数量:', messages.length);

// 2. 测试能否获取最后一条
const last = messages[messages.length - 1];
console.log('最后一条消息元素:', last);

// 3. 测试能否提取内容
const content = last.querySelector('.markdown-body');
console.log('消息内容:', content?.innerText);
```

#### 步骤 3：添加到配置

编辑 `config/api_list.json`：

```json
{
  "name": "example",
  "hostname": "example.com",
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".chat-message",
    "messageIndex": -1,
    "contentSelector": ".markdown-body"
  }
}
```

#### 步骤 4：测试

1. 重新加载扩展
2. 刷新 AI 网站
3. 让 AI 生成包含 `<tool_code>` 的回复
4. 观察是否自动触发工具调用

**调试技巧：**

打开浏览器控制台，查看日志：

```javascript
// 成功的日志
[MCP Bridge] Using UI parsed content: <tool_code>...

// 失败的日志
[MCP Bridge] Failed to parse UI content: ...
```

---

### 🥉 第三层：重新检测（断点续传）

**工作原理：** 用户点击浮窗的"重新检测"按钮，从最后一条 UI 消息重新检测工具调用

**优点：**
- ✅ 一键操作，无需复制粘贴
- ✅ 适用于断电续传场景（刷新页面后恢复）
- ✅ 可多次重试，直到检测成功

**缺点：**
- ⚠️ 需要配置 UI 解析功能
- ⚠️ 依赖页面 DOM 结构

**使用场景：**

1. **页面刷新后续传：** 
   - 在工具调用执行前刷新了页面
   - 点击"重新检测"按钮恢复执行

2. **错过自动检测：**
   - AI 回复完成但未触发自动检测
   - 点击"重新检测"手动触发

3. **检测失败重试：**
   - API 解析失败，UI 解析也失败
   - 等待页面完全加载后重试

**使用步骤：**

#### 步骤 1：确认 UI 解析已配置

检查 `config/api_list.json` 中的配置：

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

#### 步骤 2：点击重新检测按钮

在右下角浮窗标题栏，点击时钟图标⏰的"重新检测"按钮

#### 步骤 3：观察状态

浮窗会显示：
- "正在从 UI 重新检测工具调用..."
- "未检测到工具调用" 或 "正在执行工具..."

---

### 🏅 第四层：手动输入（用户兜底）

**工作原理：** 用户主动复制 AI 回复内容，粘贴到浮窗手动触发

**优点：**
- ✅ 100% 可靠
- ✅ 不依赖任何配置
- ✅ 适用于所有情况

**缺点：**
- ⚠️ 需要用户手动操作
- ⚠️ 每次都要复制粘贴

**使用步骤：**

#### 步骤 1：发现检测失败

AI 回复包含工具调用，但右下角浮窗没有显示执行状态：

```
好的，我将为你读取文件内容。

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

#### 步骤 2：复制完整回复

选中并复制 AI 的**完整回复内容**（包含 `<tool_code>` 标签）

⚠️ **注意：** 必须包含完整的 `<tool_code>...</tool_code>` 标签，不能只复制 JSON 部分

#### 步骤 3：打开浮窗

点击右下角的"MCP Bridge"浮窗，如果已收起则点击展开

#### 步骤 4：粘贴并发送

1. 在浮窗的输入框中粘贴复制的内容
2. 点击"发送到 MCP"按钮
3. 观察浮窗状态，等待工具执行完成

#### 步骤 5：查看结果

工具执行完成后，结果会自动注入到 AI 输入框并发送

---

## 常见问题

### Q1: 如何知道当前使用的是哪一层机制？

**A:** 打开浏览器控制台（F12），查看日志：

```javascript
// API 解析成功
[MCP Bridge] Tool call detected in stream chunk: {...}

// UI 解析成功
[MCP Bridge] Using UI parsed content: <tool_code>...

// 手动触发
[MCP Bridge] Manual tool call parsed: {...}
```

### Q2: API 解析和 UI 解析都失败了怎么办？

**A:** 优先使用"重新检测"功能：
1. 点击浮窗的⏰"重新检测"按钮
2. 等待页面完全加载后再次尝试

如果仍然失败，使用手动输入：
1. 复制 AI 完整回复
2. 粘贴到浮窗输入框
3. 点击"发送到 MCP"

如果手动输入也失败，检查：
- ✅ 是否包含完整的 `<tool_code>` 标签
- ✅ JSON 格式是否正确
- ✅ 本地桥接服务是否运行

### Q3: 页面刷新后如何恢复工具调用？

**A:** 使用"重新检测"功能：
1. 如果 AI 的回复还在页面上
2. 点击浮窗的⏰"重新检测"按钮
3. 系统会从最后一条消息重新提取并执行工具调用

**注意：** 需要确保 UI 解析功能已正确配置

### Q4: 如何让 UI 解析优先于 API 解析？

**A:** 修改 `priority` 字段：

```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "ui",  // 改为 "ui"
    "messageContainer": ".chat-message",
    "messageIndex": -1
  }
}
```

### Q5: 页面消息很多，如何只提取最新的？

**A:** 使用 `messageIndex` 字段：

```json
{
  "uiParsing": {
    "messageIndex": -1  // -1 最后一条，-2 倒数第二条
  }
}
```

### Q6: 消息内容包含很多其他元素（头像、时间等），如何只提取文本？

**A:** 使用 `contentSelector` 精确定位：

```json
{
  "uiParsing": {
    "messageContainer": ".chat-message",  // 整个消息
    "contentSelector": ".message-text"     // 只要文本部分
  }
}
```

### Q7: 如何调试 UI 选择器配置？

**A:** 在控制台运行测试代码：

```javascript
// 测试你的配置
const config = {
  messageContainer: '.chat-message',
  messageIndex: -1,
  contentSelector: '.markdown-body'
};

const containers = document.querySelectorAll(config.messageContainer);
console.log('消息总数:', containers.length);

const targetIndex = config.messageIndex < 0 
  ? containers.length + config.messageIndex 
  : config.messageIndex;
const target = containers[targetIndex];
console.log('目标消息:', target);

if (config.contentSelector) {
  const content = target?.querySelector(config.contentSelector);
  console.log('提取内容:', content?.innerText);
} else {
  console.log('提取内容:', target?.innerText);
}
```

---

## 最佳实践

### 推荐配置（API + UI 双保险）

```json
{
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content", "delta.text", "v"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".message",
    "messageIndex": -1
  }
}
```

### 仅 API 模式（性能优先）

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

### UI 优先模式（兼容性优先）

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

---

## 相关文档

- [响应解析配置指南](RESPONSE_CONFIG_GUIDE.md) - 详细的配置字段说明
- [README](../README.md) - 项目总览和快速开始
