# 重新检测功能说明

## 功能概述

**重新检测**功能允许用户通过点击浮窗按钮,从最后一条 UI 消息中重新提取并执行工具调用。这实现了类似"断点续传"的效果,适用于以下场景:

- 🔄 **页面刷新恢复**: 在工具执行前刷新了页面,可以重新检测并恢复执行
- 🔍 **错过自动检测**: AI 回复完成但未触发自动检测,可以手动重新检测
- ♻️ **检测失败重试**: API 解析失败后,等待页面加载完成再重试

## 使用方法

### 前置条件

必须在 `config/api_list.json` 中配置 UI 解析功能:

```json
{
  "name": "DeepSeek",
  "hostname": "chat.deepseek.com",
  "uiParsing": {
    "enabled": true,
    "messageContainer": ".ds-message",
    "messageIndex": -1,
    "contentSelector": ".ds-markdown"
  }
}
```

### 操作步骤

1. **确认 AI 回复存在** - 确保页面上有包含工具调用的 AI 回复
2. **点击重新检测按钮** - 在右下角浮窗标题栏,点击⏰图标
3. **观察执行状态** - 浮窗会显示检测和执行进度
4. **等待完成** - 工具结果会自动注入到输入框并发送

### 状态提示

- ⏳ **正在从 UI 重新检测工具调用...** - 正在解析页面内容
- ✅ **未检测到工具调用** - 最后一条消息不包含工具调用
- ⚠️ **检测到工具调用,但格式不正确** - 工具 JSON 格式错误
- 🚀 **正在执行工具...** - 成功检测到工具并开始执行
- ❌ **当前站点未配置 UI 解析功能** - 需要先配置 `uiParsing`

## 技术实现

### 前端 (status_panel.js)

修改了浮窗标题栏的按钮:

```javascript
// 之前: 刷新 System Prompt 按钮
<button class="panel-action-btn refresh-btn" title="刷新 System Prompt">
  <svg>...</svg>
</button>

// 之后: 重新检测按钮
<button class="panel-action-btn redetect-btn" title="重新检测工具调用">
  <svg class="action-icon" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10..." fill="currentColor"/>
  </svg>
</button>
```

绑定点击事件:

```javascript
const redetectBtn = this.shadowRoot.querySelector('.redetect-btn');
redetectBtn.addEventListener('click', () => this.handleRedetect());
```

发送消息通过 postMessage:

```javascript
handleRedetect() {
    // 通过 postMessage 发送到 Content Script
    window.postMessage({
        type: 'MCP_BRIDGE_REDETECT_FROM_UI',
        source: 'mcp-bridge-panel'
    }, '*');
    
    // 更新 UI 状态
    this.update({
        status: 'EXECUTING',
        message: '正在从最后一条消息重新检测...'
    });
}
```

**注意:** status_panel.js 运行在 MAIN world (page context),不能直接使用 `chrome.runtime.sendMessage`,必须通过 `window.postMessage` 发送消息给 Content Script,再由 Content Script 转发给 Background。

### 中间层 (content_script.js)

接收浮窗消息并转发到后台:

```javascript
// 监听来自浮窗的消息
window.addEventListener('message', (event) => {
    // 只处理来自浮窗的消息
    if (event.data.source !== 'mcp-bridge-panel') return;
    
    switch (event.data.type) {
        case 'MCP_BRIDGE_REDETECT_FROM_UI':
            // 转发到 Background
            chrome.runtime.sendMessage({ type: 'REDETECT_FROM_UI' });
            break;
    }
});
```

### 后端 (background.js)

添加新的消息处理:

```javascript
case 'REDETECT_FROM_UI':
    // 从最后一条 UI 消息重新检测工具调用
    if (sender.tab?.id) {
        await handleRedetectFromUI(sender.tab.id);
        sendResponse({ success: true });
    } else {
        sendResponse({ success: false, error: 'No tab ID available' });
    }
    return;
```

实现重新检测逻辑:

