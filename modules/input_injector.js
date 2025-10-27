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
        
        console.log('INPUT VALUE TEXT', inputElement.value, inputElement.textContent);
        console.log('INPUT VALUE ASSERT', inputElement.value === text, inputElement.textContent === text)

        // 聚焦输入框
        inputElement.focus();
        await sleep(delays.afterFocus);

        // 注入文本（支持 React/Vue）
        setInputValue(inputElement, text);
        await sleep(delays.afterInput);

        // 再次确保内容已设置
        console.log('[MCP Bridge] Verifying content...', {
            expectedLength: text.length,
            actualValue: inputElement.value?.length || inputElement.textContent?.length
        });

        // 如果配置了 submitKey，则等待并自动发送
        if (inputConfig.submitKey) {
            // 等待一段时间让 UI 更新
            await sleep(delays.beforeSubmit);

            // 触发发送按键
            console.log('[MCP Bridge] Triggering submit after delay...');
            simulateKeyPress(inputElement, inputConfig.submitKey, inputConfig.submitModifiers || []);
            await sleep(delays.afterSubmit);

            console.log('[MCP Bridge] Text injected and submitted successfully');
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
            console.log('[MCP Bridge] Using fallback selector:', fallbackSelector);
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
        // contenteditable 元素
        element.textContent = value;
        element.innerHTML = value; // 某些框架可能需要这个
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
    const events = [
        new Event('input', { bubbles: true, cancelable: true }),
        new Event('change', { bubbles: true, cancelable: true }),
        new Event('keydown', { bubbles: true, cancelable: true }),
        new Event('keyup', { bubbles: true, cancelable: true })
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

    console.log('[MCP Bridge] Simulating key press:', keyboardEventInit);

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
