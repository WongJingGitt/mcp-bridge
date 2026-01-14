/**
 * prompt_builder.js
 *
 * 职责: 集中管理和构建所有与 MCP 相关的 Prompt 文本。
 * 这是一个纯函数模块，不依赖任何外部状态。
 */

/**
 * 构建在新对话开始时注入的初始 System Prompt。
 * 这个 Prompt 采用"分层式工具发现"策略。
 *
 * @param {Array<Object>} services - 从 MCP Bridge Server 获取的服务列表，每个对象包含 { name, description, is_core }。
 * @returns {string} - 格式化后的完整 Prompt 文本。
 */
export function buildInitialPrompt(services) {
    // 根据 is_core 字段分组服务
    const coreServices = services.filter(s => s.is_core === true);
    const otherServices = services.filter(s => s.is_core !== true);
    
    // 核心服务：展示完整描述
    const coreServiceListText = coreServices.length > 0
        ? coreServices.map(s => `- **${s.name}**: ${s.description}`).join('\n')
        : "- 暂无核心服务";
    
    // 其他服务：仅展示名称
    const otherServiceListText = otherServices.length > 0
        ? otherServices.map(s => `- ${s.name}`).join('\n')
        : "- 暂无其他服务";

    return `
# 系统增强功能

你是一个智能助手，你现在具备了调用外部工具的能力，在收到用户的需求时，你首先需要判断用户的需求是否需要使用到工具：
    - 如果需要：你需要先调用工具，然后整合工具输出回答用户。
    - 如果不需要：你将直接使用你的知识库内容回答用户。

## 当前可用的服务

### 核心服务（常用功能，已展示完整描述）
${coreServiceListText}

### 其他服务（按需使用，仅展示名称）
${otherServiceListText}

## 工具使用流程

### 第一步：判断是否需要工具

深度理解用户的需求，判断用户是否有涉及到任何工具相关的请求。

### 第二步：查看服务的工具列表

**无论是核心服务还是其他服务**，在决定使用某个服务后，都需要先调用 \`list_tools_in_service\` 查看该服务的详细信息：


<tool_code>
{
  "tool_name": "list_tools_in_service",
  "arguments": {
    "service_name": "服务名称"
  }
}
</tool_code>


系统会返回该服务的**完整信息**，包括：
- **服务描述**（对于其他服务特别重要，因为初始 Prompt 中未展示）
- **工具列表**：每个工具的名称、描述和参数定义

然后根据返回结果选择合适的工具调用。

### 第三步：调用具体工具

根据工具列表选择合适的工具调用：


<tool_code>
{
  "tool_name": "实际工具名",
  "arguments": {
    "参数名": "参数值"
  },
  "server_name": "服务名称"  // 可选字段，如果需要指定服务的话，用于区分同名工具
}
</tool_code>


### 第四步：处理大结果缓存

某些工具可能返回较大的结果（如文件内容、长列表等）。为了性能考虑，这些结果会被缓存，你会收到缓存引用。

**可用的缓存操作工具**：

#### 1. 搜索缓存内容（推荐优先使用）
如果用户需要查找特定信息，先搜索定位：


<tool_code>
{
  "tool_name": "search_cached_result",
  "arguments": {
    "cache_id": "缓存ID",
    "keyword": "搜索关键词",
    "case_sensitive": false,  // 可选，是否区分大小写
    "max_results": 50         // 可选，最大结果数
  }
}
</tool_code>


搜索会返回所有匹配的行号和列号，然后你可以精确获取这些位置的内容。

#### 2. 获取指定行的上下文
找到目标行后，获取上下文：


<tool_code>
{
  "tool_name": "get_cache_context",
  "arguments": {
    "cache_id": "缓存ID",
    "line_num": 23,          // 目标行号
    "context_lines": 5       // 可选，上下文行数，默认3
  }
}
</tool_code>


#### 3. 分段获取内容
如果需要顺序浏览，少量多次获取：


<tool_code>
{
  "tool_name": "get_cached_result",
  "arguments": {
    "cache_id": "缓存ID",
    "start": 0,
    "end": 8000    // 建议每次 5000-10000 字符
  }
}
</tool_code>


**推荐流程**：
1. 收到缓存引用 → 先用 \`search_cached_result\` 搜索关键信息
2. 找到目标位置 → 用 \`get_cache_context\` 获取上下文
3. 需要更多内容 → 用 \`get_cached_result\` 分段获取

### 第五步：整合结果并回答

工具执行后，系统会把结果返回给你。**你必须基于这些结果给用户一个完整、友好的回答**，不要只是转发原始数据。

## 调用规则

1. **格式严格**: XML 标签必须是 \`<tool_code>\`，内部必须是合法的 JSON，并且 **绝对不允许用代码块包裹**
2. **单次调用**：一次只调用一个工具，等待结果后再决定下一步
3. **可以思考**：你可以在输出中说明你的思路，比如"我需要先查询文件内容"，然后再输出 \`<tool_code>\`
4. **正常对话**：不调用工具时，就像普通助手一样自然交流
5. **工具收尾**: 当你决定在本次输出调用工具时，你的 \`<tool_code>\` 工具调用命令必须始终处于你输出的最末尾位置。

## 错误处理

- 工具调用失败会返回错误信息，你可以调整参数重试（最多 3 次）
- 如果无法解决，诚实告知用户原因

---

现在开始处理用户的问题：
`.trim();
}

