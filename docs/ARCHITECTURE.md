# 架构设计文档

本文档详细描述 MCP Bridge 的架构设计、技术选型理由以及关键设计决策。

## 总体架构

### 分层架构

```
┌─────────────────────────────────────────────────────┐
│                    用户层                            │
│             (AI 聊天网站用户界面)                     │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│                浏览器扩展层                           │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │ Injector │ → │  Content │ → │  Background  │   │
│  │  (MAIN)  │   │  Script  │   │   (Worker)   │   │
│  └──────────┘   └──────────┘   └──────────────┘   │
│       ↕               ↕                ↕            │
│  Network Hook    DOM Access      Storage API       │
└─────────────────────────────────────────────────────┘
                        ↕ HTTP (localhost:3849)
┌─────────────────────────────────────────────────────┐
│               桥接服务层                              │
│     FastAPI Server (mcp_bridge_server)              │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │   HTTP   │ → │   MCP    │ → │    Stdio     │   │
│  │   API    │   │  Client  │   │  Transport   │   │
│  └──────────┘   └──────────┘   └──────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↕ Stdio/SSE
┌─────────────────────────────────────────────────────┐
│                  MCP 服务层                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │   File   │   │ Database │   │   Custom     │   │
│  │  System  │   │  Access  │   │   Service    │   │
│  └──────────┘   └──────────┘   └──────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 数据流向

#### 上行流(用户 → AI)

```
1. 用户输入消息
        ↓
2. Injector 拦截 fetch 请求
        ↓
3. postMessage → Content Script
        ↓
4. chrome.runtime.sendMessage → Background
        ↓
5. 调用 MCP Bridge API 获取工具列表
        ↓
6. 构建 System Prompt
        ↓
7. 修改请求体注入 Prompt
        ↓
8. Background 返回修改后的 body
        ↓
9. Content Script → postMessage → Injector
        ↓
10. Injector 继续发送原始请求(已注入工具信息)
```

#### 下行流(AI → 工具执行)

```
1. AI 开始流式返回
        ↓
2. Injector 逐块解析响应
        ↓
3. 检测到 <tool_code>...</tool_code>
        ↓
4. postMessage → Content Script
        ↓
5. chrome.runtime.sendMessage → Background
        ↓
6. Background 调用 MCP Bridge API 执行工具
        ↓
7. MCP Bridge 通过 stdio 调用 MCP Server
        ↓
8. MCP Server 执行工具并返回结果
        ↓
9. Background 格式化结果文本
        ↓
10. chrome.tabs.sendMessage → Content Script
        ↓
11. Content Script 注入结果到输入框
        ↓
12. 自动点击发送按钮
```

## 技术选型

### Chrome Extension Manifest V3

**选择理由:**
- Manifest V2 即将被淘汰(2024年)
- Service Worker 替代 Background Page 提升性能
- 更严格的权限控制增强安全性

**挑战与解决:**
- ❌ Service Worker 无法使用 XMLHttpRequest
- ✅ 使用 fetch API 替代
- ❌ Service Worker 会在空闲时停止
- ✅ 使用消息驱动架构,按需唤醒

### 多上下文架构

**Injector (MAIN world):**
- **为什么需要:** 只有 MAIN world 才能访问页面原生的 fetch/XMLHttpRequest
- **如何实现:** 通过 `world: 'MAIN'` 注入 content script
- **通信方式:** window.postMessage

**Content Script (Isolated world):**
- **为什么需要:** 可以使用 chrome.* API 与 Background 通信
- **如何实现:** 标准 content_scripts 配置
- **通信方式:** chrome.runtime.sendMessage / window.postMessage

**Background (Service Worker):**
- **为什么需要:** 管理全局状态,调用外部 API
- **如何实现:** Manifest V3 service_worker
- **通信方式:** chrome.runtime.onMessage

### 通信协议设计

#### postMessage 协议

Injector → Content Script:
```javascript
{
    source: 'mcp-bridge-injector',          // 标识来源
    direction: 'to-content-script',         // 方向
    type: 'FETCH_REQUEST_BODY',             // 消息类型
    payload: { url, body },                 // 数据
    requestId: 'unique-id-123'              // 请求ID用于匹配响应
}
```

Content Script → Injector:
```javascript
{
    source: 'mcp-bridge-content-script',
    requestId: 'unique-id-123',             // 匹配请求
    payload: { modifiedBody: '...' }
}
```

**设计考虑:**
- `source` 字段防止消息冲突(页面可能有其他扩展)
- `requestId` 实现请求-响应匹配
- `direction` 明确消息方向

#### chrome.runtime.sendMessage

```javascript
// Content Script → Background
chrome.runtime.sendMessage({
    type: 'FETCH_REQUEST_BODY',
    payload: { url, body }
});

