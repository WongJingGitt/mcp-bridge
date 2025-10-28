# 页面加载提示配置指南

## 功能说明

允许在特定网站页面加载完成后，自动弹出一个提示对话框，用于向用户展示重要信息、使用说明或注意事项。

## 特性

- ✅ 页面加载后自动显示
- ✅ 支持"不再提示"选项
- ✅ 基于 localStorage 存储用户选择（网站级别隔离）
- ✅ 可配置延迟显示时间
- ✅ 支持三种提示类型（default/warning/danger）
- ✅ 完全可自定义的内容和按钮文本

## 配置方法

在 `api_list.json` 的对应网站配置中添加 `onLoadTip` 字段：

### 基础配置

```json
{
  "name": "example",
  "hostname": "example.com",
  "api": ["/api/chat"],
  "enabled": true,
  "onLoadTip": {
    "title": "欢迎使用 MCP Bridge",
    "message": "这是一个示例提示信息。\n\n你可以在这里告诉用户重要的注意事项或使用技巧。",
    "type": "default"
  }
}
```

### 完整配置

```json
{
  "name": "example",
  "hostname": "example.com",
  "api": ["/api/chat"],
  "enabled": true,
  "onLoadTip": {
    "title": "重要提示",
    "message": "使用前请注意：\n\n1. 确保已配置 System Prompt\n2. 工具调用需要网络连接\n3. 首次使用建议查看文档",
    "confirmText": "我知道了",
    "cancelText": "关闭",
    "type": "warning",
    "delay": 1000,
    "dontShowAgainText": "不再显示此提示"
  }
}
```

## 配置参数说明

### onLoadTip 对象

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | string | 否 | "MCP Bridge 提示" | 对话框顶部显示的标题文字 |
| `message` | string \| array | **是** | - | 对话框主体显示的消息内容（支持字符串或数组） |
| `confirmText` | string | 否 | "我知道了" | 主要操作按钮的文字（蓝色/橙色/红色按钮） |
| `cancelText` | string | 否 | "关闭" | 次要操作按钮的文字（灰色按钮） |
| `type` | string | 否 | "default" | 对话框类型：`default`、`warning`、`danger` |
| `delay` | number | 否 | 500 | 页面加载完成后额外等待的毫秒数（建议范围：500-2000） |
| `dontShowAgainText` | string | 否 | "不再提示" | 对话框底部复选框旁显示的文字 |

### 参数详细说明

#### title（对话框标题）
- **作用**：显示在对话框顶部的大标题
- **示例**：`"欢迎使用 MCP Bridge"`、`"配置提醒"`、`"⚠️ 重要提示"`
- **建议**：简短明了，5-10 个字，可以使用 emoji 增强视觉效果

#### message（消息内容）**【必需】**
- **作用**：对话框的主要内容，告知用户重要信息
- **格式**：支持两种格式
  - **字符串格式**：纯文本，使用 `\n` 换行，支持 emoji
  - **数组格式**：每个元素代表一行，更清晰
- **数组处理规则**：
  - ✅ 保留字符串和数值类型
  - ❌ 自动跳过对象、数组、null、undefined
  - 📌 仅识别一层（不递归处理嵌套数组）
  - 🔗 元素之间用 `\n` 连接
- **示例**：
  ```json
  // 字符串格式
  "message": "这是第一段。\n\n这是第二段。\n\n• 列表项1\n• 列表项2"
  
  // 数组格式（推荐）
  "message": [
    "欢迎使用 MCP Bridge",
    "",
    "功能特性：",
    "• AI 助手集成",
    "• 工具调用支持",
    "端口: ",
    3849
  ]
  
  // 自动过滤示例
  "message": [
    "有效行",
    123,              // ✓ 转为字符串
    {"key": "val"},   // ✗ 跳过
    null,             // ✗ 跳过
    "另一行"
  ]
  // 显示结果: "有效行\n123\n另一行"
  ```
- **建议**：
  - 简洁明了，不超过 5 行
  - 使用数组格式更易维护
  - 使用空字符串 `""` 创建空行
  - 使用 `•` 或数字创建列表
  - 适当使用 emoji（💡 ⚠️ ✅ 等）

