# Answer Atlas 开发与运行逻辑记录

本文档是 Answer Atlas 的长期开发记录。每一次功能变更都必须同步更新本文档，尤其是涉及 LLM 上下文、版本路径、注释、删除、丢弃、模型选择、API 调用和“是否进入记忆”的规则。

## 0. 当前结论总览

Answer Atlas 不是静态展示网页，也不是普通线性聊天应用。它的目标是：

1. 程序启动时是空白工作区，不预加载任何示例文章。
2. 用户输入一个问题或主题。
3. 用户选择模型。
4. 程序调用当前选择的 LLM 模型生成文档式回答。
5. LLM 回答被拆分成结构化文档块，其中句子可被选中为 anchor。
6. 左侧 Contents 根据 LLM 生成回答里的 section heading、section summary、sentence summary 自动生成。
7. 用户可以围绕某一句话发起局部问题、获得局部回答、生成修订建议。
8. Comparison 根据当前选中句子的原句、局部问题、局部回答、active-path context 和 LLM 返回的 revisedText，通过当前选择模型动态生成，不使用图片里的固定内容。
9. 用户可以在某一句话旁边添加“注释修改”。注释会影响之后的 LLM 生成。
10. 用户可以把局部回答保留为 note、创建分支、merge 到文档、discard、delete。
11. 时间线从空开始，随着 document generated、anchor selected、local question、annotation、merge 等操作逐步生成。
12. LLM 真正接收到的上下文必须只来自当前 active version path。

核心原则：

```text
可见历史 != LLM 请求上下文
```

时间线可以保留所有历史节点，方便用户理解演化过程；但是每次调用 LLM 时，Context Builder 只会把允许进入上下文的内容发给模型。

## 1. API Key 与安全规则

用户提供的 OpenAI API key 不写入源码、不写入 Markdown、不写入 git、不显示在 UI、不打印到日志。

程序只从服务端环境变量读取：

```text
OPENAI_API_KEY
```

推荐在本地创建 `.env.local`：

```text
OPENAI_API_KEY=你的 key
ANSWER_ATLAS_ALLOWED_MODELS=gpt-5.2,gpt-5.1,gpt-5,gpt-4.1,gpt-4o
```

`.env.local` 已经被 `.gitignore` 忽略，不应该提交。

如果 `OPENAI_API_KEY` 不存在，程序进入 mock fallback 模式：

```text
provider = mock
model = mock-llm
```

mock fallback 只用于离线开发和 UI 验证，不代表最终真实 LLM 行为。

## 2. 模型选择逻辑

模型选择不是前端写死的。

服务端路由：

```text
GET /api/models
```

运行逻辑：

1. 服务端读取 `OPENAI_API_KEY`。
2. 如果没有 key，返回 mock model catalog。
3. 如果有 key，调用 OpenAI Models API：

```text
GET https://api.openai.com/v1/models
Authorization: Bearer $OPENAI_API_KEY
```

4. OpenAI 返回当前 API key 可见的 model ids。
5. 如果配置了 `ANSWER_ATLAS_ALLOWED_MODELS`，程序取交集：

```text
最终可选模型 = OpenAI API 返回的模型 ∩ ANSWER_ATLAS_ALLOWED_MODELS
```

6. 如果没有配置 allowlist，程序会从 API 返回结果里筛选看起来适合文本生成的模型，排除 embedding、audio、tts、image、moderation、realtime 等非文本回答模型。
7. 前端模型下拉框只显示最终可选模型。
8. LLM API 路由收到模型请求时，会再次检查模型是否在最终可选模型中。
9. 如果用户或前端传入不在范围内的模型，服务端拒绝，不调用 OpenAI。

这满足规则：

```text
用户给什么 API / 配置，程序只能用这个范围内可见和允许的模型。
```

## 3. OpenAI 调用方式

当前使用 OpenAI Responses API。

文档生成：

```text
POST /api/llm/generate-document
```

局部句子问题：

```text
POST /api/llm/local-question
```

论证结构对比：

```text
POST /api/llm/argument-comparison
```

服务端调用：

```text
POST https://api.openai.com/v1/responses
Authorization: Bearer $OPENAI_API_KEY
Content-Type: application/json
```

核心 body：

```json
{
  "model": "前端选择且服务端验证过的模型",
  "input": [...]
}
```

前端永远不直接持有 API key。

当前所有“看起来像 LLM 生成内容”的主要产物都通过服务端 LLM API 路由生成：

```text
用户主问题 -> /api/llm/generate-document -> 当前选择模型
局部句子问题 -> /api/llm/local-question -> 当前选择模型
原句/修订句对比图 -> /api/llm/argument-comparison -> 当前选择模型
```

前端只负责：

```text
展示模型输出
维护 project/thread/version 状态
构建 active-path context
管理 include/exclude/delete/discard 规则
把模型返回 JSON 规范化为 UI 可渲染结构
```

前端不应该把图片中的文字、AI education 示例文字或本地固定规则当作真实生成内容。

## 4. 文档生成逻辑

用户打开页面时，主文档区为空白状态。

空白状态包含：

```text
模型选择
问题输入框
Generate 按钮
空文档提示
空 Contents
空 Timeline
空 Comparison
```

用户在主文档面板输入 prompt，然后点击 Generate。

前端调用：

```text
generateDocumentFromPrompt(prompt)
```

前端随后请求：

```text
POST /api/llm/generate-document
```

服务端 prompt 要求模型返回 JSON：

```json
{
  "title": "文档标题",
  "sections": [
    {
      "heading": "这一部分的标题",
      "summary": "这一部分在 Contents 里显示的总结",
      "paragraphs": ["段落一", "段落二"],
      "sentenceSummaries": ["句子一的摘要", "句子二的摘要"]
    }
  ]
}
```

前端收到结果后，调用：

```text
createGeneratedDocumentState(output, idSuffix)
```

它会生成：

1. `Document`
2. `AnswerBlock[]`
3. `VersionNode`
4. `VersionSnapshot`

sections 会被拆成：

```text
heading block = section.heading
heading summary = section.summary
sentence block = section.paragraphs 拆句
sentence summary = section.sentenceSummaries
...
```

句子拆分规则是 MVP 简化规则：

```text
按英文/中文句号、问号、感叹号后的空格或边界拆分
```

每个 sentence block 都是 anchorable：

```ts
anchorable: true
```

生成的新文档会成为当前 active document：

```text
currentDocumentId = 新文档 id
activeVersionNodeId = 新文档 root version node id
```

生成新文档时，前端工作区状态会重置为这份新回答：

```text
currentDocumentId = 新文档 id
activeVersionNodeId = 新文档 root version node id
anchors = {}
threads = {}
messages = {}
annotations = {}
branches = {}
comparisons = {}
timeline = 仅包含新文档 root node
```

这不是删除文件，只是清空当前浏览器内存里的旧工作区状态，使界面真正基于最新 LLM 回答生成。

测试 fixture 仍然保留 mock data，但真实 app 启动不导入示例文章作为默认文档。

## 5. 句子 Anchor 逻辑

每个 sentence block 可以被点击。

点击后运行：

```text
selectSentence(blockId)
```

逻辑：

1. 如果该句子已经有 anchor，直接选中现有 anchor。
2. 如果还没有 anchor，创建新的 `Anchor`。
3. 如有需要，创建该 anchor 对应的 `LocalThread`。
4. 设置：

```text
selectedAnchorId = anchor.id
selectedThreadId = thread.id
```

5. 如果是新 anchor，会创建版本节点：

```text
nodeType = anchor_selected
```

6. 更新 active path。

## 6. 注释修改功能

新功能：用户可以在一句话旁边添加注释修改。

UI 位置：

```text
SideThreadPanel -> Annotation for Future LLM Context
```

数据模型：

```ts
type Annotation = {
  id: string;
  documentId: string;
  anchorId: string;
  blockId: string;
  content: string;
  status: "active" | "resolved" | "deleted";
  contextPolicy: "include" | "exclude";
  includeInContext: boolean;
  createdInVersionNodeId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
```

添加注释时：

```text
addAnnotation(content)
```

状态变化：

```text
annotation.status = active
annotation.contextPolicy = include
annotation.includeInContext = true
annotation.createdInVersionNodeId = 当前 activeVersionNodeId
```

同时创建版本节点：

```text
nodeType = annotation_added
label = Annotation added
```

### 6.1 注释是否进入 LLM 记忆

严格说，注释不会进入 OpenAI 或模型的“永久记忆”。

它进入的是 Answer Atlas 自己构建的“下一次 LLM 请求上下文”，也就是：

```text
LLM request context
```

更准确地说：

```text
注释不会进入长期 memory
注释不会进入全局 memory
注释不会跨 active path 无条件生效
注释只在满足 Context Builder 规则时，作为 annotation 类型 context item 被发给 LLM
```

注释进入 LLM 请求上下文必须满足：

```text
1. annotation.createdInVersionNodeId 在当前 active path 上
2. annotation.status !== deleted
3. annotation.contextPolicy !== exclude
4. annotation.includeInContext === true
```

满足后，Context Builder 生成：

```text
type = annotation
text = annotation.content
reason = Included as sentence annotation on the active version path.
```

之后局部问题、修订、未来文档生成如果使用当前 active context，就会考虑这些注释。

### 6.2 删除注释

删除注释不是批量删除文件，只是把注释状态变为 deleted：

```text
deleteAnnotation(annotationId)
```

状态变化：

```text
annotation.content = ""
annotation.status = deleted
annotation.contextPolicy = exclude
annotation.includeInContext = false
annotation.deletedAt = now
```

同时创建版本节点：

```text
nodeType = annotation_deleted
label = Annotation deleted
```

删除后的注释不会进入任何未来 LLM 请求上下文。

## 7. 局部问题逻辑

用户选择句子后，可以在 SideThreadPanel 中提问。

前端运行：

```text
askLocalQuestion(question)
```

执行顺序：

1. 找到当前 `selectedThreadId`。
2. 找到 thread 对应的 anchor。
3. 找到 anchor 对应的 sentence block。
4. 调用 `buildContextPreview(...)`。
5. 只取 `includedItems` 发给服务端。
6. 请求：

```text
POST /api/llm/local-question
```

请求体包含：

```json
{
  "anchorText": "当前句子",
  "question": "用户局部问题",
  "model": "当前选择模型",
  "contextItems": [
    {
      "type": "document_block | thread_message | annotation",
      "text": "上下文内容",
      "reason": "为什么被纳入"
    }
  ]
}
```

服务端 system prompt 规定：

```text
只能使用 active-path context
把 annotation 当作用户对未来生成的指令
返回 JSON: answer + revisedText
```

前端收到后：

1. 创建 user `ThreadMessage`。
2. 创建 assistant `ThreadMessage`。
3. 如果返回 `revisedText`，保存到：

```text
revisionSuggestions[threadId]
```

4. 创建版本节点：

```text
nodeType = local_answer_generated
```

5. 更新 active path。

6. 如果本次局部回答包含 `revisedText`，前端继续调用：

```text
POST /api/llm/argument-comparison
```

请求体包含：

```json
{
  "documentId": "当前文档 id",
  "anchorId": "当前 anchor id",
  "createdInVersionNodeId": "本次 local_answer_generated 节点 id",
  "originalText": "被选中的原句",
  "revisedText": "局部回答返回的修订句",
  "localQuestion": "用户刚刚问的问题",
  "localAnswer": "模型刚刚返回的局部回答",
  "model": "当前选择模型",
  "contextItems": [
    {
      "type": "document_block | thread_message | annotation",
      "text": "active-path context 内容",
      "reason": "为什么被纳入"
    }
  ]
}
```

这意味着 Comparison 不是前端自己根据固定模板生成，而是同一条 LLM 交互链的下一个模型调用。

如果 `/api/llm/argument-comparison` 失败，前端只保留 `revisionSuggestions[threadId]`，不会伪造一个本地 comparison。

### 7.1 局部问题是否进入 LLM 记忆

局部问题本身会被保存成 `ThreadMessage`：

```text
role = user
includeInContext = true
contentState = normal
```

它不会进入 OpenAI 的永久记忆，也不会写入任何外部长期模型记忆。

它进入的是 Answer Atlas 的项目内状态，并且只有在以下条件同时成立时，才会进入后续 LLM 请求上下文：

```text
该 message 所属 version node 位于当前 active version path
message.includeInContext = true
message.contentState != deleted
thread.contextPolicy != exclude
```

所以局部问题是“项目内、线程内、版本路径约束下的请求上下文记忆”，不是跨项目、跨 thread、跨用户的模型记忆。

### 7.2 Comparison 是否进入 LLM 记忆

Comparison 图本身是可视化结构，不会默认进入下一次 LLM 请求。

进入 LLM 请求的是生成 comparison 时所使用的原始文本来源：

```text
originalText
revisedText
localQuestion
localAnswer
contextItems
```

其中 `contextItems` 仍然由 Context Builder 根据 active path 过滤。

如果后续要让 comparison 节点本身作为上下文进入 LLM，需要显式增加一种新的 context item 类型，例如：

```text
argument_comparison_node
```

当前版本没有把 comparison 节点默认加入 LLM 请求上下文，避免让可视化派生结构反过来污染主回答记忆。

## 8. Discard 与 Delete Answer

Discard 是软隐藏：

```text
thread.status = discarded
thread.visibility = hidden
thread.contextPolicy = include
message.contentState = discarded_but_contextual
message.includeInContext = true
```

所以 discarded answer 仍然可能进入后续 LLM 请求上下文，前提是它位于 active path 上。

Delete Answer 是强删除语义：

```text
thread.status = deleted
thread.visibility = hidden
thread.contextPolicy = exclude
message.content = ""
message.contentState = deleted
message.includeInContext = false
```

所以 deleted answer 永远不会进入后续 LLM 请求上下文。

## 9. Merge 逻辑

点击 Merge into Document 时：

1. 找到当前 thread。
2. 找到 thread 对应 anchor。
3. 找到 anchor 对应 block。
4. 从 `revisionSuggestions[threadId]` 取模型返回的修订句。
5. 如果没有修订句，使用原句作为 fallback。
6. 生成 patch：

```text
replace_block_text
```

7. 打开 DiffModal。
8. 用户确认后应用 patch。
9. 创建新的 merged version node。
10. 创建新的 VersionSnapshot。
11. 设置 document.activeVersionNodeId 为 merged node。

## 10. Revert 逻辑

点击版本节点里的 Revert to This Node：

```text
checkoutVersionNode(document, versionNodes, targetNodeId)
```

执行：

1. 从 target node 向 parent 回溯到 root。
2. 得到 active path。
3. 设置目标节点为 activeVersionNodeId。
4. active path 上节点 `isActivePath = true`。
5. 其他节点 `isActivePath = false`。

Revert 后，未来节点仍在时间线上可见，但不会进入 Context Builder。

## 11. Context Builder 详细逻辑

入口：

```text
buildContextForLLM(params, state)
```

输入：

```ts
{
  documentId,
  activeVersionNodeId,
  anchorId?,
  purpose
}
```

步骤：

1. 找到 document。
2. 用 `computeActivePath` 计算当前 active path。
3. 用 `getBlocksVisibleAtVersion` 找当前版本可见 blocks。
4. 把可见 document blocks 作为 `document_block` context item。
5. 遍历 thread messages。
6. 用 `canIncludeMessageInContext` 判断是否 included。
7. 遍历 annotations。
8. 用 annotation 规则判断是否 included。
9. 返回 `LLMContext`。

### 11.1 document_block

当前 MVP 使用 VersionSnapshot：

```text
只要 block 在当前 activeVersionNodeId 的 snapshot 中可见，就进入 context。
```

### 11.2 thread_message

进入上下文条件：

```text
1. thread.createdInVersionNodeId 在 active path 上
2. thread.status !== deleted
3. thread.contextPolicy !== exclude
4. message.contentState !== deleted
5. message.includeInContext !== false
```

