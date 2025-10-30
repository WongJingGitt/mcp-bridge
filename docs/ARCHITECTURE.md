# MCP Bridge 架构设计文档

## 目录

- [概述](#概述)
- [三层架构设计](#三层架构设计)
- [核心组件详解](#核心组件详解)
- [数据流程](#数据流程)
- [关键技术决策](#关键技术决策)
- [扩展性设计](#扩展性设计)

---

## 概述

MCP Bridge 采用**三层架构**设计，将浏览器扩展、桥接服务和 MCP 工具服务解耦，实现了灵活、可扩展的工具调用系统。

### 设计目标

1. **解耦性**: 各层独立运行，互不干扰
2. **可扩展性**: 轻松添加新平台、新工具
3. **容错性**: 多层保障机制确保服务稳定
4. **透明性**: 用户无感知的工具调用体验

---

## 三层架构设计

```
┌─────────────────────────────────────────────────────────┐
│                  第一层：浏览器扩展层                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  页面脚本   │  │  内容脚本    │  │  后台脚本    │   │
│  │ (Page World)│  │(Content Script)│ │(Background)  │   │
│  └─────────────┘  └──────────────┘  └──────────────┘   │
│         │                │                   │           │
│         └────────────────┴───────────────────┘           │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTP/REST API
┌──────────────────────────▼───────────────────────────────┐
│               第二层：本地桥接服务层 (Flask)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ API 网关     │  │ 配置管理器   │  │ 服务管理器   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │ MCP Protocol (stdio)
┌──────────────────────────▼───────────────────────────────┐
│                  第三层：MCP 工具服务层                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ filesystem   │  │     git      │  │   自定义工具 │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 第一层：浏览器扩展层

**职责**
- 拦截 AI 平台的网络请求
- 注入工具调用提示词
- 解析 AI 响应中的工具调用指令
- 显示工具执行状态和结果

**技术栈**
- JavaScript (ES6+)
- Chrome Extension API (Manifest V3)
- Fetch/XHR Hooks
- DOM 操作

### 第二层：桥接服务层

**职责**
- 提供 RESTful API 接口
- 管理 MCP 工具服务的生命周期
- 进行 MCP ↔ HTTP 协议转换
- 处理配置文件的读写和热重载

**技术栈**
- Python 3.8+
- Flask (Web 框架)
- MCP Python SDK
- 进程管理

### 第三层：MCP 工具服务层

**职责**
- 实现具体功能（文件操作、网络请求等）
- 遵循 MCP 协议规范
- 独立运行，可随时启停

**技术栈**
- 任意语言（Python、Node.js、Rust 等）
- 遵循 MCP 协议标准

---

## 核心组件详解

### 1. 浏览器扩展层组件

#### 1.1 页面脚本 (Page World)

运行在网页的主 JavaScript 上下文中，负责拦截网络请求。

**核心文件**
- `scripts/page_world/injector.js` - 脚本注入器
- `scripts/page_world/fetchhook.js` - Fetch API 拦截器
- `scripts/page_world/ajaxhook.min.js` - XMLHttpRequest 拦截器

**工作原理**
```javascript
// 拦截 Fetch API
window.fetch = new Proxy(originalFetch, {
  apply: async (target, thisArg, args) => {
    // 1. 检查请求是否命中 AI 平台 API
    // 2. 提取请求体
    // 3. 发送到 content script 处理
    // 4. 等待修改后的请求体
    // 5. 继续原始请求
  }
});
```

**消息流**
```
Page World → Content Script → Background → Page World
```

#### 1.2 内容脚本 (Content Script)

运行在隔离的 JavaScript 上下文中，作为页面脚本和后台脚本之间的桥梁。

**核心文件**
- `scripts/content_script.js`

**职责**
1. 接收来自页面脚本的消息，转发到后台脚本
2. 接收来自后台脚本的 UI 更新指令
3. 管理状态面板的生命周期
4. 执行智能输入注入

**关键功能**
```javascript
// 消息转发
window.addEventListener('message', (event) => {
  if (event.data.source === 'mcp-bridge-injector') {
    chrome.runtime.sendMessage(event.data, (response) => {
      window.postMessage({
        source: 'mcp-bridge-content-script',
        requestId: event.data.requestId,
        payload: response.payload
      }, '*');
    });
  }
});
```

#### 1.3 后台脚本 (Background)

运行在扩展的后台 Service Worker 中，负责核心业务逻辑。

**核心文件**
- `scripts/background.js`

**核心流程**
1. **请求拦截与修改** (`handleRequestBody`)
   - 检查是否是新对话
   - 构建并注入 System Prompt
   - 支持多路径注入

2. **响应解析** (`handleResponseChunk`, `handleResponseComplete`)
   - 实时解析流式响应
   - 检测工具调用指令
   - 去重防止重复触发

3. **工具执行** (`handleExecuteTool`, `handleListTools`)
   - 调用桥接服务 API
   - 格式化工具结果
   - 智能注入到输入框

4. **错误处理** (`handleToolError`)
   - 提取详细错误信息
   - 反馈给 AI 模型
   - 显示在状态面板

### 2. 模块化组件

#### 2.1 API 客户端 (`modules/api_client.js`)

封装所有与桥接服务的通信。

**核心方法**
```javascript
export async function getServices()       // 获取服务列表
export async function getToolsByServer()  // 获取服务的工具列表
export async function executeTool()       // 执行工具
export async function getConfig()         // 获取配置
export async function updateConfig()      // 更新配置
```

**特性**
- 自动超时控制
- 统一错误处理
- 动态端口配置

#### 2.2 提示词构建器 (`modules/prompt_builder.js`)

负责构建所有与 MCP 相关的 Prompt。

**核心方法**
```javascript
export function buildInitialPrompt(services)        // 构建初始 Prompt
export function buildReminderPrompt()               // 构建提醒 Prompt
export function formatToolResultForModel()          // 格式化工具结果
export function formatToolErrorForModel()           // 格式化错误信息
```

**设计原则**
- 纯函数，无副作用
- 清晰的结构化文本
- 易于模型理解的格式

#### 2.3 输入注入器 (`modules/input_injector.js`)

智能地将文本注入到各种类型的输入框并提交。

**支持的输入类型**
- `<textarea>` 元素
- `contenteditable` 元素
- 自定义输入组件

**智能提交**
- 支持多种提交方式（Enter、Ctrl+Enter、点击按钮）
- 自动等待 UI 更新
- 防止多次提交

### 3. UI 组件

#### 3.1 状态面板 (`ui/status_panel.js`)

常驻在页面右下角的浮窗，显示工具调用状态。

**核心功能**
- 实时状态更新
- 可折叠/展开
- 支持手动输入兜底
- 重新检测功能

**状态类型**
- `EXECUTING` - 执行中
- `SUCCESS` - 成功
- `ERROR` - 错误
- `IDLE` - 空闲

#### 3.2 确认对话框 (`ui/confirm_dialog.js`)

用于显示页面加载提示和重要操作确认。

**特性**
- 支持自定义标题、消息、按钮文本
- 支持"不再提示"选项
- 支持多种类型（default、warning、info）

### 4. 配置系统

#### 4.1 站点配置 (`config/api_list.json`)

定义支持的 AI 平台及其配置。

**核心字段**
- `name`: 平台标识
- `hostname`: 域名
- `api`: API 路径列表
- `promptPath`: Prompt 注入路径
- `response`: 响应解析配置
- `uiParsing`: UI 解析配置
- `input`: 输入框配置
- `newConversationFlag`: 新对话判断规则

#### 4.2 MCP 服务配置

存储在系统目录的 `mcp-config.json`。

**配置位置**
- Windows: `%APPDATA%\mcp-bridge\config\mcp-config.json`
- macOS: `~/Library/Application Support/mcp-bridge/config/mcp-config.json`
- Linux: `~/.config/mcp-bridge/config/mcp-config.json`

**格式**
```json
{
  "mcpServers": {
    "service_name": {
      "enabled": true,
      "command": "executable",
      "args": ["arg1", "arg2"],
      "description": "服务描述"
    }
  }
}
```

---

## 数据流程

### 1. 新对话开始流程

```
用户在 AI 平台发起新对话
        ↓
页面脚本拦截 Fetch/XHR 请求
        ↓
后台脚本判断为新对话
        ↓
调用桥接服务获取工具列表
        ↓
构建 System Prompt 并注入到请求体
        ↓
请求继续发送到 AI 平台
        ↓
状态面板显示"System Prompt 已注入"
```

### 2. 工具调用流程

```
AI 输出包含 <tool_code> 标签的响应
        ↓
后台脚本实时解析流式响应
        ↓
检测到完整的工具调用指令
        ↓
去重检查（防止重复触发）
        ↓
判断工具类型
        ├─ list_tools_in_service
        │       ↓
        │  调用桥接服务获取工具列表
        │       ↓
        │  格式化为 JSON 数组
        │
        └─ 其他工具
                ↓
           调用桥接服务执行工具
                ↓
           获取执行结果
        ↓
格式化结果为 Markdown
        ↓
智能注入到输入框并自动提交
        ↓
状态面板显示执行状态
```

### 3. 四层保障流程

```
尝试从 API 解析工具调用
        ↓
     成功？ ─── 是 ──→ 执行工具
        ↓ 否
尝试从 UI DOM 解析
        ↓
     成功？ ─── 是 ──→ 执行工具
        ↓ 否
用户点击"重新检测"按钮
        ↓
从最后一条消息重新解析
        ↓
     成功？ ─── 是 ──→ 执行工具
        ↓ 否
用户复制粘贴到手动输入框
        ↓
解析并执行工具
```

---

## 关键技术决策

### 1. 为什么使用三层架构？

**问题**: 如何让浏览器中的 AI 调用本地工具？

**方案对比**

| 方案 | 优点 | 缺点 |
|------|------|------|
| 浏览器扩展直接调用工具 | 简单 | 受浏览器安全限制，无法执行本地程序 |
| 浏览器扩展 + Native Messaging | 可调用本地程序 | 配置复杂，跨平台支持困难 |
| **浏览器扩展 + HTTP 服务 + MCP** | 解耦灵活，易扩展 | 需要启动额外服务 |

**选择理由**: HTTP 服务作为中间层，既解决了浏览器安全限制，又通过 MCP 协议实现了工具生态的标准化。

### 2. 为什么使用 Manifest V3？

**背景**: Chrome 正在淘汰 Manifest V2。

**优势**
- Service Worker 比 Background Page 更轻量
- 更强的安全性和隐私保护
- 面向未来的长期支持

**挑战与解决**
- ❌ 无法直接注入脚本到 MAIN world
- ✅ 通过 `world: "MAIN"` 配置解决

### 3. 为什么需要四层保障机制？

**问题**: SSE 流式响应在不同平台的解析成功率不同。

**统计数据** (基于实测)
- DeepSeek: API 解析成功率 ~60%，UI 解析成功率 ~95%
- 通义千问: API 解析成功率 ~80%，UI 解析成功率 ~99%
- 豆包: API 解析成功率 ~70%，UI 解析成功率 ~90%

**解决方案**: 多层保障，确保最终成功率接近 100%。

### 4. 为什么使用智能输入注入而非页面刷新？

**旧方案**: 将工具结果存储，然后刷新页面触发注入。

**问题**
- 用户体验差（页面闪烁）
- 对话历史可能丢失
- 不适用于单页应用

**新方案**: 直接将结果注入到输入框并模拟提交。

**优势**
- 无缝体验
- 保留对话历史
- 支持所有平台

### 5. 为什么支持多路径注入？

**背景**: 不同 AI 平台的请求体结构不同。

**示例**
```javascript
// 腾讯元宝同时使用两个字段
"promptPath": ["prompt", "displayPrompt"]

// 后台脚本会向两个路径都注入 Prompt
for (const path of promptPaths) {
  setByPath(bodyJson, path, finalPrompt, siteConfig);
}
```

**优势**: 无需研究平台的内部逻辑，通过配置即可覆盖所有可能的路径。

---

## 扩展性设计

### 1. 添加新平台支持

只需在 `config/api_list.json` 中添加配置，无需修改代码。

**步骤**
1. 分析目标平台的网络请求
2. 确定 API 路径和 Prompt 注入路径
3. 配置响应解析规则
4. 配置输入框选择器

**示例**: 添加 Claude Web 支持
```json
{
  "name": "claude",
  "hostname": "claude.ai",
  "label": "Claude",
  "api": ["/api/chat"],
  "promptPath": "prompt",
  "response": {
    "type": "sse",
    "contentPaths": ["completion"]
  },
  "input": {
    "selector": "div[contenteditable='true']",
    "submitKey": "Enter"
  }
}
```

### 2. 添加新的 MCP 工具

只需修改 `mcp-config.json`，桥接服务会自动加载。

**步骤**
1. 获取 MCP 工具的可执行文件或包名
2. 添加到配置文件
3. 重启桥接服务或调用 `/reload` API

**示例**: 添加 Postgres 工具
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/db"],
      "description": "PostgreSQL 数据库访问"
    }
  }
}
```

### 3. 自定义 Prompt 模板

通过修改 `modules/prompt_builder.js` 中的模板函数。

**扩展点**
- `buildInitialPrompt()` - 初始 Prompt
- `buildReminderPrompt()` - 提醒 Prompt
- `formatToolResultForModel()` - 工具结果格式化
- `formatToolErrorForModel()` - 错误信息格式化

### 4. 添加新的 UI 组件

所有 UI 组件都是模块化的，可以独立开发和测试。

**示例**: 添加工具历史面板
```javascript
// ui/tool_history.js
export class ToolHistory {
  constructor() {
    this.history = [];
  }
  
  add(toolName, args, result) {
    this.history.push({ toolName, args, result, timestamp: Date.now() });
  }
  
  render() {
    // 渲染历史记录 UI
  }
}
```

### 5. 扩展桥接服务 API

桥接服务使用 Flask，添加新 API 非常简单。

**示例**: 添加工具搜索 API
```python
@app.route('/search-tools', methods=['GET'])
def search_tools():
    query = request.args.get('query', '')
    # 实现搜索逻辑
    return jsonify({'success': True, 'results': results})
```

---

## 性能优化

### 1. 请求拦截优化

- **问题**: 拦截所有请求会影响性能
- **优化**: 只拦截命中 API 列表的请求

```javascript
// 快速路径匹配
if (!apis.some(api => url.includes(api))) {
  return; // 不拦截
}
```

### 2. 响应解析优化

- **问题**: 每个 SSE chunk 都会触发解析
- **优化**: 去重机制，避免重复处理

```javascript
// 检查是否已经处理过这个工具调用
if (state.currentToolCall === toolCallMatch[0]) {
  return; // 跳过
}
```

### 3. 配置缓存优化

- **问题**: 频繁读取 chrome.storage 影响性能
- **优化**: 在 background.js 中缓存配置

```javascript
let cachedApiList = null;

async function getApiList() {
  if (!cachedApiList) {
    const { api_list } = await chrome.storage.local.get('api_list');
    cachedApiList = api_list;
  }
  return cachedApiList;
}
```

---

## 安全性考虑

### 1. 工具权限控制

- MCP 工具运行在本地，拥有完整的系统权限
- **建议**: 仅启用信任的 MCP 工具
- **未来**: 计划添加工具权限白名单机制

### 2. 跨域通信安全

- 使用 `window.postMessage` 时验证消息来源

```javascript
if (event.source !== window || !event.data.source === 'mcp-bridge-injector') {
  return; // 忽略非法消息
}
```

### 3. 配置文件安全

- 配置文件存储在用户目录，其他用户无法访问
- 支持加密配置（未来功能）

---

## 未来架构演进

### 1. 云端配置同步

- 支持多设备配置同步
- 通过 Chrome Sync Storage 实现

### 2. 插件市场

- 一键安装 MCP 工具
- 社区贡献的工具配置库

### 3. 工具编排

- 支持多工具协作
- 工作流可视化编辑器

### 4. 性能监控

- 工具调用耗时统计
- 成功率分析
- 错误日志聚合

---

## 总结

MCP Bridge 的三层架构实现了：

✅ **解耦**: 各层独立，易于维护  
✅ **扩展**: 配置化添加新平台和工具  
✅ **稳定**: 四层保障确保高成功率  
✅ **透明**: 用户无感知的工具调用  

通过清晰的职责划分和模块化设计，MCP Bridge 为网页版 AI 提供了强大而灵活的本地工具调用能力。
