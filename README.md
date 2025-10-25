# MCP Bridge 浏览器扩展

MCP Bridge 是一个浏览器扩展，通过本地桥接服务为网页版大语言模型提供强大的 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 工具调用能力。它支持多种主流 AI 平台，如 ChatGPT、通义千问、DeepSeek 等。

## 功能特性

- 🔄 **无缝集成**：自动识别并拦截主流 AI 平台的聊天请求
- 🛠️ **MCP 工具调用**：支持通过标准 MCP 协议调用本地工具
- 🌐 **多平台支持**：原生支持 DeepSeek、腾讯元宝、通义千问、ChatGPT、豆包、Grok 等平台
- 📦 **分层工具发现**：通过服务(Service)和工具(Tool)两层结构管理工具集
- 🎨 **可视化状态**：实时显示工具调用状态和结果
- 🎯 **多路径注入**：支持同时向请求体的多个字段注入 System Prompt
- 🛡️ **四层保障机制**：
  - API 解析 - 从网络请求中实时解析（主要方案）
  - UI DOM 解析 - 从页面内容中提取（自动兜底）
  - 重新检测 - 一键从最后消息重新检测（断点续传）
  - 手动输入 - 用户复制粘贴触发（最终兜底）
- ⚙️ **灵活配置**：可通过配置文件自定义支持的平台和工具

## 项目结构

```
mcp-bridge/
├── config/
│   └── api_list.json         # 支持的 AI 平台配置
├── modules/
│   ├── api_client.js         # 与本地桥接服务通信的客户端
│   └── prompt_builder.js     # 构建和格式化工俱调用相关的提示词
├── options/                  # 扩展选项页面
├── popup/                    # 扩展弹出窗口
├── scripts/
│   ├── background.js         # 扩展后台脚本，核心逻辑处理
│   ├── content_script.js     # 内容脚本，负责与页面交互
│   └── page_world/
│       └── injector.js       # 注入到页面主线程的脚本，拦截请求
├── ui/
│   ├── status_panel.js       # 工具调用状态面板 UI 组件
│   └── status_panel.css      # 状态面板样式
└── manifest.json             # 扩展清单文件
```

## 工作原理

MCP Bridge 采用三层架构设计：

1. **浏览器扩展层**：
   - 监听并拦截目标 AI 平台的聊天请求
   - 注入工具调用提示词到用户请求中
   - 解析模型返回的工具调用指令并执行
   - 显示工具调用状态和结果