### 11.3 annotation

进入上下文条件：

```text
1. annotation.createdInVersionNodeId 在 active path 上
2. annotation.status !== deleted
3. annotation.contextPolicy !== exclude
4. annotation.includeInContext === true
```

### 11.4 什么不会进入 LLM

以下内容不会进入 LLM 请求上下文：

```text
deleted answers
deleted annotations
inactive future nodes 的 thread messages
inactive future nodes 的 annotations
contextPolicy = exclude 的内容
includeInContext = false 的内容
```

## 12. 当前文件结构重点

核心 UI：

```text
src/components/layout/AppShell.tsx
src/components/layout/AppHeader.tsx
src/components/document/MainDocumentPanel.tsx
src/components/document/SentenceAnchor.tsx
src/components/thread/SideThreadPanel.tsx
src/components/comparison/ArgumentEvidenceComparison.tsx
src/components/timeline/VersionTimeline.tsx
src/components/debug/ContextDebugPanel.tsx
```

核心状态：

```text
src/store/useAnswerAtlasStore.ts
```

核心上下文：

```text
src/lib/context/buildContextForLLM.ts
src/lib/context/canIncludeMessageInContext.ts
```

LLM：

```text
src/app/api/models/route.ts
src/app/api/llm/generate-document/route.ts
src/app/api/llm/local-question/route.ts
src/lib/llm/openaiProvider.ts
src/lib/llm/openaiResponses.ts
src/lib/llm/serverModelCatalog.ts
```

注释：

```text
src/lib/thread/annotations.ts
```

文档生成：

```text
src/lib/document/createGeneratedDocument.ts
```

## 13. 本次修改记录

时间：2026-06-23

修改内容：

1. 新增注释修改功能。
2. 新增 `Annotation` 数据模型。
3. 注释会作为 `annotation` context item 进入 Context Builder。
4. 注释只进入 active path 的 LLM 请求上下文。
5. 删除注释后，注释内容清空并永远不进入后续上下文。
6. 新增 OpenAI Responses API provider。
7. 新增模型列表 API。
8. 新增模型选择下拉框。
9. 新增文档生成 API。
10. 新增局部问题 API。
11. 主文档面板新增 prompt 输入和 Generate 按钮。
12. 局部问题不再固定使用图片里的静态内容，而是走 `/api/llm/local-question`。
13. Merge 的修订句来源改为模型返回的 `revisedText`。
14. 新增 `.env.local.example`，但不写入真实 API key。

## 15. 第二次修改记录：空白初始与动态生成

时间：2026-06-23

本次修正用户指出的核心问题：

```text
图片只是布局参考，不是内容来源。
程序一开始应该什么都没有。
所有 Contents、Document、Comparison、Timeline 都应该根据用户问题和 LLM 回答生成。
```

修改内容：

1. Zustand 初始状态改为空：

```text
currentDocumentId = null
activeVersionNodeId = null
documents = {}
blocks = {}
anchors = {}
threads = {}
messages = {}
annotations = {}
versionNodes = {}
branches = {}
comparisons = {}
snapshots = {}
```

2. 真实 app 启动不再加载 `mockData`。
3. `mockData` 只作为测试 fixture 保留。
4. 主文档面板默认显示空白工作区和问题输入。
5. Generate 后才创建 Document、AnswerBlock、VersionNode、VersionSnapshot。
6. LLM 文档生成输出升级为 `sections` 结构。
7. `sections.heading` 生成 heading block。
8. `sections.summary` 用于左侧 Contents 的段落总结。
9. `sections.paragraphs` 被拆成 sentence blocks。
10. `sections.sentenceSummaries` 用于左侧 Contents 的句子说明。
11. 左侧 Contents 不再写死 P1/P2/P3/S2。
12. 左侧 Contents 完全从当前可见 blocks 派生。
13. Document Map 从当前 outline 派生显示。
14. SideThread 的 anchor label 不再写死 S2。
15. Comparison 的 selected anchor label 不再写死 S2。
16. Timeline 在初始状态显示空提示。
17. Timeline 节点由用户操作逐步生成。
18. Branch lane 改为通用图例，不显示固定 S2 revision。
19. 局部问题返回 revisedText 后，程序会用原句和 revisedText 生成当前 anchor 的 comparison。
20. Comparison 不再使用图片里的 AI education 固定内容。

当前仍然存在的 MVP 简化点：

```text
Comparison 目前使用原句 + revisedText 的结构化 fallback 生成。
下一步可以把 ArgumentComparison 也完全交给 LLM 返回 JSON。
```

2026-06-23 后续修正：

```text
上述 MVP 简化点已经被修正。
ArgumentComparison 现在有独立服务端路由 /api/llm/argument-comparison。
真实 OpenAI provider 会调用当前选择模型生成 comparison JSON。
mock fallback 仅在没有 OPENAI_API_KEY 或模型列表不可用时用于离线开发。
前端不会在 comparison API 失败时自行伪造 comparison。
```

## 16. 第三次修改记录：浏览器批注后的 UI 与交互修正

时间：2026-06-23

本次根据浏览器批注修改以下内容。

### 16.1 顶部栏

顶部栏现在区分 Project 与 Model：

```text
Project 下拉框在顶部栏
Model 下拉框在 Generate 按钮旁边
```

原因：

```text
Project 决定记忆/上下文隔离范围
Model 决定本次 Generate 或 local question 调用哪个模型
```

Project 规则：

```text
默认项目 = Default
New Project 会创建新的空项目
切换 Project 会保存当前项目内存快照，再恢复目标项目快照
不同 Project 之间 documents / threads / annotations / contextPreview / timeline 不互相干扰
```

注意：

```text
这里的 memory 指 Answer Atlas 程序自己的项目级上下文状态，不是 OpenAI 的永久记忆。
```

模型规则：

```text
Model 下拉框显示 /api/models 返回的模型
/api/models 会根据 OPENAI_API_KEY 可见模型和 ANSWER_ATLAS_ALLOWED_MODELS 过滤
Generate 会使用当前 Model
Local Question 会使用当前 Model
```

### 16.2 New Thread

顶部 `New Thread` 按钮现在会清空当前项目工作区：

```text
currentDocumentId = null
activeVersionNodeId = null
documents = {}
blocks = {}
anchors = {}
threads = {}
messages = {}
annotations = {}
versionNodes = {}
branches = {}
comparisons = {}
snapshots = {}
```

这不是删除文件，也不是批量删除磁盘内容，只是把当前项目的内存工作区重置为空白。

### 16.3 Menu 侧栏按钮

左上角 Menu 现在用于收起/展开导航侧栏。

收起后：

```text
左侧图标栏和 Contents 栏隐藏
主文档区 / Side Thread / Comparison 重新占用可用空间
```

### 16.4 Contents

Contents 不再显示 S1、S2 这样的句子标签。

现在 Contents 只显示每个 section 的摘要：

```text
section heading 或 section summary
```

句子级内容不在 Contents 里展开，避免视觉混乱。

后续可以加搜索和过滤：

```text
按关键词定位 section
按 annotation / branch / merged / discarded / deleted 状态过滤
```

### 16.5 主文档区

主文档区不再显示 P1、S1、S2 标签。

显示结构改为：

```text
section heading 用更大更粗字体显示
section summary 用小字说明
sentence 用普通正文样式显示
```

句子旁边默认不直接打开 Side Thread。

交互改为：

```text
鼠标 hover 到句子
出现漂亮的 anchor / plus 按钮
点击按钮才打开右侧 Side Thread
```

这样避免用户只是阅读或选择文本时误触发 side thread。

当前 MVP 用 hover 按钮模拟“拖动选择后出现 + 号”的交互。下一步可以实现真正的 text selection popover：

```text
用户拖动选中文字
selection range 保存为 anchor selectedText
浮出 + 按钮
点击 + 后打开 Side Thread
```

### 16.6 Side Thread

Side Thread 新增两个窗口控制：

```text
Minimize
Close
```

Close：

```text
只关闭窗口
不 discard
不 delete
不改变上下文
```

Minimize：

```text
关闭主窗口
在界面上方显示一个 minimized tab
点击 tab 可以恢复
tab 上可以 Discard 或 Delete
```

Minimized tab 的 Delete 会触发确认。

### 16.7 Delete 命名

底部按钮从：

```text
Delete Answer
```

改成：

```text
Delete
```

内部逻辑仍然是强删除语义：

```text
thread.status = deleted
thread.contextPolicy = exclude
messages.content = ""
messages.includeInContext = false
```

### 16.8 单条消息删除

Side Thread 中每条 user / assistant message 都新增删除按钮。

删除单条消息后：

```text
message.content = ""
message.contentState = deleted
message.includeInContext = false
```

因此这条消息不会进入后续 LLM 请求上下文。

### 16.9 Branches 快捷按钮

顶部 Branches 图标现在是快捷 Create Branch：

```text
如果当前有 selectedThreadId -> createBranch(selectedThreadId)
如果没有 selectedThreadId -> 打开 Branches 说明面板
```

### 16.10 Utility Panels

顶部和左侧图标现在可以打开说明/管理面板：

```text
Help
History
Branches
Share
Workspace
Documents
Graph
Tags
Data
Settings
```

这些面板目前是 MVP 信息面板，用来解释功能边界和未来模块。

后续可扩展为：

```text
History: 可搜索历史版本
Documents: 项目下文档列表
Graph: 当前回答结构关系图
Tags: 标签分类管理
Data: 数据库/存储状态
Settings: 模型 allowlist、上下文预算、UI 偏好
```

### 16.11 Comparison

Comparison 的 Expand 已接入：

```text
点击 Expand 后，Comparison 面板会固定铺开到 timeline 上方的大区域
再次点击恢复
```

More 菜单现在展示 comparison 相关操作入口：

```text
Regenerate comparison
View source context
Export map
Clear comparison
```

当前这些是 UI 入口，后续需要接真实逻辑。

没有 comparison 时，不显示固定树结构，只显示空状态。

### 16.12 Timeline

Timeline 去掉了之前错乱的斜线。

现在使用：

```text
单条主线
节点圆点
节点卡片
节点颜色表示类型
```

同时选择句子时不再显示动态 block id，而显示：

```text
Selected passage
```

减少视觉噪音。

## 17. 第四次修改记录：生成型 UI 元素全部收束到模型调用

时间：2026-06-23

用户再次强调：

```text
每一步都应该根据用户回答/问题调用相应模型生成。
这个程序应当像正常 GPT / LLM 交互一样运行。
不能把图片里的内容或前端本地模板当成真实回答。
```

本次修改目标：

```text
凡是内容生成、局部回答、论证对比这类“LLM 产物”，都必须经过当前选择模型对应的服务端 API 路由。
```

### 17.1 修改文件

本次修改涉及：

```text
src/lib/llm/LLMProvider.ts
src/lib/llm/openaiProvider.ts
src/lib/llm/mockProvider.ts
src/app/api/llm/argument-comparison/route.ts
src/store/useAnswerAtlasStore.ts
docs/ANSWER_ATLAS_DEVELOPMENT_RECORD.md
```

没有删除项目文件。

### 17.2 新增 API：argument comparison

新增路由：

```text
POST /api/llm/argument-comparison
```

输入来源：

```text
documentId: 当前文档
anchorId: 当前选中句子 anchor
createdInVersionNodeId: 本次局部回答生成的 version node
originalText: 用户选中的原句
revisedText: /api/llm/local-question 返回的修订句
localQuestion: 用户刚刚提出的局部问题
localAnswer: 当前模型刚刚生成的局部回答
contextItems: Context Builder 选入的 active-path context
model: 当前选择且服务端验证过的模型
```

服务端执行顺序：

```text
1. 读取请求体。
2. 检查 documentId / anchorId / createdInVersionNodeId / originalText / revisedText 是否存在。
3. 调用 getOpenAIModelCatalog() 获取当前 API key 可见模型列表。
4. 如果前端传入 model，则调用 assertAllowedModel(model) 再次验证。
5. 如果 provider = openai 且 OPENAI_API_KEY 存在，使用 OpenAIProvider.generateArgumentComparison(...)。
6. 如果没有 key 或模型列表不可用，才使用 MockLLMProvider.generateArgumentComparison(...)。
7. 返回 provider、model、output.comparison。
```

### 17.3 OpenAIProvider.generateArgumentComparison

真实 provider 现在会调用：

```text
POST https://api.openai.com/v1/responses
```

system prompt 要求模型返回 JSON：

```json
{
  "originalNodes": [
    {
      "nodeType": "claim | reason | issue | evidence | evidence_gap | advantage",
      "label": "节点标题",
      "text": "节点解释",
      "edgeToPrevious": "supports | critiques | explains | adds_evidence"
    }
  ],
  "revisedNodes": [
    {
      "nodeType": "claim | reason | issue | evidence | evidence_gap | advantage",
      "label": "节点标题",
      "text": "节点解释",
      "edgeToPrevious": "supports | critiques | explains | adds_evidence"
    }
  ],
  "comparisonEdges": [
    {
      "fromOriginalOrder": 1,
      "toRevisedOrder": 1,
      "label": "两边关系说明",
      "edgeType": "wording_improvement | evidence_added | claim_refined | support_strengthened"
    }
  ]
}
```

模型输入明确包含：

```text
Original sentence
Revised sentence
Local question
Local answer
Active-path context
```

模型 prompt 明确禁止使用示例内容：

```text
Do not use example content.
```

返回后，服务端只做结构规范化：

```text
补齐 id
限制最多 5 个节点
校验 nodeType / edgeType 是否属于允许范围
补齐 createdAt / updatedAt / documentId / anchorId
生成 UI 需要的 tree id 和 edge id
```

这个规范化步骤不是内容生成，只是把模型返回 JSON 转换成前端组件需要的数据结构。

如果真实 OpenAI provider 收到的模型输出不是可用 JSON，或者缺少：

```text
originalNodes
revisedNodes
comparisonEdges
```

则本次 comparison API 失败。

失败时前端不会调用本地模板生成替代 comparison，这样可以避免把本地 fallback 错看成真实 LLM 生成结果。

### 17.4 前端 askLocalQuestion 新流程

旧流程：

```text
local-question API 返回 revisedText
前端本地 createArgumentComparisonFromTexts(...)
显示 comparison
```

新流程：

```text
local-question API 返回 answer + revisedText
前端保存 user message
前端保存 assistant message
前端创建 local_answer_generated version node
如果 revisedText 存在，继续 POST /api/llm/argument-comparison
argument-comparison API 返回 comparison
前端显示返回的 comparison
```

如果 `/api/llm/argument-comparison` 调用失败：

```text
revisionSuggestions[threadId] 仍然保留
comparisons 不新增
前端不会用本地模板补一个假的 comparison
```

### 17.5 Mock fallback 的边界

mock fallback 仍然存在，但只代表：

```text
没有 OPENAI_API_KEY
OpenAI Models API 不可用
没有任何可用文本模型
本地离线开发
```

mock fallback 不代表真实模型行为。

UI 顶部如果显示：

```text
mock-llm
```

说明当前服务端没有拿到可用 OpenAI API key 或模型列表，程序处于离线兜底模式。

真实使用时必须让服务端环境存在：

```text
OPENAI_API_KEY
```

可选：

```text
ANSWER_ATLAS_ALLOWED_MODELS
```

### 17.6 本次修改后的“记忆”规则

主文档生成：

```text
用户 prompt 被发送到 /api/llm/generate-document
不进入 OpenAI 永久记忆
保存为 Answer Atlas 当前 project/thread 状态
生成出的 document blocks 可在后续 active path 中作为 document_block context
```

局部问题：

```text
用户 question 被发送到 /api/llm/local-question
保存为 ThreadMessage(role=user)
如果 includeInContext = true 且位于 active path，后续可进入 LLM request context
```

局部回答：

```text
模型 answer 被保存为 ThreadMessage(role=assistant)
如果 includeInContext = true 且位于 active path，后续可进入 LLM request context
```

