# 开发者指南

本文档面向想要理解 MCP Bridge 内部实现、贡献代码或基于此项目开发新功能的开发者。

## 项目架构

### 三层架构

```
┌─────────────────────────────────────────────────────┐
│              浏览器扩展层 (Chrome Extension)          │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Injector  │→ │  Content  │→ │  Background  │   │
│  │  (MAIN)   │  │  Script   │  │   Script     │   │
│  └───────────┘  └───────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↓ HTTP API
┌─────────────────────────────────────────────────────┐
│            桥接服务层 (MCP Bridge Server)            │
│            Python FastAPI (localhost:3849)          │
└─────────────────────────────────────────────────────┘
                        ↓ Stdio/SSE
┌─────────────────────────────────────────────────────┐
│              MCP 服务层 (MCP Servers)                │
│     文件系统、数据库、API 调用等工具提供者            │
└─────────────────────────────────────────────────────┘
```

### 消息流转

#### 请求拦截和注入

```
用户发送消息
    ↓
Injector (MAIN world) 拦截 fetch/xhr
    ↓
通过 window.postMessage 发送到 Content Script
    ↓
Content Script 转发到 Background
    ↓
Background 调用桥接服务获取工具列表
    ↓
构建 System Prompt 注入到请求体
    ↓
返回修改后的请求体给 Injector
    ↓
Injector 继续发送请求
```

#### 响应解析和工具执行

```
AI 开始流式返回
    ↓
Injector 逐块解析 SSE/JSON
    ↓
检测到 <tool_code>...</tool_code>
    ↓
通过 postMessage 通知 Content Script
    ↓
Content Script 转发到 Background
    ↓
Background 调用桥接服务执行工具
    ↓
格式化工具结果
    ↓
注入到 AI 输入框并自动发送
```

## 核心模块详解

### 1. Injector (scripts/page_world/injector.js)

**运行环境:** MAIN world (与页面共享上下文)

**职责:**
- 使用 fetchhook/ajaxhook 拦截网络请求
- 修改请求体注入 System Prompt
- 解析响应流提取工具调用
- 通过 postMessage 与 Content Script 通信

**关键函数:**

```javascript
// 请求拦截
function handleRequest(config, handler) {
    // 发送到 Content Script 获取修改后的请求体
    const response = await sendMessageToContentScript({
        type: 'FETCH_REQUEST_BODY',
        payload: { url, body: config.body }
    });
    
    // 应用修改
    config.body = response.modifiedBody;
    return handler.next(config);
}

// 响应解析
function handleResponseChunk(chunk) {
    // 累积文本
    fullText += extractedText;
    
    // 检测工具调用
    const toolMatch = fullText.match(/<tool_code>(.*?)</tool_code>/);
    if (toolMatch) {
        sendMessageToContentScript({
            type: 'TOOL_DETECTED',
            payload: { toolCall: toolMatch[1] }
        });
    }
}
```

**通信协议:**

Injector → Content Script:
```javascript
window.postMessage({
    source: 'mcp-bridge-injector',
    direction: 'to-content-script',
    type: 'FETCH_REQUEST_BODY',
    payload: { url, body },
    requestId: '123'
}, '*');
```

Content Script → Injector:
```javascript
window.postMessage({
    source: 'mcp-bridge-content-script',
    requestId: '123',
    payload: { modifiedBody: '...' }
}, '*');
```

### 2. Content Script (scripts/content_script.js)

**运行环境:** Isolated world

**职责:**
- 桥接 Injector 和 Background Script
- 管理状态浮窗的生命周期
- 解析页面 DOM (UI 解析兜底)
- 注入工具结果到输入框

**关键函数:**

```javascript
// 处理来自 Injector 的消息
function handleInjectorMessage(data) {
    const { type, payload, requestId } = data;
    
    // 转发到 Background
    const response = await chrome.runtime.sendMessage({
        type, payload
    });
    
    // 返回给 Injector
    window.postMessage({
        source: 'mcp-bridge-content-script',
        requestId,
        payload: response
    }, '*');
}

// 处理来自浮窗的消息
function handlePanelMessage(data) {
    switch (data.type) {
        case 'MCP_BRIDGE_REDETECT_FROM_UI':
            chrome.runtime.sendMessage({ type: 'REDETECT_FROM_UI' });
            break;
        case 'MCP_BRIDGE_MANUAL_TOOL_PARSE':
            chrome.runtime.sendMessage({ 
                type: 'MANUAL_TOOL_PARSE',
                payload: data.payload
            });
            break;
    }
}

// UI DOM 解析
function parseUIContent(uiConfig) {
    const containers = document.querySelectorAll(uiConfig.messageContainer);
    const targetIndex = uiConfig.messageIndex < 0 
        ? containers.length + uiConfig.messageIndex 
        : uiConfig.messageIndex;
    
    const target = containers[targetIndex];
    if (!target) return '';
    
    const element = uiConfig.contentSelector
        ? target.querySelector(uiConfig.contentSelector)
        : target;
    
    return element?.innerText || '';
}
```

