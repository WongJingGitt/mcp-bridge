# MCP Bridge 文档总览

本文档提供 MCP Bridge 项目所有文档的快速导航和概述。

## 📖 文档分类

### 🚀 快速开始

| 文档 | 目标读者 | 内容简介 |
|------|---------|---------|
| [README.md](../README.md) | 所有用户 | 项目介绍、安装步骤、基本使用方法 |
| [桥接服务 README](../../mcp_bridge_server/README.md) | 后端开发者 | 桥接服务安装、配置和 API 文档 |

### ⚙️ 配置指南

| 文档 | 适用场景 | 主要内容 |
|------|---------|---------|
| [API 配置完全指南](API_CONFIG_GUIDE.md) | 添加新平台支持 | api_list.json 所有字段详解、各平台配置示例 |
| [响应解析配置指南](RESPONSE_CONFIG_GUIDE.md) | 响应解析失败 | SSE/JSON 解析规则、抓包分析方法、过滤规则配置 |

### 🛠️ 功能说明

| 文档 | 功能 | 核心内容 |
|------|------|---------|
| [兜底机制使用指南](FALLBACK_GUIDE.md) | 四层保障机制 | API 解析、UI DOM 解析、重新检测、手动输入 |
| [重新检测功能](REDETECT_FEATURE.md) | 断点续传 | 使用方法、技术实现、通信流程 |
| [刷新 Prompt 功能](REFRESH_PROMPT_FEATURE.md) | System Prompt 刷新 | 刷新机制、使用场景、实现细节 |
| [快速刷新指南](REFRESH_PROMPT_QUICK_GUIDE.md) | 快速上手 | 最简化的刷新功能使用说明 |

### 🔍 问题排查

| 文档 | 适用问题 | 解决方案 |
|------|---------|---------|
| [错误处理机制](ERROR_HANDLING.md) | 工具执行失败 | 错误流程、错误结构、调试技巧、常见错误 |

### 🏗️ 架构与开发

| 文档 | 目标读者 | 核心内容 |
|------|---------|---------|
| [架构设计文档](ARCHITECTURE.md) | 架构师/高级开发者 | 系统架构、技术选型、设计决策、性能优化 |
| [开发者指南](DEVELOPER_GUIDE.md) | 贡献者/扩展开发者 | 代码结构、模块详解、调试技巧、贡献流程 |

### 🎨 界面改进

| 文档 | 内容 | 适用人群 |
|------|------|---------|
| [UI 现代化指南](UI_MODERNIZATION_GUIDE.md) | 浮窗 UI 改进历史 | UI 开发者、设计师 |

## 📚 按使用场景查找文档

### 场景 1: 我想快速上手使用

**推荐阅读顺序:**
1. [README.md](../README.md) - 了解项目基本信息
2. [桥接服务 README](../../mcp_bridge_server/README.md) - 安装并启动服务
3. [快速刷新指南](REFRESH_PROMPT_QUICK_GUIDE.md) - 学习基本操作

### 场景 2: 我想添加对新 AI 平台的支持

**推荐阅读顺序:**
1. [API 配置完全指南](API_CONFIG_GUIDE.md) - 了解配置字段
2. [响应解析配置指南](RESPONSE_CONFIG_GUIDE.md) - 配置响应解析
3. [兜底机制使用指南](FALLBACK_GUIDE.md) - 配置 UI 解析兜底
4. [开发者指南](DEVELOPER_GUIDE.md) - 了解测试流程

### 场景 3: 工具调用失败或检测不到

**推荐阅读顺序:**
1. [兜底机制使用指南](FALLBACK_GUIDE.md) - 了解四层保障
2. [重新检测功能](REDETECT_FEATURE.md) - 使用重新检测
3. [错误处理机制](ERROR_HANDLING.md) - 查看错误详情和解决方案
4. [响应解析配置指南](RESPONSE_CONFIG_GUIDE.md) - 检查配置

### 场景 4: 我想理解系统架构和设计