2. **本地桥接服务层** ([mcp-bridge-server.js](https://github.com/))：
   - 运行在本地的 Node.js 服务 (端口 3849)
   - 管理和加载各种 MCP 工具服务
   - 提供 RESTful API 接口供浏览器扩展调用
   - 实现 MCP 协议与 HTTP 协议之间的转换

3. **MCP 工具服务层**：
   - 实际实现具体功能的独立程序
   - 遵循 MCP 协议与桥接服务通信
   - 可以是文件操作、网络请求、代码执行等各种类型的工具

## 安装和使用

### 1. 安装浏览器扩展

1. 在 Chrome/Edge 等 Chromium 内核浏览器中打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择本项目目录

### 2. 启动本地桥接服务

1. 确保已安装 Node.js (推荐 v18+)
2. 在 `mcp-bridge-server` 目录下运行:
   ```
   npm install
   node mcp-bridge-server.js
   ```
3. 服务将在 `http://localhost:3849` 启动

### 3. 配置 MCP 工具服务

1. 桥接服务启动时会在用户配置目录创建配置文件:
   - Windows: `%APPDATA%\mcp-bridge\config\mcp-config.json`
   - macOS: `~/Library/Application Support/mcp-bridge/config/mcp-config.json`
   - Linux: `~/.config/mcp-bridge/config/mcp-config.json`
2. 编辑配置文件，添加你的 MCP 工具服务信息:
   ```json
   {
     "mcpServers": {
       "example_service": {
         "enabled": true,
         "command": "path/to/your/mcp/server/executable",
         "args": ["--port", "8080"],
         "description": "服务描述",
         "env": {}
       }
     }
   }
   ```
3. 重启桥接服务或通过 API 重新加载配置

### 4. 在 AI 平台中使用

1. 打开任意支持的 AI 平台 (如 chat.deepseek.com)
2. 开始一个新的对话
3. 扩展会自动注入工具调用提示词
4. 按照提示调用工具:
   ```xml
   <tool_code>
   {
     "tool_name": "list_tools_in_service",
     "arguments": {
       "service_name": "your_service_name"
     }
   }
   </tool_code>
   ```
5. 查看右下角浮窗的工具执行状态

### 5. 使用重新检测功能（断点续传）

当页面刷新或自动检测失败时：

1. **确认配置** - 确保已正确配置 UI DOM 解析功能（见下方配置说明）
2. **点击重新检测** - 点击右下角浮窗标题栏的⏰图标
3. **等待检测** - 系统会从最后一条 UI 消息重新提取工具调用
4. **自动执行** - 检测到工具调用后自动执行

**适用场景：**
- 页面刷新后需要恢复工具执行
- AI 回复完成但未触发自动检测
- 检测失败需要重试

### 6. 使用手动输入功能（最终兜底）

当自动检测和重新检测都失败时：

1. **复制 AI 回复** - 选中包含 `<tool_code>` 的完整回复内容并复制
2. **打开浮窗** - 点击右下角"MCP Bridge"浮窗展开
3. **粘贴内容** - 在输入框中粘贴复制的内容
4. **点击发送** - 点击"发送到 MCP"按钮手动触发工具调用

## API 接口

本地桥接服务提供以下 RESTful API 接口:

- `GET /health` - 健康检查
- `GET /tools` - 获取所有服务列表
- `GET /tools?serverName=:name` - 获取指定服务的工具列表
- `POST /execute` - 执行工具
- `GET /config` - 获取当前配置
- `POST /config` - 更新配置并重载
- `POST /reload` - 重新加载配置
- `POST /reset-history` - 重置工具调用历史

## 开发指南

### 添加对新 AI 平台的支持

编辑 [config/api_list.json](config/api_list.json) 文件，添加新平台的配置:

```json
{
  "name": "平台标识",
  "hostname": "平台域名",
  "label": "平台名称",
  "api": ["API路径片段"],
  "promptPath": "请求体中提示词字段的路径",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": false,
  "response": {
    "type": "sse",
    "format": "data: {json}",
    "contentPaths": ["content", "delta.text", "text"],
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

**配置说明**：

- **`response`** - API 响应解析配置（主要方案）
  - `type` - 响应类型：`"sse"` | `"json"` | `"text"`
  - `contentPaths` - 内容提取路径数组
  - `filterRules` - 数据过滤规则（可选，用于跳过特定内容）

- **`uiParsing`** - UI DOM 解析配置（自动兜底）
  - `enabled` - 是否启用 UI 解析
  - `priority` - 优先级：`"api"` 或 `"ui"`
  - `messageContainer` - 消息容器的 CSS 选择器
  - `messageIndex` - 消息索引（`-1` 表示最后一条）
  - `contentSelector` - 内容元素的选择器（可选）

- **`input`** - 输入框注入配置
  - `selector` - 输入框的 CSS 选择器
  - `submitKey` - 提交按键
  - `submitModifiers` - 修饰键（如 `["Ctrl"]`）
  - `submitDelay` - 提交延迟（毫秒）

**详细配置指南**：请参阅 [响应解析配置指南](docs/RESPONSE_CONFIG_GUIDE.md)，了解如何通过抓包配置响应解析规则以及 UI DOM 解析。

### 配置 UI DOM 解析器

如果 API 解析经常失败，可以配置 UI DOM 解析作为兜底：

#### 步骤 1: 找到消息容器选择器

1. 打开浏览器开发者工具（F12）
2. 使用元素选择器（左上角箭头图标）
3. 点击页面上的最新消息
4. 在 Elements 面板查看该元素的 class 或 ID

#### 步骤 2: 测试选择器

在控制台运行：
```javascript
// 测试消息容器
document.querySelectorAll('.your-selector')

// 测试获取最后一条消息的内容
const containers = document.querySelectorAll('.your-selector');
const last = containers[containers.length - 1];
last.innerText
```

#### 步骤 3: 添加到配置

```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".your-selector",
    "messageIndex": -1
  }
}
```

### 自定义状态面板

状态面板的样式和行为可以通过修改 [ui/status_panel.css](ui/status_panel.css) 来定制。

## 📚 文档导航

> 💡 **文档总览:** 查看 [文档索引](docs/INDEX.md) 获取完整的文档导航和使用场景指引

### 核心文档
- [README.md](README.md) - 项目总览和快速开始
- [桥接服务 README](../mcp_bridge_server/README.md) - 服务端文档
- [架构设计文档](docs/ARCHITECTURE.md) - 系统架构与技术选型
- [开发者指南](docs/DEVELOPER_GUIDE.md) - 代码结构与开发指南

### 功能指南
- [兜底机制使用指南](docs/FALLBACK_GUIDE.md) - 四层保障机制详解
- [API 配置完全指南](docs/API_CONFIG_GUIDE.md) - api_list.json 配置说明
- [响应解析配置指南](docs/RESPONSE_CONFIG_GUIDE.md) - 响应解析和过滤规则
- [错误处理机制](docs/ERROR_HANDLING.md) - 错误处理流程和调试技巧
- [多路径注入示例](docs/MULTI_PROMPTPATH_EXAMPLE.md) - 多字段同时注入 Prompt

### 特性文档
- [重新检测功能](docs/REDETECT_FEATURE.md) - 断点续传实现说明
- [刷新 Prompt 功能](docs/REFRESH_PROMPT_FEATURE.md) - System Prompt 刷新机制
- [快速刷新指南](docs/REFRESH_PROMPT_QUICK_GUIDE.md) - 刷新功能快速上手
- [UI 现代化指南](docs/UI_MODERNIZATION_GUIDE.md) - 界面改进历史

## 许可证

[MIT License](LICENSE)

## 致谢

- [Model Context Protocol](https://modelcontextprotocol.io) - 为工具生态系统提供了标准化协议