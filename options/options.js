/**
 * options.js (Upgraded for separate Service Manager view)
 *
 * 职责: 控制设置页面的所有交互逻辑。
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const elements = {
        mainNav: document.querySelector('.sidebar-nav'),
        views: document.querySelectorAll('.view'),
        siteList: document.getElementById('siteList'),
        serviceToggleList: document.getElementById('serviceToggleList'),
        configEditor: document.getElementById('configEditor'),
        reloadConfigButton: document.getElementById('reloadConfigButton'),
        saveConfigButton: document.getElementById('saveConfigButton'),
        replaceExistingServices: document.getElementById('replaceExistingServices'),
        version: document.getElementById('version')
    };

    // --- State ---
    let currentConfig = {};
    let isSaving = false;
    let bridgePort = 3849; // 默认端口

    /**
     * 获取桥接服务端口
     */
    async function getBridgePort() {
        const { bridge_port } = await chrome.storage.local.get('bridge_port');
        bridgePort = bridge_port || 3849;
        return bridgePort;
    }

    /**
     * 获取基础 URL
     */
    async function getBaseUrl() {
        await getBridgePort();
        return `http://localhost:${bridgePort}`;
    }

    async function initialize() {
        try {
            elements.version.textContent = `MCP Bridge v${chrome.runtime.getManifest().version}`;
            console.log('MCP Bridge: Version set');
            
            // 加载端口配置
            await loadPortConfig();
            
            await renderSiteList();
            console.log('MCP Bridge: Site list rendered');
            // 首次加载时，也加载一次配置，以便缓存
            const configLoaded = await loadAndCacheConfig();
            bindEvents();
        } catch (error) {
            // 即使初始化过程中出现错误，也要绑定事件，确保UI可以交互
            try {
                bindEvents();
            } catch (bindError) {
                console.error('MCP Bridge: Error binding events', bindError);
            }
        }
        console.log('MCP Bridge: Initialization complete');
    }

    /**
     * 加载端口配置
     */
    async function loadPortConfig() {
        await getBridgePort();
        const portInput = document.getElementById('bridgePort');
        if (portInput) {
            portInput.value = bridgePort;
        }
    }

    /**
     * 保存端口配置
     */
    async function savePortConfig() {
        const portInput = document.getElementById('bridgePort');
        const saveButton = document.getElementById('savePortButton');
        
        const newPort = parseInt(portInput.value);
        
        if (!newPort || newPort < 1 || newPort > 65535) {
            toast('请输入有效的端口号（1-65535）', 'error');
            return;
        }
        
        try {
            saveButton.disabled = true;
            saveButton.textContent = '保存中...';
            
            await chrome.storage.local.set({ bridge_port: newPort });
            bridgePort = newPort;
            
            toast(`端口已保存为 ${newPort}，请确保服务运行在此端口`, 'success');
        } catch (error) {
            toast('保存端口失败', 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '保存';
        }
    }

    async function renderSiteList() {
        try {
            // 添加超时机制
            const storageData = await Promise.race([
                chrome.storage.local.get(['api_list', 'always_inject', 'disable_first_inject', 'conflict_disabled_sites', 'conflict_extension_cache']),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('chrome.storage.local.get timeout')), 5000)
                )
            ]);
            const { api_list, always_inject = {}, disable_first_inject = {}, conflict_disabled_sites = [], conflict_extension_cache } = storageData;
            if (!api_list) {
                return;
            }

            elements.siteList.innerHTML = '';
            for (const site of api_list) {
                const siteItem = document.createElement('li');
                siteItem.className = 'site-card';

                const firstInjectEnabled = !disable_first_inject[site.hostname];
                const isConflictDisabled = conflict_disabled_sites.includes(site.hostname);

                // 查找冲突的扩展名称
                let conflictExtName = '';
                if (conflict_extension_cache?.data) {
                    for (const ext of conflict_extension_cache.data) {
                        if (ext.affected_sites?.includes(site.hostname)) {
                            conflictExtName = ext.name || ext.extension_id || '未知扩展';
                            break;
                        }
                    }
                }
                if (isConflictDisabled && !conflictExtName) {
                    try {
                        const localResp = await fetch(chrome.runtime.getURL('config/extension.json'));
                        if (localResp.ok) {
                            const localList = await localResp.json();
                            for (const ext of localList) {
                                if (ext.affected_sites?.includes(site.hostname)) {
                                    conflictExtName = ext.name || ext.extension_id || '未知扩展';
                                    break;
                                }
                            }
                        }
                    } catch (e) { /* ignore */ }
                    if (!conflictExtName) conflictExtName = '未知扩展';
                }

                siteItem.innerHTML = `
    <div class="site-card-header">
        <div class="site-avatar">${site.label.charAt(0)}</div>
        <div class="site-meta">
            <span class="site-name">${site.label}</span>
            <span class="site-domain">${site.hostname}</span>
        </div>
    </div>
    <div class="site-card-controls">
        <div class="toggle-row">
            <div class="toggle-info">
                <span class="toggle-label">首次自动注入</span>
                <span class="toggle-hint">新对话时注入 System Prompt</span>
            </div>
            <label class="switch">
                <input type="checkbox" data-hostname="${site.hostname}" class="disable-first-inject-toggle" ${firstInjectEnabled ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
        <div class="toggle-row">
            <div class="toggle-info">
                <span class="toggle-label">每次注入</span>
                <span class="toggle-hint">每条消息都注入工具列表</span>
            </div>
            <label class="switch">
                <input type="checkbox" data-hostname="${site.hostname}" class="always-inject-toggle" ${always_inject[site.hostname] ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
    </div>
    ${isConflictDisabled ? `
    <div class="conflict-banner">
        <span class="conflict-banner-icon">⚠️</span>
        <span>因与「${conflictExtName}」扩展冲突，已自动关闭首次注入</span>
    </div>
    ` : ''}
`;
                elements.siteList.appendChild(siteItem);
            }
        } catch (error) {
            console.error("MCP Bridge: Failed to render site list.", error);
            elements.siteList.innerHTML = '<li>加载站点列表失败。</li>';
        }
    }

    function renderServiceToggles() {
        elements.serviceToggleList.innerHTML = '';
        const services = currentConfig.mcpServers || {};

        if (Object.keys(services).length === 0) {
            elements.serviceToggleList.innerHTML = '<li class="service-card">配置文件中暂无服务。</li>';
            return;
        }

        for (const [name, config] of Object.entries(services)) {
            const isEnabled = config.enabled !== false;
            const item = document.createElement('li');
            item.className = 'service-card';
            item.innerHTML = `
                <div class="service-card-header">
                    <div class="service-card-info">
                        <span class="service-card-name">${name}</span>
                        <span class="service-card-desc">${config.description || '无描述'}</span>
                    </div>
                </div>
                <div class="service-card-actions">
                    <div class="service-status" data-service-name="${name}">
                        <span class="status-dot checking"></span>
                        <span class="status-text">检测中...</span>
                    </div>
                    <button class="btn btn-sm btn-secondary restart-button" data-service-name="${name}">重启</button>
                    <button class="btn btn-sm btn-danger delete-button" data-service-name="${name}">删除</button>
                    <label class="switch">
                        <input type="checkbox" data-service-name="${name}" class="service-toggle" ${isEnabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;
            elements.serviceToggleList.appendChild(item);
            
            // 检查服务状态
            checkServiceStatus(name);
        }
        
        // 绑定重启按钮事件
        bindRestartButtons();
        // 绑定删除按钮事件
        bindDeleteButtons();
    }
    
    function bindDeleteButtons() {
        const deleteButtons = elements.serviceToggleList.querySelectorAll('.delete-button');
        deleteButtons.forEach(button => {
            button.addEventListener('click', handleDeleteService);
        });
    }
    
    async function handleDeleteService(event) {
        const button = event.currentTarget;
        const serviceName = button.dataset.serviceName;
        
        // 确认删除
        if (!confirm(`确定要删除服务 "${serviceName}" 吗？此操作不可恢复。`)) {
            return;
        }
        
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '⏳ 删除中...';
        
        try {
            // 从配置中删除
            if (currentConfig.mcpServers && currentConfig.mcpServers[serviceName]) {
                delete currentConfig.mcpServers[serviceName];
                
                // 保存配置
                const baseUrl = await getBaseUrl();
                const saveResponse = await fetch(`${baseUrl}/config`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ config: currentConfig })
                });
                
                if (!saveResponse.ok) {
                    const errorData = await saveResponse.json();
                    throw new Error(errorData.detail || '保存配置失败');
                }
                
                toast(`服务 "${serviceName}" 已删除`, 'success');
                
                // 重新渲染服务列表
                renderServiceToggles();
            }
        } catch (error) {
            console.error('删除服务失败:', error);
            toast(`删除失败: ${error.message}`, 'error');
            button.disabled = false;
            button.innerHTML = originalText;
            
            // 恢复配置（如果已删除）
            await loadAndCacheConfig(true);
        }
    }
    
    async function checkServiceStatus(serviceName) {
        const statusEl = elements.serviceToggleList.querySelector(`.service-status[data-service-name="${serviceName}"]`);
        if (!statusEl) return;
        
        const indicator = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');
        
        try {
            // 直接调用本地 API
            const baseUrl = await getBaseUrl();
            const response = await fetch(`${baseUrl}/tools?serverName=${encodeURIComponent(serviceName)}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.tools) {
                    // 服务正常运行
                    indicator.className = 'status-dot running';
                    text.textContent = '运行中';
                } else {
                    // 返回了但有错误
                    indicator.className = 'status-dot error';
                    text.textContent = '异常';
                }
            } else if (response.status === 404) {
                // 服务未运行
                indicator.className = 'status-dot stopped';
                text.textContent = '已停止';
            } else {
                // 其他错误
                indicator.className = 'status-dot error';
                text.textContent = '错误';
            }
        } catch (error) {
            // 无法连接到服务器
            indicator.className = 'status-dot stopped';
            text.textContent = '未运行';
        }
    }
    
    function bindRestartButtons() {
        const restartButtons = elements.serviceToggleList.querySelectorAll('.restart-button');
        restartButtons.forEach(button => {
            button.addEventListener('click', handleRestartService);
        });
    }
    
    async function handleRestartService(event) {
        const button = event.currentTarget;
        const serviceName = button.dataset.serviceName;
        const originalText = button.innerHTML;
        
        button.disabled = true;
        button.innerHTML = '⏳ 重启中...';
        
        try {
            // 直接调用本地 API 重启服务
            const baseUrl = await getBaseUrl();
            const response = await fetch(`${baseUrl}/restart-server`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ serverName: serviceName })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                toast(`服务 "${serviceName}" 重启成功！`, 'success');
                // 延迟一下再检查状态，让服务有时间启动
                setTimeout(() => checkServiceStatus(serviceName), 1000);
            } else {
                toast(`重启失败: ${data.message || data.detail || '未知错误'}`, 'error');
            }
        } catch (error) {
            console.error('重启服务失败:', error);
            toast(`重启失败: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    async function loadAndCacheConfig(forceReload = false) {
        // console.log(forceReload, currentConfig)
        if (!forceReload && Object.keys(currentConfig).length > 0) {
            return true; // 返回true表示成功
        }

        try {
            // 添加超时机制，避免无限等待
            const message = { type: 'GET_CONFIG', payload: {} };
            const config = await chrome.runtime.sendMessage(message);
            if (config && config.error) {
                console.error('MCP Bridge: Config response contains error', config.error);
                throw new Error(config.error);
            }
            currentConfig = config || {};
            return true; // 成功加载配置
        } catch (error) {
            console.error('MCP Bridge: Failed to load config', error);
            currentConfig = {};
            // 显示错误信息，但不中断流程
            toast(`加载配置失败: ${error.message}`, 'error');
            return false; // 返回false表示加载失败
        }
    }

    async function populateServiceManagerView() {
        const success = await loadAndCacheConfig();
        if (success) {
            renderServiceToggles();
        }
    }

    async function populateServiceConfigView() {
        elements.configEditor.value = '正在从本地服务加载配置...';
        elements.configEditor.disabled = true;
        elements.saveConfigButton.disabled = true;

        const success = await loadAndCacheConfig(true); // 强制重新加载
        if (success) {
            elements.configEditor.value = JSON.stringify(currentConfig, null, 2);
            elements.configEditor.disabled = false;
        } else {
            elements.configEditor.value = `加载配置失败。\n\n请确保 MCP Bridge 本地服务正在运行。`;
        }
    }

    function bindEvents() {
        if (elements.mainNav) {
            elements.mainNav.addEventListener('click', handleNavClick);
        } else {
            console.error('MCP Bridge: MainNav element not found');
        }
        
        // 端口保存按钮
        const savePortButton = document.getElementById('savePortButton');
        if (savePortButton) {
            savePortButton.addEventListener('click', savePortConfig);
        }
        
        if (elements.siteList) {
            elements.siteList.addEventListener('change', handleSiteToggleChange);
        } else {
            console.error('MCP Bridge: SiteList element not found');
        }
        
        if (elements.serviceToggleList) {
            elements.serviceToggleList.addEventListener('change', handleServiceToggleChange);
        } else {
            console.error('MCP Bridge: ServiceToggleList element not found');
        }
        
        if (elements.configEditor) {
            elements.configEditor.addEventListener('input', () => {
                elements.saveConfigButton.disabled = false;
            });
        } else {
            console.error('MCP Bridge: ConfigEditor element not found');
        }
        
        if (elements.reloadConfigButton) {
            elements.reloadConfigButton.addEventListener('click', populateServiceConfigView);
        } else {
            console.error('MCP Bridge: ReloadConfigButton element not found');
        }
        
        if (elements.saveConfigButton) {
            elements.saveConfigButton.addEventListener('click', () => handleSaveConfig(true));
        } else {
            console.error('MCP Bridge: SaveConfigButton element not found');
        }
    }

    // 修复：将 handleNavClick 函数标记为 async
    async function handleNavClick(event) {
        const navItem = event.target.closest('.nav-item');

        // 如果没有找到导航项，直接返回
        if (!navItem) {
            return;
        }
        
        // 如果点击的是已经激活的项，也直接返回
        if (navItem.classList.contains('active')) {
            return;
        }

        // 安全地移除当前活动的导航项的active类
        const activeNavItem = document.querySelector('.sidebar-nav .nav-item.active');
        if (activeNavItem) {
            activeNavItem.classList.remove('active');
        }
        navItem.classList.add('active');

        elements.views.forEach(view => view.classList.remove('active'));
        const targetViewId = navItem.dataset.view;
        const targetView = document.getElementById(targetViewId);
        if (targetView) {
            targetView.classList.add('active');

            // 根据激活的视图执行特定逻辑
            if (targetViewId === 'service-manager-view') {
                await populateServiceManagerView();
            } else if (targetViewId === 'service-config-view') {
                await populateServiceConfigView();
            }
        }
    }

    async function handleSiteToggleChange(event) {
        if (event.target.classList.contains('always-inject-toggle')) {
            const hostname = event.target.dataset.hostname;
            const isEnabled = event.target.checked;
            try {
                const { always_inject = {} } = await chrome.storage.local.get('always_inject');
                always_inject[hostname] = isEnabled;
                await chrome.storage.local.set({ always_inject });
                toast(`已为 ${hostname} ${isEnabled ? '开启' : '关闭'} 每次注入`);
            } catch (error) {
                toast('保存设置失败', 'error');
            }
        } else if (event.target.classList.contains('disable-first-inject-toggle')) {
            const hostname = event.target.dataset.hostname;
            const checked = event.target.checked;
            try {
                const storage = await chrome.storage.local.get(['disable_first_inject', 'conflict_disabled_sites']);
                const disable_first_inject = storage.disable_first_inject || {};
                const conflict_disabled_sites = storage.conflict_disabled_sites || [];

                disable_first_inject[hostname] = !checked;

                // 用户手动重新开启，从冲突禁用列表中移除
                if (checked && conflict_disabled_sites.includes(hostname)) {
                    const idx = conflict_disabled_sites.indexOf(hostname);
                    conflict_disabled_sites.splice(idx, 1);
                }

                await chrome.storage.local.set({ disable_first_inject, conflict_disabled_sites });
                toast(`已为 ${hostname} ${checked ? '开启' : '关闭'} 首次自动注入`);
            } catch (error) {
                toast('保存设置失败', 'error');
            }
        }
    }

    async function handleServiceToggleChange(event) {
        const toggle = event.target.closest('.service-toggle');
        if (!toggle) return;

        const serviceName = toggle.dataset.serviceName;
        const isEnabled = toggle.checked;

        currentConfig.mcpServers[serviceName].enabled = isEnabled;

        if (isEnabled) {
            await enableService(serviceName);
        } else {
            await disableService(serviceName);
        }
    }

    /**
     * 合并服务配置
     * @param {Object} target - 目标配置对象
     * @param {Object} source - 源配置对象
     * @param {boolean} shouldReplace - 是否替换已存在的服务
     * @returns {Object} - {added: [], skipped: [], replaced: []}
     */
    function mergeServices(target, source, shouldReplace) {
        const added = [];
        const skipped = [];
        const replaced = [];

        for (const [name, config] of Object.entries(source)) {
            if (target[name]) {
                // 服务已存在
                if (shouldReplace) {
                    target[name] = config;
                    replaced.push(name);
                } else {
                    skipped.push(name);
                }
            } else {
                // 新服务
                target[name] = config;
                added.push(name);
            }
        }

        return { added, skipped, replaced };
    }

    /**
     * 显示合并结果
     */
    function showMergeResult(added, skipped, replaced) {
        const messages = [];
        if (added.length > 0) {
            messages.push(`✅ 新增 ${added.length} 个服务`);
        }
        if (replaced.length > 0) {
            messages.push(`🔄 替换 ${replaced.length} 个服务`);
        }
        if (skipped.length > 0) {
            messages.push(`⏭️ 跳过 ${skipped.length} 个已存在的服务`);
        }

        if (messages.length > 0) {
            toast(messages.join(' | '), 'success');
        } else {
            toast('配置已更新', 'success');
        }
    }

    async function handleServiceToggleChange(event) {
        const toggle = event.target;
        if (!toggle.classList.contains('service-toggle')) return;

        const serviceName = toggle.dataset.serviceName;
        const isEnabled = toggle.checked;

        if (currentConfig.mcpServers && currentConfig.mcpServers[serviceName]) {
            const originalValue = currentConfig.mcpServers[serviceName].enabled;
            
            // 更新本地配置
            currentConfig.mcpServers[serviceName].enabled = isEnabled;
            
            if (isEnabled) {
                // 启用服务：保存配置并重启该服务
                await handleEnableService(serviceName);
            } else {
                // 禁用服务：直接关闭该服务
                await handleDisableService(serviceName);
            }
        }
    }
    
    async function handleEnableService(serviceName) {
        try {
            // 直接调用本地 API 保存配置（不重载）
            const baseUrl = await getBaseUrl();
            const saveResponse = await fetch(`${baseUrl}/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ config: currentConfig })
            });
            
            if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                throw new Error(errorData.detail || '保存配置失败');
            }
            
            // 配置保存成功，等待重载完成
            // 注意：POST /config 接口会自动重载所有服务
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            toast(`服务 "${serviceName}" 已启用`, 'success');
            // 更新状态显示
            checkServiceStatus(serviceName);
        } catch (error) {
            console.error('启用服务失败:', error);
            toast(`启用失败: ${error.message}`, 'error');
            // 回滚开关状态
            const toggle = elements.serviceToggleList.querySelector(
                `.service-toggle[data-service-name="${serviceName}"]`
            );
            if (toggle) toggle.checked = false;
            currentConfig.mcpServers[serviceName].enabled = false;
        }
    }
    
    async function handleDisableService(serviceName) {
        try {
            // 先关闭服务
            const baseUrl = await getBaseUrl();
            const shutdownResponse = await fetch(`${baseUrl}/shutdown-server`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ serverName: serviceName })
            });
            
            const shutdownData = await shutdownResponse.json();
            
            if (!shutdownResponse.ok || !shutdownData.success) {
                throw new Error(shutdownData.message || shutdownData.detail || '关闭服务失败');
            }
            
            // 服务关闭成功后，直接调用本地 API 保存配置
            // 使用 GET /config 接口读取当前配置，然后更新
            const getResponse = await fetch(`${baseUrl}/config`);
            const getResult = await getResponse.json();
            
            if (getResult.success && getResult.config) {
                // 更新配置中的 enabled 状态
                if (getResult.config.mcpServers && getResult.config.mcpServers[serviceName]) {
                    getResult.config.mcpServers[serviceName].enabled = false;
                    
                    // 保存配置（这会触发重载，但服务已经关闭了，不会重新启动）
                    const saveResponse = await fetch(`${baseUrl}/config`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ config: getResult.config })
                    });
                    
                    if (!saveResponse.ok) {
                        const errorData = await saveResponse.json();
                        console.warn('保存配置失败，但服务已关闭:', errorData);
                    }
                }
            }
            
            toast(`服务 "${serviceName}" 已禁用`, 'success');
            // 更新状态显示
            setTimeout(() => checkServiceStatus(serviceName), 500);
        } catch (error) {
            console.error('禁用服务失败:', error);
            toast(`禁用失败: ${error.message}`, 'error');
            // 回滚开关状态
            const toggle = elements.serviceToggleList.querySelector(
                `.service-toggle[data-service-name="${serviceName}"]`
            );
            if (toggle) toggle.checked = true;
            currentConfig.mcpServers[serviceName].enabled = true;
        }
    }

    async function handleSaveConfig(isManual = false) {
        if (isSaving) return;
        isSaving = true;

        let configJson;
        try {
            if (isManual) {
                const inputJson = JSON.parse(elements.configEditor.value);
                const shouldReplace = elements.replaceExistingServices.checked;
                
                // 智能识别配置格式
                if (inputJson.mcpServers) {
                    // 格式1: 完整格式 {mcpServers: {...}}
                    configJson = currentConfig;
                    if (!configJson.mcpServers) {
                        configJson.mcpServers = {};
                    }
                    
                    // 根据开关决定合并策略
                    const { added, skipped, replaced } = mergeServices(
                        configJson.mcpServers, 
                        inputJson.mcpServers, 
                        shouldReplace
                    );
                    
                    // 显示合并结果
                    showMergeResult(added, skipped, replaced);
                    
                } else {
                    // 格式2: 单个服务配置对象 {command: ..., args: ..., description: ...}
                    // 检查是否是有效的服务配置
                    if (inputJson.command || inputJson.type) {
                        // 提示用户输入服务名称
                        const serviceName = prompt('请输入此服务的名称:');
                        if (!serviceName) {
                            toast('取消添加服务', 'error');
                            isSaving = false;
                            return;
                        }
                        
                        // 添加到现有配置
                        configJson = currentConfig;
                        if (!configJson.mcpServers) {
                            configJson.mcpServers = {};
                        }
                        
                        // 检查是否已存在
                        if (configJson.mcpServers[serviceName] && !shouldReplace) {
                            toast(`服务 "${serviceName}" 已存在，已跳过`, 'warning');
                            isSaving = false;
                            return;
                        }
                        
                        configJson.mcpServers[serviceName] = inputJson;
                        toast(`服务 "${serviceName}" 已${configJson.mcpServers[serviceName] ? '替换' : '添加'}`, 'success');
                        
                    } else {
                        // 格式3: 可能是包含多个服务的对象
                        configJson = currentConfig;
                        if (!configJson.mcpServers) {
                            configJson.mcpServers = {};
                        }
                        
                        // 根据开关决定合并策略
                        const { added, skipped, replaced } = mergeServices(
                            configJson.mcpServers, 
                            inputJson, 
                            shouldReplace
                        );
                        
                        // 显示合并结果
                        showMergeResult(added, skipped, replaced);
                    }
                }
                
                currentConfig = configJson;
                // 更新编辑器显示完整配置
                elements.configEditor.value = JSON.stringify(currentConfig, null, 2);
            } else {
                configJson = currentConfig;
            }
        } catch (error) {
            toast('配置不是有效的 JSON 格式，请检查。', 'error');
            isSaving = false;
            return;
        }

        if (isManual) {
            elements.saveConfigButton.disabled = true;
            elements.saveConfigButton.textContent = '保存中...';
        }

        try {
            // 添加超时机制
            const response = await Promise.race([
                chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', payload: configJson }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('UPDATE_CONFIG timeout after 5 seconds')), 5000)
                )
            ]);
            
            if (response && response.error) throw new Error(response.error);

            toast(isManual ? '配置已保存并重载！' : `服务配置已更新并重载！`, 'success');

            // 如果是在服务管理页面操作，需要重新渲染开关
            if (document.getElementById('service-manager-view').classList.contains('active')) {
                renderServiceToggles();
            }
        } catch (error) {
            toast(`保存失败: ${error.message}`, 'error');
        } finally {
            if (isManual) {
                elements.saveConfigButton.textContent = '💾 保存并重载服务';
                elements.saveConfigButton.disabled = true; // 手动保存后应禁用，直到再次修改
            }
            isSaving = false;
        }
    }

    function toast(message, type = 'success') {
        const toastEl = document.createElement('div');
        toastEl.className = 'toast';
        toastEl.textContent = message;
        if (type === 'error') {
            toastEl.style.backgroundColor = 'var(--danger-color)';
        }
        document.body.appendChild(toastEl);
        setTimeout(() => toastEl.remove(), 3000);
    }

    initialize();
});