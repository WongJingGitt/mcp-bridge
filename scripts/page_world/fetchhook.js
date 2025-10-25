/**
 * Fetch Hook Library
 * 修复版 - 使用 clone() 读取 body，避免消费原始流
 */
(function(window) {
    // 防止重复加载
    if (window.RealFetch) return;
    if (typeof window.fetch !== 'function') return;

    // 保存原始 fetch
    window.RealFetch = window.fetch;

    /**
     * Hook Fetch API
     * @param {Object} hooks - { urlHook, optionsHook, responseHook }
     */
    window.hookFetch = function(hooks) {
        if (window.fetch.__hooked) return;
        if (!hooks) return;

        window.fetch = async function(input, init) {
            let url, options;

            // 处理 Request 对象
            if (input instanceof Request) {
                url = input.url;
                
                // 读取 body（如果需要修改）
                let body = null;
                if (input.body) {
                    try {
                        // 克隆 Request 来读取 body，避免消费原始流
                        const cloned = input.clone();
                        body = await cloned.text();
                    } catch (err) {
                        console.warn('Body read error:', err);
                        body = input.body; // 降级：使用原始 body
                    }
                } else {
                    body = null;
                }
                
                options = {
                    method: input.method,
                    headers: input.headers,
                    body: body, // 读取后的文本
                    mode: input.mode,
                    credentials: input.credentials,
                    cache: input.cache,
                    redirect: input.redirect,
                    referrer: input.referrer,
                    integrity: input.integrity,
                    keepalive: input.keepalive,
                    signal: input.signal
                };
            } else {
                // 处理普通 URL + init 的情况
                url = input;
                options = init || {};
            }

            // 执行 URL hook
            if (typeof hooks.urlHook === 'function') {
                url = await hooks.urlHook.call(this, url);
            }

            // 执行 options hook
            if (typeof hooks.optionsHook === 'function') {
                options = await hooks.optionsHook.call(this, options, url);
            }

            // 执行实际的 fetch
            let response = await window.RealFetch(url, options);

            // 执行 response hook
            if (typeof hooks.responseHook === 'function') {
                return await hooks.responseHook.call(this, response);
            }

            return response;
        };

        window.fetch.__hooked = true;
    };

    /**
     * 取消 Hook
     */
    window.unHookFetch = function() {
        if (window.RealFetch) {
            delete window.fetch.__hooked;
            window.fetch = window.RealFetch;
            window.RealFetch = undefined;
        }
    };

})(window);
