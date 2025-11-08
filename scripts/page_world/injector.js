/**
 * injector.js (Corrected with postMessage for both Fetch and XHR)
 */
(() => {
    if (typeof hookFetch === 'undefined' || typeof ah === 'undefined') {
        console.error('MCP Bridge: Hooking libraries not found!');
        return;
    }

    const MESSAGE_SOURCE = 'mcp-bridge-injector';

    // --- 通用消息发送与等待函数 ---
    function sendMessageAndWaitForResponse(type, payload) {
        return new Promise(resolve => {
            const requestId = `req_${Date.now()}_${Math.random()}`;

            const messageListener = (event) => {
                if (event.source !== window || !event.data || event.data.source !== 'mcp-bridge-content-script' || event.data.requestId !== requestId) {
                    return;
                }
                window.removeEventListener('message', messageListener);
                resolve(event.data.payload);
            };

            window.addEventListener('message', messageListener);

            window.postMessage({
                source: MESSAGE_SOURCE,
                direction: 'to-content-script',
                type: type,
                requestId,
                payload: payload
            }, '*');
        });
    }

    // --- Fetch Hook ---
    hookFetch({
        optionsHook: async function(options, url) {
            if (!shouldInterceptRequest(url)) {
                console.log('[MCP Bridge] Request not in API list, skipping');
                return options;
            }
            
            // 检查是否需要跳过请求修改（仅监听响应）
            const siteConfig = getSiteConfig(url);
            if (siteConfig && siteConfig.skipRequestModification) {
                console.log('[MCP Bridge] Skip request modification for:', url);
                return options;
            }
            
            const responsePayload = await sendMessageAndWaitForResponse('FETCH_REQUEST_BODY', { url, body: options.body });
            
            // modifiedBody 应该是字符串，直接赋值
            if (responsePayload && responsePayload.modifiedBody !== undefined) {
                options.body = responsePayload.modifiedBody;
            }
            return options;
        },

        responseHook: async function(response) {
            if (!shouldInterceptRequest(response.url)) return response;

            // 检查是否是流式响应
            const contentType = response.headers.get('content-type') || '';
            const isStreamResponse = contentType.includes('stream') || contentType.includes('event-stream');

            if (isStreamResponse) {
                // 对于流式响应，需要读取流并重新构造
                return handleStreamingResponse(response);
            } else {
                // 非流式响应，直接读取全文
                const responseClone = response.clone();
                const fullText = await responseClone.text().catch(() => '');

                window.postMessage({
                    source: MESSAGE_SOURCE,
                    direction: 'to-content-script',
                    type: 'FETCH_RESPONSE_COMPLETE',
                    payload: { url: response.url, fullText }
                }, '*');

                return response;
            }
        }
    });

    // --- Ajax Hook ---
    // 存储 XHR 实例信息
    const xhrInstances = new WeakMap();
    
    ah.proxy({
        onRequest: async (config, handler) => {
            if (!shouldInterceptRequest(config.url)) {
                handler.next(config);
                return;
            }

            // 检查是否需要跳过请求修改（仅监听响应）
            const siteConfig = getSiteConfig(config.url);
            if (siteConfig && siteConfig.skipRequestModification) {
                console.log('[MCP Bridge] Skip request modification for:', config.url);
                handler.next(config);
                return;
            }

            const responsePayload = await sendMessageAndWaitForResponse('XHR_REQUEST_BODY', { url: config.url, body: config.body });

            if (responsePayload && responsePayload.modifiedBody !== undefined) {
                config.body = responsePayload.modifiedBody;
            }
            handler.next(config);
        },
        onResponse: (response, handler) => {
            if (shouldInterceptRequest(response.config.url)) {
                const fullText = response.response || '';
                
                window.postMessage({
                    source: MESSAGE_SOURCE,
                    direction: 'to-content-script',
                    type: 'XHR_RESPONSE_COMPLETE',
                    payload: { url: response.config.url, fullText }
                }, '*');
            }

            handler.next(response);
        }
    });

    // --- 在 ajaxhook 之后，额外劫持 XHR 来监听流式响应 ---
    (function setupXHRStreamMonitoring() {
        const OriginalXHR = window.XMLHttpRequest;
        const originalOpen = OriginalXHR.prototype.open;
        const originalSend = OriginalXHR.prototype.send;

        OriginalXHR.prototype.open = function(method, url, ...args) {
            xhrInstances.set(this, { 
                url, 
                method,
                accumulatedText: '',
                lastProcessedLength: 0
            });
            return originalOpen.call(this, method, url, ...args);
        };

        OriginalXHR.prototype.send = function(body) {
            const xhrInfo = xhrInstances.get(this);
            
            if (!xhrInfo || !shouldInterceptRequest(xhrInfo.url)) {
                return originalSend.call(this, body);
            }

            // 获取当前站点的配置
            const siteConfig = getSiteConfig(xhrInfo.url);
            if (!siteConfig || !siteConfig.response) {
                return originalSend.call(this, body);
            }

            // 监听 progress 事件（对于 SSE 更可靠）
            this.addEventListener('progress', () => {
                try {
                    const responseText = this.responseText || '';
                    
                    if (responseText.length <= xhrInfo.lastProcessedLength) {
                        return; // 没有新数据
                    }

                    // 使用配置化的解析器
                    const parsedContent = parseResponse(responseText, siteConfig.response);
                    
                    const hasToolCodeStart = parsedContent.includes('<tool_code>');
                    const hasToolCodeEnd = parsedContent.includes('</tool_code>');

                    xhrInfo.accumulatedText = parsedContent;
                    xhrInfo.lastProcessedLength = responseText.length;

                    // 发送累积的解析后内容
                    window.postMessage({
                        source: MESSAGE_SOURCE,
                        direction: 'to-content-script',
                        type: 'XHR_RESPONSE_CHUNK',
                        payload: { url: xhrInfo.url, fullText: parsedContent, isComplete: false }
                    }, '*');
                } catch (error) {
                    console.error('[MCP Bridge] Error processing SSE chunk:', error);
                }
            });

            // 监听 readystatechange（作为备用）
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4 && xhrInfo) {
                    const responseText = this.responseText || '';
                    const parsedContent = parseResponse(responseText, siteConfig.response);

                    window.postMessage({
                        source: MESSAGE_SOURCE,
                        direction: 'to-content-script',
                        type: 'XHR_RESPONSE_COMPLETE',
                        payload: { url: xhrInfo.url, fullText: parsedContent, isComplete: true }
                    }, '*');
                }
            });

            return originalSend.call(this, body);
        };
    })();

    // --- 配置化的响应解析器 ---
    /**
     * 根据配置解析响应内容
     * @param {string} rawText - 原始响应文本
     * @param {object} responseConfig - 响应配置对象
     * @returns {string} - 解析后的文本内容
     */
    function parseResponse(rawText, responseConfig) {
        if (!responseConfig) {
            // 没有配置，返回原始文本
            return rawText;
        }

        const { type, format, contentPaths, filterRules } = responseConfig;

        if (type === 'sse') {
            return parseSSEResponse(rawText, format, contentPaths, filterRules);
        } else if (type === 'json') {
            return parseJSONResponse(rawText, contentPaths, filterRules);
        } else if (type === 'text') {
            return rawText;
        }

        return rawText;
    }

    /**
     * 解析 SSE (Server-Sent Events) 格式的响应
     * @param {string} rawText - 原始 SSE 文本
     * @param {string} format - SSE 格式，如 "data: {json}" 或 "event: {event}\ndata: {json}"
     * @param {array} contentPaths - 内容字段路径数组（优先级从高到低）
     * @param {object} filterRules - 过滤规则配置（可选）
     * @returns {string} - 累积的文本内容
     */
    function parseSSEResponse(rawText, format, contentPaths, filterRules) {
        const lines = rawText.split('\n');
        let accumulatedContent = '';
        let extractedCount = 0;
        let skippedCount = 0;
        
        // 临时调试:记录所有提取的字符
        const debugLog = [];
        const skippedData = [];

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.substring(6).trim(); // 移除 "data: " 前缀
                    
                    // 跳过 [DONE] 等特殊标记
                    if (jsonStr === '[DONE]' || jsonStr === '') continue;
                    
                    const data = JSON.parse(jsonStr);
                    
                    // 按优先级尝试从配置的路径中提取内容
                    const content = extractContentByPaths(data, contentPaths, filterRules);
                    if (content !== null && content !== undefined && content !== '') {
                        extractedCount++;
                        accumulatedContent += content;
                        
                        // 只记录与 tool 相关的字符
                        if (content === '<' || content.includes('tool') || content.includes('>')) {
                            debugLog.push(content);
                        }
                    } else {
                        skippedCount++;
                        // 记录被跳过的数据(只记录前20个)
                        if (skippedData.length < 20 && (line.includes('tool') || line.includes('<'))) {
                            skippedData.push(jsonStr.substring(0, 100));
                        }
                    }
                } catch (e) {
                    // JSON 解析失败，可能是纯文本或其他格式
                }
            }
        }
        

        return accumulatedContent;
    }

    /**
     * 解析纯 JSON 格式的响应
     * @param {string} rawText - 原始 JSON 文本
     * @param {array} contentPaths - 内容字段路径数组
     * @param {object} filterRules - 过滤规则配置（可选）
     * @returns {string} - 提取的内容
     */
    function parseJSONResponse(rawText, contentPaths, filterRules) {
        try {
            const data = JSON.parse(rawText);
            return extractContentByPaths(data, contentPaths, filterRules) || '';
        } catch (e) {
            console.error('[MCP Bridge] Failed to parse JSON response:', e);
            return rawText;
        }
    }

    /**
     * 从对象中按路径提取内容（支持嵌套路径）
     * @param {object} obj - 数据对象
     * @param {array} paths - 路径数组，如 ["choices.0.delta.content", "content"]
     * @returns {string|null} - 提取的内容，如果都不存在则返回 null
     */
    function extractContentByPaths(obj, paths, filterRules) {
        if (!paths || !Array.isArray(paths)) {
            return null;
        }

        for (const path of paths) {
            const value = getByPath(obj, path);
            if (value !== undefined && value !== null && value !== '') {
                // 如果值是对象或数组，跳过（不是纯文本内容）
                if (typeof value === 'object') {
                    continue;
                }
                
                // 如果配置了过滤规则，应用过滤
                if (filterRules) {
                    const { pathField, excludePatterns, includePatterns } = filterRules;
                    
                    // 检查是否有路径字段
                    if (pathField && obj[pathField]) {
                        const pathValue = String(obj[pathField]);
                        
                        // 先检查排除模式
                        if (excludePatterns && Array.isArray(excludePatterns)) {
                            let shouldExclude = false;
                            for (const pattern of excludePatterns) {
                                if (pathValue.includes(pattern)) {
                                    shouldExclude = true;
                                    break;
                                }
                            }
                            if (shouldExclude) {
                                continue; // 跳过此值
                            }
                        }
                        
                        // 再检查包含模式（如果配置了）
                        if (includePatterns && Array.isArray(includePatterns) && includePatterns.length > 0) {
                            let matchesInclude = false;
                            for (const pattern of includePatterns) {
                                if (pathValue.includes(pattern)) {
                                    matchesInclude = true;
                                    break;
                                }
                            }
                            // 如果配置了包含模式但不匹配，跳过此值
                            if (!matchesInclude) {
                                continue;
                            }
                        }
                    }
                }
                
                return String(value);
            }
        }

        return null;
    }

    /**
     * 根据路径获取对象属性值（支持数组索引）
     * @param {object} obj - 对象
     * @param {string} path - 路径，如 "a.b.0.c"
     * @returns {any} - 属性值
     */
    function getByPath(obj, path) {
        return path.split('.').reduce((acc, part) => {
            if (acc === undefined || acc === null) return undefined;
            return acc[part];
        }, obj);
    }

    /**
     * 获取当前 URL 对应的站点配置
     * @param {string} url - 请求 URL
     * @returns {object|null} - 站点配置对象
     */
    function getSiteConfig(url) {
        try {
            const apiList = JSON.parse(localStorage.getItem('mcp_api_list') || '[]');
            if (!apiList || !url) return null;
            
            const currentHostname = window.location.hostname;
            
            for (const apiItem of apiList) {
                if (apiItem.hostname !== currentHostname) continue;
                
                const apis = Array.isArray(apiItem.api) ? apiItem.api : [apiItem.api];
                const matched = apis.some(apiEndpoint => url.includes(apiEndpoint));
                
                if (matched) return apiItem;
            }
            
            return null;
        } catch (e) {
            console.error('[MCP Bridge] Error getting site config:', e);
            return null;
        }
    }

    // --- Streaming Response Handler ---
    async function handleStreamingResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        let lastSentLength = 0;

        // 创建一个新的可读流来代理原始流
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done) {
                            console.log('[MCP Bridge] Stream complete, total length:', accumulatedText.length);
                            // 流结束时发送最终的完整文本
                            window.postMessage({
                                source: MESSAGE_SOURCE,
                                direction: 'to-content-script',
                                type: 'FETCH_RESPONSE_COMPLETE',
                                payload: { url: response.url, fullText: accumulatedText }
                            }, '*');
                            controller.close();
                            break;
                        }

                        // 解码当前块
                        const chunk = decoder.decode(value, { stream: true });
                        accumulatedText += chunk;

                        // 每累积一定长度或检测到tool_code标签时发送更新
                        if (accumulatedText.length - lastSentLength > 100 || accumulatedText.includes('</tool_code>')) {
                            console.log('[MCP Bridge] Stream chunk, accumulated length:', accumulatedText.length);
                            window.postMessage({
                                source: MESSAGE_SOURCE,
                                direction: 'to-content-script',
                                type: 'FETCH_RESPONSE_CHUNK',
                                payload: { url: response.url, fullText: accumulatedText, isComplete: false }
                            }, '*');
                            lastSentLength = accumulatedText.length;
                        }

                        // 将数据传递给原始消费者
                        controller.enqueue(value);
                    }
                } catch (error) {
                    console.error('[MCP Bridge] Stream reading error:', error);
                    controller.error(error);
                }
            }
        });

        // 返回一个新的响应对象，使用我们的代理流
        return new Response(stream, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText
        });
    }

    // --- Utility ---
    function shouldInterceptRequest(url) {
        try {
            const apiList = JSON.parse(localStorage.getItem('mcp_api_list') || '[]');
            if (!apiList || !url) {
                return false;
            }
            
            const currentHostname = window.location.hostname;
            
            const shouldIntercept = apiList.some(apiItem => {
                if (apiItem.hostname !== currentHostname) return false;
                const apis = Array.isArray(apiItem.api) ? apiItem.api : [apiItem.api];
                return apis.some(apiEndpoint => {
                    const matches = url.includes(apiEndpoint);
                    return matches;
                });
            });
            
            return shouldIntercept;
        } catch (e) {
            console.error('MCP Bridge: Error in shouldInterceptRequest:', e);
            return false;
        }
    }
})();