// Background → Content Script
chrome.tabs.sendMessage(tabId, {
    type: 'INJECT_RESULT',
    payload: { text }
});
```

**设计考虑:**
- 异步 Promise 方式
- 自动序列化对象
- 内置错误处理

### Shadow DOM 隔离

**为什么使用:**
- 完全隔离扩展样式和页面样式
- 防止 CSS 冲突
- 避免被页面脚本篡改

**实现方式:**
```javascript
const shadowRoot = hostElement.attachShadow({ mode: 'open' });

// 加载独立的 CSS
const styleLink = document.createElement('link');
styleLink.href = chrome.runtime.getURL('ui/status_panel.css');
shadowRoot.appendChild(styleLink);

// 在 Shadow DOM 中创建 UI
shadowRoot.innerHTML = '...';
```

**优势:**
- ✅ 样式完全独立
- ✅ DOM 结构清晰
- ✅ 可以使用 querySelector 查找元素

## 关键设计决策

### 1. 请求拦截方案

**方案对比:**

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| chrome.webRequest | 官方API | MV3中只读,无法修改body | ❌ |
| chrome.declarativeNetRequest | MV3推荐 | 规则静态,无法动态注入 | ❌ |
| fetch/xhr hook (MAIN) | 可完全控制 | 需要注入脚本 | ✅ |

**最终选择:** fetch/xhr hook

**实现细节:**
- 使用 [GitHub - wendux/ajax-hook](https://github.com/wendux/ajax-hook)
- 使用 [GitHub - wendux/fly](https://github.com/wendux/fly) 的 fetch hook
- 在 MAIN world 注入 hook 脚本
- 通过 async 阻塞获取修改后的 body

### 2. 响应解析方案

**挑战:**
- AI 响应是流式的(SSE 或 chunked JSON)
- 需要实时解析提取工具调用
- 不能等响应完成(影响用户体验)

**方案:**
```javascript
let fullText = '';

// 逐块累积
response.on('chunk', (chunk) => {
    const text = extractText(chunk);
    fullText += text;
    
    // 实时检测工具调用
    const match = fullText.match(/<tool_code>(.*?)<\/tool_code>/);
    if (match && !alreadyDetected) {
        triggerToolExecution(match[1]);
        alreadyDetected = true;
    }
});
```

**设计考虑:**
- 使用贪婪匹配 `.*?` 提取第一个工具调用
- `alreadyDetected` 标志防止重复执行
- 响应完成后清除标志为下次对话做准备

### 3. UI 解析兜底机制

**问题背景:**
- 有些平台响应解析可能失败
- 需要保证工具调用可靠性

**解决方案:**
```javascript
// 如果响应解析未检测到工具,尝试 DOM 解析
if (!toolDetected && responseComplete) {
    const content = parseUIContent();
    const match = content.match(/<tool_code>.*?<\/tool_code>/);
    if (match) {
        // 从 UI 提取到工具调用
        triggerToolExecution(match[0]);
    }
}
```

**配置示例:**
```json
{
    "uiParsing": {
        "enabled": true,
        "messageContainer": ".message-container",
        "messageIndex": -1,
        "contentSelector": ".markdown-body"
    }
}
```

### 4. 四层兜底策略

完整的兜底链:

```
1. 响应流解析(实时)
    ↓ 失败
2. 响应完成后再次解析(延迟检测)
    ↓ 失败
3. UI DOM 解析(从页面提取)
    ↓ 失败
4. 手动输入工具代码(用户兜底)
```

**实现逻辑:**

```javascript
// 层1: 流式解析
onResponseChunk(chunk) {
    if (detectTool(chunk)) {
        executeTool();
        return;
    }
}

// 层2: 完成后解析
onResponseComplete() {
    if (!toolExecuted && detectTool(fullText)) {
        executeTool();
        return;
    }
    
    // 层3: UI 解析
    if (uiParsingEnabled) {
        const uiContent = parseUI();
        if (detectTool(uiContent)) {
            executeTool();
            return;
        }
    }
    
    // 层4: 提示用户手动输入
    showManualInputButton();
}
```

### 5. 站点过滤机制

**设计目标:**
- 只在支持的 AI 网站显示浮窗
- 避免在无关网站加载扩展逻辑

**实现方式:**

```javascript
// content_script.js
async function main() {
    const currentHostname = window.location.hostname;
    const { api_list = [] } = await chrome.storage.local.get('api_list');
    
    // 检查当前站点是否在配置中
    const isSupported = api_list.some(item => item.hostname === currentHostname);
    
    if (!isSupported) {
        console.log('[MCP Bridge] Current site not in api_list');
        return;  // 提前退出,不创建浮窗
    }
    
    // 创建浮窗和注入逻辑
    initializeExtension();
}
```

**优势:**
- ✅ 减少内存占用
- ✅ 避免不必要的 DOM 操作
- ✅ 提升用户体验

### 6. 错误处理架构

**多级错误传递:**

```
MCP Server 错误
    ↓
Python Bridge 捕获
    ↓ {detail: {error, type, traceback}}
FastAPI HTTP 响应
    ↓
