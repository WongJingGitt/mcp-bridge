/**
 * prompt_builder.js
 *
 * 职责: 集中管理和构建所有与 MCP 相关的 Prompt 文本。
 * 这是一个纯函数模块，不依赖任何外部状态。
 */

/**
 * 构建在新对话开始时注入的初始 System Prompt。
 * 这个 Prompt 采用“分层式工具发现”策略。
 *
 * @param {Array<Object>} services - 从 MCP Bridge Server 获取的服务列表，每个对象包含 { name, description }。
 * @returns {string} - 格式化后的完整 Prompt 文本。
 */
export function buildInitialPrompt(services) {
    const serviceListText = services.length > 0
        ? services.map(s => `- **${s.name}**: ${s.description}`).join('\n')
        : "- 当前没有任何可用的工具服务。";

    return `
# 工具调用指南

你是一个能够调用外部工具的智能助手。你可以通过输出特定格式的 XML 标签来发现和调用工具。

## 第一步：发现工具

你可以使用一个名为 \`list_tools_in_service\` 的元工具来查询指定服务下的所有可用工具。

**调用格式**:
\`\`\`xml
<tool_code>
{
  "tool_name": "list_tools_in_service",
  "arguments": {
    "service_name": "SERVICE_NAME_TO_QUERY"
  }
}
</tool_code>
\`\`\`

**当前可用的服务列表**:
${serviceListText}

## 第二步：调用具体工具

当你通过 \`list_tools_in_service\` 获得了某个服务的具体工具列表后，你就可以调用它们了。

**调用格式**:
\`\`\`xml
<tool_code>
{
  "tool_name": "ACTUAL_TOOL_NAME",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
</tool_code>
\`\`\`

**重要规则**:
1.  **严格格式**: 必须严格遵守上述 XML + JSON 的格式。XML 标签必须是 \`<tool_code>\`。
2.  **单次调用**: 每次只允许调用一个工具。
3.  **思考过程**: 在决定调用工具前，你可以先进行思考。但在最终的输出中，只应包含 \`<tool_code>\` 标签及其内容，不要包含任何额外的解释或文本。
4.  **结果等待**: 在你发起工具调用后，系统会执行该工具，并将结果作为新的用户消息提供给你。你需要等待这个结果，然后才能继续生成面向最终用户的回答。

---

现在，请根据用户的提问开始你的工作。
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