注释：

```text
annotation.status = active
annotation.includeInContext = true
annotation.contextPolicy = include
如果位于 active path，后续进入 LLM request context
```

Comparison：

```text
comparison 是模型生成后的可视化派生结构
当前不会默认进入下一次 LLM request context
生成 comparison 时使用的 originalText / revisedText / localQuestion / localAnswer / contextItems 会发送给模型
```

Project：

```text
不同 project 的 snapshot 独立保存
不同 project 的 documents / threads / messages / annotations / comparisons 互不共享
切换 project 时，LLM context 只来自当前 project 的 active path
```

Thread：

```text
thread 是 project 下面的结构
thread 之间不会自动共享 memory
只有 Context Builder 明确选入且属于当前 active path 的内容才会进入请求
```

Delete：

```text
delete 后 contentState = deleted
includeInContext = false
后续不会进入 LLM request context
```

Discard：

```text
discard 是软隐藏
如果 contextPolicy 仍为 include，且位于 active path，仍可能进入 LLM request context
```

### 17.7 本次验证目标

本次修改后需要验证：

```text
TypeScript 编译通过
测试通过
生产构建通过
局部问题之后 comparison API 会被调用
没有 OPENAI_API_KEY 时 UI 显示 mock-llm 属于预期
有 OPENAI_API_KEY 时模型列表来自 OpenAI Models API
```

实际验证结果：

```text
pnpm typecheck: 通过
pnpm test: 通过，1 个测试文件，8 个测试
pnpm build: 通过
Next route table: 已包含 /api/llm/argument-comparison
本地 POST /api/llm/argument-comparison: 成功返回 provider/model/output.comparison
```

本地接口探测结果显示：

```text
provider = mock
model = mock-llm
```

含义：

```text
当前运行环境没有使用真实 OPENAI_API_KEY，或者服务端无法通过该 key 获取可用模型列表。
这不是最终真实 LLM 行为，而是离线兜底。
配置真实 OPENAI_API_KEY 后，generate-document / local-question / argument-comparison 都会走 OpenAI provider。
```

### 17.8 本地 API key 配置记录

时间：2026-06-23

用户要求将 OpenAI API key 写入本地运行环境并重启服务。

执行方式：

```text
创建 .env.local
写入 OPENAI_API_KEY
不写入源码
不写入 Markdown
不写入 git
不在 UI 或日志中显示完整 key
```

安全边界：

```text
.env.local 已在 .gitignore 中
前端不会读取 OPENAI_API_KEY
只有服务端 API route 通过 process.env.OPENAI_API_KEY 使用它
```

## 18. 第五次修改记录：WindowInstance + ConversationSession 改造

时间：2026-06-27

本次根据新的《NOESIS Interactive Answer System 开发手册》进行结构性修改。

核心修正：

```text
Answer Atlas 不再把模型选择和消息历史理解为全局状态。
每个窗口都是一个独立的 LLM conversation session。
普通追问不应该被视为全新回答，而是追加到当前 window session。
Main / Local Branch / Tree Compare 都必须能独立选择模型和继续问答。
```

### 18.1 新增类型

新增文件：

```text
src/types/conversation.ts
```

新增核心类型：

```text
WindowInstance
ConversationSession
ConversationMessage
ContextScope
WindowType
SessionType
```

当前支持的窗口类型：

```text
main_answer
local_branch
tree_compare
node_detail
merge_review
```

当前支持的 session 类型：

```text
main_chat
branch_chat
tree_chat
merge_chat
```

### 18.2 Project 级隔离

`ProjectSnapshot` 已经扩展为包含：

```text
mainWindowId
activeTreeWindowId
windows
sessions
conversationMessages
documents
blocks
anchors
threads
messages
annotations
versionNodes
branches
comparisons
snapshots
tombstones
revisionSuggestions
```

含义：

```text
每个 project 有自己的窗口、session、消息、文档、分支和 comparison。
切换 project 时，不同 project 的 LLM memory 不互相污染。
```

这里的 memory 仍然不是 OpenAI 永久记忆，而是 Answer Atlas project 内部用于下一次 LLM request 的 session/context 状态。

### 18.3 默认 Main Answer Window

空白工作区启动时，现在也会创建：

```text
WindowInstance: window-main
ConversationSession: session-main
```

但不会生成任何回答。

空白状态包含：

```text
Main Answer Window 存在
main session 存在
文档为空
blocks 为空
threads 为空
comparison 为空
```

用户第一次在 Main Answer Window 点击 Send 时：

```text
append user ConversationMessage 到 session-main
调用 /api/llm/generate-document
append assistant ConversationMessage 到 session-main
根据模型返回结果创建主回答文档和 semantic blocks
```

用户后续继续在 Main Answer Window 提问时：

```text
继续使用 session-main
把 session-main 中未删除且 includeInContext=true 的历史消息发给模型
ContextBuilder 额外提供当前 active document context
模型返回新的 structured answer
系统创建 document_revised version node
更新当前主回答 blocks
不清空 main session 历史
```

这解决了旧问题：

```text
每次追问都像全新 answer
```

### 18.4 Window-level model selector

旧逻辑：

```text
selectedModel 是全局模型
Main / Side / Comparison 共用
```

新逻辑：

```text
WindowInstance.modelConfigId 表示该窗口当前模型
ConversationSession.modelConfigId 表示该 session 当前模型
每次 LLM 调用读取当前 window 的 modelConfigId
切换某个窗口模型不会清空该窗口历史
旧 assistant message 仍然记录当时使用的 modelName
```

兼容字段：

```text
selectedModel
```

仍然保留，主要用于旧 UI 和 main window 默认模型兼容。真实调用优先读取当前窗口：

```text
Main Answer Window -> windows[mainWindowId].modelConfigId
Local Branch Window -> windows[window-thread-id].modelConfigId
Tree Compare Window -> windows[window-tree-comparison-id].modelConfigId
```

### 18.5 ConversationMessage 记录规则

新增 `conversationMessages`，每条消息包含：

```text
id
sessionId
role
content
modelConfigId
modelName
contentState
includeInContext
createdAt
```

规则：

```text
user message 进入当前 window session
assistant message 进入当前 window session
assistant message 记录当时实际使用的 model
deleted message 的 contentState = deleted
deleted message 的 includeInContext = false
```

### 18.6 Main Answer Window 运行逻辑

UI 变化：

```text
主面板标题变为 Main Answer Window
模型选择器属于 main window
Generate 改为 Send
新增 Regenerate 按钮
显示 Main session history
```

发送流程：

```text
1. 读取 window-main。
2. 读取 session-main。
3. 读取 window-main.modelConfigId。
4. 从 conversationMessages 中筛选 session-main 历史。
5. 如果已有当前文档，ContextBuilder 使用 general_followup 构建 effective context。
6. POST /api/llm/generate-document。
7. 保存 user ConversationMessage。
8. 保存 assistant ConversationMessage，并记录 modelName。
9. 初次生成时创建 document_created node。
10. 后续追问时创建 document_revised node。
11. 更新 semantic blocks。
```

### 18.7 Local Branch Window 运行逻辑

当用户选择一个 block / sentence anchor 时：

```text
创建 LocalThread
创建 WindowInstance: window-{threadId}
创建 ConversationSession: session-{threadId}
windowType = local_branch
sessionType = branch_chat
contextScope = selected_block_context
```

Side Thread UI 现在实际上是：

```text
Local Branch Window
```

它包含：

```text
窗口级模型选择器
被选中的 source block
branch chat input
Send
Regenerate
message history
annotation input
Keep as Note
Create Branch
Merge
Discard
Delete
```

Local Branch Send 流程：

```text
1. 读取当前 selectedThreadId。
2. 找到 window-{threadId}。
3. 找到 session-{threadId}。
4. 读取该 branch window 的 modelConfigId。
5. ContextBuilder 使用 selected block + active path 构建 context。
6. 从 conversationMessages 中筛选 session-{threadId} 历史。
7. POST /api/llm/local-question。
8. 保存旧兼容 ThreadMessage。
9. 保存新的 ConversationMessage。
10. 创建 local_answer_generated version node。
11. 如果模型返回 revisedText，则继续调用 /api/llm/argument-comparison。
```

### 18.8 Tree Compare Window 运行逻辑

当 `/api/llm/argument-comparison` 成功返回 comparison 后：

```text
创建 WindowInstance: window-tree-{comparisonId}
创建 ConversationSession: session-tree-{comparisonId}
windowType = tree_compare
sessionType = tree_chat
contextScope = tree_comparison_context
activeTreeWindowId = window-tree-{comparisonId}
```

Tree Compare Window 不再只是静态图。

它现在包含：

```text
窗口级模型选择器
Original tree
Revised tree
Alignment edges
Tree window chat history
Tree question input
Send
```

Tree chat 调用：

```text
POST /api/conversation-sessions/messages
```

请求上下文只包含：

```text
当前 tree comparison JSON
当前 tree session 历史
用户在 tree window 输入的问题
当前 tree window 选择的模型
```

不会把 main session、其他 branch session、其他 project 的消息全部塞给模型。

### 18.9 新增统一 Chat API

新增文件：

```text
src/services/llm/LLMOrchestrator.ts
src/app/api/conversation-sessions/messages/route.ts
```

API：

```text
POST /api/conversation-sessions/messages
```

请求体：

```json
{
  "windowId": "当前窗口 id",
  "sessionId": "当前 session id",
  "windowType": "main_answer | local_branch | tree_compare",
  "model": "当前窗口选择模型",
  "userMessage": "用户消息",
  "messages": [
    {
      "role": "user | assistant | system",
      "content": "当前 session 历史"
    }
  ],
  "contextItems": [
    {
      "type": "tree_comparison | document_block | thread_message | annotation",
      "text": "有效上下文",
      "reason": "为什么被纳入"
    }
  ]
}
```

服务端执行：

```text
1. 校验 windowId / sessionId / userMessage。
2. 根据 windowType 选择 system prompt。
3. 调用 LLMOrchestrator.sendChatMessage。
4. LLMOrchestrator 验证 model 是否在当前 API key 可用范围内。
5. 如果有 OPENAI_API_KEY 且模型可用，调用 OpenAIProvider。
6. 否则进入 mock fallback。
7. 返回 provider / model / output.answer。
```

### 18.10 Provider 更新

`LLMProvider` 新增：

```text
sendChatMessage(input): Promise<{ answer: string }>
```

`generateDocument` 新增输入：

```text
messages
contextItems
```

`answerLocalQuestion` 新增输入：

```text
messages
```

OpenAIProvider 的 Main Answer prompt 现在明确要求：

```text
Continue the same conversation session instead of treating every user message as an unrelated request.
```

Local Branch prompt 现在明确要求：

```text
Continue this branch session using previous branch messages.
```

Tree chat prompt 现在明确要求：

```text
Use original tree, branch tree, alignments, selected node/edge if present, and comparison summary.
Do not invent content outside provided tree/source context.
```

### 18.11 Delete / Discard 对 session context 的影响

单条 branch message 删除：

```text
ThreadMessage.contentState = deleted
ThreadMessage.includeInContext = false
对应 ConversationMessage.contentState = deleted
对应 ConversationMessage.includeInContext = false
```

整条 branch Delete：

```text
thread.status = deleted
thread.contextPolicy = exclude
thread messages includeInContext = false
branch session messages contentState = deleted
branch session messages includeInContext = false
```

整条 branch Discard：

```text
thread.status = discarded
thread.contextPolicy = include
messages 保持可进入上下文
```

这仍然遵守：

```text
Discard = UI 隐藏但上下文仍可能保留
Delete = UI 隐藏且未来 LLM context 排除
```

### 18.12 本次仍然保留的 MVP 简化

本次已经完成：

```text
WindowInstance 数据结构
ConversationSession 数据结构
Main window session-based send
Local branch window session-based send
Tree compare window chat
Window-level model selector
assistant message modelName 记录
conversation-sessions/messages API
LLMOrchestrator 基础层
```

仍属于后续阶段：

```text
完整 SemanticTree 类型替换旧 ArgumentComparison 类型
独立 semantic block segmentation API
独立 semantic tree generation API
tree alignment API
merge plan API
final merged answer API
node detail 独立窗口
真实可拖拽多窗口布局
数据库持久化
```

### 18.13 本次验证记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
通过
测试 1 个文件，8 个测试通过
生产构建通过
Next route table 已包含 /api/conversation-sessions/messages
本地 next start 已启动在 http://127.0.0.1:3000
GET /api/models 返回 provider=openai，source=openai-api
```

## 19. 第六次修改记录：正常文档正文 + 鼠标选择式局部问答 + Sidebar 融合

时间：2026-06-27

本次根据“去掉 Home 边框 + 正常文档回答 + 鼠标选择式局部问答”的需求修改。

### 19.1 Home Sidebar 去卡片化

修改文件：

```text
src/components/layout/LeftSidebar.tsx
```

修改内容：

```text
去掉 Home sidebar 外层 panel class
去掉外层 border
去掉外层 box-shadow
去掉明显 rounded card 效果
保留 Home / All Threads / Contents / Document Map
保留最左侧 icon rail
```

现在左侧 Home 区域更像普通 sidebar，和整体 app layout 融合，而不是独立白色卡片。

### 19.2 主回答正文与 metadata 分离

新增/修改：

```text
Document.rawText
GenerateDocumentOutput.answer
```

核心规则：

```text
Main Answer Window 只显示 Document.rawText。
AnswerBlock / sentenceSummaries / semantic blocks / tree nodes 只能作为 metadata。
metadata 不能直接显示在主回答正文里。
```

修改文件：

```text
src/types/document.ts
src/lib/llm/LLMProvider.ts
src/lib/llm/openaiProvider.ts
src/lib/llm/mockProvider.ts
src/lib/document/createGeneratedDocument.ts
src/components/document/MainDocumentPanel.tsx
```

OpenAI 主回答 prompt 已改为：

```text
Return a normal natural-language document answer, not JSON, not markdown metadata, and not sentence summary arrays.
```

因此主回答生成流程现在是：

```text
Call 1: 普通 Chat LLM
输出: 正常自然语言 answer
保存: Document.rawText
显示: DocumentAnswerRenderer(text=Document.rawText)
```

后台仍然会从 rawText 派生 metadata blocks：

```text
AnswerBlock[]
sentence summaries
outline/contents
tree comparison 输入
```

但是这些不会污染主回答正文。

### 19.3 DocumentAnswerRenderer

新增文件：

```text
src/components/document/DocumentAnswerRenderer.tsx
```

职责：

```text
正常显示完整自然语言回答
保留换行和段落
支持鼠标拖选任意文本
mouseup 后读取 window.getSelection()
计算 selectedText / startOffset / endOffset / contextBefore / contextAfter
在选区附近显示 floating toolbar
```

Toolbar 包含：

```text
Ask
Revise
Branch
Note
```

对应行为：

```text
Ask -> openSelectionBranch(selection, "ask")
Revise -> openSelectionBranch(selection, "revise")
Branch -> openSelectionBranch(selection, "branch")
Note -> addNoteForSelection(selection, note)
```

### 19.4 Text Selection Anchor

`Anchor` 类型新增：

```text
anchorType = text_selection
startOffset
endOffset
contextBefore
contextAfter
createdFromWindowId
```

selection anchor 最低实现使用 character offset：

```text
selectedText
startOffset
endOffset
前 30 字 contextBefore
后 30 字 contextAfter
```

这些信息用于后续重新定位和构建 LLM context。

### 19.5 Selection-based Local Branch Window

新增 store actions：

```text
openSelectionBranch(selection, mode)
addNoteForSelection(selection, content)
```

当用户选择文本并点击 Ask / Revise / Branch：

```text
1. 创建 text_selection Anchor。
2. 创建 anchor_selected version node。
3. 创建 LocalThread。
4. 创建 Local Branch Window。
5. 创建 branch ConversationSession。
6. SideThreadPanel 打开。
7. 顶部显示 Selected Text，而不是句子节点。
```

不同模式窗口标题：

```text
ask -> Ask about Selection
revise -> Revise Selection
branch -> Selection Branch
```

### 19.6 Branch sourceType

`Branch` 类型新增：

```text
sourceType
sourceSelectionId
selectedText
conversationSessionId
contextPolicy
```

支持来源：

```text
semantic_block
sentence
text_selection
tree_node
alignment_edge
```

当前 selection branch 会记录：

```text
sourceType = text_selection
sourceSelectionId = anchorId
selectedText = 用户鼠标选中的文本
conversationSessionId = 对应 branch session
contextPolicy = include_in_context
```

### 19.7 Local Branch LLM Context

Local Branch Window 发送问题时，contextItems 现在包含：

```text
full_answer: 当前 Document.rawText
selected_passage: 用户选中的 selectedText
document_block/thread_message/annotation: ContextBuilder 选入的 active-path context
```

其中 selected_passage 会记录：

```text
Mouse-selected text offsets start-end
```

这满足规则：

```text
LLM 需要看到完整主回答 raw_text
LLM 需要看到用户选中的 selected_text
LLM 需要知道 selected_text 的位置
LLM 需要看到 branch 当前 session 历史
LLM 需要看到用户当前问题
```

### 19.8 Add Note 行为

点击 selection toolbar 的 Note：

```text
提示用户输入 note
创建 text_selection anchor
创建 annotation
annotation.includeInContext = true
annotation.contextPolicy = include
创建 annotation_added version node
不修改主回答正文
```

这表示 note 进入 Answer Atlas 的未来 LLM request context，而不是 OpenAI 永久记忆。

### 19.9 兼容保留

旧的 sentence anchor 代码仍保留：

```text
SentenceAnchor.tsx
selectSentence(blockId)
AnswerBlock metadata
Contents outline
Tree Compare
```

但是 Main Answer Window 不再默认渲染 sentence cards。

换句话说：

```text
Main Answer Window = normal document answer
metadata blocks = sidebar/tree/context support
Tree Compare Window = structured semantic comparison
```

### 19.10 当前 MVP 限制

selection branch 的旧 block-based merge patch 暂时不自动执行。

原因：

```text
旧 merge 逻辑依赖 blockId
text_selection 可能跨句、跨段、跨 block
不能安全地把任意 selection 当成一个 block replacement
```

当前行为：

```text
selection branch 可以问答、修订、生成 comparison、记录 note
block anchor 仍可使用旧 merge path
selection merge 需要后续实现基于 rawText offset 的 patch
```

### 19.11 本次验证记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
通过
测试 1 个文件，8 个测试通过
生产构建通过
Next route table 保持 /api/conversation-sessions/messages 与 LLM routes
本地服务已重启到 http://127.0.0.1:3000
GET /api/models 返回 provider=openai
```

