/**
 * background.js (Corrected with robust async message handling)
 */

import * as apiClient from '../modules/api_client.js';
import * as promptBuilder from '../modules/prompt_builder.js';
import {getConfig} from "../modules/api_client.js";

// --- 插件生命周期事件 ---
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        try {
            const response = await fetch(chrome.runtime.getURL('config/api_list.json'));
            const apiList = await response.json();
            await chrome.storage.local.set({api_list: apiList});
        } catch (error) {
            console.error('MCP Bridge: Failed to initialize API list:', error);
        }
        await chrome.storage.local.set({mcp_enabled: true, always_inject: {}});
    }
});

// --- 页面加载处理 ---
chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId === 0) {
        try {
            const {api_list} = await chrome.storage.local.get('api_list');
            if (api_list) {
                await chrome.tabs.sendMessage(details.tabId, {type: 'STORE_API_LIST', payload: api_list});
            }
        } catch (error) { /* 忽略 */
        }
    }
});

// --- 消息监听与路由 (+++ 关键修正: 使用 async 和 try/catch 保证响应 +++) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const {type, payload} = message;
    console.log('message',  message, sender);

    (async () => {
        try {
            if (sender.tab && sender.tab.id) {
                const tabId = sender.tab.id;
                switch (type) {
                    case 'FETCH_REQUEST_BODY':
                        const fetchResponse = await handleRequestBody(tabId, payload);
                        sendResponse(fetchResponse);
                        return;
                    case 'XHR_REQUEST_BODY':
                        const response = await handleRequestBody(tabId, payload);

                        sendResponse(response);
                        return;
                    case 'FETCH_RESPONSE_CHUNK':
                        await handleResponseChunk(tabId, payload);
                        sendResponse({success: true});
                        return;
                    case 'XHR_RESPONSE_CHUNK':
                        // 处理流式响应的中间块
                        await handleResponseChunk(tabId, payload);
                        sendResponse({success: true});
                        return;
                    case 'FETCH_RESPONSE_COMPLETE':
                        await handleResponseComplete(tabId, payload);
                        sendResponse({success: true});
                        return;
                    case 'XHR_RESPONSE_COMPLETE':
                        await handleResponseComplete(tabId, payload);
                        sendResponse({success: true}); // 即使没有返回值，也确认收到
                        return;
                    case 'GET_CONFIG':
                        console.log('Config接受')
                        const config = await apiClient.getConfig();
                        sendResponse(config);
                        return;
                    case 'UPDATE_CONFIG':
                        const updateResult = await apiClient.updateConfig(payload);
                        sendResponse(updateResult);
                        return;
                    case 'REDETECT_FROM_UI':
                        // 从最后一条 UI 消息重新检测工具调用
                        console.log('[MCP Bridge] Received REDETECT_FROM_UI message', sender);
                        console.log('[MCP Bridge] Tab ID:', tabId);
                        await handleRedetectFromUI(tabId);
                        sendResponse({ success: true });
                        return;
                    case 'MANUAL_TOOL_PARSE':
                        // 处理用户手动粘贴的内容
                        console.log('[MCP Bridge] Received MANUAL_TOOL_PARSE message');
                        await handleManualToolParse(tabId, payload.content);
                        sendResponse({ success: true });
                        return;
                }
            } else {
                switch (type) {
                    case 'CHECK_HEALTH':
                        const health = await apiClient.checkHealth();
                        sendResponse(health);
                        return;
                    case 'REFRESH_SYSTEM_PROMPT':
                        const refreshResult = await handleRefreshSystemPrompt(payload.tabId);
                        sendResponse(refreshResult);
                        return;
                    case 'REFRESH_SYSTEM_PROMPT_FROM_PANEL':
                        // 从状态面板触发，需要获取发送者的tabId
                        if (sender.tab?.id) {
                            const panelRefreshResult = await handleRefreshSystemPrompt(sender.tab.id);
                            sendResponse(panelRefreshResult);
                        } else {
                            sendResponse({ success: false, error: 'No tab ID' });
                        }
                        return;
                }
            }
        } catch (error) {
            console.error(`MCP Bridge: Error handling message type ${type}:`, error);
            // 发生任何错误，都返回一个错误信息，确保端口不会挂起
            sendResponse({error: error.message});
        }
    })();

    return true; // 始终返回 true，因为我们总是异步处理
});

