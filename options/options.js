/**
 * options.js (Upgraded for separate Service Manager view)
 *
 * 职责: 控制设置页面的所有交互逻辑。
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const elements = {
        mainNav: document.querySelector('.main-nav'),
        views: document.querySelectorAll('.main-view'),
        siteList: document.getElementById('siteList'),
        serviceToggleList: document.getElementById('serviceToggleList'),
        configEditor: document.getElementById('configEditor'),
        reloadConfigButton: document.getElementById('reloadConfigButton'),
        saveConfigButton: document.getElementById('saveConfigButton'),
        version: document.getElementById('version')
    };
    
    console.log('MCP Bridge: Elements found:', elements);

    // --- State ---
    let currentConfig = {};
    let isSaving = false;

    async function initialize() {
        try {
            elements.version.textContent = `MCP Bridge v${chrome.runtime.getManifest().version}`;
            console.log('MCP Bridge: Version set');
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

    async function renderSiteList() {
        try {
            // 添加超时机制
            const storageData = await Promise.race([
                chrome.storage.local.get(['api_list', 'always_inject']),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('chrome.storage.local.get timeout')), 5000)
                )
            ]);
            const { api_list, always_inject = {} } = storageData;
            if (!api_list) {
                return;
            }

            elements.siteList.innerHTML = '';
            for (const site of api_list) {
                const siteItem = document.createElement('li');
                siteItem.className = 'site-item';
                siteItem.innerHTML = `
                    <div class="site-info">
                        <span class="site-name">${site.label}</span>
                        <span class="site-hostname">${site.hostname}</span>
                    </div>
                    <div class="site-actions">
                        <span class="action-label">每次都注入</span>
                        <label class="switch">
                            <input type="checkbox" data-hostname="${site.hostname}" class="always-inject-toggle" ${always_inject[site.hostname] ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
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
            elements.serviceToggleList.innerHTML = '<li class="service-toggle-item">配置文件中暂无服务。</li>';
            return;
        }

        for (const [name, config] of Object.entries(services)) {
            const isEnabled = config.enabled !== false;
            const item = document.createElement('li');
            item.className = 'service-toggle-item';
            item.innerHTML = `
                <div class="service-info">
                    <div class="service-name">${name}</div>
                    <p class="service-description">${config.description || '无描述'}</p>
                </div>
                <div class="service-actions">
                    <label class="switch">
                        <input type="checkbox" data-service-name="${name}" class="service-toggle" ${isEnabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;
            elements.serviceToggleList.appendChild(item);
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
        const activeNavItem = elements.mainNav.querySelector('.nav-item.active');
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
                toast(`已为 ${hostname} ${isEnabled ? '开启' : '关闭'} “每次都注入”`);
            } catch (error) {
                toast('保存设置失败', 'error');
            }
        }
    }

    async function handleServiceToggleChange(event) {
        const toggle = event.target;
        if (!toggle.classList.contains('service-toggle')) return;

        const serviceName = toggle.dataset.serviceName;
        const isEnabled = toggle.checked;

        if (currentConfig.mcpServers && currentConfig.mcpServers[serviceName]) {
            currentConfig.mcpServers[serviceName].enabled = isEnabled;
            // 自动保存
            await handleSaveConfig(false);
        }
    }

    async function handleSaveConfig(isManual = false) {
        if (isSaving) return;
        isSaving = true;

        let configJson;
        try {
            if (isManual) {
                configJson = JSON.parse(elements.configEditor.value);
                currentConfig = configJson;
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

            toast(isManual ? '配置已手动保存并重载！' : `服务 ${Object.keys(configJson.mcpServers).pop()} 状态已更新并重载！`, 'success');

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