## 20. 第七次修改记录：标准化 Layered Comparison Scaffold 双树对比

时间：2026-06-27

本次根据“标准化双树对比结构”需求修改 Tree Compare / Argument Comparison 生成与渲染逻辑。

核心原则：

```text
不要让 LLM 生成两棵自由形状的树。
LLM 必须生成一套共享的 layered comparison scaffold。
前端把同一套 slots 投影成左侧 Original 和右侧 Revised。
```

### 20.1 新增标准数据结构

修改文件：

```text
src/types/comparison.ts
```

新增类型：

```text
LayeredComparisonScaffold
ComparisonSlot
ComparisonSlotNode
ComparisonSummary
```

`ArgumentComparison` 现在新增字段：

```text
scaffold: LayeredComparisonScaffold
```

旧字段仍保留：

```text
originalTree
revisedTree
comparisonEdges
```

保留原因：

```text
兼容现有 store / tree chat / mock fixture / 旧组件。
新 UI 主路径使用 scaffold。
```

### 20.2 固定五层结构

scaffold slot 必须使用固定层级：

```text
Level 0: root
Level 1: main_topic
Level 2: claim_or_decision
Level 3: support_or_detail
Level 4: consequence_risk_or_action
```

同一层语义角色必须一致。

对应节点必须：

```text
同 level
同 level_role
shared_topic 相同或高度相似
语义上讨论同一对象
```

### 20.3 LLM Prompt 修改

修改文件：

```text
src/lib/llm/openaiProvider.ts
```

`generateArgumentComparison` 现在使用 Structured JSON Mode 生成：

```text
LayeredComparisonScaffold
```

system prompt 明确规定：

```text
Do not generate two independent trees.
Generate one shared comparison scaffold.
Do not generate coordinates, colors, SVG, or layout information.
Return valid JSON only.
```

user prompt 输入：

```text
Original answer
Revised answer
Local question
Local answer
```

输出：

```text
comparison_id
original_answer_id
revised_answer_id
root_slot_id
slots[]
summary
```

### 20.4 Validator

新增文件：

```text
src/lib/comparison/validateLayeredComparisonScaffold.ts
```

Validator 检查：

```text
是否只有一个 Level 0 root
root parent_slot_id 是否为 null
level_index 是否为 0-4
level_index 与 level_role 是否匹配
parent_slot_id 是否存在
是否跳层
original_only 是否只有 original_node
revised_only 是否只有 revised_node
same/rewritten/refined/expanded/reduced/contradicted 是否两边都有 node
每个 parent 的 children 数量是否超过上限
title / summary / source_text 是否为空
source_text 是否来自对应原文
```

排序函数：

```text
sortComparisonSlots
```

排序规则：

```text
matched
changed
contradicted
original_only
revised_only
```

同组内按 `order_index` 排序。

### 20.5 Repair Loop

如果第一次 LLM 输出验证失败：

```text
服务端调用同一模型进行 repair
repair prompt 包含 validation errors / original answer / revised answer / invalid JSON
要求 Return repaired JSON only
```

如果 repair 后仍失败：

```text
/api/llm/argument-comparison 返回失败
前端不会伪造一个本地 comparison
```

### 20.6 ID 归一化

LLM schema 中的 `comparison_id` 被视为 temporary id。

服务端会归一化为：

```text
comparison-{anchorId}-{timestamp}
```

并写回：

```text
scaffold.comparison_id
```

这样避免多个模型输出都叫：

```text
temporary id
```

导致 store key 冲突。

### 20.7 前端标准双树渲染

新增文件：

```text
src/components/comparison/LayeredComparisonScaffoldView.tsx
```

渲染规则：

```text
遍历同一套 slots
每个 slot 渲染为一行
左侧显示 original_node
右侧显示 revised_node
中间显示 relation
如果两边都有 node，画 alignment line
如果只有 original_node，右侧显示 revised-only placeholder
如果只有 revised_node，左侧显示 original-only placeholder
```

这意味着：

```text
Original Tree 和 Revised Tree 不是两套数据。
它们是同一套 ComparisonSlot 的左右投影。
```

### 20.8 Hover 高亮与固定 Comparison Panel

Tree Compare Window 现在包含固定 comparison panel。

hover 任意 slot 行时：

```text
高亮 original_node
高亮 revised_node
panel 显示该 slot 的 shared_topic / relation / short_comparison
```

如果 slot 是单边：

```text
original_only / revised_only placeholder 会说明该点只出现在一侧。
```

### 20.9 Mock / Fixture 兼容

修改文件：

```text
src/lib/comparison/createArgumentComparison.ts
src/data/mockData.ts
```

mock fallback 现在也生成：

```text
scaffold
```

旧 mock comparison fixture 也补充了标准 scaffold。

### 20.10 当前运行逻辑

用户在 Local Branch Window 得到 revisedText 后：

```text
POST /api/llm/argument-comparison
```

服务端：

```text
1. 验证模型是否在 API 可用范围内。
2. 调用 OpenAIProvider.generateArgumentComparison。
3. LLM 生成 LayeredComparisonScaffold。
4. Validator 检查。
5. 必要时 repair 一次。
6. 服务端归一化 comparison_id。
7. 返回 ArgumentComparison，其中 scaffold 是主渲染数据。
```

前端：

```text
ArgumentEvidenceComparison 使用 LayeredComparisonScaffoldView 渲染 scaffold。
Tree chat 仍然可以把整个 comparison JSON 作为 tree_comparison context 发给 LLM。
```

### 20.11 本次验证记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
通过
测试 1 个文件，8 个测试通过
生产构建通过
Next route table 保持 /api/llm/argument-comparison 与 /api/conversation-sessions/messages
本地服务已重启到 http://127.0.0.1:3000
GET /api/models 运行探测成功
```

## 14. 官方 API 依据

OpenAI API Reference:

```text
Responses API: POST /v1/responses
Models API: GET /v1/models
```

本项目实现遵循两个原则：

1. 前端不接触 API key。
2. 模型选择必须来自服务端验证后的可用模型列表。

## 21. 第八次修改记录：Context Notes 底部注释区与双树交互优化

### 21.1 本次修改目标

本次修改来自新的 UI 与交互需求，主要处理两个区域：

```text
Local Branch Window
Argument & Evidence Comparison / LayeredComparisonScaffoldView
```

目标是：

```text
1. Local Branch Window 底部不再重复出现 Create Branch。
2. Keep as Note 旁边新增 Add Context Note。
3. 原来的 Annotation for Future LLM Context 顶部输入栏改成底部 Context Notes 面板。
4. Context Notes 保存后进入未来 LLM context，但保存动作本身不立即调用 LLM。
5. 双树对比按 level 分组，同层横向排列。
6. 树视图支持滚轮缩放、拖拽平移、双击重置。
7. 节点 hover / click 时联动另一侧对应节点。
8. 节点长文本不直接塞进节点框，而是放进固定 detail panel。
9. 差异信息不再写在虚线中间，relation 只用短 badge 表示，完整说明放在 detail panel。
```

本次没有删除文件，也没有批量删除内容。

### 21.2 修改文件

```text
src/components/thread/ThreadActionBar.tsx
src/components/thread/SideThreadPanel.tsx
src/components/comparison/LayeredComparisonScaffoldView.tsx
docs/ANSWER_ATLAS_DEVELOPMENT_RECORD.md
```

### 21.3 Local Branch Window 按钮区

修改前底部按钮逻辑：

```text
Keep as Note
Create Branch
Merge into Document
Discard
Delete
```

修改后底部按钮逻辑：

```text
Keep as Note
Add Context Note
Merge into Document
Discard
Delete
```

删除的是 Local Branch Window 底部 UI 里的 `Create Branch` 按钮入口。

注意：

```text
底层 createBranch store action 没有删除。
主回答区域通过鼠标拖选文本后创建 branch 的能力仍然保留。
这里仅取消 Local Branch Window 底部的重复入口。
```

### 21.4 Add Context Note 的交互逻辑

`Add Context Note` 是新增的主动注释入口。

用户点击后：

```text
1. SideThreadPanel 将 contextNotesOpen 设置为 true。
2. Local Branch Window 底部显示 Context Notes 面板。
3. 面板里的 textarea 自动获得焦点。
4. 用户可以输入一条未来 LLM 要考虑的上下文注释。
```

用户点击 `Save Note` 后：

```text
1. 调用 useAnswerAtlasStore.addAnnotation(content)。
2. 创建 Annotation 数据对象。
3. 创建一个 annotation_added version node。
4. 通过 appendVersionNodeAndCheckout 把这个 version node 接到当前 activeVersionNodeId 后面。
5. 保存完成后收起 Context Notes 输入框。
6. 调用 refreshContextPreview() 刷新上下文预览。
```

用户点击 `Cancel` 后：

```text
1. 清空本地 annotationText。
2. 收起 Context Notes 输入框。
3. 不创建 Annotation。
4. 不创建 version node。
5. 不调用 LLM。
```

### 21.5 Context Notes 是否会进入 LLM

会，但不是以聊天消息的形式进入。

Context Note 保存后对应的数据类型是：

```text
Annotation
```

它进入的上下文类型是：

```text
ContextItem.type = "annotation"
```

具体构建位置：

```text
src/lib/context/buildContextForLLM.ts
```

进入 LLM context 的判断规则：

```text
1. annotation.documentId 必须等于当前 documentId。
2. annotation.createdInVersionNodeId 必须在当前 activePath 内。
3. annotation.status 不能是 deleted。
4. annotation.contextPolicy 不能是 exclude。
5. annotation.includeInContext 必须是 true。
```

满足以上条件时，context builder 会生成：

```text
{
  type: "annotation",
  text: annotation.content,
  included: true,
  reason: "Included as sentence annotation on the active version path."
}
```

### 21.6 Context Notes 不会进入哪里

Context Notes 不会进入：

```text
1. OpenAI 账号级记忆。
2. 浏览器外部长期记忆。
3. 其他 project 的 memory。
4. 其他 thread/window 的会话消息历史。
5. conversationMessages。
6. ThreadMessage 聊天记录。
```

它只保存在当前前端 store 的：

```text
annotations
```

并且只会通过项目自己的 `buildContextPreview / buildContextForLLM` 被放入后续 LLM 请求的 `contextItems`。

### 21.7 Context Notes 会影响哪些 LLM 调用

当前实现中，Context Notes 会影响这些后续调用：

```text
1. Main Answer Window 的 generateDocumentFromPrompt
   - purpose: general_followup
   - 会通过 buildContextPreview 读取 included annotation。

2. Local Branch Window 的 askLocalQuestion
   - purpose: local_question
   - 会把 selected_passage、full_answer、document_block、thread_message、annotation 一起发送给 /api/llm/local-question。

3. Local question 后自动生成 argument comparison
   - 如果 local-question 返回 revisedText
   - /api/llm/argument-comparison 会接收同一次 local question 使用过的 contextItems。
