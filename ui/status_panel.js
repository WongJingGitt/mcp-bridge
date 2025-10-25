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
        this.isMinimized = false; // 最小化状态
        this.isDragging = false; // 拖拽状态
        this.dragStarted = false; // 拖拽是否已开始
        this.dragOffset = { x: 0, y: 0 }; // 拖拽偏移
        this.position = null; // 自定义位置 {left, top} 或 null
        this.idleTimer = null; // 闲置计时器
        this.lastActiveTime = Date.now(); // 最后活跃时间
        
        // 加载保存的位置
        this.loadPosition();
    }
    
    /**
     * 从 localStorage 加载位置
     */
    loadPosition() {
        try {
            const saved = localStorage.getItem('mcp-bridge-panel-position');
            if (saved) {
                this.position = JSON.parse(saved);
            }
        } catch (e) {
            console.log('[MCP Bridge] Failed to load panel position:', e);
        }
    }
    
    /**
     * 保存位置到 localStorage
     */
    savePosition() {
        try {
            if (this.position) {
                localStorage.setItem('mcp-bridge-panel-position', JSON.stringify(this.position));
            }
        } catch (e) {
            console.log('[MCP Bridge] Failed to save panel position:', e);
        }
    }

    /**
     * 创建并注入状态面板到页面中。
     */
    create() {
        if (this.hostElement) return;

        // 检查页面上是否已经存在面板（防止重复创建）
        const existingHost = document.getElementById('mcp-bridge-status-panel-host');
        if (existingHost) {
            existingHost.remove();
        }

        // 1. 创建宿主元素
        this.hostElement = document.createElement('div');
        this.hostElement.id = 'mcp-bridge-status-panel-host';
        
        // 确保 body 已存在
        if (!document.body) {
            console.error('[MCP Bridge] document.body is null, waiting for DOMContentLoaded');
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(this.hostElement);
            });
        } else {
            document.body.appendChild(this.hostElement);
        }

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
          <button class="panel-action-btn minimize-btn" title="最小化">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 19h12v2H6v-2z" fill="currentColor"/>
            </svg>
          </button>
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
        <button class="show-input-btn" title="显示输入框">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
          </svg>
          <span>手动发送消息</span>
        </button>
        <div class="manual-input-section" style="display: none;">
          <textarea class="manual-input-box" placeholder="如果自动检测失败，可以在此粘贴完整回复内容..." rows="3"></textarea>
          <button class="manual-send-btn">发送到 MCP</button>
        </div>
      </div>
    `;
        this.shadowRoot.appendChild(panel);

        // 5. 应用自定义位置
        if (this.position) {
            panel.style.left = this.position.left + 'px';
            panel.style.top = this.position.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }

        // 6. 绑定事件
        this.bindEvents(panel);
        
        // 7. 启动闲置检测
        this.startIdleDetection();
        
        // 默认显示
        this.show();
    }
    
    /**
     * 绑定所有事件
     */
    bindEvents(panel) {
        // 最小化按钮
        const minimizeBtn = this.shadowRoot.querySelector('.minimize-btn');
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMinimize();
        });
        
        // 展开/收起事件
        const toggleBtn = this.shadowRoot.querySelector('.panel-toggle-btn');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // 重新检测按钮事件
        const redetectBtn = this.shadowRoot.querySelector('.redetect-btn');
        redetectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleRedetect();
        });
        
        // 显示输入框按钮
        const showInputBtn = this.shadowRoot.querySelector('.show-input-btn');
        showInputBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleManualInput();
        });
        
        // 手动发送按钮事件
        const manualSendBtn = this.shadowRoot.querySelector('.manual-send-btn');
        manualSendBtn.addEventListener('click', () => this.handleManualSend());
        
        // 拖拽事件（只在头部有效，不包括按钮）
        const header = this.shadowRoot.querySelector('.panel-header');
        let clickStartTime = 0;
        let clickStartPos = { x: 0, y: 0 };
        
        header.addEventListener('mousedown', (e) => {
            // 如果点击的是按钮，不触发拖拽
            if (e.target.closest('.panel-action-btn') || e.target.closest('.panel-toggle-btn')) {
                return;
            }
            
            clickStartTime = Date.now();
            clickStartPos = { x: e.clientX, y: e.clientY };
            this.dragStarted = false;
            
            // 非最小化状态直接开始拖拽
            if (!this.isMinimized) {
                this.startDrag(e);
                this.dragStarted = true;
            }
        });
        
        // 监听 mousemove，最小化状态下如果移动超过阈值则开始拖拽
        const handleMouseMove = (e) => {
            if (this.isMinimized && !this.dragStarted && clickStartTime > 0) {
                const moveDistance = Math.sqrt(
                    Math.pow(e.clientX - clickStartPos.x, 2) + 
                    Math.pow(e.clientY - clickStartPos.y, 2)
                );
                
                // 移动超过5px，开始拖拽
                if (moveDistance > 5) {
                    // 创建一个模拟事件，使用点击起始位置
                    const simulatedEvent = {
                        clientX: clickStartPos.x,
                        clientY: clickStartPos.y,
                        preventDefault: () => {}
                    };
                    this.startDrag(simulatedEvent);
                    this.dragStarted = true;
                }
            }
            
            // 继续处理拖拽
            this.onDrag(e);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        
        const handleMouseUp = (e) => {
            const clickDuration = Date.now() - clickStartTime;
            const moveDistance = Math.sqrt(
                Math.pow(e.clientX - clickStartPos.x, 2) + 
                Math.pow(e.clientY - clickStartPos.y, 2)
            );
            
            // 如果是最小化状态，且是快速点击（不是拖拽），则展开
            if (this.isMinimized && clickDuration < 300 && moveDistance < 5 && !this.dragStarted) {
                this.toggleMinimize();
            }
            
            clickStartTime = 0;
            this.dragStarted = false;
            this.stopDrag();
        };
        
        document.addEventListener('mouseup', handleMouseUp);
        
        // 活跃检测（鼠标移入）
        panel.addEventListener('mouseenter', () => this.markActive());
        panel.addEventListener('mouseleave', () => this.markActive());
    }
    
    /**
     * 开始拖拽
     */
    startDrag(e) {
        this.isDragging = true;
        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        panel.classList.add('dragging');
        
        const rect = panel.getBoundingClientRect();
        
        // 在最小化状态下，使用面板中心作为拖拽点
        if (this.isMinimized) {
            this.dragOffset = {
                x: rect.width / 2,
                y: rect.height / 2
            };
        } else {
            // 非最小化状态，使用实际点击位置的偏移
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }
        
        this.markActive();
        
        // 阻止默认行为，防止文本选择
        if (e.preventDefault) {
            e.preventDefault();
        }
    }
    
    /**
     * 拖拽中
     */
    onDrag(e) {
        if (!this.isDragging) return;
        
        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        const left = e.clientX - this.dragOffset.x;
        const top = e.clientY - this.dragOffset.y;
        
        // 边界限制
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;
        
        this.position = {
            left: Math.max(0, Math.min(left, maxLeft)),
            top: Math.max(0, Math.min(top, maxTop))
        };
        
        panel.style.left = this.position.left + 'px';
        panel.style.top = this.position.top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }
    
    /**
     * 停止拖拽
     */
    stopDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        panel.classList.remove('dragging');
        
        // 保存位置
        this.savePosition();
    }
    
    /**
     * 切换最小化
     */
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        
        if (this.isMinimized) {
            panel.classList.add('minimized');
        } else {
            panel.classList.remove('minimized');
        }
        
        this.markActive();
    }
    
    /**
     * 切换手动输入框显示
     */
    toggleManualInput() {
        const inputSection = this.shadowRoot.querySelector('.manual-input-section');
        const showBtn = this.shadowRoot.querySelector('.show-input-btn');
        
        if (inputSection.style.display === 'none') {
            inputSection.style.display = 'block';
            showBtn.style.display = 'none';
            // 聚焦到输入框
            const textarea = inputSection.querySelector('.manual-input-box');
            setTimeout(() => textarea?.focus(), 100);
        } else {
            inputSection.style.display = 'none';
            showBtn.style.display = 'flex';
        }
        
        this.markActive();
    }
    
    /**
     * 标记活跃
     */
    markActive() {
        this.lastActiveTime = Date.now();
        const panel = this.shadowRoot.querySelector('.mcp-status-panel');
        if (panel) {
            panel.classList.remove('idle');
        }
    }
    
    /**
     * 启动闲置检测
     */
    startIdleDetection() {
        // 每 2 秒检查一次
        this.idleTimer = setInterval(() => {
            const idleTime = Date.now() - this.lastActiveTime;
            const panel = this.shadowRoot?.querySelector('.mcp-status-panel');
            
            if (panel && idleTime > 5000 && !this.isMinimized) { // 5秒无操作
                panel.classList.add('idle');
            }
        }, 2000);
    }
    
    /**
     * 停止闲置检测
     */
    stopIdleDetection() {
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
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
        
        // 如果正在执行，自动恢复活跃状态和最小化
        if (status.toUpperCase() === 'EXECUTING') {
            this.markActive();
            if (this.isMinimized) {
                this.toggleMinimize();
            }
        }

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
      <button class="show-input-btn" title="显示输入框">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
        </svg>
        <span>手动发送消息</span>
      </button>
      <div class="manual-input-section" style="display: none;">
        <textarea class="manual-input-box" placeholder="如果自动检测失败，可以在此粘贴完整回复内容..." rows="3"></textarea>
        <button class="manual-send-btn">发送到 MCP</button>
      </div>
    `;

        // 为新的 details-toggle 元素绑定事件
        const toggle = panelBody.querySelector('.details-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('expanded');
                toggle.nextElementSibling.classList.toggle('expanded');
            });
        }
        
        // 重新绑定输入框相关事件
        const showInputBtn = panelBody.querySelector('.show-input-btn');
        showInputBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleManualInput();
        });
        
        const manualSendBtn = panelBody.querySelector('.manual-send-btn');
        manualSendBtn.addEventListener('click', () => this.handleManualSend());

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
            return;
        }
        
        // 停止闲置检测
        this.stopIdleDetection();
        
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