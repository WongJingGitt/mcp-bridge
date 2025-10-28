# MCP Bridge 确认对话框使用指南

## 简介

`ConfirmDialog` 是一个通用的确认对话框组件，提供明显的 MCP Bridge 品牌标识，用于需要用户二次确认的操作。

## 特性

- ✅ 明显的 MCP Bridge 品牌标识
- ✅ 支持三种类型：默认、警告、危险
- ✅ Promise-based API，易于使用
- ✅ 支持键盘操作（ESC 取消、Enter 确认）
- ✅ 响应式设计，支持移动端
- ✅ 暗色模式支持
- ✅ Shadow DOM 隔离，不受页面样式影响

## 使用方法

### 1. 导入组件

```javascript
import { confirmDialog, confirm, confirmWarning, confirmDanger } from './ui/confirm_dialog.js';
```

### 2. 基础用法

#### 使用便捷方法

```javascript
// 基础确认
const result = await confirm('确定要执行此操作吗？');
if (result) {
    console.log('用户点击了确认');
} else {
    console.log('用户点击了取消');
}
```

#### 使用完整配置

```javascript
const result = await confirmDialog.show({
    title: '删除文件',
    message: '确定要删除这个文件吗？此操作不可撤销。',
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
});

if (result) {
    // 执行删除操作
}
```

### 3. 三种对话框类型

#### 默认类型（default）

适用于一般性的确认操作。

```javascript
const result = await confirm('确定要保存更改吗？', {
    title: '保存更改',
    confirmText: '保存',
    cancelText: '取消'
});
```

#### 警告类型（warning）

适用于需要用户注意的操作。

```javascript
const result = await confirmWarning('此操作将覆盖现有配置，是否继续？', {
    title: '覆盖配置',
    confirmText: '继续',
    cancelText: '取消'
});
```

#### 危险类型（danger）

适用于危险的、不可逆的操作。

```javascript
const result = await confirmDanger('删除后无法恢复，确定要删除吗？', {
    title: '危险操作',
    confirmText: '确认删除',
    cancelText: '取消'
});
```

## API 参考

### ConfirmDialog 类

#### show(options)

显示确认对话框。

**参数：**

```typescript
{
    title?: string;        // 对话框标题，默认：'确认操作'
    message: string;       // 对话框消息（必需）
    confirmText?: string;  // 确认按钮文本，默认：'确认'
    cancelText?: string;   // 取消按钮文本，默认：'取消'
    type?: string;         // 类型：'default' | 'warning' | 'danger'，默认：'default'
}
```

**返回值：**

`Promise<boolean>` - 用户点击确认返回 `true`，点击取消或 ESC 返回 `false`

#### destroy()

销毁对话框实例，清理事件监听器。

```javascript
confirmDialog.destroy();
```

### 便捷方法

#### confirm(message, options?)

显示默认类型的确认对话框。

```javascript
const result = await confirm('确定要继续吗？');
```

#### confirmWarning(message, options?)

显示警告类型的确认对话框。

```javascript
const result = await confirmWarning('此操作有风险，是否继续？');
```

#### confirmDanger(message, options?)

显示危险类型的确认对话框。

```javascript
const result = await confirmDanger('确定要删除吗？');
```

## 实际使用示例

### 示例 1：在删除操作前确认

```javascript
async function deleteItem(itemId) {
    const confirmed = await confirmDanger(
        '删除后无法恢复，确定要删除这个项目吗？',
        {
            title: '删除项目',
            confirmText: '确认删除'
        }
    );

    if (confirmed) {
        // 执行删除
        await performDelete(itemId);
        console.log('项目已删除');
    }
}
```

### 示例 2：在重置配置前确认

```javascript
async function resetConfig() {
    const confirmed = await confirmWarning(
        '重置配置将清除所有自定义设置，恢复为默认值。是否继续？',
        {
            title: '重置配置',
            confirmText: '重置',
            cancelText: '保留当前配置'
        }
    );

    if (confirmed) {
        // 执行重置
        await performReset();
    }
}
```

### 示例 3：在发送数据前确认

```javascript
async function submitData(data) {
    const confirmed = await confirm(
        '确定要提交这些数据吗？',
        {
            title: '提交数据',
            confirmText: '提交'
        }
    );

    if (confirmed) {
        await sendData(data);
    }
}
```

## 样式定制

对话框使用 Shadow DOM 隔离样式，但支持暗色模式自动切换。如需自定义样式，可以修改 `confirm_dialog.css` 文件。

## 注意事项

1. 确保在 `manifest.json` 中声明了 `confirm_dialog.css` 文件
2. 对话框使用 `z-index: 999999`，确保显示在最上层
3. 对话框会自动处理 ESC 键关闭
4. 点击遮罩层也会关闭对话框（触发取消）
5. 使用 Promise，记得添加 `await` 或 `.then()`

## 浏览器兼容性

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ 支持所有现代浏览器

## 相关文件

- `ui/confirm_dialog.js` - JavaScript 组件
- `ui/confirm_dialog.css` - 样式文件