```

当前实现中，Tree Window chat 的 askTreeQuestion 主要发送：

```text
type: "tree_comparison"
text: JSON.stringify(comparison)
```

也就是说，Tree Window chat 当前直接看的是 comparison JSON 本身。
如果某条 Context Note 已经影响了 local answer 或 comparison generation，它会间接体现在 comparison JSON 中。
但 Tree Window chat 目前不会重新调用 buildContextPreview 来额外读取 annotation。

### 21.8 Context Notes 与删除逻辑

Context Note 旁边的删除按钮调用：

```text
deleteAnnotation(annotationId)
```

这是软删除，不是物理删除。

删除后：

```text
1. annotation.content 被清空。
2. annotation.status = "deleted"。
3. annotation.contextPolicy = "exclude"。
4. annotation.includeInContext = false。
5. 写入 deletedAt / updatedAt。
6. 创建 annotation_deleted version node。
7. refreshContextPreview()。
```

因此删除后的 Context Note 不会进入未来 LLM context。

### 21.9 SideThreadPanel 的布局变化

修改前：

```text
Annotation for Future LLM Context 位于 Local Branch Window 上部。
它和 Your Question 输入区靠得很近，容易让用户误以为这是另一个即时提问框。
```

修改后：

```text
1. 上方只保留 Selected Text 和 Your Question。
2. Context Notes 变成窗口底部独立面板。
3. 面板位于消息滚动区和 ThreadActionBar 之间。
4. 当没有 note 且未点击 Add Context Note 时，面板默认不占空间。
5. 当有已保存 note 或用户正在添加 note 时，面板显示。
```

### 21.10 Keep as Note 与 Add Context Note 的区别

`Keep as Note`：

```text
保留当前 local answer / branch 内容为 note 状态。
它处理的是当前 LLM 回答本身。
```

`Add Context Note`：

```text
让用户手动写一条对选中文本的上下文注释。
它处理的是未来 LLM 应该考虑的额外 instruction / note。
```

二者不会互相替代。

### 21.11 双树布局变化

修改前：

```text
LayeredComparisonScaffoldView 按 slot 一行渲染。
每一行是 original_node / relation / revised_node。
同一层的节点会自然竖向堆叠。
```

修改后：

```text
1. 先对 scaffold.slots 按 level_index 分组。
2. 每个 level 自成一层。
3. 同一层内按 order_group 与 order_index 排序。
4. Original Tree 在左。
5. Revised Tree 在右。
6. 同层节点在各自树列中横向排列并自动换行。
7. 中间 RelationRail 只显示短 badge 和简短对应线。
```

同层排序优先级：

```text
matched
changed
contradicted
original_only
revised_only
```

### 21.12 树节点默认展示规则

节点默认只显示短内容：

```text
1. title，最多约两行。
2. summary，最多约三行。
3. relation badge。
4. level / role 小标记。
```

节点不会默认展示完整 source_text。

原因：

```text
source_text 通常较长，如果直接塞进节点框，会导致节点高度失控、树布局挤压、对应关系难以阅读。
```

### 21.13 节点 hover 联动逻辑

当用户 hover 某个节点：

```text
1. hoveredSlotId 设置为该 slot_id。
2. 当前节点高亮。
3. 另一侧同一个 slot_id 的对应节点同步高亮。
4. 中间 relation badge 同步高亮。
5. SlotDetail 使用 hoveredSlotId 优先展示完整对比内容。
```

如果该 slot 是 original_only 或 revised_only：

```text
1. 只有存在的一侧节点高亮。
2. detail panel 中另一侧显示 only appears 提示。
```

### 21.14 节点 click 选中逻辑

当用户 click 某个节点或 relation badge：

```text
1. selectedSlotId 设置为该 slot_id。
2. 当前节点进入 selected 状态。
3. 对应节点进入 linked-selected 状态。
4. relation badge 同步保持高亮。
5. SlotDetail 保持展示该 slot 的完整内容。
```

保持规则：

```text
selectedSlotId 会一直保留，直到用户点击其他节点、点击其他 relation badge、或点击树画布空白区域。
```

### 21.15 SlotDetail 固定详情面板

完整内容现在统一展示在：

```text
Selected Comparison Detail
```

该面板显示：

```text
1. shared_topic
2. relation badge
3. Original source_text
4. Revised source_text
5. short_comparison 作为 Difference Summary
```

如果某一侧不存在：

```text
Original 缺失：This point only appears in the revised answer.
Revised 缺失：This point only appears in the original answer.
```

### 21.16 差异展示方式

修改前：

```text
relation / difference label 容易和连接线混在一起。
长差异说明如果放在线中间，会影响阅读和布局。
```

修改后：

```text
1. RelationRail 中只显示短 badge。
2. 两侧都有节点时，badge 左右显示短对应线。
3. 线只表示 correspondence / matched relation。
4. 完整差异说明只在 SlotDetail 中显示。
```

relation 颜色规则：

```text
same: slate
rewritten / refined: blue
expanded: green
reduced / contradicted: orange
original_only / revised_only: red
```

### 21.17 树视图缩放和平移

树视图新增本地 transform 状态：

```text
scale
x
y
```

鼠标滚轮：

```text
wheel up: scale * 1.08
wheel down: scale * 0.92
scale clamp: 0.65 到 1.8
```

拖拽背景：

```text
1. pointer down 在非节点、非 relation badge 区域时开始 pan。
2. pointer move 更新 x / y。
3. pointer up 或 pointer cancel 结束 pan。
```

双击背景：

```text
resetView()
scale = 1
x = 0
y = 0
```

顶部按钮：

```text
Zoom in
Zoom out
Reset view
当前 zoom 百分比
```

### 21.18 LLM 数据来源说明

本次修改没有把 comparison 内容写死。

树仍然完全依赖：

```text
comparison.scaffold
```

而 `comparison.scaffold` 来自：

```text
/api/llm/argument-comparison
OpenAIProvider.generateArgumentComparison
LayeredComparisonScaffold validator / repair loop
```

前端只是改变渲染方式，不改变 LLM 生成数据的来源。

### 21.19 本次验证记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
通过
测试 1 个文件，8 个测试通过
Next.js 生产构建通过
Route table 保持 /api/conversation-sessions/messages、/api/llm/argument-comparison、/api/llm/generate-document、/api/llm/local-question、/api/models 与 /documents/[documentId]
```

本地服务重启记录：

```text
旧 3000 端口服务进程：48344
新 3000 端口服务进程：12752
启动命令：pnpm start
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
```

本地 HTTP 探测：

```text
GET /documents/doc-ai-education -> 200
GET /api/models -> provider=openai, defaultModel=gpt-3.5-turbo, models count=74
```

浏览器探测：

```text
当前 in-app browser 页面：http://127.0.0.1:3000/documents/doc-ai-education
页面可刷新加载。
当前页面处于空 thread / 无 active branch 状态，因此 Local Branch Window 和 Comparison Window 未显示。
未主动生成新回答，避免额外消耗 OpenAI 调用。
浏览器 console error count = 0
```

## 27. 第十四次修改记录：小窗口 Enter 发送与嵌套局部问答

### 27.1 用户需求

用户本次确认先修改两个点：

```text
1. 小窗口中 Enter 应该发送问题。
2. Shift + Enter 才应该换行。
3. 小窗口中的 LLM 回答也应该可以继续用鼠标选择文本。
4. 选择后可以继续开启新的局部问答。
```

本次暂不处理 Layered Comparison 展示重构。

### 27.2 修改范围

本次修改文件：

```text
src/components/thread/SideThreadPanel.tsx
src/components/thread/ThreadMessageCard.tsx
src/store/useAnswerAtlasStore.ts
src/types/document.ts
src/types/thread.ts
docs/ANSWER_ATLAS_DEVELOPMENT_RECORD.md
```

本次没有删除文件。

本次没有批量删除代码。

本次没有重排旧文档结构。

### 27.3 小窗口 Enter 行为

修改前：

```text
Local Branch Window / Side Thread 的 Your Question 输入框是 textarea。
按 Enter 会插入换行。
用户需要点击 Send 按钮才会发送问题。
```

修改后：

```text
Enter = 发送当前局部问题
Shift + Enter = 保留 textarea 默认行为，也就是换行
空问题不会发送
正在请求 LLM 时不会重复发送
```

对应运行逻辑：

```text
用户在小窗口输入局部问题
→ onKeyDown 捕获 Enter
→ 如果没有按 Shift，preventDefault
→ 调用 submitQuestion
→ submitQuestion trim 当前问题
→ 如果非空并且没有正在请求，则调用 askLocalQuestion
→ 清空小窗口问题输入框
```

### 27.4 小窗口继续鼠标选择并提问

修改前：

```text
主回答中的 Assistant 内容可以鼠标选择。
选择后会出现 Ask / Revise / Branch / Note 浮层。
小窗口里的 LLM Answer 只是普通文本。
用户不能直接在小窗口回答里选择一段文字继续问。
```

修改后：

```text
小窗口中的 Assistant / LLM Answer 可以鼠标选择。
选中后复用同一套浮层：
Ask
Revise
Branch
Note
```

默认只让 Assistant 回答卡片支持嵌套选择。

用户自己的 Your Question 卡片不启用选择浮层，避免把原问题误当作新的分析对象。

### 27.5 嵌套局部问答的数据流

用户在小窗口的 LLM 回答中选择文本后：

```text
SideThreadPanel
→ ThreadMessageCard
→ DocumentAnswerRenderer
→ 生成 TextSelectionDraft
→ SideThreadPanel 补充来源信息
→ openSelectionBranch(selection, mode)
→ 创建新的 text_selection anchor
→ 创建新的 local thread
→ 打开新的 Local Branch Window
```

补充的来源信息包括：

```text
createdFromWindowId = 当前 local branch window id
sourceThreadId = 当前 side thread id
sourceMessageId = 被选择的 LLM answer message id
```

这些字段用于表达：

```text
这个新选择不是来自主回答窗口。
它来自某个局部问答窗口。
它来自某个具体的 LLM answer。
它是一个 parent thread 下的 child local thread。
```

### 27.6 Store 记录方式

`TextSelectionInput` 新增可选字段：

```text
createdFromWindowId
sourceThreadId
sourceMessageId
```

`Anchor` 新增可选字段：

```text
sourceThreadId
sourceMessageId
```

`LocalThread` 新增可选字段：

```text
parentThreadId
sourceMessageId
```

当通过小窗口 LLM answer 创建嵌套局部问答时：

```text
Anchor.createdFromWindowId = 当前小窗口 id
Anchor.sourceThreadId = 父 thread id
Anchor.sourceMessageId = 被选中的 assistant message id
LocalThread.parentThreadId = 父 thread id
LocalThread.sourceMessageId = 被选中的 assistant message id
```

当从主回答创建局部问答时：

```text
createdFromWindowId 默认仍然是 mainWindowId
sourceThreadId 为空
sourceMessageId 为空
```

### 27.7 LLM 上下文与记忆说明

本次代码修改本身不会调用 LLM。

只有用户实际在小窗口按 Enter 或点击 Send 时，才会调用：

```text
askLocalQuestion
→ /api/llm/local-question
```

小窗口嵌套选择创建新 thread 时，本身也不会立刻调用 LLM。

它只会创建：

```text
anchor
local thread
branch window
conversation session
version node
```

用户之后在新小窗口里发送问题时，LLM 上下文会包含：

```text
1. 当前 document 的 full answer
2. 新选中的 selected passage
3. active version path 上可进入上下文的 document blocks
4. active version path 上可进入上下文的 thread messages
5. active version path 上可进入上下文的 annotations/context notes
```

也就是说，父小窗口里的问答如果仍在 active path 上、没有被 delete、没有被 contextPolicy 排除、message 没有被删除，并且 includeInContext=true，就会作为 thread_message 进入后续 LLM 上下文。

不会进入上下文的情况包括：

```text
父 thread 不在 active version path
父 thread 被 delete
父 thread contextPolicy=exclude
message contentState=deleted
message includeInContext=false
annotation 被 delete
annotation contextPolicy=exclude
annotation includeInContext=false
```

### 27.8 验证

本次本地验证：

```text
pnpm typecheck -> 通过
pnpm test -> 初次在沙箱中因 Windows spawn EPERM 无法加载 Vitest config
pnpm test -> 提升权限后通过，1 个测试文件，10 个测试
GET /documents/doc-ai-education -> 200
3000 端口监听进程：33856
```

尚未在浏览器中点击 Send 触发真实 LLM 请求。

原因：

```text
本次验证重点是交互和类型正确性。
真实 LLM 请求会消耗用户 API，并且用户没有要求本次直接发送测试问题给模型。
```

## 26. 第十三次修改记录：修复 127.0.0.1 下 Send 按钮一直灰色

### 26.1 用户反馈

用户反馈：

```text
但是目前我 send 不了，你看看是不是哪里出问题了
```

实际表现是：

```text
主输入框可以在 DOM 里输入文字。
但是 Send 按钮仍然保持 disabled / 灰色状态。
用户无法点击 Send 正常发送主会话消息。
```

### 26.2 问题定位

本次没有先假设是 LLM 调用失败，因为 Send 按钮在发送前就已经 disabled。

检查顺序如下：

```text
1. 检查页面是否可访问。
2. 检查输入框和 Send 按钮当前状态。
3. 在浏览器中尝试输入测试文字。
4. 检查 React 状态是否跟随输入变化。
5. 检查 Next.js dev server 日志。
```

浏览器观察到的关键现象：

```text
输入框 DOM value 可以出现测试文字。
但是 React 内部 prompt 状态没有可靠更新。
Send 按钮仍然满足 disabled 条件。
```

主按钮禁用逻辑位于：

```text
src/components/document/MainDocumentPanel.tsx
disabled={isGeneratingDocument || !prompt.trim()}
```

因此，只要 React 侧的 `prompt` 没有更新，按钮就会继续灰色。

### 26.3 根因

Next.js dev 日志给出了直接原因：

```text
Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1".
Blocked cross-origin request to Next.js dev resource /__nextjs_font/geist-latin.woff2 from "127.0.0.1".
```

原因是当前页面通过下面地址访问：

```text
http://127.0.0.1:3000/documents/doc-ai-education
```

而 Next.js dev server 对开发资源有 origin 检查。未允许 `127.0.0.1` 时，部分 dev 资源会被拦截。

这会导致前端 hydration / dev client 行为异常。表现到本程序里就是：

```text
用户看起来可以输入。
但是 React 状态没有正常接住输入内容。
Send 按钮仍然认为 prompt 是空字符串。
所以 Send 一直是灰色。
```

### 26.4 本次代码修改

修改文件：

```text
next.config.mjs
```

新增配置：

```js
allowedDevOrigins: ["127.0.0.1"]
```

完整目的：

```text
允许开发环境从 http://127.0.0.1:3000 加载 Next.js dev resources。
保证 in-app browser 使用 127.0.0.1 访问时，页面可以完整运行。
保证 React 输入状态可以正常更新。
保证 Send 按钮在输入非空内容后解除 disabled。
```

### 26.5 LLM 与记忆影响

本次修改没有调用 LLM。

本次修改没有写入任何项目 memory。

本次修改没有写入任何 thread memory。

本次修改没有写入任何 conversation session。

本次修改没有新增、删除或覆盖用户消息。

本次浏览器输入测试只用于确认前端按钮状态，不会点击 Send，也不会把测试文字发送给模型。

### 26.6 需要重启服务的原因

`next.config.mjs` 是 Next.js 服务启动时读取的配置。

因此修改后必须重启 dev server，新的 `allowedDevOrigins` 才会生效。

如果不重启：

```text
旧 dev server 仍然使用旧配置。
127.0.0.1 的 dev resource 仍可能被拦截。
Send 按钮仍可能继续灰色。
```

### 26.7 本次重启记录

旧服务：

```text
3000 端口原监听进程：47288
```

执行动作：

```text
停止旧 Next.js dev server。
使用 pnpm dev 在 D:\Codex - File\NOESIS 重新启动服务。
```

新服务：

```text
3000 端口新监听进程：33856
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
```

### 26.8 本地接口验证

页面探测：

```text
GET /documents/doc-ai-education -> 200
```

模型接口探测：

```text
GET /api/models -> 200
provider=openai
defaultModel=gpt-5.5
source=openai-api
```

### 26.9 浏览器验证

验证步骤：

```text
1. 重载 http://127.0.0.1:3000/documents/doc-ai-education。
2. 定位主输入框 placeholder = Ask a question...。
3. 定位 Send 按钮。
4. 确认空输入时 Send 为 disabled。
5. 输入测试文字：测试 Send。
6. 确认 Send 变成 enabled。
7. 不点击 Send，不发送测试文字给 LLM。
```

验证结果：

```text
beforeEnabled=false
afterEnabled=true
inputValue=测试 Send
sendDisabledAttr=false
sendDisabledProp=false
```

浏览器日志：

```text
error/warn/warning logs = []
```

结论：

```text
Send 灰色的问题已经修复。
原因是 127.0.0.1 的 Next.js dev resource 被拦截导致前端状态没有正常更新。
当前 127.0.0.1 访问路径下，输入非空内容后 Send 可以正常点击。
```

## 24.0 文档插入提示

本次最新修改记录已经写入本文档的：

```text
## 24. 第十一次修改记录：Layered Comparison Board 表格式对比规则修订
```

由于本文档里存在多个相同的浏览器验证锚点，本次第 24 节被插入到较早的验证块之后。

为避免按 AGENTS.md 规则进行大范围移动或删除，暂时不重排整份文档。

本次最新实际状态以第 24 节内容为准，尤其是：

```text
24.18 本次执行记录
24.19 本地服务重启记录
24.20 本地 HTTP 探测
24.21 浏览器探测
```

当前最新服务状态：

```text
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
3000 端口监听进程：12348
默认模型：gpt-5.5
默认 comparison 标题：Layered Comparison Board
```

## 25. 第十二次修改记录：重写对比生成逻辑为 LayeredComparisonBoard JSON

本次根据“重写对比生成逻辑，改为 Layered Comparison Board”的开发说明修改。

核心变化：

