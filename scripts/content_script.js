/**
 * content_script.js (Corrected with postMessage)
 */

let statusPanel = null;
const MESSAGE_SOURCE_INJECTOR = 'mcp-bridge-injector';
const MESSAGE_SOURCE_CONTENT = 'mcp-bridge-content-script';

async function main() {
    // 检查当前网站是否在 api_list 中
    const currentHostname = window.location.hostname;
    const { api_list = [] } = await chrome.storage.local.get('api_list');
    const isSupported = api_list.some(item => item.hostname === currentHostname);
    
    if (!isSupported) {
        console.log('[MCP Bridge] Current site not in api_list, skipping panel creation');
        // 仍然监听消息,以便处理注入脚本的通信
        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) {
                return;
            }
            
            if (event.data.source === MESSAGE_SOURCE_INJECTOR && event.data.direction === 'to-content-script') {
                handleInjectorMessage(event.data);
                return;
            }
        });
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            handleBackgroundMessage(message, sender, sendResponse, null);
            return true;
        });
        
        return; // 不创建浮窗
    }
    
    console.log('[MCP Bridge] Current site is supported, creating panel');
    
    const statusPanelModuleUrl = chrome.runtime.getURL('ui/status_panel.js');
    const { StatusPanel } = await import(statusPanelModuleUrl);

    // 立即创建常驻面板
    statusPanel = new StatusPanel();
    statusPanel.create(); // 初始化常驻面板

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) {
            return;
        }
        
        // 处理来自注入脚本的消息
        if (event.data.source === MESSAGE_SOURCE_INJECTOR && event.data.direction === 'to-content-script') {
            handleInjectorMessage(event.data);
            return;
        }
        
        // 处理来自浮窗面板的消息
        if (event.data.source === 'mcp-bridge-panel') {
            handlePanelMessage(event.data);
            return;
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        handleBackgroundMessage(message, sender, sendResponse, StatusPanel);
        return true;
    });
}

function handleInjectorMessage(data) {
    const { type, payload, requestId } = data;

    // 检查 extension context 是否有效
    if (!chrome.runtime?.id) {
        console.warn('[MCP Bridge Content] Extension context invalidated');
        
        // 如果是请求拦截消息，直接返回原始 body
        if (requestId) {
            window.postMessage({
                source: MESSAGE_SOURCE_CONTENT,
                requestId,
                payload: { modifiedBody: payload.body }
            }, '*');
        }
        
        // 对于非关键消息（如响应块），提示用户刷新页面
        if (type === 'XHR_RESPONSE_CHUNK' || type === 'FETCH_RESPONSE_CHUNK' || type === 'XHR_RESPONSE_COMPLETE') {
            // 检查是否已经显示过提示（避免频繁提示）
            const lastWarning = sessionStorage.getItem('mcp_context_warning');
            const now = Date.now();
            if (!lastWarning || now - parseInt(lastWarning) > 60000) { // 1分钟内只提示一次
                sessionStorage.setItem('mcp_context_warning', now.toString());
                console.error(
                    '%c[MCP Bridge] 扩展已重新加载，请刷新页面以恢复功能',
                    'color: #ff0000; font-size: 14px; font-weight: bold;'
                );
            }
        }
        
        return;
    }

    try {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('MCP Bridge: Error with background:', chrome.runtime.lastError.message);
                if (requestId) {
                    window.postMessage({
                        source: MESSAGE_SOURCE_CONTENT,
                        requestId,
                        payload: { modifiedBody: payload.body }
                    }, '*');
                }
                return;
            }

            if (response && requestId) {
                window.postMessage({
                    source: MESSAGE_SOURCE_CONTENT,
                    requestId,
                    payload: response.payload
                }, '*');
            }
        });
    } catch (error) {
        console.error('[MCP Bridge Content] Error sending message:', error);
        if (requestId) {
            window.postMessage({
                source: MESSAGE_SOURCE_CONTENT,
                requestId,
                payload: { modifiedBody: payload.body }
            }, '*');
        }
    }
}

function handleBackgroundMessage(message, sender, sendResponse, StatusPanel) {
    const { type, payload } = message;
    switch (type) {
        case 'UPDATE_UI_PANEL':
            if (!statusPanel) {
                statusPanel = new StatusPanel();
                statusPanel.create();
            }
            statusPanel.update(payload);
            sendResponse({ success: true });
            break;
        case 'DESTROY_UI_PANEL':
            if (statusPanel) {
                statusPanel.destroy();
                statusPanel = null;
            }
            sendResponse({ success: true });
            break;
        case 'STORE_API_LIST':
            localStorage.setItem('mcp_api_list', JSON.stringify(payload));
            sendResponse({ success: true });
            break;
        case 'INJECT_TEXT_AND_SUBMIT':
            // 动态导入 input_injector 并执行注入
            handleTextInjection(payload);
            sendResponse({ success: true });
            break;
        case 'PARSE_UI_CONTENT':
            // 解析页面 DOM 获取最新消息内容
            const content = parseUIContent(payload.uiConfig);
            sendResponse({ success: true, content });
            break;
        default:
            sendResponse({ success: true });
            break;
    }
    return true; // 保持异步响应通道开启
}

