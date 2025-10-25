# 🌉 MCP Bridge

<div align="center">

**为网页版 AI 赋能本地工具调用能力**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://www.google.com/chrome/)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-blue.svg)](https://modelcontextprotocol.io)
[![GitHub](https://img.shields.io/badge/GitHub-WongJingGitt-blue.svg)](https://github.com/WongJingGitt)

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [工作原理](#-工作原理) • [文档](#-文档导航) • [许可证](#-许可证)

</div>

---

## 📖 简介

MCP Bridge 是一个强大的浏览器扩展，通过本地桥接服务为网页版大语言模型提供 **[MCP (Model Context Protocol)](https://modelcontextprotocol.io)** 工具调用能力。

无需 API Key，无需付费订阅，只需在浏览器中安装插件，即可让 DeepSeek、通义千问、腾讯元宝等 AI 平台直接调用你的本地工具！

### 支持的 AI 平台

✅ **DeepSeek** | ✅ **通义千问** | ✅ **腾讯元宝** | ✅ **豆包**  
⏳ **ChatGPT** (适配中) | ⏳ **Grok** (适配中)

---

## ✨ 功能特性

### 核心能力

- 🔄 **无缝集成** - 自动识别并拦截主流 AI 平台的聊天请求
- 🛠️ **MCP 工具调用** - 支持通过标准 MCP 协议调用本地工具
- 🌐 **多平台支持** - 原生支持多个主流 AI 平台
- 📦 **分层工具管理** - 通过服务(Service)和工具(Tool)两层结构管理工具集
- 🎨 **可视化状态** - 实时显示工具调用状态和结果
- ⚙️ **灵活配置** - 可通过配置文件自定义支持的平台和工具

### 四层保障机制

确保工具调用永不失败：

1. **API 解析** - 从网络请求中实时解析（主要方案）
2. **UI DOM 解析** - 从页面内容中提取（自动兜底）
3. **重新检测** - 一键从最后消息重新检测（断点续传）
4. **手动输入** - 用户复制粘贴触发（最终兜底）

### 高级特性

- 🎯 **多路径注入** - 支持同时向请求体的多个字段注入 System Prompt
- 🔧 **智能配置合并** - 支持 3 种 JSON 格式，自动识别并增量合并
- 🚀 **动态端口配置** - 可在设置页面自定义桥接服务端口
- 🗑️ **服务管理** - 可视化启用/禁用/删除 MCP 服务
- 📝 **站点配置** - 为每个 AI 平台独立配置自动注入策略

---

## 🚀 快速开始

### 前置要求

- Chrome/Edge 等 Chromium 内核浏览器
- Python 3.8+ (如果使用源码运行桥接服务)

### 1️⃣ 安装浏览器扩展

1. 在浏览器中打开 `chrome://extensions/`
2. 启用 **"开发者模式"**（右上角开关）
3. 点击 **"加载已解压的扩展程序"**
4. 选择本项目的 `mcp_bridge` 目录

### 2️⃣ 启动桥接服务

#### 方式一：使用可执行文件（推荐）

1. 从 [Releases](https://github.com/WongJingGitt/mcp_bridge_server/releases) 下载 `mcp-bridge-server.exe`
2. 双击运行，服务将在 `http://localhost:3849` 启动

#### 方式二：使用源码运行

```bash
cd mcp_bridge_server
pip install -r requirements.txt
python utils/mcp_bridge.py
```

### 3️⃣ 配置 MCP 工具服务

#### 配置文件位置

- **Windows:** `%APPDATA%\mcp-bridge\config\mcp-config.json`
- **macOS:** `~/Library/Application Support/mcp-bridge/config/mcp-config.json`
- **Linux:** `~/.config/mcp-bridge/config/mcp-config.json`

#### 配置示例

```json
{
  "mcpServers": {
    "filesystem": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\"],
      "description": "文件系统访问工具"
    },
    "git": {
      "enabled": true,
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "C:\\myrepo"],
      "description": "Git 仓库管理工具"
    }
  }
}
```

#### 支持的配置格式

扩展支持 **3 种 JSON 格式**，方便从其他地方复制配置：

<details>
<summary><b>格式 1：完整配置</b></summary>

```json
{
  "mcpServers": {
    "service1": { "command": "...", "args": [...] },
    "service2": { "command": "...", "args": [...] }
  }
}
```
</details>

<details>
<summary><b>格式 2：单个服务</b></summary>

```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:\\"]
}
```
粘贴后会提示输入服务名称
</details>

<details>
<summary><b>格式 3：多个服务</b></summary>

```json
{
  "weather": { "command": "...", "args": [...] },
  "database": { "command": "...", "args": [...] }
}
```
自动识别为 mcpServers 内容
</details>

### 4️⃣ 开始使用

1. 打开支持的 AI 平台（如 [DeepSeek Chat](https://chat.deepseek.com)）
2. 开始对话，插件会自动注入工具列表
3. 让 AI 帮你调用工具：
   ```
   帮我列出 filesystem 服务的所有工具
   ```
4. 查看右下角浮窗的工具执行状态 ✨

---

## 🏗️ 工作原理

MCP Bridge 采用 **三层架构设计**：

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器扩展层                          │
│  • 拦截 AI 平台请求                                      │
│  • 注入工具调用提示词                                    │
│  • 解析并执行工具调用指令                                │
│  • 显示工具调用状态                                      │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST API
┌────────────────────▼────────────────────────────────────┐
│              本地桥接服务层 (Flask)                      │
│  • 管理 MCP 工具服务                                     │
│  • 提供 RESTful API 接口                                │
│  • MCP ↔ HTTP 协议转换                                  │
└────────────────────┬────────────────────────────────────┘
                     │ MCP Protocol (stdio)
┌────────────────────▼────────────────────────────────────┐
│                  MCP 工具服务层                          │
│  • 文件操作、网络请求、代码执行...                        │
│  • 遵循 MCP 协议标准                                     │
│  • 独立运行的可执行程序                                  │
└─────────────────────────────────────────────────────────┘
```

### 关键组件

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| **浏览器扩展** | 用户界面、请求拦截、工具调用 | JavaScript, Chrome Extension API |
| **桥接服务** | 协议转换、服务管理、API 网关 | Python, Flask, MCP SDK |
| **MCP 工具** | 实际功能实现（文件、Git、数据库...） | 任意语言（遵循 MCP 协议） |

---

## 🎯 使用指南

### 基础使用

1. **打开 AI 平台** - 访问任意支持的 AI 平台（如 [DeepSeek Chat](https://chat.deepseek.com)）
2. **开始对话** - 插件会自动注入工具列表到 System Prompt
3. **调用工具** - 让 AI 帮你调用工具：
   ```
   帮我列出 filesystem 服务的所有工具
   ```
4. **查看状态** - 右下角浮窗实时显示工具执行状态

### 四层保障机制使用

#### 1️⃣ API 解析（主要方案）
**自动运行** - 无需配置，默认从网络请求中实时解析工具调用

#### 2️⃣ UI DOM 解析（自动兜底）
当 API 解析失败时自动切换，需在 `config/api_list.json` 中配置：

```json
{
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".chat-message",
    "messageIndex": -1
  }
}
```

#### 3️⃣ 重新检测（断点续传）
**适用场景：** 页面刷新、AI 回复完成但未触发自动检测

**操作步骤：**
1. 点击右下角浮窗标题栏的 **⏰** 图标
2. 系统从最后一条消息重新提取工具调用
3. 检测到后自动执行

#### 4️⃣ 手动输入（最终兜底）
**适用场景：** 所有自动检测都失败时

**操作步骤：**
1. 复制包含 `<tool_code>` 的 AI 回复
2. 点击浮窗展开，在输入框中粘贴
3. 点击 **"发送到 MCP"** 按钮

### 设置页面功能

打开浏览器扩展管理页面 → 点击 MCP Bridge 的"详细信息" → 点击"扩展程序选项"

#### 站点管理
- **功能说明** - 了解"自动注入 System Prompt"的作用
- **站点配置** - 为每个 AI 平台独立配置自动注入策略
- **端口配置** - 自定义桥接服务端口（默认 3849）

#### 服务管理
- **启用/禁用服务** - 通过开关控制服务状态
- **查看服务状态** - 实时显示服务运行状态
- **删除服务** - 一键删除不需要的服务

#### 服务配置（高级）
- **支持 3 种格式** - 完整配置、单个服务、多个服务
- **智能合并** - 自动识别格式并增量合并到现有配置
- **冲突处理** - 可选择"自动替换已存在的服务"或跳过

---

## 🔌 API 接口

桥接服务提供以下 RESTful API：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/tools` | GET | 获取所有服务列表(仅名称和描述，不含工具。) |
| `/tools?serverName=:name` | GET | 获取指定服务的工具列表 |
| `/execute` | POST | 执行工具 |
| `/config` | GET | 获取当前配置 |
| `/config` | POST | 更新配置并重载 |
| `/reload` | POST | 重新加载配置 |
| `/restart-server` | POST | 重启指定服务 |
| `/shutdown-server` | POST | 关闭指定服务 |
| `/reset-history` | POST | 重置工具调用历史 |

---

## 📁 项目结构

```
mcp_bridge/                    # 浏览器扩展
├── manifest.json              # 扩展清单文件
├── config/
│   └── api_list.json          # 支持的 AI 平台配置
├── modules/
│   ├── api_client.js          # 桥接服务通信客户端
│   ├── prompt_builder.js      # 工具调用提示词构建器
│   ├── input_injector.js      # 输入框注入器
│   └── compareVersion.js      # 版本比较工具
├── scripts/
│   ├── background.js          # 后台脚本（核心逻辑）
│   ├── content_script.js      # 内容脚本（页面交互）
│   └── page_world/
│       ├── injector.js        # 页面脚本注入器
│       ├── fetchhook.js       # Fetch API 拦截器
│       └── ajaxhook.min.js    # XMLHttpRequest 拦截器
├── ui/
│   ├── status_panel.js        # 状态面板组件
│   └── status_panel.css       # 状态面板样式
├── options/
│   ├── options.html           # 设置页面结构
│   ├── options.js             # 设置页面逻辑
│   └── options.css            # 设置页面样式
└── popup/
    ├── popup.html             # 弹出窗口结构
    ├── popup.js               # 弹出窗口逻辑
    └── popup.css              # 弹出窗口样式

mcp_bridge_server/             # 桥接服务
├── utils/
│   └── mcp_bridge.py          # Flask 服务主程序
├── requirements.txt           # Python 依赖
├── build.bat / build.sh       # 构建脚本
└── mcp_bridge.spec            # PyInstaller 配置
```

---

## 🛠️ 开发指南

### 添加对新 AI 平台的支持

编辑 `config/api_list.json`，添加平台配置：

```json
{
  "name": "platform-id",
  "hostname": "chat.example.com",
  "label": "平台名称",
  "api": ["api/chat"],
  "promptPath": "messages[0].content",
  "isJsonString": false,
  "enabled": true,
  "defaultAlwaysInject": false,
  "response": {
    "type": "sse",
    "format": "data: {json}\\n\\n",
    "contentPaths": ["choices[0].delta.content"]
  },
  "uiParsing": {
    "enabled": true,
    "priority": "api",
    "messageContainer": ".message",
    "messageIndex": -1
  }
}
```

### 配置字段说明

<details>
<summary><b>基础配置</b></summary>

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 平台唯一标识 |
| `hostname` | string | 平台域名 |
| `label` | string | 平台显示名称 |
| `api` | array | API 路径片段数组 |
| `promptPath` | string | 提示词字段路径 |
| `isJsonString` | boolean | 提示词是否为 JSON 字符串 |
| `enabled` | boolean | 是否启用 |
| `defaultAlwaysInject` | boolean | 默认是否总是注入 |

</details>

<details>
<summary><b>响应解析配置 (response)</b></summary>

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 响应类型：`sse` / `json` / `text` |
| `format` | string | SSE 数据格式（仅 SSE 需要） |
| `contentPaths` | array | 内容提取路径数组 |
| `filterRules` | object | 数据过滤规则（可选） |

</details>

<details>
<summary><b>UI 解析配置 (uiParsing)</b></summary>

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用 UI 解析 |
| `priority` | string | 优先级：`api` / `ui` |
| `messageContainer` | string | 消息容器 CSS 选择器 |
| `messageIndex` | number | 消息索引（-1 表示最后一条） |
| `contentSelector` | string | 内容选择器（可选） |

</details>

### 调试技巧

1. **查看控制台日志** - 打开浏览器开发者工具（F12），切换到 Console 标签
2. **查看网络请求** - 切换到 Network 标签，过滤 `localhost:3849`
3. **测试 UI 选择器** - 在控制台运行：
   ```javascript
   document.querySelectorAll('.your-selector')
   ```
4. **查看存储数据** - Application → Storage → Extension Storage

---

## � 文档导航

### 📖 核心文档

| 文档 | 说明 |
|------|------|
| [README.md](README.md) | 项目总览和快速开始（本文档） |
| [桥接服务 README](https://github.com/WongJingGitt/mcp_bridge_server/blob/master/README.md) | 服务端文档和 API 说明 |
| [架构设计文档](docs/ARCHITECTURE.md) | 系统架构与技术选型 |
| [开发者指南](docs/DEVELOPER_GUIDE.md) | 代码结构与开发指南 |
| [文档索引](docs/INDEX.md) | 完整文档导航和使用场景指引 |

### 🎯 功能指南

| 文档 | 说明 |
|------|------|
| [兜底机制使用指南](docs/FALLBACK_GUIDE.md) | 四层保障机制详解 |
| [API 配置完全指南](docs/API_CONFIG_GUIDE.md) | api_list.json 配置说明 |
| [响应解析配置指南](docs/RESPONSE_CONFIG_GUIDE.md) | 响应解析和过滤规则 |
| [错误处理机制](docs/ERROR_HANDLING.md) | 错误处理流程和调试技巧 |
| [多路径注入示例](docs/MULTI_PROMPTPATH_EXAMPLE.md) | 多字段同时注入 Prompt |

### ✨ 特性文档

| 文档 | 说明 |
|------|------|
| [重新检测功能](docs/REDETECT_FEATURE.md) | 断点续传实现说明 |
| [刷新 Prompt 功能](docs/REFRESH_PROMPT_FEATURE.md) | System Prompt 刷新机制 |
| [快速刷新指南](docs/REFRESH_PROMPT_QUICK_GUIDE.md) | 刷新功能快速上手 |
| [UI 现代化指南](docs/UI_MODERNIZATION_GUIDE.md) | 界面改进历史 |
| [数组根路径配置](docs/ARRAY_ROOT_CONFIG.md) | 数组格式配置说明 |
| [服务管理功能](docs/SERVICE_MANAGER_FEATURES.md) | 服务管理器功能文档 |
| [状态面板功能](docs/STATUS_PANEL_FEATURES.md) | 状态面板功能文档 |

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 报告问题

1. 在 [Issues](https://github.com/WongJingGitt/mcp_bridge/issues) 页面创建新问题
2. 提供详细的问题描述和复现步骤
3. 附上控制台日志和截图（如果适用）

### 提交代码

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

### 开发规范

- 遵循现有代码风格
- 添加必要的注释和文档
- 测试你的更改
- 更新相关文档

### 仓库地址

- **浏览器扩展:** [github.com/WongJingGitt/mcp_bridge](https://github.com/WongJingGitt/mcp_bridge)
- **桥接服务:** [github.com/WongJingGitt/mcp_bridge_server](https://github.com/WongJingGitt/mcp_bridge_server)

---

## ❓ 常见问题

<details>
<summary><b>Q: 为什么工具调用没有触发？</b></summary>

**A:** 检查以下几点：
1. 桥接服务是否正常运行（访问 http://localhost:3849/health）
2. 是否已在设置页面启用"自动注入 System Prompt"
3. 查看浏览器控制台是否有错误日志
4. 尝试使用"重新检测"功能或"手动输入"兜底
</details>

<details>
<summary><b>Q: 如何更换桥接服务端口？</b></summary>

**A:** 
1. 打开扩展设置页面
2. 在"桥接服务配置"区域修改端口号
3. 点击"保存"按钮
4. 重启桥接服务并使用新端口
</details>

<details>
<summary><b>Q: 配置文件在哪里？</b></summary>

**A:** 
- **Windows:** `%APPDATA%\mcp-bridge\config\mcp-config.json`
- **macOS:** `~/Library/Application Support/mcp-bridge/config/mcp-config.json`
- **Linux:** `~/.config/mcp-bridge/config/mcp-config.json`
</details>

<details>
<summary><b>Q: 支持哪些 MCP 工具？</b></summary>

**A:** 支持所有遵循 [MCP 协议](https://modelcontextprotocol.io) 的工具，包括：
- 官方工具：filesystem, git, postgres, sqlite 等
- 社区工具：任意实现 MCP 协议的程序
- 自定义工具：你自己开发的 MCP 服务
</details>

<details>
<summary><b>Q: 如何添加新的 AI 平台支持？</b></summary>

**A:** 参考 [开发指南](#-开发指南) 部分，编辑 `config/api_list.json` 添加平台配置。详细说明请查看 [API 配置完全指南](docs/API_CONFIG_GUIDE.md)。
</details>

<details>
<summary><b>Q: 为什么有些服务显示"已停止"？</b></summary>

**A:** 
1. 检查服务配置是否正确（command 和 args）
2. 查看桥接服务的控制台日志
3. 尝试在设置页面点击"重启服务"
4. 确认服务所需的依赖已安装
</details>

---

## 🗺️ 路线图

- [ ] 支持更多 AI 平台（ChatGPT, Grok, Claude Web）
- [ ] 工具调用历史记录和回放
- [ ] 可视化配置编辑器
- [ ] 工具调用性能分析
- [ ] 多语言支持（i18n）
- [ ] 云端配置同步
- [ ] 工具市场（一键安装 MCP 工具）

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

```
MIT License

Copyright (c) 2025 WongJingGitt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 致谢

- [Model Context Protocol](https://modelcontextprotocol.io) - 为工具生态系统提供了标准化协议
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/) - 强大的浏览器扩展能力
- [Google Gemini](https://gemini.google.com) - 协助设计了项目的初始架构，奠定了坚实的基础 🏗️
- [Claude Code](https://claude.ai) - 本项目 99% 的代码由 AI 完成(包括这段话也是🤭)，证明了人类确实可以躺平了 🤖💤
- 所有贡献者和用户 - 感谢你们的支持和反馈！

---

<div align="center">

**如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！**

Made with ❤️ by [WongJingGitt](https://github.com/WongJingGitt)

[浏览器扩展仓库](https://github.com/WongJingGitt/mcp_bridge) • [桥接服务仓库](https://github.com/WongJingGitt/mcp_bridge_server)

</div>