```text
旧默认目标：
Original Tree / Revised Tree / node alignment / LayeredComparisonScaffold

新默认目标：
LayeredComparisonBoard JSON
```

也就是说，默认 comparison 流程现在是：

```text
original answer + revised answer
-> LLM structured JSON call
-> LayeredComparisonBoard
-> validate board JSON
-> render compact level tables
-> click row to show detail panel
```

旧的 scaffold / tree / edge 数据没有删除。

它们现在只是兼容层和 Advanced Graph 用的派生数据，不再作为默认 LLM 生成目标，也不再作为默认前端渲染目标。

### 25.1 本次没有删除文件

根据 AGENTS.md：

```text
禁止批量删除东西，如果要删除东西一定要问用户。
```

本次没有删除任何文件。

保留旧文件和旧类型的原因：

```text
1. 避免破坏现有 store、mock data、旧 advanced graph view。
2. 避免批量删除。
3. 让旧逻辑只作为兼容派生层存在，而不是默认主线。
```

### 25.2 新增数据结构

修改文件：

```text
src/types/comparison.ts
```

新增：

```text
ComparisonDifference
ComparisonImportance
LayeredComparisonBoard
LayeredComparisonBoardSummary
ComparisonLevel
ComparisonRow
ComparisonRowSide
```

核心结构：

```ts
type LayeredComparisonBoard = {
  board_id: string;
  original_answer_id: string;
  revised_answer_id: string;
  summary: {
    overall_summary: string;
    recommended_action:
      | "keep_original"
      | "prefer_revised"
      | "merge_both"
      | "manual_review";
  };
  levels: ComparisonLevel[];
};
```

每一行：

```ts
type ComparisonRow = {
  row_id: string;
  shared_topic: string;
  original: ComparisonRowSide | null;
  revised: ComparisonRowSide | null;
  difference:
    | "same"
    | "rewritten"
    | "refined"
    | "expanded"
    | "reduced"
    | "replaced"
    | "added"
    | "removed"
    | "conflict";
  importance: "low" | "medium" | "high";
  short_explanation: string;
};
```

`ArgumentComparison` 现在新增主字段：

```text
board: LayeredComparisonBoard
```

兼容字段仍保留：

```text
scaffold
originalTree
revisedTree
comparisonEdges
```

但默认 UI 和默认 LLM 生成逻辑使用：

```text
comparison.board
```

### 25.3 新增 board validator

新增文件：

```text
src/lib/comparison/validateLayeredComparisonBoard.ts
```

validator 检查：

```text
1. board 是否为 object。
2. board_id 是否存在。
3. original_answer_id / revised_answer_id 是否存在。
4. summary.overall_summary 是否存在。
5. recommended_action 是否为允许值。
6. levels 是否为非空数组。
7. level_name 是否只使用：
   main_topics
   key_decisions
   details_implementation
   risks_actions
8. 每个 level.rows 是否非空。
9. row_id / shared_topic / short_explanation 是否存在。
10. difference 是否只使用固定标签。
11. importance 是否只使用 low / medium / high。
12. original 和 revised 不能同时为 null。
13. added 行必须 original = null 且 revised 存在。
14. removed 行必须 original 存在且 revised = null。
15. same / rewritten / refined / expanded / reduced / replaced / conflict 行必须两边都存在。
16. side.title / side.short_summary 必须存在。
17. full_text 如果存在必须为 string。
```

另外 validator 会扫描 LLM 输出 JSON 的 key。

禁止出现：

```text
coordinates
coordinate
x
y
svg
react
component
css
layout
node
nodes
edge
edges
link
links
tree
graph
```

目的：

```text
确保 LLM 不再输出旧图结构、节点、坐标、SVG、React code 或布局代码。
```

### 25.4 新增兼容转换器

新增文件：

```text
src/lib/comparison/boardCompatibility.ts
```

提供：

```text
boardToLayeredComparisonScaffold
scaffoldToLayeredComparisonBoard
relationFromBoardDifference
```

用途：

```text
1. 默认 LLM 生成 board。
2. 旧 Advanced Graph / store 仍需要 scaffold / tree 字段。
3. 系统从 board 派生 scaffold。
4. 派生数据不是默认生成目标。
```

difference -> legacy relation 映射：

```text
same -> same
rewritten -> rewritten
refined -> refined
expanded -> expanded
reduced -> reduced
replaced -> replaced
added -> revised_only
removed -> original_only
conflict -> contradicted
```

legacy relation -> difference 映射：

```text
original_only -> removed
revised_only -> added
contradicted -> conflict
其他同名映射
```

### 25.5 OpenAIProvider 生成逻辑重写

修改文件：

```text
src/lib/llm/openaiProvider.ts
```

旧默认 prompt：

```text
Generate a standardized layered semantic comparison scaffold
Do not generate two independent trees
```

新默认 prompt：

```text
You are generating a Layered Comparison Board for comparing an original answer and a revised answer.
Do not generate a tree.
Do not generate graph nodes.
Do not generate node-link alignment.
Do not generate visual coordinates, SVG, React components, CSS, or layout code.
Generate a concise semantic comparison board.
Return valid JSON only.
```

新 user prompt 要求返回：

```text
board_id
original_answer_id
revised_answer_id
summary
levels
rows
```

`generateArgumentComparison` 当前流程：

```text
1. 调用 OpenAI。
2. parseJsonObject<LayeredComparisonBoard>()。
3. validateLayeredComparisonBoard(board)。
4. 如果失败，调用 board repair prompt。
5. repair 后再次 validateLayeredComparisonBoard。
6. 通过后 buildComparisonFromBoard。
7. buildComparisonFromBoard 保留 board 为默认数据。
8. 再从 board 派生 scaffold / tree / edges 作为兼容字段。
```

repair prompt 已改为：

```text
The previous JSON output is invalid for the LayeredComparisonBoard schema.
Repair it without changing the intended comparison meaning.
Return repaired valid JSON only.
```

不再使用旧的：

```text
schema or tree rules
```

### 25.6 Mock provider 与 fallback

修改文件：

```text
src/lib/comparison/createArgumentComparison.ts
src/lib/llm/mockProvider.ts
```

Mock comparison 现在默认构造：

```text
LayeredComparisonBoard
```

然后：

```text
boardToLayeredComparisonScaffold(board)
```

生成兼容 scaffold。

这意味着：

```text
没有 OpenAI key 或使用 mock provider 时，默认 comparison 仍然是 board。
```

### 25.7 mockData 更新

修改文件：

```text
src/data/mockData.ts
```

`mockComparisons[0]` 新增：

```text
board
```

mock board 中包含：

```text
summary
Level 1: Main Topics
Level 3: Details / Implementation
```

旧的 scaffold、originalTree、revisedTree、comparisonEdges 仍保留。

它们只是兼容数据。

### 25.8 前端默认渲染修改

修改文件：

```text
src/components/comparison/LayeredComparisonBoard.tsx
src/components/comparison/ArgumentEvidenceComparison.tsx
```

之前：

```text
LayeredComparisonBoard(scaffold)
-> scaffold.slots
-> slotToLayeredBoardRow
-> table rows
```

现在：

```text
LayeredComparisonBoard(board)
-> board.levels
-> board.rows
-> compact level tables
```

`ArgumentEvidenceComparison` 当前传入：

```tsx
<LayeredComparisonBoard board={comparison.board} />
```

不再传入：

```tsx
scaffold={comparison.scaffold}
```

### 25.9 DifferenceBadge

新增文件：

```text
src/components/comparison/DifferenceBadge.tsx
```

显示映射：

```text
same -> Same
rewritten -> Rewritten
refined -> Refined
expanded -> Expanded
reduced -> Reduced
replaced -> Replaced
added -> Added
removed -> Removed
conflict -> Conflict
```

`LayeredComparisonBoard` 使用：

```text
DifferenceBadge
```

而不是 legacy：

```text
RelationBadge
```

### 25.10 Detail Panel

修改文件：

```text
src/components/comparison/ComparisonDetailPanel.tsx
```

现在支持：

```text
row?: ComparisonRow
slot?: ComparisonSlot
```

默认 board 使用：

```text
row
```

显示：

```text
Shared Topic
Difference
Importance
Original title
Original short summary
Original full text
Revised title
Revised short summary
Revised full text
Short explanation
Possible Merge Suggestion
```

如果 full_text 不存在：

```text
使用 short_summary 作为 detail text fallback。
```

### 25.11 Filter Bar

`LayeredComparisonBoard.tsx` 新增 board JSON 过滤函数：

```text
applyBoardJsonFilter
buildBoardJsonFilterCounts
```

过滤规则：

```text
All:
  所有 rows

Changed:
  rewritten
  refined
  expanded
  reduced
  replaced

Added:
  added

Removed:
  removed

Conflict:
  conflict

Important:
  importance === high
```

这次 filter 不再依赖：

```text
ComparisonSlot.relation
```

而是直接依赖：

```text
ComparisonRow.difference
```

### 25.12 Advanced Graph 降级

修改文件：

```text
src/components/comparison/ViewModeToggle.tsx
```

显示从：

```text
Graph View
```

改为：

```text
Advanced Graph
```

默认仍然是：

```text
Board View
```

高级图视图使用的是从 board 派生的 scaffold。

它不是默认 comparison 流程。

### 25.13 Board Chat / LLM context

修改文件：

```text
src/app/api/conversation-sessions/messages/route.ts
src/store/useAnswerAtlasStore.ts
```

系统提示从：

```text
Semantic Diff Tree comparison window
original tree, branch tree, alignments
```

改为：

```text
Layered Comparison Board window
comparison board JSON
selected row if present
summary, levels, rows, differences, risks, merge consequences
```

store 发送给 board chat 的 contextItem 从：

```text
type: "tree_comparison"
text: JSON.stringify(comparison)
reason: Tree Compare Window context: original tree, revised tree, and alignment edges.
```

改为：

```text
type: "comparison_board"
text: JSON.stringify(comparison.board)
reason: Layered Comparison Board context: board summary, levels, rows, differences, and selected revision evidence.
```

这意味着：

```text
用户在 Board chat 中提问时，进入 LLM context 的主要 comparison memory 是 board JSON。
```

不会再把默认 tree / edge / alignment 作为主要 context。

### 25.14 什么会进入 LLM 记忆

本次修改后：

```text
1. 用户点击 board row：
   不调用 LLM。
   不写入 conversation。
   不进入 LLM context。

2. 用户切换 filter：
   不调用 LLM。
   不写入 conversation。
   不进入 LLM context。

3. LLM 生成 comparison：
   /api/llm/argument-comparison 会调用 selected model。
   输入是 originalText、revisedText、localQuestion、localAnswer、contextItems。
   输出是 LayeredComparisonBoard JSON。

4. 用户在 Board chat 里提问：
   用户问题进入对应 comparison window conversation session。
   assistant 回答进入同一个 session。
   contextItems 包含 comparison.board。

5. annotation 规则：
   本次没有改变 annotation 是否进入 context 的规则。
```

### 25.15 测试更新

修改文件：

```text
src/__tests__/context-rules.test.ts
```

测试从旧树判断：

```text
keeps argument comparison as two separate trees
```

改为：

```text
uses layered comparison board as the default comparison data
```

filter 测试从：

```text
ComparisonSlot.relation
```

改为：

```text
ComparisonRow.difference
```

覆盖：

```text
changed -> refined + replaced
added -> added
removed -> removed
conflicts -> conflict
important -> replaced + conflict + explicit high importance
```

### 25.16 本次执行记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
pnpm typecheck -> 通过
pnpm test -> 通过，1 个测试文件，10 个测试通过
pnpm build -> 通过，Next.js 生产构建成功
```

生产构建 route table：

```text
/
/_not-found
/api/conversation-sessions/messages
/api/llm/argument-comparison
/api/llm/generate-document
/api/llm/local-question
/api/models
/documents/[documentId]
```

### 25.17 当前仍保留但非默认的旧内容

仍保留：

```text
LayeredComparisonScaffold
ArgumentTree
ComparisonEdge
LayeredComparisonScaffoldView
SemanticDiffBoard
ComparisonCard
OriginalClaimTree
RevisedClaimTree
```

原因：

```text
1. 不进行批量删除。
2. 支持 Advanced Graph。
3. 兼容旧 store / mock / history data。
```

默认流程不再依赖它们。

默认流程依赖：

```text
LayeredComparisonBoard
ComparisonLevel
ComparisonRow
DifferenceBadge
validateLayeredComparisonBoard
```

### 25.18 本地服务重启与探测

重启前：

```text
3000 端口监听进程：12348
```

重启后：

```text
3000 端口监听进程：41040
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
```

HTTP 探测：

```text
GET /documents/doc-ai-education -> 200
GET /api/models -> provider=openai, defaultModel=gpt-5.5, firstModel=gpt-5.5, models count=74
```

浏览器探测：

```json
{
  "hasLayeredTitle": true,
  "hasAdvancedGraph": false,
  "hasGraphView": false,
  "hasSemanticTitle": false,
  "hasMainSessionHistory": false,
  "url": "http://127.0.0.1:3000/documents/doc-ai-education",
  "consoleErrorCount": 0
}
```

说明：

```text
当前页面没有 active comparison，因此 Advanced Graph toggle 没有显示是预期行为。
默认页面标题已经是 Layered Comparison Board。
旧 Semantic Diff Board 标题没有显示。
旧 Graph View 文案没有显示。
MAIN SESSION HISTORY 没有显示。
浏览器 console error count = 0。
```

## 24. 第十一次修改记录：Layered Comparison Board 表格式对比规则修订

本次根据新的“Layered Comparison Board 规则修订版”进行修改。

核心目标：

```text
1. 底层继续使用标准化 LayeredComparisonScaffold。
2. 前端默认不再把 comparison 渲染成大量卡片。
3. 前端默认不渲染树节点、连接线或拥挤图结构。
4. 默认渲染为 compact comparison table。
5. 每个 level 使用 Original | Revised | Difference 三列表格。
6. 点击表格行后，才在右侧 detail panel 展示完整内容。
7. LLM 不再被要求每层最多生成固定数量的 children。
8. LLM 仍然必须生成简洁、聚焦、有语义价值的 comparison。
```

### 24.1 本次没有执行的删除

根据 AGENTS.md 规则：

```text
禁止批量删除东西，如果要删除东西一定要问用户。
```

本次没有删除文件。

保留的旧文件：

```text
src/components/comparison/SemanticDiffBoard.tsx
src/components/comparison/ComparisonSection.tsx
src/components/comparison/ComparisonCard.tsx
```

原因：

```text
1. 避免批量删除。
2. 保留旧实现作为可回退代码。
3. 默认入口已经切换到新的 LayeredComparisonBoard。
4. 旧卡片组件不再作为默认 board 渲染路径。
```

新的默认渲染入口是：

```text
src/components/comparison/LayeredComparisonBoard.tsx
```

### 24.2 新增 LayeredComparisonBoard

新增文件：

```text
src/components/comparison/LayeredComparisonBoard.tsx
```

这个组件把底层 `ComparisonSlot[]` 映射成前端使用的 board row：

```text
ComparisonSlot
-> LayeredBoardRow
```

每一行包含：

```text
row_id
slot_id
level_role
shared_topic
original
revised
difference
importance
short_explanation
source_slot
```

其中：

```text
original = original_node 映射出来的 title / short_summary / full_text
revised = revised_node 映射出来的 title / short_summary / full_text
source_slot = 原始 ComparisonSlot，供 detail panel 和旧 scaffold 逻辑继续使用
```

### 24.3 Summary 与 Level 的关系

本次实现明确区分：

```text
Summary 不是 level。
Summary 显示在 board 顶部。
Level 1-4 才渲染为表格。
```

对应逻辑：

```text
slot.level_role === "root"
```

不会进入表格行。

root slot 只作为整体 comparison anchor / fallback detail 使用。

### 24.4 Level 映射规则

底层 scaffold level_role 到前端表格标题的映射：

```text
main_topic
-> Level 1: Main Topics