#### confirmText（确认按钮文字）
- **作用**：主要操作按钮显示的文字
- **颜色**：根据 type 变化（蓝色/橙色/红色）
- **示例**：`"我知道了"`、`"开始使用"`、`"已完成配置"`
- **建议**：使用明确的动作词，让用户知道点击后会发生什么

#### cancelText（取消按钮文字）
- **作用**：次要操作按钮显示的文字
- **颜色**：灰色（所有类型统一）
- **示例**：`"关闭"`、`"稍后"`、`"跳过"`
- **建议**：表示"不采取行动"的选择

#### type（对话框类型）
- **default**（蓝色主题）
  - **用途**：一般性提示、欢迎信息、功能介绍
  - **颜色**：蓝色品牌色 (#0969da)
  - **场景**：首次使用引导、功能说明、使用技巧
  
- **warning**（橙色主题）
  - **用途**：需要用户注意的提示、配置提醒
  - **颜色**：警告橙 (#f59e0b)
  - **场景**：配置未完成、功能限制、注意事项
  
- **danger**（红色主题）
  - **用途**：重要警告、安全提示、严重限制
  - **颜色**：危险红 (#ef4444)
  - **场景**：数据丢失风险、功能不可用、严重问题

#### delay（延迟时间）
- **作用**：页面 load 事件触发后，额外等待的毫秒数再显示对话框
- **单位**：毫秒（ms）
- **推荐值**：
  - **500-800ms**：页面快速加载的网站（如静态页面）
  - **1000-1500ms**：一般网站（推荐）
  - **1500-2000ms**：需要等待动态内容加载的网站
- **注意**：过短可能在页面渲染完成前显示，过长用户可能已开始操作

#### dontShowAgainText（"不再提示"文字）
- **作用**：复选框旁边显示的文字
- **示例**：`"不再提示"`、`"不再显示此提示"`、`"下次不再显示"`
- **建议**：简短明了，建议不超过 8 个字

### type 类型说明

- **`default`**（默认）：蓝色主题，用于一般性提示
- **`warning`**（警告）：橙色主题，用于需要注意的提示
- **`danger`**（危险）：红色主题，用于重要警告信息

## 使用示例

### 示例 1：欢迎提示

适用于新用户引导或功能介绍。

```json
{
  "name": "chatgpt",
  "hostname": "chatgpt.com",
  "api": ["/backend-api/conversation"],
  "enabled": true,
  "onLoadTip": {
    "title": "欢迎使用 MCP Bridge",
    "message": "MCP Bridge 已启用！\n\n现在你可以使用各种工具来增强 ChatGPT 的能力。\n\n首次使用建议：\n• 查看右下角的 MCP Bridge 面板\n• 确保桥接服务正在运行\n• 在 System Prompt 中告诉模型可用的工具",
    "type": "default",
    "delay": 1000
  }
}
```

### 示例 2：配置提醒

提醒用户完成必要的配置。

```json
{
  "name": "deepseek",
  "hostname": "chat.deepseek.com",
  "api": ["/api/v0/chat/completion"],
  "enabled": true,
  "onLoadTip": {
    "title": "配置提醒",
    "message": "⚠️ 使用前请确保：\n\n✓ MCP 桥接服务已启动（端口 3849）\n✓ 已在设置中配置 System Prompt\n✓ System Prompt 中包含工具使用说明\n\n如需帮助，请查看插件文档。",
    "type": "warning",
    "confirmText": "已完成配置",
    "cancelText": "稍后配置",
    "delay": 800
  }
}
```

### 示例 3：重要警告

用于重要的安全提示或限制说明。

```json
{
  "name": "custom_site",
  "hostname": "custom.example.com",
  "api": ["/api/chat"],
  "enabled": true,
  "skipRequestModification": true,
  "onLoadTip": {
    "title": "⚠️ 重要提示",
    "message": "当前网站使用加密请求，无法自动注入 System Prompt。\n\n你需要：\n1. 手动在网站设置中添加 System Prompt\n2. 告诉模型可用的工具列表\n3. 确保模型知道如何使用 <tool_code> 标签\n\n否则工具调用功能将无法正常工作！",
    "type": "danger",
    "confirmText": "我已了解",
    "delay": 500,
    "dontShowAgainText": "不再显示（不推荐）"
  }
}
```

### 示例 4：简短提示

快速提示，延迟显示。

```json
{
  "name": "yuanbao",
  "hostname": "yuanbao.tencent.com",
  "api": ["/api/chat/"],
  "enabled": true,
  "onLoadTip": {
    "message": "💡 提示：可以通过右下角的 MCP Bridge 面板查看工具调用状态。",
    "confirmText": "知道了",
    "delay": 1500
  }
}
```

## 工作流程

```
页面开始加载
    ↓
main() 函数执行
    ↓
检查当前网站配置
    ↓
读取 onLoadTip 配置
    ↓
检查 localStorage（是否"不再提示"）
    ↓
等待页面 load 事件
    ↓
延迟指定时间（delay）
    ↓
显示提示对话框
    ↓
用户操作
    ├─ 勾选"不再提示" → 存储到 localStorage
    └─ 未勾选 → 下次仍会显示
```

## 存储机制

### 存储键格式

```
mcp_bridge_onload_tip_disabled_{hostname}
```

### 示例

- `mcp_bridge_onload_tip_disabled_chat.deepseek.com`
- `mcp_bridge_onload_tip_disabled_chatgpt.com`

### 存储位置

- 使用 `localStorage`（网站级别）
- 数据仅存储在当前网站的 localStorage 中
- 不同网站的设置相互独立
- 清除浏览器缓存会重置设置

## 重置提示

如果用户想再次看到提示，有两种方法：

### 方法 1：通过浏览器开发者工具

1. 打开网站
2. 按 F12 打开开发者工具
3. 切换到 Console 标签
4. 执行以下代码：

```javascript
localStorage.removeItem('mcp_bridge_onload_tip_disabled_' + location.hostname);
location.reload();
```

### 方法 2：清除网站数据

1. 浏览器设置 → 隐私和安全
2. 清除浏览数据 → 选择"Cookie 和其他网站数据"
3. 只清除目标网站的数据

## 最佳实践

### 1. 消息内容

- ✅ 简洁明了，不超过 5 行
- ✅ 使用 `\n\n` 分段，提高可读性
- ✅ 使用 emoji 增强视觉效果（可选）
- ✅ 列表使用 `•` 或数字
- ❌ 避免过长的段落

### 2. 延迟时间

- 快速提示：500-800ms
- 一般提示：1000-1500ms
- 等待内容加载：1500-2000ms

### 3. 类型选择

- 一般引导 → `default`
- 需要注意 → `warning`
- 重要警告 → `danger`

### 4. 按钮文本

确认按钮应该明确用户的下一步动作：
- ✅ "我知道了"、"开始使用"、"已完成配置"
- ❌ "确定"、"OK"（太模糊）

## 注意事项

1. **不要滥用**：只在真正需要时使用，避免打扰用户
2. **内容精准**：确保信息对用户有价值
3. **测试延迟**：根据页面实际加载速度调整 delay
4. **尊重选择**：用户选择"不再提示"后，不应再显示

## 调试

### 启用调试日志

打开浏览器控制台，查看以下日志：

```
[MCP Bridge] OnLoad tip disabled for this site  // 用户已禁用
[MCP Bridge] OnLoad tip result: {confirmed: true, dontShowAgain: false}  // 用户响应
[MCP Bridge] OnLoad tip disabled by user  // 用户勾选了"不再提示"
```

### 测试提示

1. 删除 localStorage 中的禁用标记
2. 刷新页面
3. 观察提示是否正常显示

## 相关文件

- `ui/confirm_dialog.js` - 对话框组件
- `ui/confirm_dialog.css` - 样式文件
- `scripts/content_script.js` - 提示逻辑实现
- `config/api_list.json` - 配置文件