/**
 * 处理请求体，在发送到服务器前修改请求内容
 * @param {number} tabId - 浏览器标签页ID
 * @param {Object} payload - 请求载荷数据
 * @param {string} payload.url - 请求URL
 * @param {string} payload.body - 请求体内容（JSON字符串）
 * @returns {Promise<Object>} 修改后的响应对象
 */
async function handleRequestBody(tabId, payload) {
    const {mcp_enabled} = await chrome.storage.local.get('mcp_enabled');
    if (!mcp_enabled) return createResponse(payload.body);

    const state = await getTabState(tabId);
    if (state.status === 'FEEDING_BACK') {
        await setTabState(tabId, {status: 'AWAITING_RESPONSE', toolName: state.toolName});
        return createResponse(JSON.stringify(state.modifiedBody));
    }

    const {api_list, always_inject = {}} = await chrome.storage.local.get(['api_list', 'always_inject']);
    const siteConfig = getSiteConfig(payload.url, api_list);
    console.log('api_list', api_list, payload)
    if (!siteConfig) return createResponse(payload.body);

    const bodyJson = parseJsonSafely(payload.body);
    console.log('bodyJson', bodyJson)
    if (!bodyJson) return createResponse(payload.body);

    const isNewConversation = checkIsNewConversation(bodyJson, siteConfig);
    const shouldAlwaysInject = always_inject[siteConfig.hostname] || false;

    if (isNewConversation || shouldAlwaysInject) {
        await updateUIPanel(tabId, 'EXECUTING', '正在构建并注入 MCP Prompt...');
        const services = await apiClient.getServices(); // 如果这里失败，会被外层 try/catch 捕获
        const initialPrompt = promptBuilder.buildInitialPrompt(services);
        const reminderPrompt = promptBuilder.buildReminderPrompt();

        // 支持单个路径或多个路径
        const promptPaths = Array.isArray(siteConfig.promptPath) ? siteConfig.promptPath : [siteConfig.promptPath];
        
        console.log('[MCP Bridge] Injecting to paths:', promptPaths);
        console.log('[MCP Bridge] isJsonString:', siteConfig.isJsonString);
        console.log('[MCP Bridge] Request body before injection:', JSON.stringify(bodyJson).substring(0, 200));
        
        // 对每个路径都进行注入
        for (const path of promptPaths) {
            const originalPrompt = getByPath(bodyJson, path, siteConfig.isJsonString) || '';
            console.log(`[MCP Bridge] Path "${path}" original value:`, originalPrompt);
            const finalPrompt = (isNewConversation ? initialPrompt + '\n\n---\n\n' : reminderPrompt + '\n\n---\n\n') + originalPrompt;
            setByPath(bodyJson, path, finalPrompt, siteConfig);
            console.log(`[MCP Bridge] Path "${path}" after injection:`, getByPath(bodyJson, path, siteConfig.isJsonString)?.substring(0, 100));
        }
        
        console.log('[MCP Bridge] Request body after injection:', JSON.stringify(bodyJson).substring(0, 200));

        const modifiedBody = JSON.stringify(bodyJson);
        await setTabState(tabId, {status: 'AWAITING_RESPONSE'});
        return createResponse(modifiedBody);
    }

    await setTabState(tabId, {status: 'AWAITING_RESPONSE'});
    return createResponse(payload.body);
}

/**
 * 处理流式响应的中间块（检测工具调用）
 */