claim_or_decision
-> Level 2: Key Decisions

support_or_detail
-> Level 3: Details / Implementation

consequence_risk_or_action
-> Level 4: Risks / Actions
```

如果某个 level 没有 row：

```text
该 level 不显示。
```

这符合“没有必要的 level 可以不显示”的规则。

### 24.5 表格渲染规则

每个 level 使用一个 compact table。

表头固定为：

```text
Original | Revised | Difference
```

表格里不直接塞完整段落。

表格行显示：

```text
Original:
  title
  short_summary

Revised:
  title
  short_summary

Difference:
  relation badge
  importance
  shared_topic
  short_explanation
```

完整 source_text 只在 detail panel 中显示。

### 24.6 Difference 标签映射

本次新增前端 board difference 类型：

```ts
type LayeredBoardDifference =
  | "same"
  | "rewritten"
  | "refined"
  | "expanded"
  | "reduced"
  | "replaced"
  | "added"
  | "removed"
  | "conflict";
```

从底层 scaffold relation 到前端 difference 的映射：

```text
same -> same
rewritten -> rewritten
refined -> refined
expanded -> expanded
reduced -> reduced
replaced -> replaced
contradicted -> conflict
original_only -> removed
revised_only -> added
```

### 24.7 replaced relation

类型文件修改：

```text
src/types/comparison.ts
```

`ComparisonSlot["relation"]` 新增：

```text
replaced
```

用途：

```text
当 revised answer 不是简单扩写、精炼或改写，而是把 original 的设计、观点或主题替换成一个明显不同的版本时，使用 replaced。
```

前端显示：

```text
replaced -> Replaced
```

颜色：

```text
indigo 系列，用来和 refined / expanded / reduced 区分。
```

### 24.8 relation badge 更新

修改文件：

```text
src/components/comparison/RelationBadge.tsx
src/components/comparison/LayeredComparisonScaffoldView.tsx
```

补充：

```text
replaced -> Replaced
```

这样：

```text
Board View
Graph View
Detail Panel
```

都能识别 replaced，不会因为类型新增造成渲染缺口。

### 24.9 Filter 规则

本次新的 board filter 函数：

```text
applyLayeredBoardFilter
buildLayeredBoardFilterCounts
```

保留兼容导出：

```text
applySemanticDiffFilter
```

原因：

```text
已有测试和旧命名仍然依赖这个 helper。
为了避免大范围重命名和删除，本次保留兼容名称。
```

过滤规则：

```text
All:
  所有非 root row

Changed:
  rewritten
  refined
  expanded
  reduced
  replaced

Added:
  revised_only -> added

Removed:
  original_only -> removed

Conflict:
  contradicted -> conflict

Important:
  importance === high
```

如果 LLM 没有显式给 importance：

```text
conflict -> high
replaced -> high
added -> medium
removed -> medium
其他 changed -> medium
same -> low
```

### 24.10 Detail Panel 修改

修改文件：

```text
src/components/comparison/ComparisonDetailPanel.tsx
```

文案从：

```text
Select a comparison card...
```

改为：

```text
Select a comparison row...
```

Detail Panel 现在显示：

```text
1. Selected Comparison Detail
2. Shared Topic
3. Relation badge
4. Importance
5. Original title / summary / source_text
6. Revised title / summary / source_text
7. Comparison short_comparison
8. Possible Merge Suggestion
```

这对应需求里的：

```text
Shared topic
Original full text
Revised full text
Difference
Importance
Short explanation
Possible merge suggestion
```

### 24.11 ArgumentEvidenceComparison 默认入口修改

修改文件：

```text
src/components/comparison/ArgumentEvidenceComparison.tsx
```

默认 board view 从：

```text
SemanticDiffBoard
```

改为：

```text
LayeredComparisonBoard
```

标题从：

```text
Semantic Diff Board
```

改为：

```text
Layered Comparison Board
```

聊天区文案从：

```text
Diff board chat
Diff Assistant
Ask about this semantic diff...
```

改为：

```text
Board chat
Board Assistant
Ask about this comparison board...
```

### 24.12 LLM prompt 修改

修改文件：

```text
src/lib/llm/openaiProvider.ts
```

`layeredComparisonSystemPrompt` 现在说明：

```text
1. 生成 standardized layered semantic comparison scaffold。
2. 这个 scaffold 会被渲染为 compact Layered Comparison Board。
3. 不生成两个独立的 trees。
4. 不生成 graph nodes。
5. 不生成 coordinates、SVG、layout information 或 UI code。
6. root slot 是整体 anchor。
7. Level 1-4 变成 board tables。
8. 生成 concise semantic comparison board，不追求 exhaustive map。
9. 优先生成 meaningful semantic / structural / design / implementation changes。
10. 合并相似小变化。
11. 不过度生成 minor wording differences。
12. 不强行填满每个 level。
13. unchanged 内容只有在理解整体结构很重要时才加入。
14. 没有有意义的风险、冲突或 action 时，不需要生成 level 4。
15. 支持 relation = replaced。
```

`layeredComparisonUserPrompt` schema 中新增：

```text
relation: "... | replaced | ..."
importance: "low | medium | high"
```

### 24.13 Validator 修改

修改文件：

```text
src/lib/comparison/validateLayeredComparisonScaffold.ts
```

新增：

```text
replaced
```

作为 two-sided relation。

也就是说 replaced 必须包含：

```text
original_node
revised_node
```

本次不再执行 children 数量限制。

当前逻辑：

```text
enforceChildLimits = false
```

旧的 childrenLimits 常量保留，但不参与 validation。

这样做的原因：

```text
1. 满足“不再规定每个 level 最多几行”的要求。
2. 避免直接删除旧限制代码。
3. 后续如果用户要求重新启用上限，可以明确恢复。
```

### 24.14 LLM context / memory 规则

本次没有新增新的 LLM 记忆。

LayeredComparisonBoard 本身：

```text
不会直接调用 LLM。
不会写入模型记忆。
不会改变 conversation session。
不会改变 annotation 是否进入 context 的规则。
```

它读取的是：

```text
comparison.scaffold
```

comparison.scaffold 的来源仍然是：

```text
1. 用户在主回答中选中局部文本。
2. 用户在 Local Branch Window 里提问。
3. Local Branch Window 调用 LLM 生成 local answer / revisedText。
4. 系统调用 /api/llm/argument-comparison。
5. OpenAIProvider.generateArgumentComparison 使用 originalText、revisedText、localQuestion、localAnswer 生成 LayeredComparisonScaffold。
6. 前端用 LayeredComparisonBoard 把 scaffold 渲染成表格。
```

Board chat 继续使用：

```text
askTreeQuestion
/api/conversation-sessions/messages
```

其上下文仍然来自当前 tree / comparison window session。

如果后续用户在 Board chat 中提问：

```text
用户问题会进入该 comparison window 的 conversation session。
assistant 回答会追加到同一 session。
```

但仅仅展开、点击、过滤 board row：

```text
不会调用 LLM。
不会进入 LLM memory。
不会写入 conversation message。
```

### 24.15 Annotation 与本次修改的关系

本次没有改变 annotation 逻辑。

annotation 是否进入 LLM context 仍然取决于：

```text
1. annotation 是否 active。
2. annotation 是否属于当前 document / anchor / active path。
3. context 构建目的是否需要它。
```

LayeredComparisonBoard 只是显示 comparison 结果。

它不会把表格点击行为写入 annotation。

它也不会自动把某个 table row 写进未来 LLM prompt。

### 24.16 UI 行为

用户看到的默认 comparison 区域现在是：

```text
Overall Change summary
Filter bar
Level 1 table
Level 2 table
Level 3 table
Level 4 table, only if available
Detail panel
Board chat
```

用户点击一行：

```text
selectedRowId 更新。
对应 row 高亮。
右侧 detail panel 更新为该 row 的完整 original / revised / comparison。
不会触发 LLM。
```

用户切换 filter：

```text
visibleRows 重新计算。
如果有匹配 row，自动选择第一个匹配 row。
如果没有匹配 row，显示 No comparison rows match this filter.
不会触发 LLM。
```

### 24.17 测试更新

修改文件：

```text
src/__tests__/context-rules.test.ts
```

测试名称从：

```text
filters semantic diff board slots by relation and importance
```

改为：

```text
filters layered comparison board slots by relation and importance
```

新增覆盖：

```text
replaced -> changed
replaced -> important, because inferred importance is high
contradicted -> important, because inferred importance is high
```

当前测试验证：

```text
changed -> refined + replaced
added -> revised_only
removed -> original_only
conflicts -> contradicted
important -> replaced + contradicted + explicit high importance
```

### 24.18 本次执行记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
pnpm typecheck -> 通过
pnpm test -> 通过，1 个测试文件，10 个测试通过
pnpm build -> 通过，Next.js 生产构建成功
```

测试备注：

```text
第一次 pnpm test 在沙箱里遇到 Windows spawn EPERM。
随后使用提升权限重跑同一测试命令。
第二次测试进入真实断言阶段，发现 Important filter 期待值需要跟随 replaced/conflict 的 high importance 推断规则更新。
更新测试后，pnpm test 通过。
```

生产构建 route table：

```text
/
/_not-found
/api/conversation-sessions/messages
/api/llm/argument-comparison
/api/llm/generate-document
/api/llm/local-question
/api/models
/documents/[documentId]
```

### 24.19 本地服务重启记录

重启前：

```text
3000 端口监听进程：40940
```

操作：

```text
停止旧 3000 端口服务进程。
使用 pnpm start 启动新服务。
```

重启后：

```text
3000 端口监听进程：12348
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
```

### 24.20 本地 HTTP 探测

```text
GET /documents/doc-ai-education -> 200
GET /api/models -> provider=openai, defaultModel=gpt-5.5, firstModel=gpt-5.5, models count=74
```

### 24.21 浏览器探测

当前 in-app browser 页面：

```text
http://127.0.0.1:3000/documents/doc-ai-education
```

刷新后读取页面状态：

```json
{
  "hasLayeredTitle": true,
  "hasSemanticTitle": false,
  "hasMainSessionHistory": false,
  "consoleErrorCount": 0
}
```

说明：

```text
Layered Comparison Board 标题可见。
旧 Semantic Diff Board 标题不可见。
MAIN SESSION HISTORY 没有重新出现。
浏览器 console error count = 0。
```

当前页面没有 active comparison，因此：

```text
Original | Revised | Difference 表头暂时不出现。
```

这是符合运行逻辑的：

```text
只有在用户选中文本、发起 local question、生成 revisedText 和 comparison.scaffold 后，
LayeredComparisonBoard 才会渲染具体 level table。
```

## 22. 第九次修改记录：移除左侧栏、主窗口连续 Chat、轻量问题历史、默认 GPT-5.5

### 22.1 本次修改目标

本次修改处理四个核心需求：

```text
1. 移除左侧 Home / All Threads / Contents / Document Map 面板。
2. 移除主窗口里的 MAIN SESSION HISTORY 大卡片。
3. 主窗口改成正常 ChatGPT 式连续 conversation stream。
4. 用输入框旁边的小型 Previous Questions hover popover 代替大历史面板。
5. 默认模型改为 gpt-5.5，并显示为 GPT-5.5。
```

本次没有删除任何文件。

UI 层面的“删除”范围是：

```text
1. AppShell 不再 import / render LeftSidebar。
2. AppShell 不再 render 左侧竖向 icon rail。
3. AppHeader 不再显示左侧 Menu 按钮。
4. AppHeader 不再显示顶部 History 按钮。
5. MainDocumentPanel 不再显示 Main session history 大卡片。
```

保留但不再从主布局渲染的文件：

```text
src/components/layout/LeftSidebar.tsx
```

保留原因：

```text
用户要求不能批量删除东西。
本次只切断 UI 渲染路径，不物理删除文件。
```

### 22.2 修改文件

```text
src/components/layout/AppShell.tsx
src/components/layout/AppHeader.tsx
src/components/document/MainDocumentPanel.tsx
src/store/useAnswerAtlasStore.ts
src/lib/llm/modelCatalog.ts
src/lib/llm/serverModelCatalog.ts
src/components/thread/SideThreadPanel.tsx
src/components/comparison/ArgumentEvidenceComparison.tsx
src/__tests__/context-rules.test.ts
docs/ANSWER_ATLAS_DEVELOPMENT_RECORD.md
```

### 22.3 左侧栏移除逻辑

修改前：

```text
AppShell grid 包含：
1. 左侧 icon rail，宽 58px。
2. LeftSidebar，宽 236px。
3. MainDocumentPanel。
4. SideThreadPanel。
5. ArgumentEvidenceComparison。
6. VersionTimeline。
```

修改后：

```text
AppShell grid 只包含：
1. MainDocumentPanel。
2. SideThreadPanel，如果 local branch 打开。
3. ArgumentEvidenceComparison。
4. VersionTimeline。
```

新 grid columns：

```text
sideThreadVisible = true:
grid-cols-[main, side-thread, comparison]

sideThreadVisible = false:
grid-cols-[main, comparison]
```

因此页面不再显示：

```text
Home
All Threads
Contents
P1 / P2 / P12 等 outline 项
Document Map
```

也不会留下原来的 58px + 236px 左侧 gutter。

### 22.4 顶部 Header 调整

移除：

```text
Menu 按钮
History 按钮
```

原因：

```text
Menu 原本只用于折叠左侧导航。
左侧导航已经不再渲染，所以 Menu 会变成无效入口。

History 不再用大面板展示。
主窗口改为输入框旁边的小型 Previous Questions hover popover。
```

保留：

```text
Project select
New Project
Help
Library
Branches
Share
Context Preview
New Thread
```

### 22.5 主窗口从 Document-first 改为 Chat-first

修改前 MainDocumentPanel 结构：

```text
Header
Toolbar
Prompt input
Main session history 大卡片
DocumentAnswerRenderer / empty state
Stats footer
```

修改后 MainDocumentPanel 结构：

```text
Header
Toolbar
Chat area
Input area
Stats footer
```

Chat area 渲染：

```text
mainMessages = conversationMessages filtered by mainWindow.conversationSessionId
按 createdAt 升序排列
逐条渲染 user / assistant message
```

User message：

```text
右侧气泡
显示 You
显示完整用户输入
```

Assistant message：

```text
左侧气泡
显示 Assistant
显示 modelName badge
显示完整 assistant content
```

最新的 assistant message：

```text
使用 DocumentAnswerRenderer 渲染。
因此用户仍然可以在最新回答中拖选文本，打开 local branch / revise / context note。
```

历史 assistant message：

```text
以普通 whitespace-pre-line 文本显示。
不会再被截断为 line-clamp-3。
```

### 22.6 MAIN SESSION HISTORY 大卡片移除

删除渲染路径：

```text
Main session history
```

现在不再有单独的大卡片区域展示历史问答。

历史问答本身没有被删除。

它们仍然保存在：

```text
conversationMessages
```

并直接作为主 chat stream 展示。

### 22.7 主会话发送消息的正确流程

修改前：

```text
1. 用户点击 Send。
2. 前端调用 /api/llm/generate-document。
3. API 返回后，才同时写入 user message 和 assistant message。
4. 在模型响应慢时，用户问题不会立刻出现在页面上。
```

修改后：

```text
1. 用户点击 Send。
2. MainDocumentPanel 立即清空 input。
3. useAnswerAtlasStore.generateDocumentFromPrompt 创建 userConversationMessage。
4. 立即写入 conversationMessages。
5. 页面马上显示 You: 用户问题。
6. 前端调用 /api/llm/generate-document。
7. API 返回后创建 assistantConversationMessage。
8. assistant message 写入同一个 main conversation session。
9. 页面在用户问题下方追加 Assistant 回答。
```

关键规则：

```text
mainWindow.conversationSessionId 不变。
不会为每次主问题创建新的 main session。
用户第二次、第三次追问继续 append 到同一个 conversation session。
```

