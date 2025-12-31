/**
 * api_client.js
 *
 * 职责: 封装所有与本地 MCP Bridge Server (localhost:3849) 的 API 通信。
 * 提供了一组简单、异步的函数供 background.js 调用。
 * 集中处理网络请求、URL构造和基本的错误处理。
 */

/**
 * 从 chrome.storage 获取桥接服务端口
 * @returns {Promise<number>} - 端口号，默认 3849
 */
async function getBridgePort() {
    try {
        const { bridge_port } = await chrome.storage.local.get('bridge_port');
        return bridge_port || 3849;
    } catch (error) {
        console.warn('MCP Bridge: Failed to get bridge port, using default 3849', error);
        return 3849;
    }
}

/**
 * 获取基础 URL
 * @returns {Promise<string>} - 基础 URL
 */
async function getBaseUrl() {
    const port = await getBridgePort();
    return `http://localhost:${port}`;
}

/**
 * 封装的 fetch 函数，增加了超时和统一的错误处理。
 * @param {string} url - 目标 URL。
 * @param {RequestInit} options - fetch 的配置选项。
 * @param {number} timeout - 超时时间 (毫秒)。
 * @returns {Promise<any>} - 解析后的 JSON 数据。
 */
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => {
        controller.abort();
    }, timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });


        clearTimeout(id);

        if (!response.ok) {
            // 尝试解析错误响应体
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { detail: `HTTP error! status: ${response.status}` };
            }
            
            // FastAPI 返回的错误格式: { detail: ... }
            // detail 可能是字符串或对象
            let errorMessage = '';
            if (typeof errorData.detail === 'object') {
                // 详细错误对象
                errorMessage = errorData.detail.error || JSON.stringify(errorData.detail);
            } else {
                // 字符串错误
                errorMessage = errorData.detail || errorData.error || `HTTP error! status: ${response.status}`;
            }
            
            // 保存完整的错误信息供后续使用
            const error = new Error(errorMessage);
            error.details = errorData.detail;
            error.status = response.status;
            throw error;
        }

        const jsonData = await response.json();
        return jsonData;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            console.error('MCP Bridge: Fetch aborted due to timeout', url);
            throw new Error('请求超时，请检查 MCP Bridge 服务是否正在运行。');
        }
        // 重新抛出更具体的错误信息
        console.error('MCP Bridge: Fetch error', error);
        throw new Error(error.message || '网络请求失败，无法连接到 MCP Bridge 服务。');
    }
}

/**
 * 检查本地 MCP Bridge Server 的健康状况。
 * @returns {Promise<{status: string}>}
 */
export async function checkHealth() {
    const baseUrl = await getBaseUrl();
    return await fetchWithTimeout(`${baseUrl}/health`, {}, 2000);
}

/**
 * 获取所有已加载服务的列表及其描述 (第一层发现)。
 * @returns {Promise<Array<{name: string, description: string}>>}
 */
export async function getServices() {
    const baseUrl = await getBaseUrl();
    const data = await fetchWithTimeout(`${baseUrl}/tools`);
    if (data && data.success && Array.isArray(data.services)) {
        return data.services;
    }
    throw new Error('从 Bridge 服务获取服务列表失败或格式不正确。');
}

/**
 * 根据服务名称获取该服务下的所有具体工具 (第二层发现)。
 * @param {string} serverName - 服务名称。
 * @returns {Promise<{service_name: string, service_description: string, tools: Array<Object>}>} - 包含服务信息和工具列表的对象。
 */
export async function getToolsByServer(serverName) {
    const baseUrl = await getBaseUrl();
    const url = new URL(`${baseUrl}/tools`);
    url.searchParams.append('serverName', serverName);
    const data = await fetchWithTimeout(url.toString());
    if (data && data.success) {
        // 服务端现在返回 { success: true, tools: { service_name, service_description, tools: [...] } }
        // 或者可能是 { success: true, tools: {...} }
        return data.tools;
    }
    throw new Error(`从 Bridge 服务获取 "${serverName}" 的工具列表失败。`);
}

/**
 * 执行一个指定的工具。
 * @param {string} toolName - 工具名称。
 * @param {Object} args - 工具参数。
 * @returns {Promise<any>} - 工具执行的结果。
 */