api_client.js 解析
    ↓ error.details = {error, type, traceback}
Background 处理
    ↓ 格式化为文本
注入到 AI 输入
```

**错误对象结构:**

```javascript
// Python 端
{
    "detail": {
        "error": "Tool 'invalid_tool' not found",
        "type": "ValueError",
        "traceback": "Traceback (most recent call last):\n  ..."
    }
}

// JavaScript 端
const error = new Error(errorData.detail.error);
error.details = {
    error: errorData.detail.error,
    type: errorData.detail.type,
    traceback: errorData.detail.traceback
};
```

**展示格式:**

```
# 工具执行失败

**工具名称**: `list_files`
**错误类型**: [ValueError]
**错误信息**: Invalid path: /nonexistent

**Stack Trace** (last 10 lines):
  File "mcp_bridge.py", line 45, in execute_tool
    result = await client.call_tool(name, arguments)
  File "mcp/client.py", line 123, in call_tool
    raise ValueError(f"Invalid path: {path}")
ValueError: Invalid path: /nonexistent

请检查工具参数是否正确。
```

## 性能优化

### 1. 懒加载

```javascript
// 只在需要时加载大型模块
async function loadParser() {
    if (!parser) {
        const module = await import('./response_parser.js');
        parser = new module.ResponseParser();
    }
    return parser;
}
```

### 2. 防抖处理

```javascript
// 防止短时间内重复请求
let lastRequestTime = 0;
const MIN_INTERVAL = 1000;

function shouldThrottle() {
    const now = Date.now();
    if (now - lastRequestTime < MIN_INTERVAL) {
        return true;
    }
    lastRequestTime = now;
    return false;
}
```

### 3. 状态缓存

```javascript
// 缓存工具列表,避免重复请求
const toolsCache = new Map();

async function getTools(serviceName) {
    if (toolsCache.has(serviceName)) {
        return toolsCache.get(serviceName);
    }
    
    const tools = await apiClient.getToolsByServer(serviceName);
    toolsCache.set(serviceName, tools);
    return tools;
}
```

## 安全考虑

### 1. CSP (Content Security Policy)

**问题:** Manifest V3 禁止 `unsafe-eval` 和内联脚本

**解决:**
- 所有脚本使用外部文件
- 不使用 `eval()` 或 `new Function()`
- JSON 解析使用 `JSON.parse()`

### 2. XSS 防护

**输入过滤:**
```javascript
function sanitizeInput(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

**危险函数避免:**
- ❌ `innerHTML = userInput`
- ✅ `textContent = userInput`
- ✅ `createElement` + `appendChild`

### 3. 权限最小化

**Manifest 权限:**
```json
{
    "permissions": [
        "storage",          // 仅本地存储
        "activeTab"         // 仅当前标签页
    ],
    "host_permissions": [
        "http://localhost:3849/*"  // 仅桥接服务
    ]
}
```

**不需要的权限:**
- ❌ `tabs` (全部标签页访问)
- ❌ `<all_urls>` (所有网站)
- ❌ `cookies` (Cookie 访问)

## 可扩展性设计

### 1. 插件化配置

所有平台配置独立于代码:

```json
{
    "name": "platform_name",
    "hostname": "example.com",
    "api": [...],
    "response": {...},
    "input": {...},
    "uiParsing": {...}
}
```

添加新平台只需修改 JSON,无需改代码。

### 2. 模块化架构

每个模块职责单一:

```
modules/
  ├── api_client.js      # HTTP 通信
  ├── prompt_builder.js  # Prompt 构建
  └── input_injector.js  # 输入注入

scripts/
  ├── background.js      # 业务逻辑
  ├── content_script.js  # 页面交互
  └── page_world/
      └── injector.js    # 网络拦截

ui/
  ├── status_panel.js    # UI 组件
  └── status_panel.css   # 样式
```

### 3. 事件驱动

所有交互通过消息驱动:

```javascript
// 定义消息类型
const MESSAGE_TYPES = {
    FETCH_REQUEST_BODY: 'FETCH_REQUEST_BODY',
    TOOL_DETECTED: 'TOOL_DETECTED',
    INJECT_RESULT: 'INJECT_RESULT',
    // ...
};

// 统一的消息处理器
function handleMessage(message) {
    const handler = messageHandlers[message.type];
    if (handler) {
        return handler(message.payload);
    }
}
```

## 未来规划

### 短期目标

- [ ] 支持更多 AI 平台(Gemini、Kimi 等)
- [ ] 增加工具调用历史记录
- [ ] 优化错误提示 UI

### 中期目标

- [ ] 支持 SSE 传输的 MCP Server
- [ ] 增加工具调用可视化
- [ ] 支持多轮工具调用

### 长期目标

- [ ] 浏览器无关(Firefox、Edge 支持)
- [ ] 本地 LLM 集成
- [ ] 工具市场

## 相关资料

- [Manifest V3 文档](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts 指南](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [MCP 协议规范](https://modelcontextprotocol.io/)