async function handleResponseChunk(tabId, payload) {
    if (!payload || typeof payload.fullText !== 'string') return;

    const {mcp_enabled} = await chrome.storage.local.get('mcp_enabled');
    if (!mcp_enabled) return;

    // 检查是否包含完整的工具调用标签
    // 高容错:开头和结尾的 < > 都是可选的,兼容 SSE 解析丢失字符的情况
    // 匹配: <tool_code> 或 tool_code> 或 <tool_code 或 tool_code
    const toolCallMatch = payload.fullText.match(/<?\s*tool_code\s*>?([\s\S]*?)<\s*\/\s*tool_code\s*>/);
    if (!toolCallMatch) return;

    const toolCallJson = parseJsonSafely(toolCallMatch[1]);
    if (!toolCallJson || !toolCallJson.tool_name) return;

    console.log('[MCP Bridge] Tool call detected in stream chunk:', toolCallJson);

    // 检查是否已经处理过这个工具调用（避免重复触发）
    const state = await getTabState(tabId);
    if (state.currentToolCall === toolCallMatch[0]) {
        console.log('[MCP Bridge] Tool call already processed, skipping');
        return;
    }

    // 记录当前工具调用，避免重复处理
    await setTabState(tabId, { ...state, currentToolCall: toolCallMatch[0] });

    const {tool_name, arguments: args} = toolCallJson;
    if (tool_name === 'list_tools_in_service') {
        await handleListTools(tabId, args.service_name);
    } else {
        await handleExecuteTool(tabId, tool_name, args);
    }
}

async function handleResponseComplete(tabId, payload) {
    if (!payload || typeof payload.fullText !== 'string') {
        const state = await getTabState(tabId);
        if (state.status === 'AWAITING_RESPONSE') {
            await destroyUIPanel(tabId);
            await clearTabState(tabId);
        }
        return;
    }

    const {mcp_enabled, api_list} = await chrome.storage.local.get(['mcp_enabled', 'api_list']);
    if (!mcp_enabled) return;

    let fullText = payload.fullText;
    const siteConfig = getSiteConfig(payload.url, api_list);
    
    // 如果配置了 UI 解析，根据优先级决定是否使用 DOM 解析
    if (siteConfig?.uiParsing?.enabled && siteConfig.uiParsing.messageContainer) {
        const uiPriority = siteConfig.uiParsing.priority || 'api';
        let shouldTryUI = false;
        let shouldReplaceText = false;
        
        if (uiPriority === 'ui') {
            // UI 优先：直接使用 UI 解析，替换 API 结果
            shouldTryUI = true;
            shouldReplaceText = true;
            console.log('[MCP Bridge] UI parsing priority: using DOM content');
        } else {
            // API 优先：只在 API 失败时使用 UI 解析
            shouldTryUI = !fullText || fullText.trim() === '';
            shouldReplaceText = shouldTryUI;
            if (shouldTryUI) {
                console.log('[MCP Bridge] API parsing failed, falling back to UI parsing');
            }
        }
        
        if (shouldTryUI) {
            try {
                const response = await chrome.tabs.sendMessage(tabId, {
                    type: 'PARSE_UI_CONTENT',
                    payload: { uiConfig: siteConfig.uiParsing }
                });
                
                if (response?.success && response.content) {
                    console.log('[MCP Bridge] UI parsed content length:', response.content.length);
                    if (shouldReplaceText) {
                        fullText = response.content;
                    }
                }
            } catch (error) {
                console.error('[MCP Bridge] Failed to parse UI content:', error);
            }
        }
    }

    // 高容错:开头和结尾的 < > 都是可选的
    const toolCallMatch = fullText.match(/<?\s*tool_code\s*>?([\s\S]*?)<\s*\/\s*tool_code\s*>/);
    if (!toolCallMatch) {
        const state = await getTabState(tabId);
        if (state.status === 'AWAITING_RESPONSE') {
            await updateUIPanel(tabId, 'SUCCESS', '响应完成，未发现工具调用。');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            await clearTabState(tabId);
        }
        return;
    }

    const toolCallJson = parseJsonSafely(toolCallMatch[1]);
    if (!toolCallJson || !toolCallJson.tool_name) {
        // 把错误信息发送给模型
        try {
            JSON.parse(toolCallMatch[1])
        } catch (e) {
            await injectToolResult(tabId, `**工具调用失败！** \n\n错误信息:\n\n${e.message}`)
        }

        await updateUIPanel(tabId, 'ERROR', '模型尝试调用工具，但格式不正确。');
        return;
    }

    console.log('[MCP Bridge] Parsed tool call:', toolCallJson);

    const {tool_name, arguments: args} = toolCallJson;
    if (tool_name === 'list_tools_in_service') {
        await handleListTools(tabId, args.service_name);
    } else {
        await handleExecuteTool(tabId, tool_name, args);
    }
}

