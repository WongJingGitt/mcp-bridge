# MCP Bridge 用户使用手册

## 目录

- [快速开始](#快速开始)
- [安装指南](#安装指南)
- [配置指南](#配置指南)
- [使用教程](#使用教程)
- [常见问题](#常见问题)
- [故障排除](#故障排除)

---

## 快速开始

### 三步开始使用

1. **安装浏览器扩展**
2. **启动桥接服务**
3. **配置 MCP 工具**

就这么简单！

---

## 安装指南

### 第一步：安装浏览器扩展

#### Chrome / Edge 安装

1. 下载项目文件
   ```bash
   git clone https://github.com/WongJingGitt/mcp_bridge.git
   ```

2. 打开浏览器，访问扩展管理页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. 启用"开发者模式"（右上角开关）

4. 点击"加载已解压的扩展程序"

5. 选择项目根目录 `mcp_bridge`

6. 确认扩展已启用（图标显示为彩色）

#### 验证安装

访问 [DeepSeek Chat](https://chat.deepseek.com)，右下角应该出现 MCP Bridge 浮窗。

### 第二步：安装桥接服务

桥接服务是连接浏览器和 MCP 工具的中间层。

#### 方式一：使用可执行文件（推荐）

**Windows**
1. 从 [Releases](https://github.com/WongJingGitt/mcp_bridge_server/releases) 下载 `mcp-bridge-server-windows.exe`
2. 双击运行
3. 看到 "Server running on http://localhost:3849" 表示成功

**macOS**
1. 下载 `mcp-bridge-server-macos`
2. 赋予执行权限:
   ```bash
   chmod +x mcp-bridge-server-macos
   ```
3. 运行:
   ```bash
   ./mcp-bridge-server-macos
   ```

**Linux**
1. 下载 `mcp-bridge-server-linux`
2. 赋予执行权限并运行:
   ```bash
   chmod +x mcp-bridge-server-linux
   ./mcp-bridge-server-linux
   ```

#### 方式二：使用 Python 源码

**前置要求**: Python 3.8+

```bash
# 1. 克隆仓库
git clone https://github.com/WongJingGitt/mcp_bridge_server.git
cd mcp_bridge_server

# 2. 安装依赖
pip install -r requirements.txt

# 3. 运行服务
python utils/mcp_bridge.py
```

#### 验证服务

打开浏览器，访问 http://localhost:3849/health

应该看到:
```json
{
  "status": "healthy"
}
```

---

## 配置指南

### 配置 MCP 工具服务

#### 配置文件位置

MCP Bridge 会在以下位置查找配置文件:

- **Windows**: `%APPDATA%\mcp-bridge\config\mcp-config.json`
- **macOS**: `~/Library/Application Support/mcp-bridge/config/mcp-config.json`
- **Linux**: `~/.config/mcp-bridge/config/mcp-config.json`

#### 快速访问配置文件

**Windows**
```powershell
# 打开配置目录
explorer %APPDATA%\mcp-bridge\config
```

**macOS / Linux**
```bash
# 打开配置目录
open ~/Library/Application\ Support/mcp-bridge/config  # macOS
xdg-open ~/.config/mcp-bridge/config  # Linux
```

#### 创建配置文件

如果配置文件不存在，创建 `mcp-config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\"],
      "description": "文件系统访问工具"
    }
  }
}
```

#### 通过扩展设置页面配置

1. 打开扩展管理页面 (`chrome://extensions/`)
2. 找到 MCP Bridge，点击"详细信息"
3. 点击"扩展程序选项"
4. 切换到"服务配置"标签
5. 粘贴 JSON 配置，点击"保存"

### 配置格式详解

#### 完整配置格式

```json
{
  "mcpServers": {
    "服务名称": {
      "enabled": true,           // 是否启用
      "command": "可执行文件",    // 命令
      "args": ["参数1", "参数2"], // 参数数组
      "description": "服务描述"  // 描述文本
    }
  }
}
```

#### 支持的三种格式

扩展支持三种 JSON 格式，方便从不同来源复制配置:

**格式 1: 完整配置**
```json
{
  "mcpServers": {
    "service1": {
      "command": "npx",
      "args": ["-y", "package"]
    }
  }
}
```

**格式 2: 单个服务**（粘贴后会提示输入服务名）
```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:\\"]
}
```

**格式 3: 多个服务**（自动识别）
```json
{
  "weather": {
    "command": "python",
    "args": ["weather_server.py"]
  },
  "database": {
    "command": "node",
    "args": ["db_server.js"]
  }
}
```

### 常用 MCP 工具配置

#### 文件系统工具

**功能**: 读写本地文件

**Windows**
```json
{
  "filesystem": {
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\"],
    "description": "文件系统访问工具"
  }
}
```

**macOS / Linux**
```json
{
  "filesystem": {
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/"],
    "description": "文件系统访问工具"
  }
}
```

#### Git 工具

**功能**: 管理 Git 仓库

```json
{
  "git": {
    "enabled": true,
    "command": "uvx",
    "args": ["mcp-server-git", "--repository", "C:\\myrepo"],
    "description": "Git 仓库管理工具"
  }
}
```

#### SQLite 工具

**功能**: 操作 SQLite 数据库

```json
{
  "sqlite": {
    "enabled": true,
    "command": "uvx",
    "args": ["mcp-server-sqlite", "--db-path", "C:\\data\\mydb.sqlite"],
    "description": "SQLite 数据库访问"
  }
}
```

#### PostgreSQL 工具

**功能**: 操作 PostgreSQL 数据库

```json
{
  "postgres": {
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/mydb"],
    "description": "PostgreSQL 数据库访问"
  }
}
```

---

## 使用教程

### 基础使用流程

#### 1. 打开支持的 AI 平台

访问任意支持的平台:
- [DeepSeek Chat](https://chat.deepseek.com)
- [通义千问](https://www.tongyi.com)
- [腾讯元宝](https://yuanbao.tencent.com)
- [豆包](https://www.doubao.com)

#### 2. 开始对话

MCP Bridge 会自动注入工具列表到 System Prompt。

你可以在右下角浮窗看到状态提示。

#### 3. 让 AI 调用工具

**示例对话**:

```
用户: 帮我列出 filesystem 服务的所有工具

AI: 我来帮你查询 filesystem 服务的工具列表...
<tool_code>
{
  "tool_name": "list_tools_in_service",
  "arguments": {
    "service_name": "filesystem"
  }
}
</tool_code>

[系统自动执行工具，返回结果给 AI]

AI: filesystem 服务提供以下工具:
1. read_file - 读取文件内容
2. write_file - 写入文件
3. list_directory - 列出目录
...
```

#### 4. 查看执行状态

右下角浮窗会实时显示:
- 🔄 执行中: 工具正在运行
- ✅ 成功: 工具执行完成
- ❌ 错误: 工具执行失败

### 高级功能

#### 手动刷新 System Prompt

**使用场景**: 
- 添加了新的 MCP 工具
- 想在当前对话中更新工具列表

**操作步骤**:
1. 点击右下角浮窗标题栏的 **🔄** 图标
2. 系统会重新获取工具列表
3. System Prompt 会自动注入到输入框

#### 重新检测工具调用

**使用场景**:
- 页面刷新后工具调用未触发
- AI 回复完成但工具未执行

**操作步骤**:
1. 点击浮窗标题栏的 **⏰** 图标
2. 系统从最后一条消息重新提取工具调用
3. 检测到后自动执行

#### 手动输入工具调用

**使用场景**: 所有自动检测都失败

**操作步骤**:
1. 复制 AI 回复中包含 `<tool_code>` 的部分
2. 点击浮窗展开
3. 粘贴到输入框
4. 点击"发送到 MCP"

### 设置页面功能

打开扩展管理页面 → MCP Bridge → 详细信息 → 扩展程序选项

#### 站点管理标签

**自动注入 System Prompt**

- 功能说明: 了解自动注入的作用
- 站点配置: 为每个 AI 平台独立配置
- 端口配置: 修改桥接服务端口（默认 3849）

#### 服务管理标签

**查看和管理 MCP 服务**

- 启用/禁用: 通过开关控制服务状态
- 查看状态: 实时显示服务运行状态
  - ✅ 运行中
  - ⏸️ 已停止
  - ❌ 错误
- 重启服务: 点击"🔄 重启"按钮
- 删除服务: 点击"🗑️ 删除"按钮

#### 服务配置标签

**添加新服务**

1. 粘贴 JSON 配置（支持三种格式）
2. 选择是否"自动替换已存在的服务"
3. 点击"保存配置"
4. 服务会自动重载

---

## 常见问题

### 安装与配置

#### Q: 扩展图标显示为灰色？

**A**: 说明扩展未正确加载或被禁用。

**解决方法**:
1. 访问 `chrome://extensions/`
2. 确认 MCP Bridge 已启用
3. 点击刷新按钮重新加载

#### Q: 找不到配置文件？

**A**: 首次运行时配置文件不存在，需要手动创建。

**解决方法**:
1. 创建配置目录
2. 新建 `mcp-config.json` 文件
3. 参考[配置指南](#配置指南)编写配置

#### Q: 如何更换桥接服务端口？

**A**: 在扩展设置页面修改。

**步骤**:
1. 打开扩展设置 → 站点管理
2. 修改"桥接服务端口"
3. 点击"保存"
4. 重启桥接服务，使用新端口启动

### 使用问题

#### Q: System Prompt 没有注入？

**可能原因**:
1. 桥接服务未运行
2. 未启用"自动注入"
3. 不是新对话

**解决方法**:
1. 检查 http://localhost:3849/health 是否正常
2. 在设置页面启用对应站点的"自动注入"
3. 尝试手动刷新 System Prompt（浮窗 🔄 图标）

#### Q: 工具调用没有触发？

**检查清单**:
- [ ] AI 的回复中是否包含 `<tool_code>` 标签？
- [ ] 浮窗是否显示"执行中"？
- [ ] 浏览器控制台是否有错误日志？

**解决方法**:
1. 尝试"重新检测"（浮窗 ⏰ 图标）
2. 使用"手动输入"兜底
3. 查看浏览器控制台日志（F12）

#### Q: 工具结果没有自动发送？

**可能原因**: 输入框配置不正确

**解决方法**:
1. 打开浏览器控制台（F12）
2. 执行: `document.querySelector('textarea')`
3. 如果返回 `null`，说明选择器不匹配
4. 在 GitHub 提 Issue，我们会更新配置

#### Q: 服务显示"已停止"？

**可能原因**:
1. 服务配置错误（command 或 args 不正确）
2. 所需依赖未安装

**解决方法**:
1. 检查配置是否正确
2. 尝试在终端手动运行命令
   ```bash
   npx -y @modelcontextprotocol/server-filesystem C:\
   ```
3. 安装缺失的依赖
4. 点击"重启服务"

### 性能问题

#### Q: 页面加载变慢？

**A**: 可能是脚本注入时机过早。

**解决方法**: 暂无需手动操作，脚本注入优化中。

#### Q: 工具执行很慢？

**A**: 某些工具（如大文件操作）本身就需要时间。

**提示**: 浮窗会显示"执行中"状态，请耐心等待。

---

## 故障排除

### 问题诊断流程

```
工具调用失败
    ↓
检查桥接服务是否运行
    ↓ 是
检查 MCP 服务是否启用
    ↓ 是
检查 AI 回复是否包含 <tool_code>
    ↓ 是
查看浮窗状态和错误信息
    ↓
根据错误信息解决
```

### 收集诊断信息

遇到问题时，收集以下信息有助于排查:

1. **浏览器信息**
   - 浏览器类型和版本
   - 扩展版本

2. **服务状态**
   - 访问 http://localhost:3849/health
   - 截图服务控制台日志

3. **扩展日志**
   - 打开浏览器控制台（F12）
   - 复制所有 `[MCP Bridge]` 开头的日志

4. **配置文件**
   - 复制 `mcp-config.json` 内容
   - 复制 `api_list.json` 中对应平台的配置

### 重置扩展

如果扩展工作不正常，尝试重置:

1. 访问 `chrome://extensions/`
2. 移除 MCP Bridge
3. 重新加载扩展
4. 清除浏览器缓存（可选）

### 重置配置

删除配置文件，重新开始:

**Windows**
```powershell
Remove-Item -Recurse -Force $env:APPDATA\mcp-bridge
```

**macOS / Linux**
```bash
rm -rf ~/Library/Application\ Support/mcp-bridge  # macOS
rm -rf ~/.config/mcp-bridge  # Linux
```

---

## 获取帮助

### 在线资源

- **GitHub 仓库**: https://github.com/WongJingGitt/mcp_bridge
- **Issue 追踪**: https://github.com/WongJingGitt/mcp_bridge/issues
- **MCP 官方文档**: https://modelcontextprotocol.io

### 报告问题

在 GitHub Issues 中报告问题时，请提供:

1. **问题描述**: 详细说明遇到的问题
2. **复现步骤**: 如何触发此问题
3. **期望行为**: 应该发生什么
4. **实际行为**: 实际发生了什么
5. **诊断信息**: 参考[收集诊断信息](#收集诊断信息)
6. **截图/录屏**: 如果适用

### 贡献指南

欢迎贡献代码或改进文档！

参考 [DEVELOPMENT.md](DEVELOPMENT.md) 了解开发流程。

---

## 附录

### 支持的 AI 平台列表

| 平台 | 状态 | 自动注入 | UI 解析 |
|------|------|----------|---------|
| DeepSeek | ✅ 完全支持 | ✅ | ✅ |
| 通义千问 | ✅ 完全支持 | ✅ | ✅ |
| 腾讯元宝 | ✅ 完全支持 | ✅ | ✅ |
| 豆包 | ✅ 完全支持 | ✅ | ✅ |
| ChatGPT | ⏳ 适配中 | ❌ | ❌ |
| Grok | ⏳ 适配中 | ❌ | ❌ |
| Google AI Studio | ⚠️ 部分支持 | ❌ 需手动 | ✅ |

### 常用 MCP 工具列表

| 工具 | 功能 | 安装命令 |
|------|------|----------|
| filesystem | 文件系统访问 | `npx -y @modelcontextprotocol/server-filesystem` |
| git | Git 仓库管理 | `uvx mcp-server-git` |
| sqlite | SQLite 数据库 | `uvx mcp-server-sqlite` |
| postgres | PostgreSQL 数据库 | `npx -y @modelcontextprotocol/server-postgres` |
| github | GitHub API | `npx -y @modelcontextprotocol/server-github` |
| google-maps | Google Maps | `npx -y @modelcontextprotocol/server-google-maps` |

更多工具请访问 [MCP Servers](https://github.com/modelcontextprotocol/servers)。

### 快捷键参考

| 操作 | 快捷键 |
|------|--------|
| 打开扩展管理 | 地址栏输入 `chrome://extensions/` |
| 打开开发者工具 | `F12` 或 `Ctrl+Shift+I` |
| 刷新页面 | `F5` 或 `Ctrl+R` |
| 硬刷新（清除缓存） | `Ctrl+Shift+R` |

---

**祝使用愉快！🎉**

如有疑问，欢迎在 [GitHub](https://github.com/WongJingGitt/mcp_bridge) 提问。