**推荐阅读顺序:**
1. [架构设计文档](ARCHITECTURE.md) - 整体架构和设计理念
2. [开发者指南](DEVELOPER_GUIDE.md) - 代码结构和模块详解
3. [错误处理机制](ERROR_HANDLING.md) - 错误处理架构
4. 相关特性文档 - 深入理解具体功能实现

### 场景 5: 我想贡献代码

**推荐阅读顺序:**
1. [开发者指南](DEVELOPER_GUIDE.md) - 开发环境和代码规范
2. [架构设计文档](ARCHITECTURE.md) - 理解设计决策
3. 相关功能文档 - 深入理解要修改的功能
4. [API 配置完全指南](API_CONFIG_GUIDE.md) - 如需修改配置系统

## 🔑 关键概念速查

### 通信架构

- **MAIN world (Injector)** → `window.postMessage` → **Isolated world (Content Script)** → `chrome.runtime.sendMessage` → **Service Worker (Background)**
- 详见: [架构设计文档 - 通信协议](ARCHITECTURE.md#通信协议设计)

### 四层兜底

1. **API 解析** - 实时流式检测 (最快)
2. **UI DOM 解析** - 自动兜底 (延迟检测)
3. **重新检测** - 手动触发 (断点续传)
4. **手动输入** - 用户兜底 (最终保障)

详见: [兜底机制使用指南](FALLBACK_GUIDE.md)

### 配置文件

- **api_list.json** - 平台配置 (hostname、API、响应解析、UI 解析、输入框)
- 详见: [API 配置完全指南](API_CONFIG_GUIDE.md)

### 错误处理

- **错误对象结构:** `{detail: {error, type, traceback}}`
- **错误传递链:** Python → FastAPI → api_client.js → background.js → 格式化文本 → AI 输入
- 详见: [错误处理机制](ERROR_HANDLING.md)

## 📝 文档维护

### 文档更新规则

当以下情况发生时需要更新文档:

1. **新增功能** → 创建新的功能文档 + 更新 README.md
2. **修改配置字段** → 更新 [API 配置完全指南](API_CONFIG_GUIDE.md)
3. **修改响应解析逻辑** → 更新 [响应解析配置指南](RESPONSE_CONFIG_GUIDE.md)
4. **修改通信协议** → 更新 [架构设计文档](ARCHITECTURE.md) + [开发者指南](DEVELOPER_GUIDE.md)
5. **修改错误处理** → 更新 [错误处理机制](ERROR_HANDLING.md)

### 文档完整性检查清单

- [ ] README.md 是否包含所有核心功能
- [ ] 所有配置字段是否都有文档说明
- [ ] 所有特性是否都有独立文档
- [ ] 错误处理流程是否完整记录
- [ ] 架构变更是否更新到架构文档
- [ ] 代码示例是否与实际代码一致
- [ ] 所有文档链接是否有效

## 🤝 参与文档贡献

如果您发现文档有误或需要改进:

1. **提 Issue** - 在 GitHub 上描述问题
2. **提 PR** - 直接修改文档并提交
3. **反馈** - 通过任何渠道告诉我们

### 文档编写规范

- 使用清晰的标题层级
- 提供代码示例和配置示例
- 使用表格组织对比信息
- 添加 emoji 增强可读性 (但不要过度使用)
- 保持中英文混排时的空格规范
- 链接使用相对路径

## 📞 获取帮助

如果文档无法解决您的问题:

1. **检查日志** - 浏览器控制台 (F12) 和桥接服务日志
2. **查看示例** - 参考 api_list.json 中的现有配置
3. **提 Issue** - 在 GitHub 上详细描述问题
4. **查阅 MCP 文档** - [Model Context Protocol](https://modelcontextprotocol.io/)

## 🔗 外部资源

- [Chrome Extension 官方文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [MCP 协议规范](https://modelcontextprotocol.io/docs)
- [FastAPI 文档](https://fastapi.tiangolo.com/)

---

**最后更新:** 2024

**维护者:** MCP Bridge 团队

**文档版本:** 1.0