**浮窗管理:**

```javascript
// 只在 api_list 中配置的网站创建浮窗
async function main() {
    const currentHostname = window.location.hostname;
    const { api_list = [] } = await chrome.storage.local.get('api_list');
    const isSupported = api_list.some(item => item.hostname === currentHostname);
    
    if (!isSupported) {
        console.log('[MCP Bridge] Current site not in api_list, skipping panel creation');
        return;
    }
    
    // 创建浮窗
    statusPanel = new StatusPanel();
    statusPanel.create();
}
```

### 3. Background Script (scripts/background.js)

**运行环境:** Service Worker

**职责:**
- 核心业务逻辑处理
- 与桥接服务 API 交互
- 管理工具调用状态
- 协调请求修改和响应解析

**关键函数:**

```javascript
// 请求体修改
async function handleRequestBody(tabId, payload) {
    const { mcp_enabled } = await chrome.storage.local.get('mcp_enabled');
    if (!mcp_enabled) {
        return { modifiedBody: payload.body };
    }
    
    // 构建 System Prompt
    const services = await apiClient.getServices();
    const systemPrompt = promptBuilder.buildInitialPrompt(services);
    
    // 注入到请求体
    const modifiedBody = injectPromptToBody(payload.body, systemPrompt);
    return { modifiedBody };
}

// 响应完成处理
async function handleResponseComplete(tabId, payload) {
    let fullText = payload.fullText;
    
    // 尝试 UI 解析(兜底)
    if (shouldTryUI) {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'PARSE_UI_CONTENT',
            payload: { uiConfig: siteConfig.uiParsing }
        });
        if (response?.success && response.content) {
            fullText = response.content;
        }
    }
    
    // 检测工具调用
    const toolCallMatch = fullText.match(/<tool_code>(.*?)</tool_code>/);
    if (!toolCallMatch) return;
    
    const toolCall = parseJsonSafely(toolCallMatch[1]);
    if (toolCall.tool_name === 'list_tools_in_service') {
        await handleListTools(tabId, toolCall.arguments.service_name);
    } else {
        await handleExecuteTool(tabId, toolCall.tool_name, toolCall.arguments);
    }
}

// 工具执行
async function handleExecuteTool(tabId, toolName, args) {
    try {
        await updateUIPanel(tabId, 'EXECUTING', `执行工具: ${toolName}...`);
        
        const result = await apiClient.executeTool(toolName, args);
        const resultText = promptBuilder.formatToolResultForModel(toolName, result);
        
        await updateUIPanel(tabId, 'SUCCESS', '工具执行成功');
        await injectToolResult(tabId, resultText);
        
    } catch (error) {
        await handleToolError(tabId, toolName, error);
    }
}
```

**状态管理:**

```javascript
const tabStates = new Map();

async function getTabState(tabId) {
    return tabStates.get(tabId) || { status: 'IDLE' };
}

async function updateTabState(tabId, updates) {
    const current = await getTabState(tabId);
    tabStates.set(tabId, { ...current, ...updates });
}

async function clearTabState(tabId) {
    tabStates.delete(tabId);
}
```

### 4. Status Panel (ui/status_panel.js)

**运行环境:** Page context (通过 Shadow DOM 隔离)

**职责:**
- 显示工具调用状态
- 提供手动输入和重新检测按钮
- 通过 postMessage 与 Content Script 通信

**关键代码:**

```javascript
export class StatusPanel {
    create() {
        // 使用 Shadow DOM 隔离样式
        this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
        
        // 注入 CSS
        const styleLink = document.createElement('link');
        styleLink.href = chrome.runtime.getURL('ui/status_panel.css');
        this.shadowRoot.appendChild(styleLink);
        
        // 创建 HTML
        const panel = document.createElement('div');
        panel.className = 'mcp-status-panel';
        panel.innerHTML = `...`;
        this.shadowRoot.appendChild(panel);
        
        // 绑定事件
        this.bindEvents();
    }
    
    handleRedetect() {
        // 通过 postMessage 发送到 Content Script
        window.postMessage({
            type: 'MCP_BRIDGE_REDETECT_FROM_UI',
            source: 'mcp-bridge-panel'
        }, '*');
    }
    
    update({ status, message, details }) {
        const statusIcon = this.shadowRoot.querySelector('.status-icon');
        const statusText = this.shadowRoot.querySelector('.status-text');
        
        statusIcon.textContent = {
            'EXECUTING': '⏳',
            'SUCCESS': '✅',
            'ERROR': '❌',
            'IDLE': '⚪'
        }[status];
        
        statusText.innerHTML = message;
        
        if (details) {
            // 显示详情
        }
    }
}
```

## API 模块

### api_client.js

封装所有与桥接服务的 HTTP 通信:

```javascript
const BASE_URL = 'http://localhost:3849';

async function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            const error = new Error(errorData.detail.error);
            error.details = errorData.detail;  // 保存完整错误
            throw error;
        }
        
        return await response.json();
    } finally {
        clearTimeout(id);
    }
}

export async function getServices() {
    const data = await fetchWithTimeout(`${BASE_URL}/tools`);
    return data.services;
}

export async function getToolsByServer(serverName) {
    const data = await fetchWithTimeout(`${BASE_URL}/tools?serverName=${serverName}`);
    return data.tools;
}

export async function executeTool(toolName, args) {
    const data = await fetchWithTimeout(`${BASE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, arguments: args })
    }, 120000);
    
    return data.result;
}
```

### prompt_builder.js

构建和格式化 Prompt:

```javascript
export function buildInitialPrompt(services) {
    const serviceList = services.map(s => 
        `- **${s.name}**: ${s.description}`
    ).join('\n');
    
    return `
# 工具调用指南

你可以通过输出 <tool_code>...</tool_code> 来调用工具。

当前可用的服务:
${serviceList}

使用 list_tools_in_service 查询具体工具。
    `.trim();
}

export function formatToolResultForModel(toolName, result) {
    return `
# 工具执行结果

**工具名称**: \`${toolName}\`
**执行结果**:
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

现在请基于以上结果继续回答。
    `.trim();
}

export function formatToolErrorForModel(toolName, errorMessage) {
    return `
# 工具执行失败

**工具名称**: \`${toolName}\`
**错误信息**: ${errorMessage}

请分析错误原因。你可以尝试修正参数后重新调用该工具。
    `.trim();
}
```

## 配置系统

### chrome.storage.local

扩展使用 Chrome 的本地存储保存配置:

```javascript
// 读取配置
const { api_list } = await chrome.storage.local.get('api_list');
const { mcp_enabled } = await chrome.storage.local.get('mcp_enabled');

// 保存配置
await chrome.storage.local.set({ mcp_enabled: true });
await chrome.storage.local.set({ api_list: [...] });
```

### 初始化

Background script 在启动时加载配置:

```javascript
chrome.runtime.onInstalled.addListener(async () => {
    // 加载默认 api_list
    const response = await fetch(chrome.runtime.getURL('config/api_list.json'));
    const defaultApiList = await response.json();
    
    // 如果没有配置,使用默认值
    const { api_list } = await chrome.storage.local.get('api_list');
    if (!api_list) {
        await chrome.storage.local.set({ 
            api_list: defaultApiList,
            mcp_enabled: true
        });
    }
});
```

## 调试技巧

### 1. 日志级别

所有日志都有前缀标识来源:

```javascript
console.log('[MCP Bridge] Message');           // 一般信息
console.warn('[MCP Bridge] Warning');         // 警告
console.error('[MCP Bridge] Error');          // 错误
console.log('[MCP Bridge] 🔧 Tool detected'); // 重要事件
```

### 2. 断点调试

在 Chrome DevTools 中设置断点:

- **Injector:** Sources → Page → injector.js
- **Content Script:** Sources → Content scripts → content_script.js  
- **Background:** Sources → Service worker → background.js

### 3. 消息跟踪

查看 postMessage 通信:

```javascript
// 在 Injector 中
window.addEventListener('message', (e) => {
    console.log('[DEBUG] Message:', e.data);
});
```

### 4. 网络抓包

- 使用 Network 标签查看请求修改
- 使用 Preserve log 保留跨页面日志
- 过滤 XHR/Fetch 类型查看 API 调用

### 5. Storage 检查

在 DevTools → Application → Storage → Local Storage 查看存储的配置

## 贡献指南

### 添加新平台支持

1. **抓包分析**
   - 打开目标 AI 网站
   - 发送消息,在 Network 中找到聊天 API
   - 分析请求体和响应体结构

2. **添加配置**
   ```json
   {
     "name": "new_platform",
     "hostname": "example.com",
     "api": ["/api/chat"],
     "response": {
       "type": "sse",
       "contentPaths": ["data.message"]
     },
     "input": {
       "selector": "#input",
       "submitKey": "Enter"
     }
   }
   ```

3. **测试**
   - 重新加载扩展
   - 刷新 AI 网站
   - 测试工具调用

### 代码风格

- 使用 ES6+ 语法
- 函数名使用驼峰命名
- 添加 JSDoc 注释
- 保持代码简洁清晰

### 提交 PR

1. Fork 项目
2. 创建特性分支
3. 提交代码并推送
4. 创建 Pull Request
5. 等待 Review

## 常见问题

### Q: 为什么要用 MAIN world 注入?

**A:** 只有 MAIN world 才能访问页面的原生 fetch/XMLHttpRequest,才能拦截网络请求

### Q: Shadow DOM 有什么作用?

**A:** 隔离浮窗的样式,防止与页面 CSS 冲突

### Q: 为什么用 postMessage 而不是直接调用?

**A:** Injector (MAIN) 和 Content Script (Isolated) 在不同的上下文,不能直接通信,只能通过 postMessage

### Q: Service Worker 的限制是什么?

**A:** 
- 不能直接操作 DOM
- 不能使用 window 对象
- 会在空闲时被浏览器停止

## 相关资源

- [Chrome Extension 文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [MCP 协议规范](https://modelcontextprotocol.io/docs)
