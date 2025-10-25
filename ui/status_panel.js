/**
 * status_panel.js
 *
 * 职责: 封装“工具调用状态面板”的所有 UI 逻辑。
 * 这是一个独立的类，负责创建、更新和销毁 UI 元素。
 * 它通过 Shadow DOM 实现样式隔离。
 */

export class StatusPanel {
    constructor() {
        this.hostElement = null;
        this.shadowRoot = null;
        this.isVisible = false;
        this.isExpanded = true; // 默认展开
        this.isPermanent = true; // 常驻模式
    }

    /**
     * 创建并注入状态面板到页面中。
     */
    create() {
        if (this.hostElement) return;

        // 检查页面上是否已经存在面板（防止重复创建）
        const existingHost = document.getElementById('mcp-bridge-status-panel-host');
        if (existingHost) {
            console.warn('[MCP Bridge] Panel already exists, removing duplicate');
            existingHost.remove();
        }

        // 1. 创建宿主元素
        this.hostElement = document.createElement('div');
        this.hostElement.id = 'mcp-bridge-status-panel-host';
        document.body.appendChild(this.hostElement);

        // 2. 附加 Shadow DOM
        this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

        // 3. 注入 CSS
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = chrome.runtime.getURL('ui/status_panel.css');
        this.shadowRoot.appendChild(styleLink);

        // 4. 创建面板的基本 HTML 结构（常驻版本）
        const panel = document.createElement('div');
        panel.className = 'mcp-status-panel permanent';
        panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">
          <svg class="panel-title-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.4 2.126A5.4 5.4 0 0 0 9.6 0H5.4A5.4 5.4 0 0 0 0 5.4v4.2a5.4 5.4 0 0 0 2.126 4.2L11.4 23.1a1.8 1.8 0 0 0 2.546 0l7.925-7.924a1.8 1.8 0 0 0 0-2.546L14.4 2.126ZM5.4 9a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z" fill="#0969da"></path></svg>
          <span>MCP Bridge</span>
        </div>
        <div class="panel-header-actions">
          <button class="panel-action-btn redetect-btn" title="重新检测工具调用">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
            </svg>
          </button>
          <button class="panel-toggle-btn" title="展开/收起">
            <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 10l5 5 5-5z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="panel-body">
        <div class="status-line">
          <div class="status-icon">⚪</div>
          <div class="status-text">准备就绪</div>
        </div>
        <div class="manual-input-section">
          <textarea class="manual-input-box" placeholder="如果自动检测失败，可以在此粘贴完整回复内容..." rows="3"></textarea>
          <button class="manual-send-btn">发送到 MCP</button>
        </div>
      </div>
    `;
        this.shadowRoot.appendChild(panel);

        // 5. 绑定展开/收起事件
        const toggleBtn = this.shadowRoot.querySelector('.panel-toggle-btn');
        toggleBtn.addEventListener('click', () => this.toggle());
        
        // 6. 绑定重新检测按钮事件
        const redetectBtn = this.shadowRoot.querySelector('.redetect-btn');
        redetectBtn.addEventListener('click', () => this.handleRedetect());
        
        // 7. 绑定手动发送按钮事件
        const manualSendBtn = this.shadowRoot.querySelector('.manual-send-btn');
        manualSendBtn.addEventListener('click', () => this.handleManualSend());
        
        // 默认显示
        this.show();
    }

    /**
     * 处理手动发送
     */
    handleManualSend() {
        const inputBox = this.shadowRoot.querySelector('.manual-input-box');
        const content = inputBox.value.trim();
        
        if (!content) {
            this.update({
                status: 'ERROR',
                message: '请先粘贴内容'
            });
            return;
        }

        // 通过 window.postMessage 发送到 content_script
        window.postMessage({
            type: 'MCP_BRIDGE_MANUAL_TOOL_PARSE',
            source: 'mcp-bridge-panel',
            payload: { content }
        }, '*');
        
        // 清空输入框并显示处理状态
        inputBox.value = '';
        this.update({
            status: 'EXECUTING',
            message: '正在处理手动输入的内容...'
        });
    }

    /**
     * 处理重新检测工具调用
     */
    handleRedetect() {
        console.log('[MCP Bridge] Redetect button clicked');
        
        // 显示检测中状态
        this.update({
            status: 'EXECUTING',
            message: '正在从最后一条消息重新检测...'
        });
        
        console.log('[MCP Bridge] Posting REDETECT_FROM_UI message via window.postMessage');
        
        // 通过 window.postMessage 发送到 content_script
        window.postMessage({
            type: 'MCP_BRIDGE_REDETECT_FROM_UI',
            source: 'mcp-bridge-panel'
        }, '*');
    }    /**
     * 处理刷新 System Prompt (保留用于其他用途)
     */
    handleRefresh() {
        // 发送消息到 background script
        chrome.runtime.sendMessage({ 
            type: 'REFRESH_SYSTEM_PROMPT_FROM_PANEL'
        }).catch(error => {
            console.error('[MCP Bridge] Failed to send refresh message:', error);
        });
    }

    /**
     * 展开/收起面板
     */
    toggle() {
        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        const body = this.shadowRoot.querySelector('.panel-body');
        const toggleIcon = this.shadowRoot.querySelector('.toggle-icon');
        
        this.isExpanded = !this.isExpanded;
        
        if (this.isExpanded) {
            panel.classList.remove('collapsed');
            toggleIcon.style.transform = 'rotate(0deg)';
        } else {
            panel.classList.add('collapsed');
            toggleIcon.style.transform = 'rotate(180deg)';
        }
    }

    /**
     * 显示面板。
     */
    show() {
        if (!this.hostElement) this.create();
        // 使用 requestAnimationFrame 确保元素已渲染，从而使 CSS transition 生效
        requestAnimationFrame(() => {
            const panel = this.shadowRoot.querySelector('.mcp-status-panel');
            if (panel) {
                panel.classList.add('visible');
            }
        });
        this.isVisible = true;
    }

    /**
     * 更新面板内容。
     * @param {object} state - 包含要显示信息的状态对象。
     * @param {string} state.status - 'EXECUTING', 'SUCCESS', 'ERROR', 'IDLE'
     * @param {string} state.message - 显示在状态行中的主信息。
     * @param {object} [state.details] - 可选的详细信息。
     * @param {string} [state.details.title] - 详细信息部分的标题。
     * @param {string} [state.details.content] - 详细信息的内容 (可以是 JSON 字符串)。
     */
    update({ status, message, details }) {
        if (!this.hostElement) this.create();

        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        const panelBody = this.shadowRoot.querySelector('.panel-body');

        if (!panel || !panelBody) return;

        // 更新面板的 data-state 属性以应用不同的样式
        panel.dataset.state = status.toUpperCase();

        let iconHtml = '';
        switch (status.toUpperCase()) {
            case 'EXECUTING':
                iconHtml = '<div class="spinner"></div>';
                break;
            // SUCCESS 和 ERROR 状态的图标由 CSS伪元素 ::before 提供
            case 'SUCCESS':
            case 'ERROR':
                iconHtml = '';
                break;
            default:
                iconHtml = '⚪'; // IDLE
        }

        let detailsHtml = '';
        if (details && details.title && details.content) {
            detailsHtml = `
        <div class="details-section">
          <div class="details-toggle">${details.title}</div>
          <div class="details-content">
            <pre>${this._escapeHtml(details.content)}</pre>
          </div>
        </div>
      `;
        }

        panelBody.innerHTML = `
      <div class="status-line">
        <div class="status-icon">${iconHtml}</div>
        <div class="status-text">${message}</div>
      </div>
      ${detailsHtml}
    `;

        // 为新的 details-toggle 元素绑定事件
        const toggle = panelBody.querySelector('.details-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('expanded');
                toggle.nextElementSibling.classList.toggle('expanded');
            });
        }

        if (!this.isVisible) {
            this.show();
        }
    }

    /**
     * 销毁并从页面中移除状态面板。
     * 注意：常驻模式下不应该调用此方法
     */
    destroy() {
        if (this.isPermanent) {
            console.warn('[MCP Bridge] Panel is permanent, cannot destroy');
            return;
        }
        
        if (this.hostElement) {
            const panel = this.shadowRoot.querySelector('.mcp-status-panel');
            if (panel) {
                panel.classList.remove('visible');
                // 等待 CSS transition 结束后再移除 DOM 元素
                setTimeout(() => {
                    this.hostElement.remove();
                    this.hostElement = null;
                    this.shadowRoot = null;
                }, 300);
            } else {
                this.hostElement.remove();
            }
        }
        this.isVisible = false;
    }

    /**
     * HTML 转义函数，防止 XSS
     * @param {string} str - 需要转义的字符串
     * @returns {string} - 转义后的字符串
     */
    _escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}