### 22.8 LLM 调用上下文

主窗口调用：

```text
/api/llm/generate-document
```

发送给 LLM 的内容：

```text
1. prompt: 当前用户新输入。
2. model: mainWindow.modelConfigId。
3. messages: 当前 main session 里已有的 conversationMessages，不包含刚刚新增的 user message。
4. contextItems: buildContextPreview(...).includedItems。
```

为什么 messages 不包含刚刚新增的 user message：

```text
因为当前新输入已经作为 prompt 单独传给 API。
如果同时放进 messages，会造成同一问题重复出现两次。
```

### 22.9 主会话记忆规则

主会话消息会进入：

```text
conversationMessages
```

会被后续主窗口 LLM 调用读取：

```text
sessionMessagesForModel(state.conversationMessages, mainSession.id)
```

它不会进入：

```text
1. OpenAI 账号级记忆。
2. 外部长期记忆。
3. 其他 project 的 memory。
4. 其他 project 的 conversation session。
```

Project 隔离仍由：

```text
ProjectSnapshot
```

保存不同 project 下的：

```text
windows
sessions
conversationMessages
documents
threads
annotations
versionNodes
comparisons
```

### 22.10 修复第二次回答不更新 active document rawText

发现的问题：

```text
已有 document 上再次调用 generateDocumentFromPrompt 时，
store 会创建新的 generated document state 和 version node，
但是 documents[documentId] 只更新 title / updatedAt，
没有更新 rawText。
```

结果：

```text
conversationMessages 里有新的 assistant answer，
但 active document 的 rawText 仍可能停留在旧回答。
```

修复：

```text
documents[generated.document.id].rawText = generated.document.rawText
```

这样最新 assistant answer 和 active document 内容保持一致。

### 22.11 轻量 Previous Questions hover popover

新增位置：

```text
MainDocumentPanel 底部 input area 左侧
```

按钮：

```text
小 History icon button
aria-label = Previous questions
```

Hover / focus 行为：

```text
显示一个小 popover。
标题为 Previous Questions。
只列出 role=user 的 main session messages。
不显示 assistant 完整回答。
```

点击某个历史问题：

```text
scrollIntoView 到对应 user message。
```

不会：

```text
1. 重新发送该问题。
2. 调用 LLM。
3. 修改 input。
4. 创建新消息。
```

### 22.12 输入框行为

底部输入框：

```text
输入新问题。
点击 Send 发送。
按 Enter 也会发送。
发送后立即清空 input。
```

Send disabled 条件：

```text
isGeneratingDocument = true
或 prompt.trim() 为空
```

Regenerate disabled 条件：

```text
isGeneratingDocument = true
或当前 main session 没有 user question
```

### 22.13 默认模型 GPT-5.5

前端默认常量：

```text
DEFAULT_MODEL = "gpt-5.5"
```

影响范围：

```text
1. 初始 Main Answer Window。
2. 初始 main conversation session。
3. empty project snapshot。
4. 新 project。
5. reset workspace 后的新 main session。
6. createThreadForAnchor 创建的 Local Branch Window。
7. Local Branch session。
8. Tree Compare Window 在生成 comparison 后使用 API 返回 model；如果主/local 默认没有切换，则会沿用 gpt-5.5。
```

服务端 model catalog：

```text
PREFERRED_DEFAULT_MODEL = "gpt-5.5"
```

`getOpenAIModelCatalog()` 现在会：

```text
1. 从 /v1/models 获取 API 可见模型。
2. 用 filterUsableModels 过滤文本模型。
3. 调用 prioritizePreferredDefaultModel。
4. 把 gpt-5.5 放在 models[0]。
5. defaultModel 固定为 gpt-5.5。
```

如果 API 返回列表里没有 `gpt-5.5`：

```text
根据本次用户要求，前端模型列表仍会加入 gpt-5.5。
```

风险说明：

```text
如果 OpenAI API 实际不接受 model="gpt-5.5"，
真实 LLM 调用会由 OpenAI 返回模型不可用错误。
这是本次“如果模型列表中没有 gpt-5.5，请先在 model config 里添加”要求带来的风险。
```

### 22.14 模型显示

select option 内部值：

```text
gpt-5.5
```

显示文本：

```text
GPT-5.5
```

已同步位置：

```text
MainDocumentPanel
SideThreadPanel
ArgumentEvidenceComparison
```

### 22.15 测试更新

新增测试：

```text
promotes GPT-5.5 as the default selectable model
```

验证：

```text
prioritizePreferredDefaultModel(["gpt-4.1", "gpt-5"])
=> ["gpt-5.5", "gpt-4.1", "gpt-5"]
```

### 22.16 本次验证记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
通过
测试 1 个文件，9 个测试通过
Next.js 生产构建通过
Route table 保持 /api/conversation-sessions/messages、/api/llm/argument-comparison、/api/llm/generate-document、/api/llm/local-question、/api/models 与 /documents/[documentId]
```

本地服务重启记录：

```text
旧 3000 端口服务进程：12752
新 3000 端口服务进程：34044
启动命令：pnpm start
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
```

本地 HTTP 探测：

```text
GET /documents/doc-ai-education -> 200
GET /api/models -> provider=openai, defaultModel=gpt-5.5, firstModel=gpt-5.5, models count=74
```

## 23. 第十次修改记录：Semantic Diff Board 默认对比视图

### 23.1 本次修改目标

本次修改将默认 comparison 展示方式从：

```text
Two Trees + Node Links
```

改为：

```text
Semantic Diff Board
```

核心原则：

```text
底层仍然使用 LLM 生成的 standardized layered comparison scaffold。
前端默认不再把 scaffold 画成两棵拥挤的树。
前端把每个 ComparisonSlot 渲染为 ComparisonCard。
ComparisonSlot 按 semantic level_role 分组成 board sections。
用户通过 cards、badges、filters、detail panel 阅读差异。
```

本次没有删除文件。

旧树图组件：

```text
src/components/comparison/LayeredComparisonScaffoldView.tsx
```

仍然保留，只作为可选：

```text
Graph View
```

默认视图：

```text
Board View
```

### 23.2 修改文件

新增文件：

```text
src/components/comparison/SemanticDiffBoard.tsx
src/components/comparison/ComparisonSummaryPanel.tsx
src/components/comparison/ComparisonFilterBar.tsx
src/components/comparison/ComparisonSection.tsx
src/components/comparison/ComparisonCard.tsx
src/components/comparison/ComparisonDetailPanel.tsx
src/components/comparison/RelationBadge.tsx
src/components/comparison/ViewModeToggle.tsx
```

修改文件：

```text
src/components/comparison/ArgumentEvidenceComparison.tsx
src/types/comparison.ts
src/__tests__/context-rules.test.ts
docs/ANSWER_ATLAS_DEVELOPMENT_RECORD.md
```

### 23.3 标题变化

修改前：

```text
Argument & Evidence Comparison
Original vs Revised
```

修改后：

```text
Semantic Diff Board
Original vs Revised
```

### 23.4 View Mode 逻辑

新增：

```text
ViewModeToggle
```

可选值：

```text
board
graph
```

默认状态：

```text
const [viewMode, setViewMode] = useState("board")
```

渲染逻辑：

```text
viewMode === "board"
  -> SemanticDiffBoard

viewMode === "graph"
  -> LayeredComparisonScaffoldView
```

这意味着：

```text
用户打开 Original vs Revised 对比时，默认看到 Semantic Diff Board。
旧树图只在用户主动切到 Graph View 时显示。
```

### 23.5 底层 LLM 数据结构不变

本次没有改 LLM 的核心输出目标。

仍然使用：

```text
LayeredComparisonScaffold
ComparisonSlot[]
ComparisonSummary
```

仍然通过：

```text
OpenAIProvider.generateArgumentComparison
validateLayeredComparisonScaffold
repair loop
```

生成和验证。

LLM 仍然不生成：

```text
1. UI 卡片。
2. 坐标。
3. 颜色。
4. SVG。
5. React 组件。
6. 布局信息。
```

前端根据 scaffold 自己渲染 board。

### 23.6 ComparisonSlot 类型变化

给 `ComparisonSlot` 增加可选字段：

```text
importance?: "low" | "medium" | "high"
```

原因：

```text
Semantic Diff Board 的 Important only filter 可以直接读取该字段。
```

兼容性：

```text
importance 是 optional。
旧数据、mock 数据、现有 LLM 输出不包含 importance 也不会报错。
Important only 在没有 high importance slot 时显示空状态。
```

### 23.7 Semantic Diff Board 结构

`SemanticDiffBoard` 由四部分组成：

```text
1. ComparisonSummaryPanel
2. ComparisonFilterBar
3. ComparisonSection / ComparisonCard 列表
4. ComparisonDetailPanel
```

总体布局：

```text
Summary
Filter Bar
Sections + Right Detail Panel
```

大屏时：

```text
左侧：sections/cards
右侧：sticky detail panel
```

小屏时：

```text
CSS grid 会自然纵向堆叠。
```

### 23.8 Summary Panel

`ComparisonSummaryPanel` 显示：

```text
overall_summary
recommended_action
main_differences
main_risks
```

列表显示规则：

```text
默认显示前 3 条。
超过 3 条显示 Show more / Show less。
```

### 23.9 Filter Bar

Filter 类型：

```text
all
changed
added
removed
conflicts
important
```

UI label：

```text
All
Changed
Added
Removed
Conflicts
Important only
```

每个 filter 按钮显示 count。

映射规则：

```text
All:
  all slots

Changed:
  relation in ["rewritten", "refined", "expanded", "reduced"]

Added:
  relation === "revised_only"

Removed:
  relation === "original_only"

Conflicts:
  relation === "contradicted"

Important only:
  importance === "high"
```

相关函数：

```text
applySemanticDiffFilter
buildSemanticDiffFilterCounts
```

### 23.10 Section 分组

Semantic Diff Board 不再按图形树布局。

它按：

```text
slot.level_role
```

分组。

固定 section order：

```text
root
main_topic
claim_or_decision
support_or_detail
consequence_risk_or_action
```

显示名称：

```text
root -> Overview
main_topic -> Main topics
claim_or_decision -> Key decisions
support_or_detail -> Details and support
consequence_risk_or_action -> Risks, consequences, and actions
```

### 23.11 Card 排序

同一 section 内的 slots 排序规则：

```text
1. level_index
2. order_group rank
3. order_index
```

order_group rank：

```text
matched: 1
changed: 2
contradicted: 3
original_only: 4
revised_only: 5
```

### 23.12 ComparisonCard 内容

每个 `ComparisonSlot` 渲染为一张 `ComparisonCard`。

卡片包含：

```text
1. shared_topic
2. relation badge
3. Original column
4. Revised column
5. short_comparison
6. View detail affordance
```

Original / Revised 两列：

```text
如果 original_node 存在，显示 title + summary。
如果 original_node 缺失，显示 Not present in original。

如果 revised_node 存在，显示 title + summary。
如果 revised_node 缺失，显示 Not present in revised。
```

卡片文本默认截断：

```text
title: line-clamp-1
summary: line-clamp-2
short_comparison: line-clamp-2
```

完整内容不在卡片里展开，避免 board 变乱。

### 23.13 RelationBadge

Relation 显示映射：

```text
same -> Same
rewritten -> Rewritten
refined -> Refined
expanded -> Expanded
reduced -> Reduced
contradicted -> Conflict
original_only -> Removed
revised_only -> Added
```

颜色只做辅助。

文字 badge 是主要信息来源。

### 23.14 Detail Panel

点击任意 ComparisonCard：

```text
1. selectedSlotId 更新为该 slot_id。
2. 卡片进入 selected 状态。
3. ComparisonDetailPanel 显示完整内容。
```

Detail Panel 显示：

```text
1. Shared Topic
2. Relation
3. Original title
4. Original summary
5. Original source_text
6. Revised title
7. Revised summary
8. Revised source_text
9. short_comparison
10. recommended_action
```

缺失侧显示：

```text
Not present in original answer
Not present in revised answer
```

### 23.15 Board 与 Graph 的关系

旧 Graph View 仍然可以显示：

```text
LayeredComparisonScaffoldView
```

但默认不会显示。

默认不会显示：

```text
1. 两棵树。
2. 复杂节点连线。
3. 大量 alignment lines。
```

除非用户主动点击：

```text
Graph View
```

### 23.16 Tree Window 文案更新

因为默认不再是 tree，相关文案改为 semantic diff：

```text
Tree window chat -> Diff board chat
Tree Assistant -> Diff Assistant
Ask about this tree comparison... -> Ask about this semantic diff...
```

### 23.17 LLM context / memory 规则

本次只改前端渲染方式。

没有新增 LLM 记忆。

没有改变：

```text
1. comparison 生成 API。
2. local question API。
3. contextItems 生成规则。
4. annotation 是否进入 context 的规则。
5. project 隔离规则。
```

Semantic Diff Board 读取的是：

```text
comparison.scaffold
```

它不会直接调用 LLM。

用户在 Diff board chat 里提问时，仍然走：

```text
askTreeQuestion
/api/conversation-sessions/messages
contextItems: tree_comparison JSON
```

### 23.18 测试更新

新增测试：

```text
filters semantic diff board slots by relation and importance
```

覆盖：

```text
changed -> refined
added -> revised_only
removed -> original_only
conflicts -> contradicted
important -> importance high
```

### 23.19 本次验证记录

已执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

结果：

```text
通过
测试 1 个文件，10 个测试通过
Next.js 生产构建通过
Route table 保持 /api/conversation-sessions/messages、/api/llm/argument-comparison、/api/llm/generate-document、/api/llm/local-question、/api/models 与 /documents/[documentId]
```

本地服务启动记录：

```text
启动前 3000 端口：无监听进程
新 3000 端口服务进程：40940
启动命令：pnpm start
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
```

本地 HTTP 探测：

```text
GET /documents/doc-ai-education -> 200
GET /api/models -> provider=openai, defaultModel=gpt-5.5, firstModel=gpt-5.5, models count=74
```

浏览器探测：

```text
当前 in-app browser 页面：http://127.0.0.1:3000/documents/doc-ai-education
页面可刷新加载。
Semantic Diff Board 标题可见。
当前页面没有 active comparison，因此 Board View / Graph View toggle 不显示属于预期。
旧标题 Argument & Evidence Comparison 不再显示。
浏览器 console error count = 0
```

## 24.22 文档顺序补充

本次最新修改记录已经写入本文档的：

```text
## 24. 第十一次修改记录：Layered Comparison Board 表格式对比规则修订
```

由于本文档里存在多个相同的浏览器验证锚点，本次第 24 节被插入到较早的验证块之后。

为避免按 AGENTS.md 规则进行大范围移动或删除，暂时不重排整份文档。

本次最新实际状态以第 24 节内容为准，尤其是：

```text
24.18 本次执行记录
24.19 本地服务重启记录
24.20 本地 HTTP 探测
24.21 浏览器探测
```

当前最新服务状态：

```text
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
3000 端口监听进程：12348
默认模型：gpt-5.5
默认 comparison 标题：Layered Comparison Board
```

## 25.19 文档末尾索引

本次最新修改记录已经写入本文档较前位置：

```text
## 25. 第十二次修改记录：重写对比生成逻辑为 LayeredComparisonBoard JSON
```

最新运行状态：

```text
访问地址：http://127.0.0.1:3000/documents/doc-ai-education
3000 端口监听进程：41040
默认 comparison 数据：comparison.board / LayeredComparisonBoard
默认 comparison 标题：Layered Comparison Board
默认模型：gpt-5.5
```

本次验证：

```text
pnpm typecheck -> 通过
pnpm test -> 通过，10 个测试
pnpm build -> 通过
GET /documents/doc-ai-education -> 200
GET /api/models -> provider=openai, defaultModel=gpt-5.5
浏览器 console error count = 0
```