async function handleListTools(tabId, serviceName) {
    try {
        await updateUIPanel(tabId, 'EXECUTING', `查询服务 <strong>${serviceName}</strong> 的工具...`);
        const tools = await apiClient.getToolsByServer(serviceName);
        const resultText = `服务 "${serviceName}" 下有以下工具:\n${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`;
        
        await updateUIPanel(tabId, 'SUCCESS', `已获取工具列表，正在反馈给模型...`);
        
        // 使用智能输入注入代替页面刷新
        await injectToolResult(tabId, resultText);
        await clearTabState(tabId);
    } catch (error) {
        await handleToolError(tabId, 'list_tools_in_service', error.message);
    }
}

async function handleExecuteTool(tabId, toolName, args) {
    try {
        await updateUIPanel(tabId, 'EXECUTING', `执行工具: <strong>${toolName}</strong>...`, {
            title: '参数',
            content: JSON.stringify(args, null, 2)
        });
        const result = await apiClient.executeTool(toolName, args);
        const resultText = promptBuilder.formatToolResultForModel(toolName, result);
        
        await updateUIPanel(tabId, 'SUCCESS', `工具执行成功，正在反馈给模型...`, {
            title: '结果',
            content: JSON.stringify(result, null, 2)
        });
        
        // 使用智能输入注入代替页面刷新
        await injectToolResult(tabId, resultText);
        await clearTabState(tabId);
    } catch (error) {
        console.error('[MCP Bridge] Tool execution error:', error);
        await handleToolError(tabId, toolName, error);
    }
}

async function handleToolError(tabId, toolName, error) {
    // 构建详细的错误信息
    let errorMessage = error.message || '未知错误';
    let errorDetails = errorMessage;
    let fullErrorText = errorMessage; // 用于注入到输入框的完整错误
    
    // 如果有详细错误对象,提取更多信息
    if (error.details && typeof error.details === 'object') {
        const details = error.details;
        errorMessage = details.error || errorMessage;
        
        // 构建详细错误信息(用于浮窗显示)
        const errorParts = [`错误类型: ${details.type || 'Error'}`];
        errorParts.push(`错误信息: ${details.error || errorMessage}`);
        
        if (details.traceback) {
            errorParts.push(`\n调用堆栈:\n${details.traceback}`);
        }
        
        errorDetails = errorParts.join('\n');
        
        // 构建用于注入的完整错误(包含类型和堆栈)
        fullErrorText = errorMessage;
        if (details.type) {
            fullErrorText = `[${details.type}] ${fullErrorText}`;
        }
        if (details.traceback) {
            // 截取堆栈的关键部分(最后几行通常最有用)
            const tracebackLines = details.traceback.split('\n');
            const importantLines = tracebackLines.slice(-10); // 取最后10行
            fullErrorText += `\n\n调用堆栈:\n${importantLines.join('\n')}`;
        }
    }
    
    console.error('[MCP Bridge] Tool error details:', errorDetails);
    
    const errorText = promptBuilder.formatToolErrorForModel(toolName, fullErrorText);
    
    await updateUIPanel(tabId, 'ERROR', `工具 <strong>${toolName}</strong> 执行失败`, {
        title: '错误详情',
        content: errorDetails
    });
    
    // 使用智能输入注入代替页面刷新
    await injectToolResult(tabId, errorText);
    await clearTabState(tabId);
}