export async function executeTool(toolName, args) {
    const baseUrl = await getBaseUrl();
    const data = await fetchWithTimeout(`${baseUrl}/execute`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: toolName,
            arguments: args
        })
    }, 120000); // 工具执行可能耗时较长，设置更长的超时时间 (2分钟)

    if (data && data.success) {
        // 检查是否是缓存引用
        if (data.result_type === 'cached_reference') {
            // 返回完整的缓存信息
            return {
                result_type: data.result_type,
                cache_id: data.cache_id,
                cache_type: data.cache_type,
                total_size: data.total_size,
                message: data.message
            };
        }
        // 普通结果，返回 result 字段
        return data.result;
    }
    throw new Error(data.error || `执行工具 "${toolName}" 失败。`);
}

/**
 * 获取远程 mcp-config.json 的内容。
 * @returns {Promise<Object>}
 */
export async function getConfig() {
    console.log('MCP Bridge: Fetching config')
    try {
        const baseUrl = await getBaseUrl();
        const data = await fetchWithTimeout(`${baseUrl}/config`);
        if (data && data.success) {
            return data.config;
        }
        const error = new Error('获取远程配置失败。');
        console.error('MCP Bridge: Config retrieval failed', error);
        throw error;
    } catch (error) {
        console.error('MCP Bridge: Error getting config', error);
        // 添加更多错误信息
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('无法连接到本地MCP Bridge服务。请确保服务正在运行。');
        }
        throw error;
    }
}

/**
 * 更新 mcp-config.json 的内容并触发重载。
 * @param {Object} newConfig - 新的配置对象。
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function updateConfig(newConfig) {
    const baseUrl = await getBaseUrl();
    return await fetchWithTimeout(`${baseUrl}/config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ config: newConfig })
    });
}

/**
 * 获取缓存的结果（完整或分段）
 * @param {string} cacheId - 缓存ID
 * @param {number} [start] - 可选，起始位置（字符索引）
 * @param {number} [end] - 可选，结束位置（字符索引）
 * @returns {Promise<Object>} - 包含 content 和 metadata 的对象
 */
export async function getCachedResult(cacheId, start = null, end = null) {
    const baseUrl = await getBaseUrl();
    const url = new URL(`${baseUrl}/result/${cacheId}`);
    
    if (start !== null && start !== undefined) {
        url.searchParams.append('start', start);
    }
    if (end !== null && end !== undefined) {
        url.searchParams.append('end', end);
    }
    
    const data = await fetchWithTimeout(url.toString(), {}, 30000); // 30秒超时
    
    if (data && data.success) {
        return {
            content: data.result,
            metadata: data.metadata || {}
        };
    }
    
    throw new Error(data.error || '获取缓存结果失败');
}

/**
 * 在缓存内容中搜索关键词
 * @param {string} cacheId - 缓存ID
 * @param {string} keyword - 搜索关键词
 * @param {boolean} [caseSensitive] - 是否区分大小写，默认false
 * @param {number} [maxResults] - 最大返回结果数，默认50
 * @returns {Promise<Object>} - 搜索结果，包含匹配的行号、列号和内容片段
 */
export async function searchCachedResult(cacheId, keyword, caseSensitive = false, maxResults = 50) {
    const baseUrl = await getBaseUrl();
    const data = await fetchWithTimeout(`${baseUrl}/search-cache`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            cache_id: cacheId,
            keyword: keyword,
            case_sensitive: caseSensitive,
            max_results: maxResults
        })
    }, 30000); // 30秒超时
    
    if (data && data.success) {
        return data.result;
    }
    
    throw new Error(data.error || '搜索缓存失败');
}

/**
 * 获取缓存中指定行的上下文
 * @param {string} cacheId - 缓存ID
 * @param {number} lineNum - 目标行号（从1开始）
 * @param {number} [contextLines] - 上下文行数，默认3
 * @returns {Promise<Object>} - 包含目标行及上下文的内容
 */
export async function getCacheContext(cacheId, lineNum, contextLines = 3) {
    const baseUrl = await getBaseUrl();
    const data = await fetchWithTimeout(`${baseUrl}/get-cache-context`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            cache_id: cacheId,
            line_num: lineNum,
            context_lines: contextLines
        })
    }, 30000); // 30秒超时
    
    if (data && data.success) {
        return data.result;
    }
    
    throw new Error(data.error || '获取上下文失败');
}