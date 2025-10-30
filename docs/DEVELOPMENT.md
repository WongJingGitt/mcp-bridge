# MCP Bridge 开发指南

## 目录

- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [调试技巧](#调试技巧)
- [添加新平台支持](#添加新平台支持)
- [开发工作流](#开发工作流)
- [代码规范](#代码规范)
- [常见问题](#常见问题)

---

## 开发环境设置

### 前置要求

1. **浏览器**: Chrome/Edge (版本 88+)
2. **代码编辑器**: VS Code (推荐)
3. **版本控制**: Git

### 安装开发环境

#### 1. 克隆项目

```bash
git clone https://github.com/WongJingGitt/mcp_bridge.git
cd mcp_bridge
```

#### 2. 安装浏览器扩展（开发模式）

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录

#### 3. 配置桥接服务

参考 [MCPBridgeServer](https://github.com/WongJingGitt/mcp_bridge_server) 项目的文档。

#### 4. VS Code 推荐扩展

安装以下扩展以提升开发体验：

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",       // JavaScript 代码检查
    "esbenp.prettier-vscode",        // 代码格式化
    "ms-vscode.vscode-js-debug",     // JavaScript 调试
    "christian-kohler.path-intellisense" // 路径自动补全
  ]
}
```

---

## 项目结构

```
mcp_bridge/
├── manifest.json              # 扩展清单文件
├── config/
│   └── api_list.json          # AI 平台配置
├── modules/
│   ├── api_client.js          # 桥接服务 API 客户端
│   ├── prompt_builder.js      # Prompt 构建器
│   ├── input_injector.js      # 输入框注入器
│   └── compareVersion.js      # 版本比较工具
├── scripts/
│   ├── background.js          # 后台脚本（核心逻辑）
│   ├── content_script.js      # 内容脚本（页面交互）
│   └── page_world/            # 页面世界脚本
│       ├── injector.js        # 脚本注入器
│       ├── fetchhook.js       # Fetch 拦截器
│       └── ajaxhook.min.js    # XHR 拦截器
├── ui/
│   ├── status_panel.js        # 状态面板组件
│   ├── status_panel.css       # 状态面板样式
│   ├── confirm_dialog.js      # 确认对话框组件
│   └── confirm_dialog.css     # 确认对话框样式
├── options/
│   ├── options.html           # 设置页面
│   ├── options.js             # 设置页面逻辑
│   └── options.css            # 设置页面样式
├── popup/
│   ├── popup.html             # 弹出窗口
│   ├── popup.js               # 弹出窗口逻辑
│   └── popup.css              # 弹出窗口样式
└── icons/                     # 图标资源
```

### 核心文件说明

| 文件 | 职责 | 修改频率 |
|------|------|----------|
| `manifest.json` | 扩展配置 | 低 |
| `config/api_list.json` | 平台配置 | 高（添加新平台） |
| `scripts/background.js` | 核心业务逻辑 | 中 |
| `modules/api_client.js` | API 通信 | 低 |
| `modules/prompt_builder.js` | Prompt 模板 | 中 |
| `ui/status_panel.js` | UI 组件 | 低 |

---

## 调试技巧

### 1. 后台脚本调试

**步骤**
1. 访问 `chrome://extensions/`
2. 找到 MCP Bridge，点击"Service Worker"链接
3. 打开 DevTools，切换到 Console 标签

**查看日志**
```javascript
// background.js 中的日志会显示在这里
console.log('[MCP Bridge] Debug info:', data);
```

**断点调试**
1. 在 DevTools 的 Sources 标签中找到 `background.js`
2. 设置断点
3. 触发相应操作

### 2. 内容脚本调试

**步骤**
1. 在目标页面（如 DeepSeek Chat）打开 DevTools（F12）
2. 切换到 Console 标签
3. 过滤日志：输入 `MCP Bridge`

**查看注入的脚本**
1. 打开 DevTools → Sources
2. 展开 `Content scripts`
3. 查找 `content_script.js`

### 3. 页面脚本调试

**步骤**
1. 在目标页面打开 DevTools
2. Sources → Page → top
3. 查找 `fetchhook.js` 或 `injector.js`

**断点调试网络拦截**
```javascript
// fetchhook.js 中设置断点
window.fetch = new Proxy(originalFetch, {
  apply: async (target, thisArg, args) => {
    debugger; // 在这里设置断点
    // ...
  }
});
```

### 4. 网络请求调试

**查看拦截的请求**
1. DevTools → Network
2. 过滤：输入 AI 平台的 API 路径（如 `/api/v0/chat/completion`）
3. 查看请求头、请求体、响应

**查看桥接服务请求**
1. 过滤：输入 `localhost:3849`
2. 查看工具调用的请求和响应

### 5. 使用 Chrome DevTools Protocol

**高级调试**: 监听所有网络请求

```javascript
// background.js
chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
  chrome.debugger.sendCommand({ tabId: tabId }, "Network.enable");
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Network.responseReceived") {
    console.log('Response:', params);
  }
});
```

### 6. 日志级别控制

**环境变量配置**（未来功能）
```javascript
// background.js
const DEBUG_LEVEL = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

let currentLevel = DEBUG_LEVEL.DEBUG; // 开发模式

function log(level, message, data) {
  if (level <= currentLevel) {
    console.log(`[MCP Bridge][${level}]`, message, data);
  }
}
```

---

## 添加新平台支持

### 完整步骤指南

#### 第一步：分析目标平台

1. **访问目标 AI 平台**（如 Claude Web）
2. **打开 DevTools → Network**
3. **发起一次对话，观察网络请求**

**需要找到的信息**
- API 路径（如 `/api/chat`）
- 请求方法（通常是 POST）
- 请求体结构
- 响应格式（JSON、SSE、Text）

#### 第二步：确定关键路径

**1. Prompt 注入路径**

查看请求体 JSON，找到用户消息的位置。

**示例 1**: 简单路径
```json
{
  "prompt": "用户的消息",  // ← 注入路径: "prompt"
  "model": "gpt-4"
}
```

**示例 2**: 嵌套路径
```json
{
  "messages": [
    {
      "role": "user",
      "content": "用户的消息"  // ← 注入路径: "messages.0.content"
    }
  ]
}
```

**示例 3**: JSON 字符串字段
```json
{
  "messages": [
    {
      "content": "{\"text\": \"用户的消息\"}"  // ← 需要解析 JSON 字符串
    }
  ]
}
```
路径: `"messages.0.content.text"`，设置 `isJsonString: true`

**2. 响应内容路径**

查看响应数据，找到 AI 回复的位置。

**示例 1**: SSE 格式
```
data: {"content": "AI 的回复"}

data: {"content": "继续回复"}
```
contentPaths: `["content"]`

**示例 2**: 多层嵌套
```
data: {"choices": [{"delta": {"content": "AI 的回复"}}]}
```
contentPaths: `["choices.0.delta.content"]`

**3. 输入框选择器**

在页面上找到输入框元素。

**方法 1**: 使用 DevTools
1. 点击 Elements 标签左上角的选择工具
2. 点击输入框
3. 查看元素的 ID、class、或其他属性

**方法 2**: 在 Console 执行
```javascript
// 测试选择器是否正确
document.querySelector('textarea');
document.querySelector('#prompt-textarea');
document.querySelector('[contenteditable="true"]');
```

#### 第三步：编写配置

在 `config/api_list.json` 中添加配置。

**最小配置模板**
```json
{
  "name": "platform_id",
  "hostname": "platform.example.com",
  "label": "平台名称",
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
```

**完整配置模板**（包含可选字段）
```json
{
  "name": "platform_id",
  "hostname": "platform.example.com",
  "label": "平台名称",
  "api": ["/api/chat", "/api/v2/chat"],
  "promptPath": "messages.0.content",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": true,
  "skipRequestModification": false,
  "response": {
    "type": "sse",
    "format": "data: {json}\\n\\n",
    "contentPaths": ["choices.0.delta.content", "content"],
    "filterRules": {
      "pathField": "type",
      "excludePatterns": ["metadata"]
    }
  },
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".message",
    "messageIndex": -1,
    "contentSelector": ".markdown"
  },
  "input": {
    "selector": "textarea, [contenteditable='true']",
    "submitKey": "Enter",
    "submitModifiers": ["Ctrl"],
    "submitDelay": 1600
  },
  "newConversationFlag": {
    "from": "requestBody",
    "path": "conversation_id",
    "checkExists": false
  },
  "onLoadTip": {
    "message": ["提示信息第一行", "提示信息第二行"],
    "dontShowAgainText": "不再提示"
  }
}
```

#### 第四步：更新 manifest.json

添加新平台的域名到权限列表。

```json
{
  "host_permissions": [
    "https://platform.example.com/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://platform.example.com/*"
      ],
      "js": [
        "scripts/page_world/fetchhook.js",
        "scripts/page_world/ajaxhook.min.js",
        "scripts/page_world/injector.js"
      ],
      "run_at": "document_start",
      "world": "MAIN"
    }
  ]
}
```

#### 第五步：测试

**测试清单**

- [ ] 新对话时，System Prompt 是否正确注入？
  - 打开 DevTools → Network
  - 发起新对话
  - 查看请求体是否包含 MCP Prompt

- [ ] 工具调用是否能正确检测？
  - 让 AI 调用工具（如"列出 filesystem 服务的工具"）
  - 查看状态面板是否显示"执行中"

- [ ] 工具结果是否正确反馈？
  - 工具执行完成后
  - 输入框是否自动填入结果并发送

- [ ] UI 解析是否正常？
  - 如果配置了 `uiParsing`
  - 测试从 DOM 解析是否成功

- [ ] 手动输入是否可用？
  - 复制包含 `<tool_code>` 的文本
  - 粘贴到状态面板的输入框
  - 点击"发送到 MCP"

#### 第六步：优化配置

**常见问题与优化**

1. **System Prompt 重复注入**
   - 问题：每次发送消息都注入
   - 解决：正确配置 `newConversationFlag`

2. **工具调用检测失败**
   - 问题：API 解析成功率低
   - 解决：启用 UI 解析，设置 `priority: "ui"`

3. **输入框无法自动提交**
   - 问题：提交键不正确
   - 解决：尝试不同的 `submitKey` 和 `submitModifiers`

4. **页面加载慢**
   - 问题：脚本注入时机过早
   - 解决：调整 `submitDelay`

---

## 开发工作流

### 典型开发流程

```
1. 创建功能分支
   ↓
2. 修改代码
   ↓
3. 重新加载扩展
   ↓
4. 测试功能
   ↓
5. 查看日志/调试
   ↓
6. 修复问题
   ↓
7. 提交代码
   ↓
8. 创建 Pull Request
```

### 热重载技巧

**方法 1**: 使用快捷键
1. 访问 `chrome://extensions/`
2. 找到 MCP Bridge
3. 点击刷新图标（或使用快捷键 `Ctrl+R`）

**方法 2**: 使用扩展管理工具
- 安装 [Extensions Reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid)
- 一键重载所有扩展

**方法 3**: 编程式重载
```javascript
// 在 popup.js 或 options.js 中添加重载按钮
document.getElementById('reloadBtn').addEventListener('click', () => {
  chrome.runtime.reload();
});
```

### 版本管理

**版本号规范**: 遵循语义化版本 (Semantic Versioning)

```
主版本号.次版本号.修订号

1.0.0 → 1.0.1  (修复 bug)
1.0.1 → 1.1.0  (添加新功能，向后兼容)
1.1.0 → 2.0.0  (破坏性变更)
```

**更新 manifest.json**
```json
{
  "version": "1.1.0"
}
```

**创建 Git Tag**
```bash
git tag -a v1.1.0 -m "Release version 1.1.0"
git push origin v1.1.0
```

---

## 代码规范

### JavaScript 编码规范

**1. 使用 ES6+ 语法**
```javascript
// ✅ 推荐
const result = await fetchData();
const { name, age } = user;

// ❌ 避免
var result = fetchData().then(...);
var name = user.name;
var age = user.age;
```

**2. 命名规范**
```javascript
// 变量和函数: camelCase
const userName = 'Alice';
function getUserData() {}

// 常量: UPPER_SNAKE_CASE
const API_TIMEOUT = 5000;

// 类: PascalCase
class StatusPanel {}
```

**3. 异步处理**
```javascript
// ✅ 推荐: 使用 async/await
async function handleRequest() {
  try {
    const data = await fetchData();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}

// ❌ 避免: 回调地狱
fetchData(function(data) {
  processData(data, function(result) {
    saveResult(result, function() {
      // ...
    });
  });
});
```

**4. 错误处理**
```javascript
// ✅ 推荐: 详细的错误信息
try {
  const result = await executeTool(toolName, args);
} catch (error) {
  console.error(`[MCP Bridge] Failed to execute tool ${toolName}:`, error);
  throw new Error(`工具 ${toolName} 执行失败: ${error.message}`);
}

// ❌ 避免: 静默失败
try {
  await executeTool(toolName, args);
} catch (error) {
  // 什么都不做
}
```

**5. 注释规范**
```javascript
/**
 * 执行 MCP 工具
 * @param {string} toolName - 工具名称
 * @param {Object} args - 工具参数
 * @returns {Promise<any>} - 工具执行结果
 * @throws {Error} - 当工具执行失败时
 */
async function executeTool(toolName, args) {
  // 实现...
}
```

### JSON 配置规范

**1. 使用 2 空格缩进**
```json
{
  "name": "deepseek",
  "api": [
    "/api/v0/chat/completion"
  ]
}
```

**2. 添加注释**（注意：标准 JSON 不支持注释，但可以在文档中说明）
```javascript
// config/api_list.json
[
  {
    // 平台唯一标识
    "name": "deepseek",
    
    // 域名（不包含协议）
    "hostname": "chat.deepseek.com",
    
    // ...
  }
]
```

### Git 提交规范

**提交消息格式**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型 (type)**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**
```
feat(config): add support for Claude Web

- Add Claude configuration to api_list.json
- Update manifest.json with claude.ai domain
- Test tool calling on Claude platform

Closes #123
```

---

## 常见问题

### Q1: 修改代码后不生效？

**A**: 需要重新加载扩展。
1. 访问 `chrome://extensions/`
2. 找到 MCP Bridge，点击刷新图标
3. 刷新测试页面

### Q2: 无法调试 background.js？

**A**: Service Worker 可能已停止。
1. 访问 `chrome://extensions/`
2. 点击"Service Worker"链接重新启动
3. 现在可以看到 Console 日志

### Q3: content_script.js 无法访问 window 对象？

**A**: Content Script 运行在隔离环境，无法直接访问页面的 window。
- 解决：使用 `world: "MAIN"` 注入脚本到页面环境
- 或者：通过 `window.postMessage` 通信

### Q4: 如何模拟 SSE 响应测试？

**A**: 使用 Mock 服务器。
```javascript
// test-server.js
const express = require('express');
const app = express();

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.write('data: {"content": "Hello"}\n\n');
  setTimeout(() => {
    res.write('data: {"content": " World"}\n\n');
    res.end();
  }, 1000);
});

app.listen(3000);
```

### Q5: 配置更新后如何生效？

**A**: 
- `api_list.json`: 需要重新加载扩展
- `mcp-config.json`: 会自动热重载（桥接服务）

### Q6: 如何测试多个版本？

**A**: 使用不同的浏览器 Profile。
```bash
# Chrome
chrome.exe --user-data-dir="C:\temp\chrome-dev"

# Edge
msedge.exe --user-data-dir="C:\temp\edge-dev"
```

### Q7: 性能分析？

**A**: 使用 Chrome DevTools Performance 标签。
1. 打开目标页面的 DevTools
2. 切换到 Performance
3. 点击 Record
4. 执行操作
5. 停止录制，分析结果

---

## 进阶主题

### 自定义 Prompt 模板

编辑 `modules/prompt_builder.js`:

```javascript
export function buildInitialPrompt(services) {
  // 自定义你的 Prompt 结构
  return `
你是一个增强版 AI 助手，拥有以下工具:
${services.map(s => `- ${s.name}: ${s.description}`).join('\n')}

使用工具时，输出:
<tool_code>{"tool_name": "...", "arguments": {...}}</tool_code>
`.trim();
}
```

### 添加新的 UI 组件

```javascript
// ui/my_component.js
export class MyComponent {
  constructor() {
    this.element = null;
  }
  
  create() {
    this.element = document.createElement('div');
    this.element.id = 'my-component';
    document.body.appendChild(this.element);
  }
  
  update(data) {
    this.element.textContent = data;
  }
  
  destroy() {
    this.element?.remove();
  }
}
```

### 扩展桥接服务 API

参考 [MCPBridgeServer 开发文档](https://github.com/WongJingGitt/mcp_bridge_server)。

---

## 相关资源

- [Chrome Extension 官方文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [MCP 协议规范](https://modelcontextprotocol.io)
- [Flask 官方文档](https://flask.palletsprojects.com/)

---

**Happy Coding! 🚀**

如有问题，欢迎在 [GitHub Issues](https://github.com/WongJingGitt/mcp_bridge/issues) 提问。