/**
 * 注入工具执行结果到输入框并发送
 */
async function injectToolResult(tabId, resultText) {
    try {
        // 获取当前网站的配置
        const {api_list} = await chrome.storage.local.get('api_list');
        const currentHostname = await getCurrentHostname(tabId);
        const siteConfig = api_list?.find(site => site.hostname === currentHostname);
        
        if (!siteConfig || !siteConfig.input) {
            console.error('[MCP Bridge] No input config found for:', currentHostname);
            return;
        }

        // 发送消息到 content script 执行注入
        await chrome.tabs.sendMessage(tabId, {
            type: 'INJECT_TEXT_AND_SUBMIT',
            payload: {
                text: resultText,
                inputConfig: siteConfig.input
            }
        });
    } catch (error) {
        console.error('[MCP Bridge] Failed to inject tool result:', error);
    }
}

/**
 * 获取标签页的 hostname
 */
async function getCurrentHostname(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const url = new URL(tab.url);
        return url.hostname;
    } catch (error) {
        console.error('[MCP Bridge] Failed to get hostname:', error);
        return '';
    }
}

function createResponse(modifiedBody) {
    return {payload: {modifiedBody}};
}

async function getTabState(tabId) {
    const key = `tab_${tabId}_state`;
    const data = await chrome.storage.session.get(key);
    return data[key] || {status: 'IDLE'};
}

async function setTabState(tabId, state) {
    const key = `tab_${tabId}_state`;
    await chrome.storage.session.set({[key]: state});
}

async function clearTabState(tabId) {
    const key = `tab_${tabId}_state`;
    await chrome.storage.session.remove(key);
}

async function updateUIPanel(tabId, status, message, details = null) {
    try {
        await chrome.tabs.sendMessage(tabId, {type: 'UPDATE_UI_PANEL', payload: {status, message, details}});
    } catch (e) {
    }
}

async function destroyUIPanel(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, {type: 'DESTROY_UI_PANEL'});
    } catch (e) {
    }
}

