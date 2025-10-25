/**
 * popup.js
 *
 * 职责: 控制插件弹窗的交互逻辑。
 *   - 初始化 UI 状态 (读取 storage)。
 *   - 检查并显示本地 Bridge Server 的连接状态。
 *   - 处理用户交互 (如点击全局开关)。
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const globalEnableToggle = document.getElementById('globalEnableToggle');
    const autoSubmitToggle = document.getElementById('autoSubmitToggle');
    const refreshPromptButton = document.getElementById('refreshPromptButton');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const openOptionsButton = document.getElementById('openOptionsButton');

    async function initialize() {
        try {
            const { mcp_enabled, auto_submit_prompt } = await chrome.storage.local.get({ 
                mcp_enabled: true,
                auto_submit_prompt: false
            });
            globalEnableToggle.checked = mcp_enabled;
            autoSubmitToggle.checked = auto_submit_prompt;
        } catch (error) {
            console.error("MCP Bridge: Error loading global state.", error);
            globalEnableToggle.checked = true;
            autoSubmitToggle.checked = false;
        }

        await checkBridgeStatus();
        bindEventListeners();
    }

    async function checkBridgeStatus() {
        updateStatusUI('checking', '检查中...');

        try {
            // 通过 background script 发起健康检查
            const response = await chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' });

            // 健壮性检查：确保 response 存在
            if (!response) {
                throw new Error("从后台脚本收到的响应为空。");
            }

            if (response.status === 'ok') {
                updateStatusUI('connected', '服务已连接');
            } else {
                // 如果 response 中有 error 字段，就使用它
                throw new Error(response.error || '未知的响应格式');
            }
        } catch (error) {
            console.warn("MCP Bridge: Health check failed.", error.message);
            updateStatusUI('disconnected', '服务未连接');
        }
    }

    function updateStatusUI(state, text) {
        statusDot.className = 'status-dot'; // 重置类
        statusText.className = 'status-text';

        statusDot.classList.add(state);
        statusText.classList.add(state);
        statusText.textContent = text;
    }

    function bindEventListeners() {
        globalEnableToggle.addEventListener('change', handleGlobalToggle);
        autoSubmitToggle.addEventListener('change', handleAutoSubmitToggle);
        refreshPromptButton.addEventListener('click', handleRefreshPrompt);
        openOptionsButton.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
        });
    }

    async function handleGlobalToggle(event) {
        const isEnabled = event.target.checked;
        try {
            await chrome.storage.local.set({ mcp_enabled: isEnabled });
        } catch (error) {
            console.error("MCP Bridge: Error saving global state.", error);
        }
    }

    async function handleAutoSubmitToggle(event) {
        const autoSubmit = event.target.checked;
        try {
            await chrome.storage.local.set({ auto_submit_prompt: autoSubmit });
        } catch (error) {
            console.error("MCP Bridge: Error saving auto submit state.", error);
        }
    }

    async function handleRefreshPrompt() {
        try {
            // 添加加载状态
            const originalText = refreshPromptButton.innerHTML;
            refreshPromptButton.disabled = true;
            refreshPromptButton.innerHTML = `
                <svg class="button-icon spinning" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3.5 3.5a.5.5 0 010 .708l-3.5 3.5A.5.5 0 0112 9.5V8a6 6 0 00-6 6 6 6 0 006 6 6 6 0 006-6h2a8 8 0 01-8 8 8 8 0 01-8-8z" fill="currentColor"/>
                </svg>
                <span>刷新中...</span>
            `;

            // 获取当前激活的标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 发送刷新 Prompt 的消息到 background
            const response = await chrome.runtime.sendMessage({ 
                type: 'REFRESH_SYSTEM_PROMPT',
                payload: { tabId: tab.id }
            });

            if (response?.success) {
                // 成功反馈
                refreshPromptButton.innerHTML = `
                    <svg class="button-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/>
                    </svg>
                    <span>刷新成功</span>
                `;
                setTimeout(() => {
                    refreshPromptButton.innerHTML = originalText;
                    refreshPromptButton.disabled = false;
                }, 1500);
            } else {
                throw new Error(response?.error || '未知错误');
            }
        } catch (error) {
            console.error("MCP Bridge: Error refreshing prompt.", error);
            refreshPromptButton.innerHTML = `
                <svg class="button-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor"/>
                </svg>
                <span>刷新失败</span>
            `;
            setTimeout(() => {
                refreshPromptButton.innerHTML = originalText;
                refreshPromptButton.disabled = false;
            }, 2000);
        }
    }

    initialize();
});