```javascript
async function handleRedetectFromUI(tabId) {
    try {
        await updateUIPanel(tabId, 'EXECUTING', '正在从 UI 重新检测工具调用...');

        // 1. 获取站点配置
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = new URL(tab.url).hostname;
        const { apiList = [] } = await chrome.storage.local.get('apiList');
        const siteConfig = getSiteConfig(currentUrl, apiList);

        if (!siteConfig?.uiParsing?.enabled) {
            await updateUIPanel(tabId, 'ERROR', '当前站点未配置 UI 解析功能');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        // 2. 从页面 DOM 解析最后一条消息
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'PARSE_UI_CONTENT',
            payload: { uiConfig: siteConfig.uiParsing }
        });

        if (!response?.success || !response.content) {
            await updateUIPanel(tabId, 'ERROR', 'UI 解析失败,未获取到内容');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        // 3. 检测工具调用
        const toolCallMatch = response.content.match(/<?\s*tool_code\s*>?([\s\S]*?)<\s*\/\s*tool_code\s*>/);

        if (!toolCallMatch) {
            await updateUIPanel(tabId, 'SUCCESS', '未检测到工具调用');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        const toolCallJson = parseJsonSafely(toolCallMatch[1]);
        if (!toolCallJson || !toolCallJson.tool_name) {
            await updateUIPanel(tabId, 'ERROR', '检测到工具调用,但格式不正确');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        // 4. 执行工具调用
        const { tool_name, arguments: args } = toolCallJson;
        if (tool_name === 'list_tools_in_service') {
            await handleListTools(tabId, args.service_name);
        } else {
            await handleExecuteTool(tabId, tool_name, args);
        }
    } catch (error) {
        console.error('[MCP Bridge] Failed to redetect from UI:', error);
        await updateUIPanel(tabId, 'ERROR', '重新检测失败: ' + error.message);
        setTimeout(() => destroyUIPanel(tabId), 3000);
    }
}
```

## 工作流程

```
用户点击⏰按钮
    ↓
前端发送 REDETECT_FROM_UI 消息
    ↓
后台获取当前 Tab 的站点配置
    ↓
检查是否启用 UI 解析功能
    ↓
发送 PARSE_UI_CONTENT 到 content_script
    ↓
content_script 使用配置的选择器提取最后一条消息
    ↓
返回消息内容到 background
    ↓
使用正则匹配 <tool_code>...</tool_code>
    ↓
解析 JSON 获取工具名和参数
    ↓
执行工具调用（复用现有逻辑）
    ↓
工具结果注入到输入框并发送
```

## 与其他兜底机制的对比

| 机制 | 触发方式 | 前置条件 | 用户操作 | 适用场景 |
|------|----------|----------|----------|----------|
| API 解析 | 自动 | 配置 `response` | 无 | 正常流程,最快速 |
| UI DOM 解析 | 自动 | 配置 `uiParsing` + `priority: "api"` | 无 | API 解析失败时自动兜底 |
| **重新检测** | **手动** | **配置 `uiParsing`** | **点击按钮** | **页面刷新/错过检测/重试** |
| 手动输入 | 手动 | 无 | 复制粘贴 | 所有配置失效时的最终兜底 |

## 优势

1. ✅ **一键操作** - 只需点击按钮,无需复制粘贴
2. ✅ **断点续传** - 页面刷新后可以恢复执行
3. ✅ **重试机制** - 失败后可以多次重试
4. ✅ **复用逻辑** - 使用已有的 UI 解析和工具执行逻辑
5. ✅ **状态反馈** - 浮窗实时显示检测和执行状态

## 限制

1. ⚠️ **需要 UI 配置** - 必须正确配置 `uiParsing` 选择器
2. ⚠️ **依赖页面结构** - 页面 DOM 变化可能导致失效
3. ⚠️ **只能检测最后一条** - 无法检测历史消息中的工具调用
4. ⚠️ **需要消息可见** - 如果消息已被删除或隐藏则无法检测

## 调试技巧

如果重新检测失败,打开控制台查看日志:

```javascript
// 成功的日志
[MCP Bridge] Redetected UI content length: 253
[MCP Bridge] Redetected tool call: {tool_name: "...", arguments: {...}}

// 失败的日志
[MCP Bridge] parseUIContent: Found containers: 0  // 选择器错误
[MCP Bridge] Failed to redetect from UI: ...     // 错误详情
```

使用以下代码测试选择器:

```javascript
// 在页面控制台运行
const containers = document.querySelectorAll('.ds-message');
console.log('消息数量:', containers.length);
const last = containers[containers.length - 1];
console.log('最后一条:', last?.querySelector('.ds-markdown')?.innerText);
```

## 相关文档

- [FALLBACK_GUIDE.md](./FALLBACK_GUIDE.md) - 完整的兜底机制使用指南
- [RESPONSE_CONFIG_GUIDE.md](./RESPONSE_CONFIG_GUIDE.md) - UI 解析配置详解
- [README.md](../README.md) - 项目总览
