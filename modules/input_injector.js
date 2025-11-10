/**
 * input_injector.js
 * 
 * 职责：智能注入文本到网页输入框，支持现代框架（React/Vue）
 * 通过触发原生事件来绕过框架的双向绑定限制
 */

/**
 * 向页面输入框注入文本并自动发送
 * @param {string} text - 要注入的文本
 * @param {object} inputConfig - 输入配置
 * @param {string} inputConfig.selector - 输入框选择器
 * @param {string} inputConfig.submitKey - 发送按键 (Enter/Tab等)，null 表示不自动发送
 * @param {array} inputConfig.submitModifiers - 修饰键 (Shift/Ctrl/Alt/Meta)
 * @param {number} inputConfig.submitDelay - 总延迟时间（毫秒），默认 1600ms
 * @returns {Promise<boolean>} - 是否成功
 */
export async function injectTextAndSubmit(text, inputConfig) {
    try {

        // 获取总延迟时间（默认 1600ms）
        const totalDelay = inputConfig.submitDelay || 1600;
        
        // 按比例分配延迟时间
        // 比例：聚焦 12.5%、输入后 31.25%、等待UI 50%、发送后 6.25%
        const delays = {
            afterFocus: Math.round(totalDelay * 0.125),    // 12.5% → 默认 200ms
            afterInput: Math.round(totalDelay * 0.3125),   // 31.25% → 默认 500ms
            beforeSubmit: Math.round(totalDelay * 0.5),    // 50% → 默认 800ms
            afterSubmit: Math.round(totalDelay * 0.0625)   // 6.25% → 默认 100ms
        };


        // 查找输入框
        const inputElement = findInputElement(inputConfig.selector);
        if (!inputElement) {
            throw new Error(`Input element not found: ${inputConfig.selector}`);
        }
        
        // 聚焦输入框
        inputElement.focus();
        await sleep(delays.afterFocus);
        
        const finalText = `
<tool_result>
${text}
</tool_result>`

        // 注入文本（支持 React/Vue）
        setInputValue(inputElement, finalText);
        await sleep(delays.afterInput);


        // 如果配置了 submitKey，则等待并自动发送
        if (inputConfig.submitKey) {
            // 等待一段时间让 UI 更新
            await sleep(delays.beforeSubmit);

            simulateKeyPress(inputElement, inputConfig.submitKey, inputConfig.submitModifiers || []);
            await sleep(delays.afterSubmit);

        } else {
            console.log('[MCP Bridge] Text injected (auto-submit disabled, waiting for user input)');
        }

        return true;
    } catch (error) {
        console.error('[MCP Bridge] Failed to inject text:', error);
        return false;
    }
}

/**
 * 查找输入框元素
 */
function findInputElement(selector) {
    // 尝试直接查找
    let element = document.querySelector(selector);
    if (element) return element;

    // 尝试在 Shadow DOM 中查找
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            element = el.shadowRoot.querySelector(selector);
            if (element) return element;
        }
    }

    // 使用通用选择器作为后备
    const fallbackSelectors = [
        'textarea[placeholder*="输入"]',
        'textarea[placeholder*="问"]',
        'textarea',
        '[contenteditable="true"]',
        'input[type="text"]'
    ];

    for (const fallbackSelector of fallbackSelectors) {
        element = document.querySelector(fallbackSelector);
        if (element && isVisible(element)) {
            return element;
        }
    }

    return null;
}

/**
 * 检查元素是否可见
 */
function isVisible(element) {
    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

/**
 * 设置输入框的值（兼容 React/Vue 等框架）
 */
function setInputValue(element, value) {
    const isContentEditable = element.contentEditable === 'true';

    if (isContentEditable) {
        // contenteditable 元素 - 使用更可靠的方法
        
        // 方法1: 先清空再插入（模拟用户行为）
        element.focus();
        
        // 选中所有内容
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // 触发 beforeinput 事件（现代框架依赖此事件）
        element.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: value
        }));
        
        // 尝试使用 execCommand（虽然已废弃，但兼容性最好）
        try {
            document.execCommand('insertText', false, value);
        } catch (e) {
            // 如果 execCommand 失败，使用 DOM 操作
            element.textContent = value;
        }
        
        // 将光标移到末尾
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        
    } else {
        // textarea 或 input
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, value);
        } else {
            element.value = value;
        }
    }

    // 触发所有可能的事件，确保框架检测到变化
    // 注意：对于 contenteditable，某些事件已经在上面触发过了
    const events = [
        new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }),
        new Event('change', { bubbles: true, cancelable: true }),
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Unidentified' }),
        new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Unidentified' })
    ];

    events.forEach(event => {
        element.dispatchEvent(event);
    });
}

/**
 * 模拟按键按下
 */
function simulateKeyPress(element, key, modifiers = []) {
    const keyboardEventInit = {
        key: key,
        code: key === 'Enter' ? 'Enter' : key,
        keyCode: getKeyCode(key),
        which: getKeyCode(key),
        bubbles: true,
        cancelable: true,
        shiftKey: modifiers.includes('Shift'),
        ctrlKey: modifiers.includes('Ctrl') || modifiers.includes('Control'),
        altKey: modifiers.includes('Alt'),
        metaKey: modifiers.includes('Meta') || modifiers.includes('Cmd')
    };


    element.dispatchEvent(new KeyboardEvent('keydown', keyboardEventInit));
    element.dispatchEvent(new KeyboardEvent('keypress', keyboardEventInit));
    element.dispatchEvent(new KeyboardEvent('keyup', keyboardEventInit));
}

/**
 * 获取按键的 keyCode
 */
function getKeyCode(key) {
    const keyCodes = {
        'Enter': 13,
        'Tab': 9,
        'Escape': 27,
        'Space': 32
    };
    return keyCodes[key] || 0;
}

/**
 * 睡眠函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
