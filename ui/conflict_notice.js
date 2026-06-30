/**
 * conflict_notice.js
 * 冲突插件通知组件 — 右下角滑动通知
 */
export class ConflictNotice {
    constructor() {
        this.container = null;
    }

    create(conflictExtName, logoUrl) {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.id = 'mcp-conflict-notice';
        this.container.innerHTML = `
            <div class="mcp-conflict-notice-inner">
                <div class="mcp-conflict-notice-header">
                    <span class="mcp-conflict-notice-brand">
                        <img class="mcp-conflict-notice-logo" src="${logoUrl}" alt="">
                        <span>MCP Bridge</span>
                    </span>
                    <button class="mcp-conflict-notice-close" title="关闭">✕</button>
                </div>
                <div class="mcp-conflict-notice-body">
                    <span class="mcp-conflict-notice-icon">⚠️</span>
                    <span class="mcp-conflict-notice-text">检测到与「${conflictExtName}」扩展冲突，已自动关闭本站首次注入。</span>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        // 触发滑入动画
        requestAnimationFrame(() => {
            this.container.classList.add('mcp-conflict-notice-visible');
        });

        // 绑定关闭按钮
        const closeBtn = this.container.querySelector('.mcp-conflict-notice-close');
        closeBtn.addEventListener('click', () => this.destroy());
    }

    destroy() {
        if (!this.container) return;

        this.container.classList.remove('mcp-conflict-notice-visible');

        const el = this.container;
        el.addEventListener('transitionend', () => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }, { once: true });

        this.container = null;

        // 记录关闭状态
        localStorage.setItem(`mcp_bridge_conflict_notice_closed_${window.location.hostname}`, 'true');
    }
}