/**
 * 从页面 DOM 解析最新消息内容（兜底方案）
 * @param {object} uiConfig - UI 解析配置
 * @returns {string} - 解析到的文本内容
 */
function parseUIContent(uiConfig) {
    if (!uiConfig || !uiConfig.messageContainer) {
        console.warn('[MCP Bridge] parseUIContent: No messageContainer configured');
        return '';
    }

    try {
        const containers = document.querySelectorAll(uiConfig.messageContainer);
        console.log('[MCP Bridge] parseUIContent: Found containers:', containers.length);
        
        if (!containers || containers.length === 0) {
            console.warn('[MCP Bridge] parseUIContent: No containers found for selector:', uiConfig.messageContainer);
            return '';
        }

        // 获取指定索引的消息容器（支持负数索引）
        const index = uiConfig.messageIndex ?? -1;
        const targetIndex = index < 0 ? containers.length + index : index;
        const messageContainer = containers[targetIndex];

        console.log('[MCP Bridge] parseUIContent: Target index:', targetIndex, 'Total:', containers.length);

        if (!messageContainer) {
            console.warn('[MCP Bridge] parseUIContent: No container at index:', targetIndex);
            return '';
        }

        // 如果配置了内容选择器，使用它
        let contentElement = messageContainer;
        if (uiConfig.contentSelector) {
            const selected = messageContainer.querySelector(uiConfig.contentSelector);
            if (selected) {
                contentElement = selected;
                console.log('[MCP Bridge] parseUIContent: Using content selector:', uiConfig.contentSelector);
            } else {
                console.warn('[MCP Bridge] parseUIContent: Content selector not found:', uiConfig.contentSelector);
            }
        }

        // 提取文本内容
        const content = contentElement.innerText || contentElement.textContent || '';
        console.log('[MCP Bridge] parseUIContent: Extracted content length:', content.length);
        return content;
    } catch (error) {
        console.error('[MCP Bridge] Failed to parse UI content:', error);
        return '';
    }
}

async function handleTextInjection(payload) {
    try {
        const inputInjectorUrl = chrome.runtime.getURL('modules/input_injector.js');
        const { injectTextAndSubmit } = await import(inputInjectorUrl);
        await injectTextAndSubmit(payload.text, payload.inputConfig);
    } catch (error) {
        console.error('[MCP Bridge] Failed to inject text:', error);
    }
}

/**
 * 处理来自浮窗面板的消息
 */
function handlePanelMessage(data) {
    const { type, payload } = data;
    
    console.log('[MCP Bridge] Received panel message:', type);
    
    switch (type) {
        case 'MCP_BRIDGE_REDETECT_FROM_UI':
            // 转发重新检测请求到 background
            chrome.runtime.sendMessage({
                type: 'REDETECT_FROM_UI'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[MCP Bridge] Failed to send redetect message:', chrome.runtime.lastError);
                    // 通知浮窗失败
                    if (statusPanel) {
                        statusPanel.update({
                            status: 'ERROR',
                            message: '重新检测失败: ' + chrome.runtime.lastError.message
                        });
                    }
                } else {
                    console.log('[MCP Bridge] Redetect message sent, response:', response);
                }
            });
            break;
            
        case 'MCP_BRIDGE_MANUAL_TOOL_PARSE':
            // 转发手动输入请求到 background
            chrome.runtime.sendMessage({
                type: 'MANUAL_TOOL_PARSE',
                payload: payload
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[MCP Bridge] Failed to send manual parse message:', chrome.runtime.lastError);
                    // 通知浮窗失败
                    if (statusPanel) {
                        statusPanel.update({
                            status: 'ERROR',
                            message: '发送失败: ' + chrome.runtime.lastError.message
                        });
                    }
                } else if (!response?.success) {
                    console.error('[MCP Bridge] Manual parse failed:', response?.error);
                    if (statusPanel) {
                        statusPanel.update({
                            status: 'ERROR',
                            message: '发送失败: ' + (response?.error || '未知错误')
                        });
                    }
                }
            });
            break;
            
        default:
            console.warn('[MCP Bridge] Unknown panel message type:', type);
    }
}

main().catch(console.error);