/**
 * 构建一个简短的提醒 Prompt，用于“每次都注入”的场景。
 * @returns {string} - 简短的提醒文本。
 */
export function buildReminderPrompt() {
    return `
# 工具调用提醒
请记住，你可以通过输出 \`<tool_code>{"tool_name": "...", "arguments": {...}}</tool_code>\` 格式来调用外部工具。
`.trim();
}

/**
 * 将工具执行的结果格式化后，喂回给模型。
 *
 * @param {string} toolName - 被调用的工具名称。
 * @param {any} toolResult - 工具执行返回的结果 (通常是 JSON 对象或字符串)。
 * @returns {string} - 格式化后的结果文本。
 */
export function formatToolResultForModel(toolName, toolResult) {
    let resultContent;
    try {
        // 尝试将结果格式化为美化的 JSON 字符串，便于模型阅读
        resultContent = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
    } catch (error) {
        resultContent = String(toolResult);
    }

    return `
# 工具执行结果

**工具名称**: \`${toolName}\`
**执行结果**:
\`\`\`json
${resultContent}
\`\`\`

现在，请基于以上工具执行结果，继续为用户生成最终的回答。如果需要，你也可以调用另一个工具。
`.trim();
}

/**
 * 当工具执行失败时，构建一个错误信息反馈给模型。
 *
 * @param {string} toolName - 尝试调用的工具名称。
 * @param {string} errorMessage - 从 MCP Bridge Server 返回的错误信息。
 * @returns {string} - 格式化后的错误信息文本。
 */
export function formatToolErrorForModel(toolName, errorMessage) {
    return `
# 工具执行失败

**工具名称**: \`${toolName}\`
**错误信息**: ${errorMessage}

请分析错误原因。你可以尝试修正参数后重新调用该工具，或者选择其他工具，或者直接告诉用户无法完成任务。
`.trim();
}

/**
 * 格式化缓存引用信息，引导模型如何处理大结果
 *
 * @param {string} toolName - 被调用的工具名称。
 * @param {Object} cacheInfo - 缓存信息对象，包含 cache_id, cache_type, total_size 等字段。
 * @returns {string} - 格式化后的提示文本。
 */
export function formatCachedResultForModel(toolName, cacheInfo) {
    const sizeKB = (cacheInfo.total_size / 1024).toFixed(2);
    
    // 根据大小给出推荐的分段大小
    let recommendedChunkSize;
    if (cacheInfo.total_size < 20000) {
        recommendedChunkSize = 5000;
    } else if (cacheInfo.total_size < 100000) {
        recommendedChunkSize = 8000;
    } else {
        recommendedChunkSize = 10000;
    }
    
    return `
# 工具执行结果（已缓存）

**工具**: \`${toolName}\`  
**大小**: ${sizeKB} KB (${cacheInfo.total_size} 字符)  
**缓存ID**: \`${cacheInfo.cache_id}\`

结果过大已缓存。**推荐操作**：

**1. 如果用户需要查找特定信息** → 先搜索定位：
\`\`\`xml
<tool_code>
{
  "tool_name": "search_cached_result",
  "arguments": {
    "cache_id": "${cacheInfo.cache_id}",
    "keyword": "搜索关键词"
  }
}
</tool_code>
\`\`\`

**2. 如果需要顺序浏览** → 分段获取（每次 ${recommendedChunkSize} 字符）：
\`\`\`xml
<tool_code>
{
  "tool_name": "get_cached_result",
  "arguments": {
    "cache_id": "${cacheInfo.cache_id}",
    "start": 0,
    "end": ${recommendedChunkSize}
  }
}
</tool_code>
\`\`\`
`.trim();
}