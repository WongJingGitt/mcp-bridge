/**
 * confirm_dialog.js
 *
 * 职责: 封装通用的确认对话框组件
 * 提供一个明显标识来自 MCP Bridge 的二次确认弹窗
 * 支持自定义标题、消息、按钮文本和回调函数
 */

export class ConfirmDialog {
    constructor() {
        this.hostElement = null;
        this.shadowRoot = null;
        this.isVisible = false;
        this.resolveCallback = null;
    }

    /**
     * 创建对话框
     */
    create() {
        if (this.hostElement) return;

        // 检查页面上是否已经存在对话框
        const existingHost = document.getElementById('mcp-bridge-confirm-dialog-host');
        if (existingHost) {
            existingHost.remove();
        }

        // 1. 创建宿主元素
        this.hostElement = document.createElement('div');
        this.hostElement.id = 'mcp-bridge-confirm-dialog-host';
        
        // 确保 body 已存在
        if (!document.body) {
            console.error('[MCP Bridge] document.body is null');
            return;
        }
        
        document.body.appendChild(this.hostElement);

        // 2. 附加 Shadow DOM
        this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

        // 3. 注入 CSS
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = chrome.runtime.getURL('ui/confirm_dialog.css');
        this.shadowRoot.appendChild(styleLink);

        // 4. 创建对话框的基本 HTML 结构
        const dialog = document.createElement('div');
        dialog.className = 'mcp-confirm-overlay';
        dialog.innerHTML = `
            <div class="mcp-confirm-dialog">
                <div class="mcp-confirm-header">
                    <div class="mcp-confirm-branding">
                        <svg class="mcp-confirm-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14.4 2.126A5.4 5.4 0 0 0 9.6 0H5.4A5.4 5.4 0 0 0 0 5.4v4.2a5.4 5.4 0 0 0 2.126 4.2L11.4 23.1a1.8 1.8 0 0 0 2.546 0l7.925-7.924a1.8 1.8 0 0 0 0-2.546L14.4 2.126ZM5.4 9a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z" fill="#0969da"></path>
                        </svg>
                        <span class="mcp-confirm-brand-text">MCP Bridge</span>
                    </div>
                    <div class="mcp-confirm-title"></div>
                </div>
                <div class="mcp-confirm-body">
                    <div class="mcp-confirm-message"></div>
                </div>
                <div class="mcp-confirm-footer">
                    <div class="mcp-confirm-btn-container">
                        <button class="mcp-confirm-btn mcp-confirm-btn-cancel">取消</button>
                        <button class="mcp-confirm-btn mcp-confirm-btn-confirm">确认</button>
                    </div>
                </div>
            </div>
        `;
        this.shadowRoot.appendChild(dialog);

        // 5. 绑定事件
        this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        const overlay = this.shadowRoot.querySelector('.mcp-confirm-overlay');
        const cancelBtn = this.shadowRoot.querySelector('.mcp-confirm-btn-cancel');
        const confirmBtn = this.shadowRoot.querySelector('.mcp-confirm-btn-confirm');

        // 点击遮罩层关闭（可选）
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.cancel();
            }
        });

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            this.cancel();
        });

        // 确认按钮
        confirmBtn.addEventListener('click', () => {
            this.confirm();
        });

        // ESC 键关闭
        const handleKeydown = (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.cancel();
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        // 保存引用以便后续移除
        this._keydownHandler = handleKeydown;
    }

    /**
     * 显示确认对话框
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题（默认：确认操作）
     * @param {string} options.message - 对话框消息（必需）
     * @param {string} options.confirmText - 确认按钮文本（默认：确认）
     * @param {string} options.cancelText - 取消按钮文本（默认：取消）
     * @param {string} options.type - 对话框类型：'default', 'warning', 'danger'（默认：default）
     * @returns {Promise<boolean>} - 用户选择确认返回 true，取消返回 false
     */
    show({
        title = '确认操作',
        message = '',
        confirmText = '确认',
        cancelText = '取消',
        type = 'default',
        showDontShowAgain = false,
        dontShowAgainText = '不再提示'
    } = {}) {
        if (!this.hostElement) {
            this.create();
        }

        return new Promise((resolve) => {
            this.resolveCallback = resolve;

            // 更新内容
            const titleElement = this.shadowRoot.querySelector('.mcp-confirm-title');
            const messageElement = this.shadowRoot.querySelector('.mcp-confirm-message');
            const confirmBtn = this.shadowRoot.querySelector('.mcp-confirm-btn-confirm');
            const cancelBtn = this.shadowRoot.querySelector('.mcp-confirm-btn-cancel');
            const dialog = this.shadowRoot.querySelector('.mcp-confirm-dialog');
            const footer = this.shadowRoot.querySelector('.mcp-confirm-footer');

            titleElement.textContent = title;
            messageElement.textContent = message;
            confirmBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            // 设置类型样式
            dialog.className = 'mcp-confirm-dialog';
            if (type === 'warning') {
                dialog.classList.add('mcp-confirm-warning');
            } else if (type === 'danger') {
                dialog.classList.add('mcp-confirm-danger');
            }

            // 处理"不再提示"复选框
            let checkboxContainer = footer.querySelector('.mcp-confirm-dont-show-again');
            if (showDontShowAgain) {
                if (!checkboxContainer) {
                    checkboxContainer = document.createElement('label');
                    checkboxContainer.className = 'mcp-confirm-dont-show-again';
                    checkboxContainer.innerHTML = `
                        <input type="checkbox" class="mcp-confirm-checkbox">
                        <span class="mcp-confirm-checkbox-text">${dontShowAgainText}</span>
                    `;
                    // 插入到按钮容器之前
                    const btnContainer = footer.querySelector('.mcp-confirm-btn-container');
                    footer.insertBefore(checkboxContainer, btnContainer);
                } else {
                    checkboxContainer.style.display = 'flex';
                    checkboxContainer.querySelector('.mcp-confirm-checkbox-text').textContent = dontShowAgainText;
                    checkboxContainer.querySelector('.mcp-confirm-checkbox').checked = false;
                }
            } else {
                if (checkboxContainer) {
                    checkboxContainer.style.display = 'none';
                }
            }

            // 显示对话框
            const overlay = this.shadowRoot.querySelector('.mcp-confirm-overlay');
            overlay.classList.add('visible');
            this.isVisible = true;

            // 聚焦到确认按钮
            setTimeout(() => {
                confirmBtn.focus();
            }, 100);
        });
    }

    /**
     * 用户确认
     */
    confirm() {
        const result = this.getResult(true);
        this.hide();
        if (this.resolveCallback) {
            this.resolveCallback(result);
            this.resolveCallback = null;
        }
    }

    /**
     * 用户取消
     */
    cancel() {
        const result = this.getResult(false);
        this.hide();
        if (this.resolveCallback) {
            this.resolveCallback(result);
            this.resolveCallback = null;
        }
    }

    /**
     * 获取对话框结果
     * @param {boolean} confirmed - 是否确认
     * @returns {Object|boolean} - 如果有复选框返回对象，否则返回布尔值
     */
    getResult(confirmed) {
        const checkboxContainer = this.shadowRoot?.querySelector('.mcp-confirm-dont-show-again');
        if (checkboxContainer && checkboxContainer.style.display !== 'none') {
            const checkbox = checkboxContainer.querySelector('.mcp-confirm-checkbox');
            return {
                confirmed: confirmed,
                dontShowAgain: checkbox ? checkbox.checked : false
            };
        }
        return confirmed;
    }

    /**
     * 隐藏对话框
     */
    hide() {
        if (!this.shadowRoot) return;

        const overlay = this.shadowRoot.querySelector('.mcp-confirm-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
        }
        this.isVisible = false;
    }

    /**
     * 销毁对话框
     */
    destroy() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }

        if (this.hostElement) {
            this.hostElement.remove();
            this.hostElement = null;
            this.shadowRoot = null;
        }

        this.isVisible = false;
        this.resolveCallback = null;
    }
}

// 导出一个全局单例实例，方便直接使用
export const confirmDialog = new ConfirmDialog();

// 便捷方法：显示确认对话框
export async function confirm(message, options = {}) {
    return await confirmDialog.show({
        message,
        ...options
    });
}

// 便捷方法：显示警告类型的确认对话框
export async function confirmWarning(message, options = {}) {
    return await confirmDialog.show({
        message,
        type: 'warning',
        ...options
    });
}

// 便捷方法：显示危险操作的确认对话框
export async function confirmDanger(message, options = {}) {
    return await confirmDialog.show({
        message,
        type: 'danger',
        confirmText: '确认删除',
        ...options
    });
}
