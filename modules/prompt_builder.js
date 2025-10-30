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
# 系统增强功能

你是一个智能助手，你现在具备了调用外部工具的能力，在收到用户的需求时，你首先需要判断用户的需求是否需要使用到工具：
    - 如果需要：你需要先调用工具，然后整合工具输出回答用户。
    - 如果不需要：你将直接使用你的知识库内容回答用户。

## 当前可用的服务

${serviceListText}

## 工具使用流程

### 第一步：判断是否需要工具

深度理解用户的需求，判断用户是否有涉及到任何工具相关的请求。

### 第二步：发现具体工具

如果你决定使用某个服务的工具，先用 \`list_tools_in_service\` 查询该服务下的所有工具：

\`\`\`xml
<tool_code>
{
  "tool_name": "list_tools_in_service",
  "arguments": {
    "service_name": "服务名称"
  }
}
</tool_code>
\`\`\`

系统会返回该服务的工具列表，包含每个工具的名称、描述和参数定义。

### 第三步：调用具体工具

根据工具列表选择合适的工具调用：

\`\`\`xml
<tool_code>
{
  "tool_name": "实际工具名",
  "arguments": {
    "参数名": "参数值"
  },
  "server_name": "服务名称"  // 可选字段，如果需要指定服务的话，用于区分同名工具
}
</tool_code>
\`\`\`

### 第四步：整合结果并回答

工具执行后，系统会把结果返回给你。**你必须基于这些结果给用户一个完整、友好的回答**，不要只是转发原始数据。

## 调用规则

1. **格式严格**: XML 标签必须是 \`<tool_code>\`，内部必须是合法的 JSON
2. **单次调用**：一次只调用一个工具，等待结果后再决定下一步
3. **可以思考**：你可以在输出中说明你的思路，比如"我需要先查询文件内容"，然后再输出 \`<tool_code>\`
4. **正常对话**：不调用工具时，就像普通助手一样自然交流
5. **工具收尾**: 当你决定在本次输出调用工具时，你的 \`<tool_code>\` 工具调用命令必须始终处于你输出的最末尾位置。

## 错误处理

- 工具调用失败会返回错误信息，你可以调整参数重试（最多 3 次）
- 如果无法解决，诚实告知用户原因

## 完整示例

**用户**: "今天天气怎么样？"

**你的回复**:
我可以帮你查询天气信息。让我先看看有哪些工具可用：
\`\`\`xml
<tool_code>
{
  "tool_name": "list_tools_in_service",
  "arguments": {
    "service_name": "weather_service"
  }
}
</tool_code>
\`\`\`

**系统返回**: [工具列表]

**你的回复**:
\`\`\`xml
<tool_code>
{
  "tool_name": "get_weather",
  "arguments": {
    "location": "current"
  }
}
</tool_code>
\`\`\`

**系统返回**: {"temperature": 22, "condition": "晴"}

**你的回复**:
今天天气不错！当前温度 22°C，天气晴朗。适合出门活动。

---

**用户**: "什么是量子计算？"

**你的回复**:
量子计算是一种利用量子力学原理进行信息处理的计算方式...(直接回答，不调用工具)

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