function getSiteConfig(url, apiList) {
    if (!url || !Array.isArray(apiList)) return null;
    try {
        for (const apiItem of apiList) {
            const apis = apiItem?.api ?? [];
            for (const apiEndpoint of apis) {
                if (apiEndpoint.includes(url) || url.includes(apiEndpoint)) return apiItem;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function parseJsonSafely(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

// 修正：为不同网站提供更准确的新对话判断
function checkIsNewConversation(body, siteConfig) {
    if (siteConfig.name === 'chatgpt' && body.parent_message_id) {
        return body.parent_message_id.includes('00000000-0000-0000-0000-000000000000');
    }
    if (siteConfig.name === 'doubao' && body?.conversation_id == '0') return true;
    return !body.conversation_id && !body.parent_message_id && !body.sessionId;
}

function getByPath(obj, path, isJsonString) {
    const parts = path.split('.');
    
    if (isJsonString && parts.length >= 2) {
        // 对于 JSON 字符串,需要特殊处理
        const innerKey = parts.pop();
        const jsonFieldKey = parts.pop();
        
        let target = obj;
        for (const part of parts) {
            if (!target) return undefined;
            target = target[part];
        }
        
        if (target && typeof target === 'object' && jsonFieldKey) {
            try {
                const jsonString = target[jsonFieldKey];
                if (typeof jsonString === 'string') {
                    const innerObj = JSON.parse(jsonString);
                    return innerObj ? innerObj[innerKey] : undefined;
                }
            } catch (e) {
                console.error('[MCP Bridge] Failed to parse JSON string in getByPath:', e);
                return undefined;
            }
        }
        return undefined;
    } else {
        // 普通路径
        return parts.reduce((acc, part) => acc && acc[part], obj);
    }
}

function setByPath(obj, path, value, siteConfig) {
    const {isJsonString} = siteConfig;
    const parts = path.split('.');
    
    if (isJsonString && parts.length >= 2) {
        // 对于 JSON 字符串,需要特殊处理
        // 例如: "messages.0.content.text" 
        // - parts = ["messages", "0", "content", "text"]
        // - 我们需要找到 "content" 字段,解析它,修改内部的 "text",再序列化回去
        
        const innerKey = parts.pop(); // "text"
        const jsonFieldKey = parts.pop(); // "content"
        
        // 导航到 JSON 字符串所在的对象
        let target = obj;
        for (const part of parts) {
            if (target === undefined || target === null) return;
            target = target[part];
        }
        
        if (target && typeof target === 'object' && jsonFieldKey) {
            try {
                const jsonString = target[jsonFieldKey];
                if (typeof jsonString === 'string') {
                    const innerObj = JSON.parse(jsonString);
                    if (innerObj && typeof innerObj === 'object') {
                        innerObj[innerKey] = value;
                        target[jsonFieldKey] = JSON.stringify(innerObj);
                    }
                } else {
                    console.warn('[MCP Bridge] isJsonString is true but field is not a string:', jsonString);
                }
            } catch (e) {
                console.error('[MCP Bridge] Failed to parse and set value in JSON string:', e);
            }
        }
    } else {
        // 普通路径处理
        const lastPart = parts.pop();
        let target = obj;
        for (const part of parts) {
            if (target === undefined || target === null) return;
            target = target[part];
        }
        if (target && typeof target === 'object' && lastPart) {
            target[lastPart] = value;
        }
    }
}

/**
 * 刷新 System Prompt 并注入到当前页面
 * @param {number} tabId - 标签页ID
 * @returns {Promise<Object>} 操作结果
 */
async function handleRefreshSystemPrompt(tabId) {
    try {
        await updateUIPanel(tabId, 'EXECUTING', '正在获取最新工具列表...');

        // 获取服务列表
        const services = await apiClient.getServices();
        
        // 构建完整的初始 Prompt
        const systemPrompt = promptBuilder.buildInitialPrompt(services);
        
        await updateUIPanel(tabId, 'SUCCESS', 'System Prompt 已刷新，正在注入...');

        // 获取当前站点配置
        const { api_list, auto_submit_prompt } = await chrome.storage.local.get(['api_list', 'auto_submit_prompt']);
        const currentHostname = await getCurrentHostname(tabId);
        const siteConfig = api_list?.find(site => site.hostname === currentHostname);
        
        if (!siteConfig || !siteConfig.input) {
            throw new Error(`当前网站 (${currentHostname}) 未配置输入选项`);
        }

        // 创建输入配置，根据用户设置决定是否自动发送
        const inputConfig = {
            ...siteConfig.input,
            // 如果用户关闭了自动发送，则不触发提交按键
            submitKey: auto_submit_prompt ? siteConfig.input.submitKey : null
        };

        // 发送注入消息
        await chrome.tabs.sendMessage(tabId, {
            type: 'INJECT_TEXT_AND_SUBMIT',
            payload: {
                text: systemPrompt,
                inputConfig: inputConfig
            }
        });

        await updateUIPanel(tabId, 'SUCCESS', `System Prompt 已${auto_submit_prompt ? '注入并发送' : '注入到输入框'}`);
        
        // 2秒后清除面板
        setTimeout(() => clearTabState(tabId), 2000);

        return { success: true };
    } catch (error) {
        console.error('[MCP Bridge] Failed to refresh system prompt:', error);
        await updateUIPanel(tabId, 'ERROR', '刷新 Prompt 失败', {
            title: '错误详情',
            content: error.message
        });
        return { success: false, error: error.message };
    }
}

/**
 * 处理用户手动粘贴的内容(兜底方案)
 */
async function handleManualToolParse(tabId, content) {
    try {
        await updateUIPanel(tabId, 'EXECUTING', '正在解析手动输入的内容...');

        // 使用相同的正则匹配工具调用
        const toolCallMatch = content.match(/<?\s*tool_code\s*>?([\s\S]*?)<\s*\/\s*tool_code\s*>/);

        if (!toolCallMatch) {
            await updateUIPanel(tabId, 'ERROR', '未在内容中找到工具调用标签');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        const toolCallJson = parseJsonSafely(toolCallMatch[1]);
        if (!toolCallJson || !toolCallJson.tool_name) {
            await updateUIPanel(tabId, 'ERROR', '工具调用格式不正确');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        console.log('[MCP Bridge] Manual tool call parsed:', toolCallJson);

        // 执行工具调用
        const { tool_name, arguments: args } = toolCallJson;
        if (tool_name === 'list_tools_in_service') {
            await handleListTools(tabId, args.service_name);
        } else {
            await handleExecuteTool(tabId, tool_name, args);
        }
    } catch (error) {
        console.error('[MCP Bridge] Failed to parse manual content:', error);
        await updateUIPanel(tabId, 'ERROR', '解析失败: ' + error.message);
        setTimeout(() => destroyUIPanel(tabId), 3000);
    }
}

/**
 * 从最后一条 UI 消息重新检测工具调用(断点续传)
 */
async function handleRedetectFromUI(tabId) {
    console.log('[MCP Bridge] handleRedetectFromUI called with tabId:', tabId);
    
    try {
        await updateUIPanel(tabId, 'EXECUTING', '正在从 UI 重新检测工具调用...');

        // 获取当前 Tab 的 URL
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = new URL(tab.url).hostname;
        
        console.log('[MCP Bridge] Current URL hostname:', currentUrl);

        // 获取 API 配置列表
        const { api_list = [] } = await chrome.storage.local.get('api_list');
        
        console.log('[MCP Bridge] api_list:', api_list);
        
        // 使用 hostname 字段匹配站点配置
        const siteConfig = api_list.find(item => item.hostname === currentUrl);
        
        console.log('[MCP Bridge] Site config:', siteConfig);

        if (!siteConfig) {
            console.warn('[MCP Bridge] No site config found for hostname:', currentUrl);
            await updateUIPanel(tabId, 'ERROR', '无法获取站点配置');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        // 检查是否配置了 UI 解析
        if (!siteConfig.uiParsing || !siteConfig.uiParsing.enabled) {
            await updateUIPanel(tabId, 'ERROR', '当前站点未配置 UI 解析功能');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        // 从页面 DOM 解析最后一条消息
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'PARSE_UI_CONTENT',
            payload: { uiConfig: siteConfig.uiParsing }
        });

        if (!response?.success || !response.content) {
            await updateUIPanel(tabId, 'ERROR', 'UI 解析失败,未获取到内容');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        console.log('[MCP Bridge] Redetected UI content length:', response.content.length);

        // 使用解析到的内容检测工具调用
        const toolCallMatch = response.content.match(/<?\s*tool_code\s*>?([\s\S]*?)<\s*\/\s*tool_code\s*>/);

        if (!toolCallMatch) {
            await updateUIPanel(tabId, 'SUCCESS', '未检测到工具调用');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        const toolCallJson = parseJsonSafely(toolCallMatch[1]);
        if (!toolCallJson || !toolCallJson.tool_name) {
            // 把错误信息发送给模型
            try {
                JSON.parse(toolCallMatch[1])
            } catch (e) {
                await injectToolResult(tabId, `**工具调用失败！** \n\n错误信息:\n\n${e.message}`)
            }
            await updateUIPanel(tabId, 'ERROR', '检测到工具调用,但格式不正确');
            setTimeout(() => destroyUIPanel(tabId), 3000);
            return;
        }

        console.log('[MCP Bridge] Redetected tool call:', toolCallJson);

        // 执行工具调用
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
