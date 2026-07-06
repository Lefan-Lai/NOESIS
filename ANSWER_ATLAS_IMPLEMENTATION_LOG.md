# Answer Atlas 实现记录

## 2026-07-06 - Timeline 改为动态 Logical Depth 与分支折叠规则

### 修改原因

用户指出 Timeline 不能预设固定层级，例如：

```text
Main Path
Local Checks
Follow-up Checks
Drafts
Memory
Inactive
```

因为真实的人的思考路径不是按 object type 分层，而是按用户操作动态分层：

```text
一开始只有主线
用户从某个节点选中内容并追问，才分出下一层
用户在 local answer 中继续追问，才继续深入下一层
用户 merge / keep note / revert，才回到上一层或主线
```

### 修改文件

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/components/timeline/TimelineNode.tsx
src/components/timeline/BranchLane.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新增 Logical Depth 规则

`timelineHumanize.ts` 现在不再把节点固定映射到 `local / followup / draft` 这些 lane。

新的推导规则：

```text
main conversation / document movement
→ logicalDepth = 0

anchor_selected / branch_created
→ parentDepth + 1

local question / local answer
→ 继承 parentDepth

merged / document_revised
→ max(parentDepth - 1, 0)

annotation
→ memory lane，不改变 depth

discarded / deleted / inactive future path
→ inactive lane，默认折叠
```

因此可见层级现在是动态生成的：

```text
Level 0 - Main Path
Level 1 - Branch
Level 2 - Branch
...
```

不是固定写死的分类泳道。

### Branch Group 规则

每个分支节点会推导：

```text
branchGroupId
logicalDepth
folded
foldReason
```

规则：

```text
depth = 0
→ branchGroupId = main

startsBranch(node)
→ branchGroupId = node.id

branch 内后续节点
→ 继承 parent branchGroupId
```

### 大分支折叠规则

当以下条件成立：

```text
collapseLargeBranches = true
logicalDepth > 0
branchSize > 4
node is not active path
node is not merge node
```

该分支会被折叠。

折叠后：

```text
只显示该 branch group 的第一个 summary chip
后续同组节点暂时隐藏
hover 显示 foldReason，例如 large branch (7 steps)
左侧控制栏显示 folded branch count
```

这只是显示层折叠：

```text
不会删除节点
不会改变 active path
不会改变 memory
不会改变 EventLog
```

### 左侧控制器更新

左侧栏不再只是 legend，现在可以控制：

```text
Show 1 level
Show 2 levels
Show 3 levels
Show all active levels

Show / Hide inactive paths
Show / Hide memory notes
Collapse / Expand large branches
```

默认：

```text
maxVisibleDepth = 2
showInactive = false
showMemory = true
collapseLargeBranches = true
```

也就是默认最多显示三层人的逻辑路径，inactive 不占常驻 lane。

### 节点显示规则

节点默认仍然保持 compact chip：

```text
短标题
时间
圆点
```

详细内容在 hover：

```text
relation label
status label
active badge
title
selected text / summary
fold reason
created time
```

### Memory / LLM 影响

本次修改仍然只影响 Timeline 前端推导和显示：

```text
不改变 VersionNode 数据结构
不改变 TimelineEdge 数据结构
不改变 EventLog
不改变 ContextSnapshot
不改变 LLM prompt
不改变 memory scope
不删除任何历史
```

目前 logicalDepth / branchGroupId / folded 都是前端根据已有数据推导出来的展示模型。

## 2026-07-06 - Timeline 紧凑化、Hover 详情、全屏模式与 Inactive 折叠

### 修改原因

用户指出新版 Timeline 仍有四个可视化问题：

```text
1. 节点、lane label、曲线之间互相遮挡。
2. 右上角放大按钮应该真正进入全屏。
3. 节点默认文字应该非常简略，详细描述应该放到 hover。
4. Inactive History 不应该常驻占据一整条 lane，否则图会变得过大。
```

### 修改文件

```text
src/components/timeline/VersionTimeline.tsx
src/components/timeline/TimelineNode.tsx
src/components/timeline/BranchLane.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 节点显示规则

`TimelineNode` 从大卡片改成紧凑 chip：

```text
默认只显示短标题
时间显示在点上方
状态、摘要、relation、active 标记放到 hover popover
点击节点仍然打开操作菜单
```

这样默认视图优先表达路径，而不是把所有解释文字堆在图上。

### Hover 详情规则

鼠标移动到节点上时显示详情：

```text
relation label
status label
active badge
human title
selected text / object summary
created time
```

点击节点时继续显示操作菜单：

```text
Revert to This Node
View Diff
Open Related Thread
Delete Related Answer
```

hover popover 与 click menu 分离，避免默认信息遮挡 timeline dot。

### Layout 防遮挡规则

Timeline graph 的起点从左侧 lane label 后方开始：

```text
GRAPH_PADDING_X = 224
```

这样 lane label 不会压住第一个节点或第一条曲线。

节点高度也压缩：

```text
LANE_HEIGHT = 112
node chip height = 44
```

### Inactive History 折叠规则

`Inactive History` 默认不作为常驻 lane 展示。

左侧 `Logic lanes` 增加控制：

```text
Show inactive paths (n)
Hide inactive paths (n)
```

默认状态：

```text
showInactive = false
```

因此 inactive nodes 会被过滤，不占图高度。

当用户选择显示 inactive paths 时：

```text
Inactive History lane 才被加入可见 lane
inactive nodes 才重新参与 layout
inactive edges 使用灰色虚线
```

### 全屏模式

右上角放大按钮现在会打开真正的 fullscreen overlay：

```text
fixed inset-0
占满浏览器窗口
顶部显示 Version Timeline 标题与关闭按钮
左侧保留 Logic lanes 控制
右侧使用同一套 TimelineGraphCanvas
```

普通视图与全屏视图复用同一个 `TimelineGraphCanvas`，避免两套渲染逻辑分叉。

### Memory / LLM 影响

本次修改只影响 Timeline 前端可视化：

```text
不改变 EventLog
不改变 VersionNode 数据
不改变 TimelineEdge 数据
不改变 active path 计算
不改变 ContextSnapshot
不改变 LLM prompt
不改变 memory scope
```

Inactive 折叠只是显示层过滤，不会删除任何历史节点。

## 2026-07-06 - Timeline 改为人的逻辑路径图

### 修改原因

用户指出当前 Timeline 的问题不是单纯样式问题，而是逻辑表达问题：

```text
Timeline 应该反映人的修订思路
什么时候分出去、什么时候回来，应该符合人的操作逻辑
节点命名不能直接显示重复的技术事件名
```

旧 Timeline 把所有节点按时间排成一条线，导致：

```text
局部追问看起来像主线推进
merge back 看不出是从旁支回到主文档
Selected text / Local answer generated 等节点重复且不说明人的意图
active / inactive 的语义不够清楚
```

### 修改文件

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/components/timeline/TimelineNode.tsx
src/components/timeline/BranchLane.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新增 Timeline Humanizer

新增 `timelineHumanize.ts`，用于把底层 `VersionNode` 转换为人可读的展示模型：

```text
VersionNode
→ HumanTimelineNode
```

每个 humanized node 包含：

```text
laneId
title
subtitle
statusLabel
statusTone
relationLabel
node
```

### Lane 规则

Timeline 现在按人的思考路径分成这些 lane：

```text
Main Path
Local Checks
Follow-up Checks
Drafts & Merges
Memory Notes
Inactive History
```

规则：

```text
document_created / document_revised / merged / reverted
→ Main Path

anchor_selected
→ Local Checks

anchor_selected from local answer
→ Follow-up Checks

local_answer_generated / local_question_asked
→ Local Checks 或 Follow-up Checks

branch_created / revision_generated
→ Drafts & Merges

annotation_added / annotation_deleted
→ Memory Notes

discarded / deleted / inactive future path
→ Inactive History
```

### 节点命名规则

节点标题不再直接显示技术 label，而是转成人的动作：

```text
LLM document generated      -> Generated first answer
Main answer updated         -> Saved document revision
Selected text               -> Checked a sentence
Selected local text         -> Followed up on local answer
Local answer generated      -> Suggested local wording
Created revision branch     -> Drafted alternative wording
Merged into main document   -> Merged into document
discarded                  -> Discarded local path
deleted                    -> Deleted local path
reverted                   -> Returned to earlier point
```

副标题优先显示用户真正操作的文本摘要：

```text
anchor.selectedText
thread.selectedText
branch.selectedText
```

如果没有可用文本，才 fallback 到更简洁的人话 label。

### Edge 视觉规则

Timeline 不再只有一条横线，而是根据 parent / child 关系画 SVG 曲线：

```text
同 lane 连接
→ 表示继续同一条思路

Main Path -> Local Checks
→ 表示从主线分出去做局部检查

Local / Draft -> Main Path
→ 表示 merge back 或采用回主文档

Inactive History
→ 使用虚线和灰色弱化
```

颜色规则：

```text
blue   -> main path
green  -> local checks
purple -> follow-up / drafts
amber  -> memory notes
gray   -> inactive history
red    -> deleted / dangerous state
```

### UI 改动

`VersionTimeline` 现在使用绝对定位和 SVG edge 绘制多 lane 图。

`TimelineNode` 现在显示：

```text
relation badge
human title
text summary
status
Active badge
```

左侧 `BranchLane` 改为 `Logic lanes` legend，不再只叫 branches。

### Memory / LLM 影响

本次修改只改变 Timeline 的前端解释和布局：

```text
不改变 EventLog
不改变 TimelineNode 数据结构
不改变 TimelineEdge 数据结构
不改变 ContextSnapshot
不改变 LLM prompt
不改变 active path 计算
不改变任何 memory scope
```

现有节点仍然来自 `versionNodes`，只是显示时进行 humanize 和 lane layout。

## 2026-07-06 - 顶部品牌名称改为 NOESIS

### 修改原因

用户指出顶部 header 中仍显示：

```text
Answer Atlas
```

需要改为：

```text
NOESIS
```

### 修改文件

```text
src/components/layout/AppHeader.tsx
src/app/layout.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 修改内容

顶部左侧主品牌名从 `Answer Atlas` 改为 `NOESIS`。

浏览器页面 metadata title 也从 `Answer Atlas` 改为 `NOESIS`，使页面标题与界面品牌一致。

### Memory / LLM 影响

本次修改只影响前端品牌显示：

```text
不改变 LLM prompt
不改变 ContextSnapshot
不改变 EventLog
不改变 TimelineNode
不改变项目数据结构
不改变任何 memory scope
```

## 2026-07-06 - Semantic Difference Map 改为 Difference Lens 可视化

### 修改原因

用户指出当前 `Semantic Difference Map` 的可视性仍然偏差：

```text
不要再让用户在 Original / Revised 两种卡片视图之间切换。
用户真正需要的是直接看到原句在哪里，以及现在到底变成了什么。
```

因此本次将主展示层从“对照卡片列表”改成：

```text
以原回答位置为底图
只强调发生变化的位置
每条变化直接显示 source sentence 和 current difference
```

### 修改文件

```text
src/components/comparison/SemanticDifferenceMapView.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新的展示结构

Layer 2 从：

```text
Review Queue
Original Context / Revised Result toggle
一张张大卡片
```

改为：

```text
Difference Lens
按原文 / 插入位置顺序排列
每条 row 显示原句锚点
每条 row 下方直接显示当前差异
```

用户现在看到的结构是：

```text
Source sentence
当前原句或插入点说明

Current difference
当前版本中对应的新句子 / 删除说明 / 新增内容
```

### 默认过滤规则

默认仍然使用：

```text
Important Changes
```

也就是说：

```text
unchanged 不默认展示
low importance 且无明显 tag / risk 的变化不默认展示
annotation-linked / question-linked / risk / evidence 等变化会优先出现
```

用户仍然可以切换：

```text
Important Changes
All Changes
Annotation-linked
Preserved
```

但主视图不再使用 Original / Revised side toggle。

### 每条 Difference Lens row 的显示规则

每条 row 显示：

```text
位置编号
semantic block type
change label
risk
source cue
where changed
source sentence
current difference
semantic tags
suggested action
```

change label 根据 `primaryChange` 生成：

```text
added     -> Added here
removed   -> Removed
moved     -> Moved
split     -> Split
merged    -> Merged
unchanged -> Preserved
rewritten -> Rewritten
```

source cue 根据 `triggeredBy` 生成：

```text
annotation        -> from note
user_question     -> from question
context_alignment -> context aligned
other             -> model inferred
```

### 颜色规则

当前颜色不再表示左右两栏，而表示变化类型和风险：

```text
high risk / risk_introduced -> red
added                       -> green
removed                     -> red
moved                       -> purple
unchanged                   -> gray
rewritten / normal change   -> blue
```

### Detail 面板文案修改

右侧 Layer 3 从：

```text
Local Difference Explanation
Original
Revised
```

改为：

```text
Difference Inspector
Source sentence
Current sentence
```

这样右侧仍然可以查看完整解释，但主展示层不再是拥挤的 Original / Revised 对照表。

### Memory / LLM 影响

本次修改只改变 Semantic Difference Map 的前端可视化：

```text
不改变 ComparisonGraph 数据结构
不改变 LLM prompt
不改变 ContextSnapshot
不改变 EventLog
不改变 TimelineNode
不改变 DocumentVersion
```

点击 row 的联动高亮逻辑仍然保留：

```text
点击 Difference Lens row
→ 设置 activeReviewFocus
→ main answer window 高亮 source sentence
→ local / nested answer window 高亮 current sentence
```

## 2026-07-05 - Semantic Difference Map 增加联动高亮与自动定位

### 修改原因

用户指出 Semantic Difference Map 不应该只在 map 卡片里解释“哪里变了”，更应该在真实回答窗口中直接定位：

```text
点击某条 semantic difference
→ main answer window 自动滚动到对应 original 句子或段落
→ local / revised answer window 自动滚动到对应 revised 句子或段落
→ 两边对应内容高亮
```

这样用户不需要依赖 `local context` 文字解释，也不用自己在长回答里寻找对应位置。

### 修改文件

```text
src/store/useAnswerAtlasStore.ts
src/components/comparison/SemanticDifferenceMapView.tsx
src/components/document/DocumentAnswerRenderer.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新增 Review Focus 状态

store 新增临时 UI 状态：

```text
activeReviewFocus
setActiveReviewFocus
```

这个状态记录当前被用户选中的 semantic difference row，包括：

```text
semanticRowId
anchorId
documentId
originalBlockId
revisedBlockId
originalText
revisedText
originalIndex
revisedIndex
primaryChange
createdAt
```

### 运行逻辑

用户点击 Semantic Difference Map 的某一行时：

```text
SemanticDifferenceMapView.selectRow(row)
→ setSelectedRowId(row.id)
→ setActiveReviewFocus(...)
→ 继续按原逻辑生成 / 读取 Layer 3 detail
```

主回答与 local answer 使用同一个 `DocumentAnswerRenderer`。该 renderer 会监听 `activeReviewFocus`：

```text
toolbarMode = main_answer
→ 使用 activeReviewFocus.originalText
→ 在主回答 DOM 中查找匹配段落 / 句子
→ 自动 scrollIntoView
→ 蓝色高亮

toolbarMode = local_answer
→ 使用 activeReviewFocus.revisedText
→ 在 local / nested local 回答 DOM 中查找匹配段落 / 句子
→ 自动 scrollIntoView
→ 紫色高亮
```

### 匹配规则

优先使用精确文本匹配：

```text
normalize whitespace
normalize curly quotes
case-insensitive includes
```

如果精确匹配失败，会使用关键词 fallback：

```text
提取长度大于 3 的重要词
在候选段落中计算命中数
命中比例达到阈值后认为是对应位置
```

候选 DOM 节点包括：

```text
p
li
blockquote
h1-h6
pre
code
```

### Memory / LLM 影响

这次修改只影响前端 review navigation：

```text
不会写入 LLM memory
不会进入 ContextSnapshot
不会创建 EventLog
不会创建 TimelineNode
不会改变 DocumentVersion
不会改变 ComparisonGraph 数据
```

它只是把 Semantic Difference Map 的 row selection 映射成一个临时 UI focus，帮助用户快速看见 original / revised 的对应位置。

## 2026-07-05 - Semantic Difference Map 增加 Original Context / Revised Result 与 Where Changed 锚点

### 修改原因

用户指出仅展示修改后的 semantic block 不合理：

```text
用户不知道这条修改发生在原回答哪里。
用户不知道 revised block 对应哪一句原文。
只显示 revised 会丢失 original anchor。
```

因此 Semantic Difference Map 不能只是展示“修改结果”，而必须展示：

```text
修改发生的位置
原句锚点
修改结果
另一侧预览
处理建议
```

### 修改文件

```text
src/components/comparison/SemanticDifferenceMapView.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 顶部视角切换

Layer 2 的侧边切换从：

```text
Original / Revised
```

改为：

```text
Original Context / Revised Result
```

默认视角改为：

```text
Original Context
```

原因是 revision review 的第一步应该是定位原文，而不是先看生成结果。

### 每条 row 新增 Where Changed

每张 card 现在固定显示：

```text
Where changed
Original block #n → Revised block #m · BlockType
```

特殊情况：

```text
added   -> Inserted near revised block #n
removed -> Original block #n removed
moved   -> Original block #n → revised block #m
```

这样即使用户当前在 `Revised Result` 模式，也知道该修改对应原文哪里。

### 主显示区规则

`Original Context` 模式：

```text
主显示 original block
颜色强调原句被修改、删除或作为插入锚点
下方保留 revised result preview
```

`Revised Result` 模式：

```text
主显示 revised block
颜色强调新增、改写或删除结果
下方保留 original anchor preview
```

也就是说，一次只主显示一侧，但另一侧不会完全消失。

### UI 文案规则

另一侧 preview 现在明确显示：

```text
Revised result preview
Original anchor preview
```

而不是只写 `Switch to revised/original`。

### Memory / LLM 影响

本次仍然只是前端展示逻辑：

```text
不改变 LLM prompt
不改变 SemanticDifferenceMap schema
不改变 ComparisonGraph 持久化
不改变 ContextSnapshot
不改变 main conversation memory
```

### 验证

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

## 2026-07-05 - Semantic Difference Map 默认隐藏 unchanged，改为 Review Queue

### 修改原因

用户指出 Semantic Difference Map 存在一个展示误区：

```text
unchanged 不应该作为主要内容展示。
```

Semantic Difference Map 的主要目标不是完整对齐所有文本，而是帮助用户快速审查：

1. 哪里被修改了。
2. 哪里和用户问题或 annotation 有关。
3. 哪里可能影响 merge。
4. 哪里可能影响 future LLM context。

因此 `unchanged` 应该默认隐藏，只在用户需要检查 preserved context 时单独查看。

### 修改文件

```text
src/components/comparison/SemanticDifferenceMapView.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新默认视图

Layer 2 从：

```text
Focused Difference List
```

进一步改为：

```text
Review Queue
```

默认 filter：

```text
Important Changes
```

默认不显示：

```text
primaryChange = unchanged
low importance + no risk + only context_aligned 的轻微内容
```

### 新增过滤器

Layer 2 顶部新增 review filter：

```text
Important Changes
All Changes
Annotation-linked
Preserved
```

规则：

```text
Important Changes:
  显示非 unchanged，且满足 importance/risk/tag/question/annotation 任一重要条件

All Changes:
  显示所有非 unchanged row

Annotation-linked:
  显示 triggeredBy = annotation 且发生修改的 row

Preserved:
  只显示 primaryChange = unchanged 的 row
```

### 视觉规则

每条 row 现在更像一个 revision review item。

新增优先级 pill：

```text
Review first
Note-linked
Question-linked
Preserved
Review change
```

新增 `Suggested action`：

```text
Review before merge.
Check against the active annotation.
Check whether it answers your local question.
Likely useful support; verify before merge.
No action by default. Use only when you need to verify preserved context.
```

### Memory / LLM 影响

本次修改只改变前端可视化和过滤规则：

```text
不改变 LLM prompt
不改变 SemanticDifferenceMap schema
不改变 ComparisonGraph 持久化
不改变 ContextSnapshot
不改变 main conversation memory
```

`unchanged` 只是默认 UI 隐藏，不是删除，也不是从底层数据移除。

### 验证

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

## 2026-07-05 - Semantic Difference Map 改为宽行单侧切换展示

### 修改原因

用户觉得原来的 Semantic Difference Map 显示不够清晰：

1. Layer 2 使用 Original / Change / Revised 三栏小卡片，文本稍长就被挤压。
2. 很多语义差异需要看完整上下文，小卡片预览不够。
3. 差异颜色主要体现在标签上，用户不容易直接看出当前文本块是新增、删除、改写还是风险变化。
4. 用户希望 Layer 2 可以只显示 Original 或 Revised，并允许手动切换。

### 修改文件

```text
src/components/comparison/SemanticDifferenceMapView.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Layer 1 修改

Layer 1 仍然是 `Difference Overview`，但新增了更明显的总览判断条：

```text
Meaning
Risk
Main Change
Changed Blocks
```

这些信息来自现有 `SemanticDifferenceMap.overview`，不需要新增 LLM schema。

### Layer 2 修改

Layer 2 从：

```text
Original | Change | Revised
```

改为：

```text
Focused Difference List
```

并新增全局视角切换：

```text
Original / Revised
```

当前规则：

1. 默认显示 `Revised` 视角。
2. 用户可以切换到 `Original`。
3. 每条 semantic row 变成一张宽行卡片。
4. 当前视角的文本以大文本块展示。
5. 另一侧不再和当前侧并排挤在一起，只显示一行提示，引导用户切换查看。
6. 行内仍显示 change type、importance、risk、semantic tags。

### 颜色规则

现在文本块本身也会用颜色表达差异：

```text
Original + removed      -> red
Original + changed      -> amber
Revised + added         -> green
Revised + changed       -> blue
High risk               -> red emphasis
Unchanged               -> slate
```

这些颜色只是视觉解释，不改变底层数据和 memory 规则。

### Layer 3 修改

Layer 3 仍然是 `Local Difference Explanation`。

但在大屏幕下，它会和 Layer 2 并排显示为右侧详情区：

```text
Layer 2 wide list | Layer 3 detail panel
```

这样用户点击某条变化后，不需要滚到页面底部才能看解释。

### LLM / Memory 影响

本次修改只改变前端展示：

```text
不改变 SemanticDifferenceMap schema
不改变 LLM 生成 prompt
不改变 ComparisonGraph 持久化
不改变 ContextSnapshot
不改变 main conversation memory
```

Layer 2 使用已有字段：

```text
originalBlock
revisedBlock
primaryChange
importance
risk
semanticTags
shortReason
explanation
```

### 验证

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

## 2026-07-05 - 修复 Thread Navigator 中 Project Rename 的交互 bug

### 修改原因

用户反馈点击 `Rename` 时会出现 bug。

排查后发现 Project rename 旧逻辑有两个容易出错的点：

1. 使用 `window.prompt` 做重命名。在嵌入式浏览器 / dev overlay 环境里，原生 prompt 的交互不够稳定，也不适合后续扩展。
2. `RevisionExplorerPanel` 有一个 effect 监听整个 `projects` 对象。rename 会更新 `projects`，导致 effect 每次都把当前 detail selection 重置成 `main_window`，用户正在查看的版本、thread 或 selection 会被打断。

### 修改文件

```text
src/components/thread/RevisionExplorerPanel.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新交互

`Rename` 不再打开浏览器原生 prompt。

现在点击 `Rename` 后，会在对应 project card 内直接显示：

```text
project name input
Save
Cancel
```

操作规则：

1. `Enter` 保存。
2. `Escape` 取消。
3. `Save` 保存。
4. `Cancel` 取消。
5. 空名字不能保存。
6. 如果名字没有变化，直接退出 rename 模式，不写入 store。

### Selection 保留规则

rename 后不再强制把右侧 detail panel 重置为 `Main Answer Window`。

新的 effect 规则：

1. 如果 selected project 还存在，保留当前 selected item。
2. 只有 selected project 被删除或不存在时，才 fallback 到当前 project 的 `main_window`。
3. 如果当前没有 selected item，才初始化为 selected project 的 `main_window`。

这样用户在查看：

```text
Document Version
Local Revision Thread
Selection Group
Main Conversation
```

时点击 rename，不会被强制跳回主窗口。

### 验证

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

## 2026-07-05 - 修复 Return to This Version 的 active version / timeline / memory 同步

### 修改原因

用户发现：在 Thread Navigator 中点击 `Return to This Version` 返回到 `Document v1` 后，右侧详情仍然显示：

```text
Status: Previous
Stored status: superseded
```

这说明界面虽然触发了返回操作，但底层 revision workspace 的 active 指针没有完整同步。具体问题是：

1. manual edit 生成 `DocumentVersion v2` 后，`activeDocumentVersionId` 更新了，但 `activeTimelineNodeId` 可能仍停留在 v1。
2. `Return to This Version` 旧逻辑直接按 timeline node 调用 revert，没有先确认当前 active document version 和 active timeline node 是否一致。
3. 底部旧版 `VersionTimeline` 与新的 revision timeline 使用的是两套 node id；v1 初始版本通常对应旧 timeline 的 `rootVersionNodeId`，不是 revision timeline 的 `createdFromTimelineNodeId`。
4. 结果是 v1 / v2 的 active 标记、右侧 stored status、后续 LLM context 使用的 active document version 可能不同步。

### 修改文件

```text
src/store/useAnswerAtlasStore.ts
src/components/thread/RevisionExplorerPanel.tsx
src/services/revision/DocumentVersionService.ts
src/services/revision/RevertService.ts
src/__tests__/revision-foundation.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 新增主逻辑

Store 新增：

```text
returnToDocumentVersion(versionId)
```

这个方法现在是 Thread Navigator 中 `Return to This Version` 的正式入口。

执行顺序：

1. 根据 `versionId` 找到目标 `DocumentVersion`。
2. 如果目标版本已经 deleted，或者没有 `createdFromTimelineNodeId`，直接停止。
3. 找到当前 active document version。
4. 如果当前 active document version 对应的 timeline node 与 conversation 的 `activeTimelineNodeId` 不一致，先修复 conversation 的 active timeline 指针。
5. 调用 `revertToNode(targetVersion.createdFromTimelineNodeId)`。
6. `revertToNode` 再根据服务层返回的 active document version 同步主文档内容、visible version node、active path 标记。

### Active DocumentVersion 与 Timeline 指针规则

`DocumentVersionService` 现在在创建或激活文档版本时同时写入：

```text
activeDocumentVersionId
activeTimelineNodeId
```

影响范围：

```text
Project
MainConversation
```

也就是说，生成初始回答、确认 manual edit 后：

```text
Project.activeDocumentVersionId = 新版本 id
Project.activeTimelineNodeId = 新版本对应 timeline node id

MainConversation.activeDocumentVersionId = 新版本 id
MainConversation.activeTimelineNodeId = 新版本对应 timeline node id
```

### Return / Revert 后的 memory 规则

返回某个版本后：

```text
目标 DocumentVersion.status = active
原 active DocumentVersion.status = superseded
MainConversation.activeDocumentVersionId = 目标版本 id
MainConversation.activeTimelineNodeId = 目标版本 timeline node id
Project.activeDocumentVersionId = 目标版本 id
Project.activeTimelineNodeId = 目标版本 timeline node id
```

后续 LLM context builder 会以新的 active document version 为准。

被 revert 掉的未来路径不会删除，而是：

```text
timeline node status = inactive
memoryEffect = excluded_inactive
```

这表示：

1. 历史仍然可以查看。
2. 默认不会进入未来 LLM context。
3. 用户之后仍可以再次 Return / Revert 到这些旧未来节点。

### 从旧版本再回到新版本

`RevertService` 增强了 active path 恢复逻辑：

1. revert 到旧节点时，后续节点会被标为 inactive。
2. 如果用户之后再次 revert / return 到那些 inactive 节点，服务会把目标路径上的节点重新激活。
3. 重新激活的 document version 会恢复为 active，并重新进入后续 context。

因此现在支持：

```text
v2 active
→ return to v1
→ v1 active, v2 inactive/superseded
→ return to v2
→ v2 active, v1 superseded
```

### UI 显示同步规则

新增 `syncVisibleDocumentVersion`，用于把 revision document version 同步到旧 UI 的 visible version timeline。

规则：

1. 如果 `DocumentVersion.createdFromTimelineNodeId` 已存在于旧 `versionNodes`，直接使用它。
2. 如果是 v1 初始版本，优先使用当前 document 的 `rootVersionNodeId`。
3. 如果没有可见节点，则创建一个 legacy `VersionNode`，用于保证底部 timeline 至少能显示 active 状态。
4. 主文档内容会替换为 active document version 的 `content`。
5. `activeVersionNodeId` 会同步到可见 timeline node。

### 修复的用户可见结果

点击 `Return to This Version` 后，Thread Navigator 右侧应该立即显示：

```text
Document v1
Status: Active
Stored status: active
```

如果再点 v2：

```text
Document v2
Status: Active
Stored status: active
```

同时底部 Version Timeline 的 active 标记也会同步变化。

### 测试

新增/补强测试：

```text
manual edit confirmed 后，Project / MainConversation 的 activeTimelineNodeId 必须等于新 DocumentVersion.createdFromTimelineNodeId
revert 到旧版本后，还能再次 revert 回之前的未来版本
恢复未来版本后，ContextSnapshot 包含恢复后的 active document version，并排除 inactive path message
```

验证命令：

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

## 2026-07-05 - Thread Navigator 标签、Thread 操作、Project 管理补全

### 修改原因

用户指出：

1. Revision Outline 下方的 `Main Answer Threads` 标注不清楚，尤其在 0 threads 时像一个莫名其妙的重复分组。
2. Thread 没有清楚的删除 / 丢弃标志，也不能直接从 Thread Navigator 操作。
3. Project 没有重命名入口，也没有删除入口。

### 修改文件

```text
src/components/thread/RevisionExplorerPanel.tsx
src/store/useAnswerAtlasStore.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Thread Navigator 标签修改

`Main Answer Threads` 分组改为：

```text
Local Revision Threads
```

说明语义改为：

```text
selection-based threads
local revision threads created from selected text
```

空状态也改为明确说明：

```text
No local revision threads yet. Select text in an answer and open a local window to create one.
```

筛选按钮中原来的 `Main Answer Thread` 改为：

```text
From Main Answer
```

### Thread 操作补全

Thread detail 中新增：

```text
Discard Thread
Delete Thread
```

规则：

1. `Discard Thread` 会保留 thread 历史，但默认排除在未来 LLM context 之外。
2. `Delete Thread` 会把 thread 的 local answer / messages 标记删除或脱敏，未来永不进入 LLM context。
3. Timeline 历史保留。
4. 对非当前 project 的 thread 操作时，会先切换到对应 project，再执行操作，避免误操作当前 project。
5. 操作前会弹出确认框，并说明作用范围。

### Project 管理补全

Store 新增：

```text
renameProject(projectId, name)
deleteProject(projectId)
```

Thread Navigator 左侧 project card 新增：

```text
Rename
Delete
```

删除规则：

1. 不允许删除最后一个 project。
2. 删除非当前 project：移除该 project card 和保存的 project snapshot。
3. 删除当前 project：切换到另一个 project，并移除被删 project 的当前加载 workspace 数据。
4. 删除 project 不删除磁盘文件。
5. 删除前会弹出确认框，明确说明删除范围。

### Memory 影响

Thread delete / discard 使用既有的 revision action：

```text
object.discard
object.delete
```

所以它们会继续遵守已有 memory 规则：

```text
discarded -> excluded_by_default
deleted -> never_include
```

Project rename 只影响 UI label，不影响 LLM context。

### 验证结果

```text
pnpm typecheck
pnpm test
```

`pnpm test` 普通 sandbox 下仍因 Windows `spawn EPERM` 被拦截；提升权限后通过：5 个 test files，72 个 tests。

## 2026-07-05 - Thread Navigator 问答可视性与 Manual Edit Timeline 节点修复

### 修改原因

用户指出两个问题：

1. Thread Navigator 详情中的 question 和 answer 使用同一种白色框，视觉上很难区分。
2. 在主回答里编辑原本文字并确认保存后，底部 Version Timeline 没有出现新的可见节点。

### 修改文件

```text
src/components/thread/RevisionExplorerPanel.tsx
src/store/useAnswerAtlasStore.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### UI 修改

Thread Navigator 的 thread detail 现在使用不同样式显示最新问答：

```text
Latest Question:
  蓝色 user card
  User 图标

Latest Answer:
  紫色 assistant card
  Bot 图标
```

这样用户在查看 thread 时，可以更快地区分“用户问了什么”和“模型回答了什么”。

### Timeline 修改

底层持久化服务在 manual edit 确认时已经会创建：

```text
document.version.created
document.manual_edited
document.version.activated
```

以及对应的 persistent timeline nodes。

本次修复的是旧版可见底部 `VersionTimeline`：

1. `confirmManualEditDraft` 成功后，会创建一个兼容旧 timeline 的 `VersionNode`。
2. 该节点的 id 使用 persistent manual edit timeline node id。
3. 该节点类型为 `document_revised`。
4. label 显示为 `Edited document vX`。
5. 该节点会加入当前 document 的 version node path，并被设置为 active。

这样底部 Version Timeline 能看到 manual edit 产生的新节点，同时点击该节点 revert 时仍然能走真实 persistent timeline。

### Memory 影响

manual edit 确认后真正进入 future LLM context 的仍然是新的 `DocumentVersion`，不是旧版 UI timeline node。旧版 `VersionNode` 只负责前端可视化兼容。

### 验证结果

```text
pnpm typecheck
pnpm test
```

`pnpm test` 普通 sandbox 下仍因 Windows `spawn EPERM` 被拦截；提升权限后通过：5 个 test files，72 个 tests。

## 2026-07-05 - Revision Explorer Active Version 显示与 Return 修复

### 修改原因

用户在界面中发现：已经 revert 到 v1 后，Document Versions 列表仍然显示 v2 为 Active，v1 显示 Previous；同时用户无法清楚地回到之前未 revert 的 v2。这个问题说明 UI 的 active 标志仍主要依赖 `DocumentVersion.status`，而不是当前 conversation 的 `activeDocumentVersionId`；并且前端 revert 调用里 conversationId 仍有写死默认值的风险。

### 修改文件

```text
src/components/thread/RevisionExplorerPanel.tsx
src/store/useAnswerAtlasStore.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### 修改规则

1. Revision Explorer 中的版本 Active 判断优先使用当前 main conversation 的 `activeDocumentVersionId`。
2. 如果 `activeDocumentVersionId === version.id`，该版本显示为 `Active`。
3. 如果版本对应的 timeline node 已被 revert 标记为 `inactive`，显示为 `Off active path`，而不是误显示为 Active。
4. 非 active、非 deleted、且有 `createdFromTimelineNodeId` 的版本都可以执行 `Return to This Version`。
5. `Return to This Version` 用于从当前 active path 返回到旧版本或之前被 revert 掉的未来版本。
6. `revertToNode` 不再写死 `DEFAULT_MAIN_SESSION_ID`，而是从目标 timeline node 读取 `projectId` 和 `conversationId`。
7. 如果持久化 revert action 没有成功返回新 revision state，前端不会偷偷执行旧的 checkout，避免 UI 假装已经回退。
8. ProjectView 会订阅 `timelineNodes`，revert 后 badge 会重新计算。

### Memory 影响

这次修改没有改变 context builder 的底层 included/excluded 规则，但修正了 UI 与底层 active pointer 的对应关系。之后用户看到的 Active / Off active path 应该和 LLM context 中使用的 active document version 保持一致。

### 验证结果

```text
pnpm typecheck
pnpm test
```

`pnpm test` 在普通 sandbox 下仍因 Windows `spawn EPERM` 被拦截；提升权限后通过：5 个 test files，72 个 tests。

## 2026-07-05 - Revert Active Path 与 Memory 状态修复

### 修改原因

用户指出：revert 之后，active 的标志必须跟着变化；已经被 revert 变成 inactive 的“未来节点”之后仍然应该可以再次 revert 回去；同时所有会影响 LLM context / memory 的地方也要根据新的 active path 更新。

### 修改文件

```text
src/services/revision/TimelineService.ts
src/services/revision/RevertService.ts
src/store/useAnswerAtlasStore.ts
src/components/thread/RevisionExplorerPanel.tsx
src/__tests__/revision-foundation.test.ts
```

### 核心规则

1. Revert 不删除历史，只改变 active path / inactive path / active document version。
2. 当 timeline node 因 revert 被标记 inactive 时，会保存它之前的 status 和 memoryEffect。
3. 当用户之后又 revert 回一个之前 inactive 的节点时，该节点所在 active path 会重新激活。
4. 重新激活后，timeline node 的 memoryEffect 会从 `excluded_inactive` 恢复为原先的 memoryEffect；如果没有旧值，则 document version node 会恢复为 `updates_document_memory`。
5. 同一个 project + conversation 范围内，只有当前目标 DocumentVersion 会是 `active`；其他 active DocumentVersion 会变成 `superseded`。
6. ContextSnapshot 之后读取的 active document version 会跟随 revert 后的 `activeDocumentVersionId`，不会继续使用被 inactive path 排除的版本。
7. Revision Explorer 的 `Revert to This Version` 只使用真实的 `createdFromTimelineNodeId`，不再把 event id 当作 timeline node id。
8. 前端 store 在 revert 后会用持久化 DocumentVersion 同步主文档内容、标题和 active version node，避免 UI active 标志、document 内容、context 三者不一致。

### 验证结果

```text
pnpm typecheck
pnpm test
```

`pnpm test` 在普通 sandbox 下因为 Windows `spawn EPERM` 无法加载 Vitest config；提升权限后通过：5 个 test files，72 个 tests。

## 2026-07-05 - Revision Explorer 三栏重构

### 修改原因

用户指出：之前的 Project Thread Explorer 记录过于杂乱、重复，而且“类似文件夹结构”的意思不是显示文件夹图标，而是要有清楚的层级、简略信息、点击后看详情、能查看旧版本并回到旧版本。

### 修改文件

```text
src/components/thread/RevisionExplorerPanel.tsx
src/components/layout/UtilityPanel.tsx
```

说明：没有删除旧 explorer 文件。workspace 面板现在切换到新的 `RevisionExplorerPanel`。

### 新 UI 结构

新的 Revision Explorer 是三栏：

```text
左栏：Projects
中栏：Revision Outline
右栏：Selected Item Detail
```

左栏用于跨 project 快速切换。

中栏只显示简略结构：

```text
Main Answer Window
  Main Conversation
  Document Versions
    v3 active
    v2 previous
    v1 previous
  Main Answer Threads
    Selection
      Main Answer Thread
        Follow-up Thread
```

右栏显示被选中项的详情。

### 去除文件夹图标

本次不再使用文件夹图标表达层级。层级只通过：

```text
缩进
展开箭头
简短标题
简短 meta
状态小标
```

来表示。

### 简略信息规则

outline 中每一行只显示：

```text
title
meta
status badge（如有）
```

不再把 last question / last answer / memory / related objects 全部塞在节点里。

### 详情面板规则

点击不同节点后，右侧详情面板显示不同内容：

```text
Main Answer Window:
  window title
  document title
  active version
  updated time
  active document preview

Main Conversation:
  message count
  last user question
  last assistant answer
  memory explanation

Document Versions:
  version list
  source type
  created time
  active / previous status

Document Version:
  status
  source
  created time
  version preview
  Revert to This Version

Selection:
  selected source text
  threads from this selection

Thread:
  source text
  last question
  last answer
  status
  memory rule
  related counts
  Open Thread
```

### 版本展示与回退

`Document Versions` 现在是真实版本列表：

```text
v3 active
v2 previous
v1 previous
```

点击版本只会预览，不改变 active document。

回退必须点击：

```text
Revert to This Version
```

按钮逻辑：

```text
如果 version 是 active -> 禁用
如果 version 没有 timeline node -> 禁用
如果 version 可回退 -> 弹出 confirm
确认后 -> revertToNode(version.createdFromTimelineNodeId ?? version.sourceEventId)
```

跨 project 回退时：

```text
switchProject(projectId)
setTimeout(revertToNode)
```

### 标签筛选规则

标签只放在顶部作为全局筛选：

```text
All
Main Answer Thread
Follow-up Thread
Has Notes
Has Branch
Has Merge
Has Comparison
Active
Discarded
Deleted
```

节点内部不再堆标签。

### Memory / Context 影响

Revision Explorer 本身是读取视图：

```text
浏览 project / outline:
  不创建 message
  不创建 DocumentVersion
  不创建 EventLog
  不创建 ContextSnapshot
  不改变 LLM memory

点击版本:
  只预览
  不改变 active version

点击 Revert to This Version:
  才会走 revertToNode
  才会改变 active path / active document version

点击 Open Thread:
  先走 related_thread.open
  再恢复 side thread UI
  不把 local thread 内容加入 main context
```

### 验证记录

```text
pnpm typecheck -> passed
pnpm test -> 5 test files passed, 72 tests passed
```

说明：`pnpm test` 在 sandbox 内仍然遇到 Windows `spawn EPERM`，提权重跑后通过。

服务检查：

```text
http://127.0.0.1:3000/documents/doc-ai-education -> 200
```

## 2026-07-05 - Project Thread Explorer 补充 Main Answer Window 根节点

### 修改原因

用户指出：Project Thread Explorer 只展示了 thread，却少展示了 Main Answer Window 里的主会话和主文档版本。这样会让 `Main Answer Thread` 看起来像凭空出现，而不是从主回答窗口分叉出来。

### 修改文件

```text
src/components/thread/ProjectThreadExplorerPanel.tsx
```

### 新结构

Project Thread Explorer 现在按这个层级展示：

```text
Project
└─ Main Answer Window
   ├─ Main Conversation
   ├─ Document Versions
   └─ Main Answer Threads
      └─ Main Answer Thread
         └─ Follow-up Threads
            └─ Follow-up Thread
```

### Main Answer Window 记录内容

`Main Answer Window` 节点会显示：

```text
window title
document title
active document version
updated time
```

### Main Conversation 记录内容

`Main Conversation` 子文件夹会显示：

```text
main conversation title
main message count
last user question
last assistant answer
```

如果 UI conversation messages 不存在，会尝试从 persistent `revisionMessages` 中恢复 main thread messages。

### Document Versions 记录内容

`Document Versions` 子文件夹会显示：

```text
active DocumentVersion
document version count
active document preview
```

规则说明：

```text
Main context 使用 active DocumentVersion。
旧版本仍可追溯，但默认不是 active document memory。
```

### 空 thread 项目的显示规则

即使 project 还没有任何 local / follow-up thread，也会显示：

```text
Main Answer Window
Main Conversation
Document Versions
Main Answer Threads
```

`Main Answer Threads` 内部会提示没有匹配的 thread，而不是让整个 explorer 变成空白。

### Memory / Context 影响

本次修改只改变可视化层级，不改变 memory。

```text
Main Answer Window:
  读取现有 main conversation / document version
  不创建 message
  不创建 DocumentVersion
  不创建 EventLog
  不改变 ContextSnapshot

Main Answer Threads:
  仍然只是 local / follow-up thread 的导航入口
  打开 thread 不会把 local 内容加入 main context
```

### 验证记录

```text
pnpm typecheck -> passed
pnpm test -> 5 test files passed, 72 tests passed
```

说明：`pnpm test` 在 sandbox 内仍然遇到 Windows `spawn EPERM`，提权重跑后通过。

服务检查：

```text
http://127.0.0.1:3000/documents/doc-ai-education -> 200
```

## 2026-07-05 - Project Thread Explorer / 文件夹式 Thread 导航

### 修改原因

用户反馈：原 Thread Navigator 的标签含义不清楚，不知道标签指的是 thread 类型、状态、memory 还是来源；同时需要一个能在不同 project 之间快速回到之前 thread 的导航栏。

本次修改将右侧 workspace 面板从普通 thread card list 升级为 `Project Thread Explorer`。

### 修改文件

```text
src/components/thread/ProjectThreadExplorerPanel.tsx
src/components/layout/UtilityPanel.tsx
```

说明：没有删除旧 `ThreadNavigatorPanel.tsx`，只是将 workspace 面板切换为新的 explorer 组件。

### 新命名规则

```text
Main Answer Thread
  从主回答选中文字后创建的局部 thread

Follow-up Thread
  从 local / follow-up answer 里继续选中文字后创建的嵌套 thread
```

不再在 UI 上使用 `Main Local Thread` / `Nested Local Thread` 这种偏内部实现的叫法。

### 新 UI 结构

现在 workspace 面板是两栏：

```text
左栏：Projects
  - project name
  - total threads
  - main answer thread count
  - follow-up thread count
  - latest activity

右栏：Project Thread Explorer
  - selected project summary
  - search
  - clickable filter labels
  - collapsible folder tree
```

右侧 thread 树是文件夹式结构：

```text
Main Answer Threads
  └─ Main Answer Thread
      ├─ Source / Status / Memory / Last question / Last answer
      └─ Follow-up Threads
          └─ Follow-up Thread
```

每一层都可以展开 / 收缩。

### 标签语义

标签现在分为两类：

```text
Thread type:
  Main Answer Thread
  Follow-up Thread

State / relation filters:
  Active
  Merged
  Branched
  Noted
  Discarded
  Deleted
  Has Notes
  Has Branch
  Has Merge
  Has Comparison
```

点击标签会切换过滤器，只显示对应类型或对应关系的 thread。

如果过滤结果是 Follow-up Thread，系统会保留 parent thread 作为路径提示，并显示：

```text
Parent path shown for orientation.
```

这样用户既能只看目标类型，又不会丢失这个 follow-up 从哪里来的结构关系。

### Thread 节点详情

每个 thread 展开后显示：

```text
Source:
  Source: Main answer selection
  Source: Follow-up answer fragment

Source version:
  Source version: vX

Memory:
  Memory: local only
  Memory: excluded by default
  Memory: never include
  Memory: merged through DocumentVersion

UI:
  UI: available
  UI: hidden

Conversation:
  Last question
  Last answer

Related:
  messages
  notes
  branches
  merges
  comparisons
```

### 跨 Project 打开 thread 的逻辑

用户可以先在左栏选择任意 project 查看其 thread。

如果点击其他 project 中的 thread：

```text
setSelectedProjectId(projectId)
switchProject(projectId)
executeRevisionAction("related_thread.open", target)
openThread(thread.id)
```

这样用户不需要先手动切 project，再重新找 thread。

### Memory / Context 影响

Project Thread Explorer 是导航视图，不改变 memory。

```text
浏览 project:
  不改变 LLM context
  不创建事件
  不创建 message
  不创建 DocumentVersion

打开 thread:
  先走 related_thread.open action
  memory_effect = none
  只恢复 selectedThreadId / side thread UI
  不把 thread 内容加入 main conversation context

Deleted thread:
  不允许打开
  source text redacted
  不展示删除正文
  永远不进入未来 LLM context
```

### 验证记录

```text
pnpm typecheck -> passed
pnpm test -> 5 test files passed, 72 tests passed
```

说明：`pnpm test` 在 sandbox 内仍然遇到 Windows `spawn EPERM`，提权重跑后通过。

服务检查：

```text
http://127.0.0.1:3000/documents/doc-ai-education -> 200
```

## 2026-07-05 - Thread Navigator / Thread Map 入口

### 修改原因

用户反馈：点击或创建 thread 之后，如果窗口被关闭、最小化、切换，用户很难再知道之前有哪些 thread，也很难重新找到过去的 local conversation。

本次修改不是重做 UI，而是在现有 workspace 右侧工具面板中增加一个可视化 thread navigator，用于把当前 project 下的 local thread / nested local thread 显示成可恢复的结构。

### 修改文件

```text
src/components/thread/ThreadNavigatorPanel.tsx
src/components/layout/UtilityPanel.tsx
src/components/layout/AppHeader.tsx
```

### 新增功能

新增 `ThreadNavigatorPanel`，显示当前 project 的 thread 概览：

```text
Thread Navigator
├─ Total / Active / Hidden / Discarded / Deleted 统计
├─ 搜索框
├─ All / Active / Minimized / Discarded / Deleted 过滤器
└─ Thread cards
   ├─ source selected text preview
   ├─ local / nested local 类型
   ├─ status
   ├─ source document version
   ├─ last local question
   ├─ last local assistant answer
   ├─ message count
   ├─ related note count
   ├─ related branch count
   ├─ related merge count
   └─ related comparison count
```

如果 thread 有 `parentThreadId`，会作为 nested thread 缩进显示在 parent thread 下方。这样用户可以看到：

```text
main selected text
  -> local thread
       -> nested local thread
```

### 顶部入口

在 `AppHeader` 增加 `Thread Navigator` 按钮。用户点击后会打开右侧 Thread Navigator 面板。

### 打开 thread 的逻辑

每个 thread card 右上角有 Open 按钮。点击后先走统一 action layer：

```text
executeRevisionAction("related_thread.open", target)
```

如果 action 没有被 guard 阻止，并且 thread 不是 deleted，则继续调用：

```text
openThread(thread.id)
```

这只恢复 UI 中当前选中的 side thread，不会改变 document memory。

### Memory / Context 影响

Thread Navigator 本身不改变任何 memory。

```text
Open thread:
  memory_effect = none
  不创建 message
  不创建 DocumentVersion
  不创建 Annotation
  不创建 MergeRecord
  不进入 main conversation context

Search / filter:
  纯 UI 查询
  不改变数据库
  不改变 context snapshot

Deleted thread:
  不允许打开
  source text 显示为 redacted
  不显示已删除正文
  不会进入未来 LLM context
```

### Related counts 计算规则

每个 thread 会根据这些 id 聚合相关对象：

```text
thread.id
thread.revisionLocalThreadId
thread.sourceSelectionId
thread.sourceLocalSelectionId
thread.relatedBranchId
```

然后统计 Annotation / RevisionBranch / MergeRecord / ComparisonGraph 的相关数量。deleted 对象不计入普通 related count。

### 验证记录

```text
pnpm typecheck -> passed
pnpm test -> 5 test files passed, 72 tests passed
```

说明：`pnpm test` 在 sandbox 内仍然遇到 Windows `spawn EPERM`，按既有方式提权重跑后通过。

服务检查：

```text
http://127.0.0.1:3000/documents/doc-ai-education -> 200
```

## 2026-07-04：Context Review、LLM 调用记录、本地存储

### 本次修改目标

本次修改根据新的需求，把 Context Preview 的逻辑从“每次 LLM 调用前打扰用户”调整为“每次 LLM 调用时后台保存 context snapshot，用户需要时主动查看”。

也就是说：

- 用户点击 Send 时，系统不会强制弹出 Context Preview。
- 系统仍然会在后台构建本次 LLM 调用使用的 context。
- 系统会保存一份 `ContextSnapshot`，记录本次 LLM 实际看到和没有看到的内容。
- 用户可以通过右下角 `Context Review` 按钮查看最近一次 LLM 调用实际使用的上下文。

### 新增核心对象

新增 `ContextSnapshot`：

- `id`：context snapshot id。
- `llmCallId`：关联的 LLM 调用 id。
- `projectId`：所属 project。
- `callType`：调用类型，例如 main conversation、local window、comparison generation、comparison chat。
- `purpose`：调用目的，例如 general followup、local question、argument comparison。
- `model`：本次调用使用的模型。
- `windowId` / `sessionId` / `threadId` / `comparisonId`：本次调用所属窗口、会话、局部线程或 comparison。
- `includedItems`：本次进入 LLM context 的内容。
- `excludedItems`：本次被排除在 LLM context 外的内容。
- `tokenEstimate`：粗略 token 估算。
- `createdAt`：保存时间。

新增 `LLMCallRecord`：

- `id`：LLM 调用 id。
- `projectId`：所属 project。
- `callType`：调用类型。
- `purpose`：调用目的。
- `model`：调用模型。
- `provider`：openai 或 mock。
- `status`：completed 或 failed。
- `prompt`：本次用户输入。
- `contextSnapshotId`：关联的 context snapshot。
- `outputMessageId` / `outputObjectId`：本次调用生成的消息或对象。
- `createdAt` / `completedAt`：调用时间记录。

### Main Conversation 运行逻辑

用户在主输入框发送问题时：

1. 创建 user message。
2. Context Builder 根据当前 active document version 和 active path 构建 context。
3. 直接调用 LLM，不弹出 Context Preview。
4. LLM 返回后创建 assistant message。
5. 保存 `LLMCallRecord`。
6. 保存 `ContextSnapshot`。
7. 生成新的 document version / timeline node。

普通 local thread、未 merge 的 branch、discarded 内容、deleted 内容、inactive path 内容不会默认进入 main conversation context。

### Local Window 运行逻辑

用户在 local window 里发送局部问题时：

1. 使用 selected text、当前 document excerpt、local thread history、active annotations 构建 local context。
2. 调用 LLM。
3. 保存 local user message 和 local assistant answer。
4. 保存 `LLMCallRecord`。
5. 保存 `ContextSnapshot`。
6. 创建 local answer timeline node。

local window 的普通问答默认只属于 local thread memory，不会自动进入 main conversation memory。

### Comparison 运行逻辑

当 local answer 返回 revisedText 并触发 Semantic Difference Map 时：

1. 系统把 original selected text、revised text、local question、local answer 和相关 context 发送给 comparison LLM。
2. LLM 返回 comparison graph。
3. 系统保存 comparison。
4. 系统保存 comparison generation 的 `LLMCallRecord` 和 `ContextSnapshot`。

用户在 Semantic Difference Map 的 Board chat 中继续提问时：

1. comparison board 会作为本次 chat 的 context。
2. 系统保存 Board chat 的 `LLMCallRecord` 和 `ContextSnapshot`。

### Context Review 面板

右下角按钮从 `Context` 改为 `Context Review`。

面板现在显示：

- 当前 active node。
- 当前如果发送时的 preview item 数量。
- 最近一次实际 LLM 调用使用的 context item 数量。
- 最近一次调用的 model、status、scope、time。
- 最近一次 included context。
- 最近一次 excluded context。

这个面板只在用户主动打开时显示，不会阻塞正常聊天。

### 本地持久化

新增浏览器 localStorage 持久化，key 为：

```text
answer-atlas-workspace-v1
```

当前会持久化：

- projects
- windows
- sessions
- conversationMessages
- documents
- blocks
- anchors
- threads
- local messages
- annotations
- versionNodes
- branches
- comparisons
- snapshots
- tombstones
- contextSnapshots
- llmCallRecords
- selectedModel
- availableModels
- revisionSuggestions

不会持久化：

- 正在生成中的 loading 状态
- diff 弹窗打开状态
- pendingPatch
- 当前临时 Context Preview
- UI 临时展开状态

### Memory 影响说明

本次修改没有把所有 memory scope 规则一次性重写成数据库系统，但已经为后续规则打下基础。

当前新增的关键保证是：

- 每次真实 LLM 调用都有记录。
- 每次真实 LLM 调用都能追溯当时使用了哪些 context。
- deleted / discarded / inactive path 的排除原因会通过 Context Builder 记录在 excluded items 中。
- 用户不需要每次发送前被 Context Preview 打断。

### 后续仍需实现

后续还需要继续补：

- 完整 Event Log。
- 完整 TimelineNode 事件类型。
- Direct Edit 正式版本化。
- Selective Merge。
- LocalSelection 对象。
- Restore / Re-anchor / Pin to Context。
- Comparison clear 与 delete 的区分。
- 按钮行为表在代码层面的完整落地。

## 2026-07-04：Phase 1 Persistent Revision Foundation

### 本次修改目标

本次修改实现 Answer Atlas 的第一阶段持久化 revision foundation。

本阶段不重设计 UI，也不实现完整 Local Window merge 行为。重点是把现有 main conversation 的发送流程接入底层 revision system：

- Event Log
- Timeline Graph
- Scoped Memory
- Context Snapshot
- LLM Call Record
- Read APIs

### 当前数据库 / migration 状态

当前项目没有 Prisma、Drizzle、SQLite、PostgreSQL 或 migration setup。

所以本阶段采用兼容当前架构的方案：

- 前端 Zustand store 继续作为当前 UI 状态来源。
- localStorage 继续作为 MVP 持久化。
- 新增 revision services 作为未来数据库层的抽象。
- 新增 in-memory `revisionRepository` 给 read APIs 使用。
- 前端在 main Send 后通过 `/api/revision/sync` 把 revision records 同步给 server-side read APIs。

后续如果接真实数据库，可以把 `revisionRepository` 替换为数据库 adapter。

### 新增类型模型

新增 `src/types/revision.ts`，定义以下模型：

- `ProjectModel`
- `MainConversationModel`
- `MessageModel`
- `DocumentVersionModel`
- `TextSelectionModel`
- `LocalThreadModel`
- `LocalSelectionModel`
- `AnnotationModel`
- `RevisionBranchModel`
- `MergeRecordModel`
- `ComparisonGraphModel`
- `EventLogRecord`
- `RevisionTimelineNode`
- `RevisionTimelineEdge`
- `RevisionRepositoryState`

同时保留并扩展已有：

- `LLMCallRecord`
- `ContextSnapshot`

`LLMCallRecord.status` 现在支持：

```text
started
completed
failed
```

这样可以先记录调用开始，再在 LLM 返回后更新为 completed。

### 新增共享枚举 / 常量

新增这些共享常量：

- `REVISION_EVENT_TYPES`
- `OBJECT_STATUSES`
- `MEMORY_SCOPES`
- `MEMORY_EFFECTS`
- `THREAD_TYPES`
- `MERGE_MODES`
- `TIMELINE_EDGE_TYPES`

这些用于统一按钮行为、事件类型、memory scope、timeline edge 类型。

### EventService

新增 `src/services/revision/EventService.ts`。

实现：

- `createEvent`
- `createEventWithTimelineNode`
- `getEventsForObject`
- `getEventsForProject`

规则：

- Event 是 immutable。
- 如果相同 event id 已存在，服务会返回已有 event，不覆盖原 event。
- Event 可以单独创建，也可以和 timeline node 一起创建。

### TimelineService

新增 `src/services/revision/TimelineService.ts`。

实现：

- `createTimelineNode`
- `createTimelineEdge`
- `getProjectTimelineGraph`
- `getTimelineForObject`
- `getLatestTimelineNodeForConversation`

当前 main conversation 中：

- user message 创建一个 timeline node。
- assistant answer 创建一个 timeline node。
- user message node 与 assistant answer node 之间创建 `sequence` edge。
- 如果当前 conversation 已经有旧 node，新 user node 会接到旧 node 后面。

### ContextSnapshotService

新增 `src/services/revision/ContextSnapshotService.ts`。

实现：

- `buildContextSnapshot`
- `saveContextSnapshot`
- `getContextSnapshot`
- `createStartedLLMCall`

当前简单 context builder 规则：

默认 include：

- active document version
- recent active main conversation messages
- active project/document annotations

默认 exclude：

- deleted objects
- discarded objects
- inactive timeline nodes
- unmerged local threads
- unmerged branches

deleted memory 永远不会进入未来 context snapshot。

discarded memory 会保留，但默认排除。

### Main Conversation Send Flow

主对话发送现在接入 `MainConversationRevisionService`。

用户点击 Send 后：

1. 创建 UI 层 user conversation message。
2. 创建 revision `MessageModel`。
3. 创建 `message.user.created` EventLog。
4. 创建 user message TimelineNode。
5. 构建并保存 ContextSnapshot。
6. 创建 `context_snapshot.created` EventLog。
7. 创建 `LLMCallRecord`，状态为 `started`。
8. 创建 `llm.call.started` EventLog。
9. 调用 LLM。
10. 保存 UI 层 assistant message。
11. 创建 revision assistant `MessageModel`。
12. 更新 LLMCallRecord 为 `completed`。
13. 创建 `llm.call.completed` EventLog。
14. 创建 `message.assistant.created` EventLog。
15. 创建 assistant answer TimelineNode。
16. 创建 user -> assistant TimelineEdge。
17. 创建新的 `DocumentVersionModel`。
18. 同步 revision records 到 `/api/revision/sync`。

### 新增 Read APIs

新增 API：

```text
GET /api/revision/projects/[projectId]/timeline
```

返回 project timeline graph。

```text
GET /api/revision/events?projectId=...
GET /api/revision/events?objectType=...&objectId=...
```

读取 project events 或 object events。

```text
GET /api/revision/llm-calls/[llmCallId]/context-snapshot
```

读取某次 LLM call 对应的 context snapshot。

```text
GET /api/revision/selections/[selectionId]/related
```

读取 selection 相关对象占位，包括 local threads、annotations、branches、merge records、comparison graphs、events。

新增内部 sync API：

```text
POST /api/revision/sync
```

用于当前 MVP 把前端 revision records 同步给 server-side in-memory repository。

### Discard / Delete Context Rule 修改

本次修改把 discarded 的默认规则改为：

```text
discarded 内容保留，但默认不进入未来 LLM context
```

修改位置：

- `discardThread`
- `canIncludeMessageInContext`
- `buildContextForLLM`

因此 discarded thread 的 messages 会：

- 保留内容
- status 变为 discarded
- visibility 变 hidden
- contextPolicy 变 exclude
- includeInContext 变 false

deleted 内容仍然：

- 永远不进入未来 LLM context
- 正文清空或 tombstone
- contextPolicy 为 exclude

### 测试

新增 `src/__tests__/revision-foundation.test.ts`。

覆盖：

- sending a main message creates user message, assistant message, events, timeline nodes, LLM call record, context snapshot
- deleted objects are excluded from context snapshot
- discarded objects are excluded by default
- unmerged branches are excluded by default
- timeline nodes preserve parent-child relationship
- LLMCallRecord stores model and contextSnapshotId

同时更新旧 context test，使 discarded answers 默认排除。

验证结果：

```text
pnpm typecheck
```

通过。

```text
pnpm test
```

通过：2 个测试文件，14 个测试。
## 2026-07-04：Phase 1 验收字段对齐

### Timeline Edge 命名

新的 main conversation timeline edge 现在统一写入为：

```text
edge_type = sequence
```

为了兼容旧的本地缓存或旧记录，内部类型仍然允许历史值：

```text
chronological
```

但是 `GET /api/revision/projects/[projectId]/timeline` 返回给前端和验收检查时，会把历史 `chronological` 标准化显示为：

```text
sequence
```

### Assistant Timeline Node 的 LLM 追溯字段

assistant answer 对应的 timeline node 现在会在 `payload` 中保存：

```json
{
  "llm_call_id": "...",
  "context_snapshot_id": "..."
}
```

因此一个 assistant answer 可以追溯到：

- 它使用的 LLM call record
- 它调用前保存的 context snapshot
- 它所属的 main conversation / thread
- 它生成的 assistant message

### Timeline Graph API 输出格式

新增 `src/services/revision/timelineApiShape.ts`。

这个文件负责把内部 timeline graph 转换成验收更容易读的 snake_case 结构。

返回节点至少包含：

```json
{
  "event_type": "message.assistant.created",
  "target_object_type": "message",
  "memory_scope": "conversation",
  "llm_call_id": "...",
  "context_snapshot_id": "..."
}
```

返回边至少包含：

```json
{
  "edge_type": "sequence",
  "from_node_id": "...",
  "to_node_id": "..."
}
```

### 本次验证

本次补充测试覆盖：

- main message 发送后有 user message / assistant message
- 有 context snapshot
- 有 LLM call record
- 有 event log entries
- 有 timeline nodes
- 有 timeline edge
- assistant timeline node 能查到 `llm_call_id`
- assistant timeline node 能查到 `context_snapshot_id`
- timeline graph API shape 返回 `event_type / target_object_type / memory_scope / edge_type / from_node_id / to_node_id`

验证命令：

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
2 test files passed
15 tests passed
```

## 2026-07-05：Phase 9 统一 Action Layer 与安全规则补强

### 本次修改目标

本次不是重做 UI，而是把现有按钮背后的数据变更路径继续收敛到统一 action layer。
目标是让按钮不再各自绕过规则直接改持久 revision state，而是尽量经过：

```text
executeRevisionAction(actionId, payload)
→ executeWorkspaceAction(actionId, payload)
→ ActionGuardService
→ WorkspaceActionExecutor
→ EventLog / TimelineNode / ContextSnapshot / LLMCallRecord
```

### 新增 / 调整的 action 与事件

1. 新增 `message.regenerated` event type。
   - `message.regenerate` action 成功后不再只使用旧名 `answer.regenerated`。
   - 旧名 `answer.regenerated` 暂时保留，避免破坏旧数据兼容。

2. 新增 `branch.updated` event type。
   - 这是最终 logic line 要覆盖的事件名之一，本次先补齐常量。

3. 新增 `merge.cancel` workspace action。
   - target: `merge_record`
   - allowed status: `pending`, `diff_ready`, `conflict`
   - success event: `merge.cancelled`
   - memory effect: `excluded_by_default`
   - 用于替代 UI cancel merge 直接调用 `MergeService.cancelMerge`。

### Regenerate Answer 的新规则

`message.regenerate` 现在会真正执行持久 revision 行为：

```text
旧 assistant message.status = superseded
旧 assistant message.includeInContext = false
新 assistant message.status = active
新 assistant message.payload.regeneratedFromMessageId = old_message_id
```

同时会生成：

```text
ContextSnapshot
LLMCallRecord(status = completed, outputMessageId = new_message_id)
EventLog: context_snapshot.created
EventLog: llm.call.started
EventLog: llm.call.completed
EventLog: message.regenerated
TimelineNode: message.regenerated
TimelineEdge: old message node -> new message node, edge_type = supersede
```

因此 regenerate 不会覆盖旧回答，旧回答仍可查，但默认不进入 future context。

### Deleted Memory 的 Context Review 规则

修复 `context.review` 的 redaction 判断。

以前只在 reason 完全等于：

```text
deleted_memory_never_included
```

时清空正文。

现在只要 reason 中包含：

```text
deleted_memory_never_included
```

就会：

```text
includedItems 中删除该 item
excludedItems 中保留记录但 text = ""
```

这保证 deleted memory 不会通过 Context Review 泄露正文。

### Store Wrapper 的 action-backed 改造

以下旧 store 方法现在会先走 action layer，再保留必要的旧 UI 状态同步：

```text
deleteThreadMessage
deleteAnnotation
addAnnotation
keepAsNote
createBranch
openMergeModalForSource
setManualMergeTarget
requestMergeFromSelection
confirmMerge
cancelActiveMerge
discardThread
deleteAnswer
revertToNode
createManualEditDraft
previewManualEditDraftDiff
confirmManualEditDraft
cancelManualEditDraft
```

重要说明：

```text
Close / Minimize 仍然只改 UI state
不会 discard
不会 delete
不会改 timeline
不会改 memory
```

显式的 Discard / Delete 按钮才会触发 `object.discard` / `object.delete`。

### Merge 的确认规则

Merge 现在继续遵守：

```text
source local fragment / local answer / branch
→ merge.into_document
→ MergeRecord pending/diff_ready
→ DiffReview
→ confirm
→ DocumentVersion
```

`confirmMerge` 不再直接调用 `MergeService.confirmMerge`，而是调用：

```text
executeRevisionAction("merge.into_document", {
  target: { objectType: "merge_record", ... },
  confirmed: true,
  diffAccepted: true
})
```

这样可以保证 action guard、event log、timeline 和 memory effect 都在同一层处理。

### Manual Edit 的确认规则

主文档手动编辑相关方法现在走 document action：

```text
document.edit
document.preview_diff
document.confirm_edit
document.cancel_edit
```

确认保存后仍会同步旧 UI 的 `documents[currentDocumentId].rawText`，让页面立即显示新的 active document version 内容。

### 本次验证

执行命令：

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
3 test files passed
61 tests passed
```

新增测试覆盖：

```text
message.regenerate 会 supersede 旧 answer，并创建 supersede timeline edge
message.regenerate 会创建 context snapshot / llm call started / llm call completed / message.regenerated
context.review 会清空 deleted_memory_never_included 的正文
```

### 当前仍需注意

这次已经把关键 store wrapper 接入 action layer，但代码里仍然保留旧 UI 状态结构，用于兼容当前界面。
后续如果继续严格化，可以再做一轮 UI 层审计，把所有 `onClick` 统一改成更显式的：

```text
executeRevisionAction(actionId, payload)
```

而不是通过兼容 wrapper 间接调用。

## 2026-07-04：Phase 8 二次验收补齐

### 本次补齐目标

这次根据 Phase 8 验收标准，补齐 Semantic Comparison Graph 的持久化细节、context 规则、timeline payload 字段，以及前端 comparison 菜单的最小可点击闭环。

### 数据与运行逻辑

- 生成 comparison 时，底层会创建 `ComparisonGraph`、`ComparisonRun`、`LLMCallRecord`、`ContextSnapshot`、`EventLog`、`TimelineNode` 和 `TimelineEdge`。
- `comparison.created` 节点记录 graph 的 source objects、source hashes、scope、model、memory scope 和 graph/run 关系。
- `comparison.generated` 节点记录 active run、LLM call、context snapshot、graph node/edge count、summary hash、source hashes。
- Regenerate 会创建新的 `ComparisonRun`，旧 run 标记为 `superseded`，并创建 `supersede` timeline edge；旧 run 不删除。
- Clear comparison 只把当前 comparison 从 UI 视图清掉，`ComparisonGraph` 和 `ComparisonRun` 保留，后续默认 context 不包含它。
- Delete comparison 会把 `ComparisonGraph.status` 标记为 `deleted`，清空 graph nodes/edges/summary 的可见内容，并设置 redaction policy；之后任何 LLM context 都不能包含它。
- Export map 会创建 `ComparisonExport`、`comparison.exported` event、timeline node，以及 `comparison run -> export` 的 `export` edge。Export 本身不进入 LLM context。

### Memory / Context 规则

- Main Conversation 默认不包含 comparison，排除 reason 为 `comparison_not_active_or_pinned`。
- 如果 comparison 已删除，排除 reason 为 `deleted_memory_never_included`。
- ComparisonPanel 内提问时，ContextSnapshot 会包含 active comparison run、source objects、comparison summary 和必要 graph data，reason 为 `active_comparison_panel_context`。
- Export 只作为导出记录保存，不作为未来 LLM 调用的 memory。

### 前端最小接线

- `Semantic Difference Map` 右上角 More 菜单现在接入：
  - Regenerate comparison
  - Export map
  - Clear comparison
  - Delete comparison
- Delete comparison 有确认弹窗。确认后只标记 comparison graph 为 deleted，不删除历史 event/timeline 记录。
- Clear comparison 后当前旧 UI comparison 会隐藏，但底层 graph/run 仍保留。

### 主要修改文件

- `src/services/revision/ComparisonService.ts`
- `src/services/revision/ContextSnapshotService.ts`
- `src/store/useAnswerAtlasStore.ts`
- `src/components/comparison/ArgumentEvidenceComparison.tsx`
- `src/lib/comparison/buildArgumentComparison.ts`
- `src/__tests__/revision-foundation.test.ts`

### 验证记录

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
2 test files passed
47 tests passed
```

## 2026-07-05：Phase 9 Action Layer / Button Guard / Idempotency 收口

### 本次目标

Phase 9 的核心不是继续新增大产品概念，而是把之前 Phase 1-8 已经做出来的 revision workspace 能力收束到统一动作层：

- 所有重要 mutation action 都有统一 action definition。
- 按钮是否可点不再靠组件自己猜，而是通过 `ButtonStateResolver`。
- 动作执行不直接从 UI 改业务状态，而是通过 `executeWorkspaceAction`。
- Delete / Discard / Merge / Revert / Confirm Edit 等危险动作有 confirmation / diff-required 流程。
- 重复 confirm 类动作有 idempotency 记录，避免重复创建数据。
- action 执行失败时返回 structured error，并保持 rollback，不留下半截状态。

### 新增 Action Registry

新增：

```text
src/services/revision/WorkspaceActionRegistry.ts
src/types/workspaceActions.ts
```

已注册 action：

```text
message.send
message.regenerate
revise.open
branch.create
note.open_editor
annotation.add_context_note
annotation.keep_as_note
merge.into_document
object.discard
object.delete
object.restore
window.minimize
window.close
thread.new
project.new
context.preview
context.review
comparison.regenerate
comparison.clear
map.export
timeline.revert_to_node
diff.view
related_thread.open
document.edit
document.preview_diff
document.confirm_edit
document.cancel_edit
```

每个 action 都记录：

```text
action_id
label
target_object_types
required_permissions
allowed_statuses
blocked_statuses
requires_confirmation
requires_diff_review
mutates_data
creates_event
creates_timeline_node
memory_effect
service_handler
success_event_type
failure_event_type
timeline_event_type
```

同时新增 `ACTION_TIMELINE_MAPPINGS`，统一定义 action 对应的：

```text
event_type
target_object_type
memory_scope
memory_effect
default_edge_type
display_policy
```

### 新增 Guard / Button State

新增：

```text
src/services/revision/ActionGuardService.ts
src/services/revision/ButtonStateResolver.ts
```

Guard 现在会检查：

- action 是否存在
- target 是否存在
- target type 是否符合 action
- user 是否有权限
- target status 是否 allowed / blocked
- deleted content 不能被读取型 action 使用
- discarded object 不能 merge / regenerate / branch / keep as note，必须先 restore
- inactive object 默认进入 history mode，不允许直接 mutation
- parent selection / local selection / local thread deleted 时，子对象 action 会被挡住
- project / conversation 必须 active
- 需要 active document version 的 action 会检查 active DocumentVersion
- 需要 active timeline path 的 action 预留检查入口

ButtonStateResolver 返回：

```ts
{
  visible,
  enabled,
  disabledReason,
  requiresConfirmation,
  requiresDiffReview,
  badge
}
```

### 新增 Unified Executor

新增：

```text
src/services/revision/WorkspaceActionExecutor.ts
```

执行流程：

1. 读取 action definition。
2. 读取 target。
3. 通过 ActionGuardService。
4. 如需 confirmation 且未 confirmed，返回 `confirmation_required`。
5. 如需 diff 且未 accepted，调用已有服务创建 proposal / diff，返回 `diff_required`。
6. mutation action 进入统一执行路径。
7. 调用已有 Phase 1-8 service handler。
8. 复用已有 service 生成 EventLog / TimelineNode。
9. 成功后写入 idempotency completed record。
10. 失败时返回 structured error，并 rollback 到原 state。

### Idempotency

新增 revision state 字段：

```text
actionIdempotencyRecords
```

每条记录包含：

```text
idempotency_key
project_id
conversation_id
action_id
target_object_type
target_object_id
status
result_reference
created_at
updated_at
```

当前支持重复执行保护：

- message.send
- merge.into_document
- document.confirm_edit
- object.delete
- object.restore
- timeline.revert_to_node
- comparison.regenerate
- map.export

重复成功请求会返回 previous result，不再重复创建 message / run / export / document version。

### 新增可复用 UI Flow

新增：

```text
src/components/actions/ConfirmationModal.tsx
src/components/actions/DiffRequiredFlow.tsx
```

ConfirmationModal 支持：

- title
- body
- risk level
- target object preview
- memory consequence
- confirm label
- cancel label

DiffRequiredFlow 支持：

- Confirm
- Continue Editing / Choose Target
- Cancel

### 已接入的 UI

`Semantic Difference Map` 的 More 菜单已迁移到 action layer：

- Regenerate comparison -> `executeWorkspaceAction("comparison.regenerate")`
- Clear comparison -> `executeWorkspaceAction("comparison.clear")`
- Export map -> `executeWorkspaceAction("map.export")`
- Delete comparison -> `executeWorkspaceAction("object.delete")` + reusable `ConfirmationModal`

这些按钮现在通过 `ButtonStateResolver` 判断 enabled / disabled reason。

### Context / Memory 规则

Phase 9 没重写 ContextSnapshotService，但 action guard 和 executor 强制了状态边界：

- deleted memory 不能作为读取型 action 的内容来源。
- discarded memory 默认不能 merge / regenerate / branch / keep as note。
- inactive object mutation 会被阻止，并提示 history mode。
- pending merge 只有 diff/confirm flow 能继续进入 document memory。
- comparison 默认不会污染 main conversation memory，只有 comparison panel action 可以读取 active comparison context。
- context review 读取 snapshot 时会对 `deleted_memory_never_included` 项清空正文。

### 验证测试

新增：

```text
src/__tests__/workspace-actions.test.ts
```

覆盖内容：

- registry / timeline mapping
- main send 持久化 message / LLMCallRecord / ContextSnapshot / EventLog / TimelineNode
- local send 保持 local memory scope
- revise.open 创建 / 恢复 local 和 nested local thread
- branch.create 不进入 document memory
- keep as note 创建 Annotation
- merge 先 confirmation，再 diff_required，确认后才创建 DocumentVersion
- discard / restore / delete 的 memory policy
- comparison regenerate / export / clear 保留历史
- context preview / window minimize read-only
- idempotency 防重复创建
- invalid action 被 guard 阻止并给出明确原因

验证命令：

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
3 test files passed
59 tests passed
```

## 2026-07-04: Phase 7 Persistent State / Revert / Active Path Foundation

### 本次目标

Phase 7 的目标不是重做 UI，而是补齐 Answer Atlas 持久修订系统的状态层：

- Discard：保留对象，但默认不再进入 LLM context。
- Delete：对象进入 tombstone / deleted 状态，未来永远不能进入 LLM context。
- Restore：只允许恢复 discarded 对象；deleted 对象不能走普通恢复流程。
- Revert：可以回退到某个 timeline node，并把该节点之后的当前 active path 节点标为 inactive。
- Active Path：项目/会话记录当前 active timeline node 与 active timeline path。
- Context Snapshot：根据对象状态解释 included / excluded 的原因。

### 新增 / 扩展的数据结构

在 `src/types/revision.ts` 中扩展：

- `OBJECT_STATUSES`
  - 新增 `failed`
  - 新增 `active_marker`
  - 保留 `active`, `inactive`, `discarded`, `deleted`, `superseded`, `pending`, `merged`, `cancelled`, `conflict` 等状态。

- `REVISION_EVENT_TYPES`
  - 新增 `object.discarded`
  - 新增 `timeline.reverted`
  - 新增 `timeline.active_path_changed`
  - 新增 `timeline.node_marked_inactive`
  - 新增 `timeline.continuation_path_created`

- `MEMORY_SCOPES`
  - 新增 `timeline`

- `MEMORY_EFFECTS`
  - 新增 `restored_to_scope`
  - 新增 `adds_to_context`
  - 新增 `changes_active_path`

- `ProjectModel`
  - 新增 `activeTimelineNodeId`
  - 新增 `activeTimelinePathId`

- `MainConversationModel`
  - 新增 `activeTimelinePathId`

新增模型：

- `ObjectStateTransitionModel`
  - 记录 object 从哪个 status 变到哪个 status。
  - 记录 reason、actor、event_id、timeline_node_id、metadata。

- `TimelinePathModel`
  - 记录一条 active / inactive 的 timeline path。
  - 用于 revert 后继续从旧节点分叉。

- `RevertRecordModel`
  - 记录一次 revert 从哪个 node 回到哪个 node。
  - 记录 active document version before / after。
  - 记录 affected / inactive node ids。

新增 repository tables：

- `objectStateTransitions`
- `timelinePaths`
- `revertRecords`

这些表已经加入：

- `createEmptyRevisionState`
- `revisionRepository.mergeState`
- `useAnswerAtlasStore`
- project snapshot persist / restore

### ObjectStateService

新增文件：

```text
src/services/revision/ObjectStateService.ts
```

提供：

- `discardObject`
- `deleteObject`
- `restoreObject`
- `getObjectStatus`
- `assertObjectCanEnterContext`

#### discardObject 逻辑

适用对象：

- message
- document_version，active document version 不允许直接 discard
- text_selection
- local_thread
- local_selection
- annotation
- revision_branch
- merge_record
- comparison_graph
- timeline_node

执行后：

- object.status = `discarded`
- includeInContext = false，如果对象有该字段
- memoryPolicy = `excluded_by_default`，如果对象有该字段
- memoryScope = `discarded`
- memoryEffect = `excluded_by_default`
- 写入 `ObjectStateTransition`
- 写入 EventLog
- 写入 TimelineNode

annotation 使用事件：

```text
annotation.discarded
```

merge 使用事件：

```text
merge.discarded
```

local_thread 使用事件：

```text
thread.discarded
```

其他对象使用：

```text
object.discarded
```

#### deleteObject 逻辑

必须传入：

```text
confirmed = true
```

否则抛错，避免误删。

执行后：

- object.status = `deleted`
- includeInContext = false
- memoryPolicy = `never_include`
- memoryScope = `deleted`
- memoryEffect = `permanently_excluded`
- payload 记录 `redaction_policy = hide_full_content_from_context_review`
- 写入 `ObjectStateTransition`
- 写入 EventLog
- 写入 TimelineNode

deleted 对象的完整内容不会出现在 ContextSnapshot 的 excluded item text 中。

#### restoreObject 逻辑

只允许：

```text
discarded -> active
```

对于 `merge_record`，恢复为：

```text
discarded -> pending
```

不允许：

```text
deleted -> active
```

如果 parent selection / parent local selection 已经 deleted，也不允许恢复依赖它的对象。

恢复后：

- includeInContext = true
- memoryPolicy = `auto_by_scope`
- memoryEffect = `restored_to_scope`
- 写入 `ObjectStateTransition`
- 写入 EventLog
- 写入 TimelineNode

### TimelineService 扩展

扩展文件：

```text
src/services/revision/TimelineService.ts
```

新增：

- `getActivePath`
- `getActivePathNodes`
- `getActiveTimelineNode`
- `getAncestors`
- `getDescendants`
- `getNearestDocumentVersionForNode`
- `getNodesAfterTargetOnCurrentActivePath`
- `markNodesInactive`
- `createContinuationPathFromNode`
- `setActiveNode`
- `setActivePath`

#### active path 规则

优先读取：

```text
conversation.activeTimelinePathId
```

其次读取：

```text
project.activeTimelinePathId
```

如果没有 path，则使用当前 conversation / project 的 active timeline node 回溯 ancestors。

#### nearest document version 规则

从目标 node 开始向祖先节点查找：

1. `payload.document_version_after_id`
2. `payload.result_document_version_id`
3. 如果节点本身 `targetObjectType = document_version`，使用 `targetObjectId`

第一个未 deleted 的 DocumentVersion 即为目标 node 对应的 document memory。

### RevertService

新增文件：

```text
src/services/revision/RevertService.ts
```

提供：

- `previewRevert`
- `confirmRevert`

#### previewRevert

只读，不修改 state。

会计算：

- target node
- current active node
- previous active document version
- new active document version
- target 之后当前 active path 上会被 inactive 的 node ids
- document diff
- context changes

如果 target node 不存在、已 deleted、或已经是 active node，则抛错。

#### confirmRevert

执行后：

- target node 成为 activeTimelineNode
- 创建新的 TimelinePath
- project / conversation 记录 activeTimelinePathId
- project / conversation 记录 activeTimelineNodeId
- project / conversation 记录 activeDocumentVersionId
- target 之后当前 active path 上的节点改为 `inactive`
- 写入 `RevertRecord`
- 写入 `timeline.reverted`
- 写入 `timeline.active_path_changed`
- 写入 `timeline.continuation_path_created`
- 为被 inactive 的节点写入 `timeline.node_marked_inactive`
- 创建 revert edge：

```text
previous active node --revert--> target node
```

注意：

- Revert marker node 只是记录“发生了 revert”。
- 真正的 active node 是 target node。
- 旧 future history 不删除，只变成 inactive，因此仍然可追溯。

### Main Conversation Send Flow 调整

文件：

```text
src/services/revision/MainConversationRevisionService.ts
```

调整点：

1. 用户发送消息时，parent node 优先使用 `activeTimelineNodeId`，而不是简单使用最新 timeline node。
2. 如果当前存在 active TimelinePath，新 user node 使用：

```text
edgeType = continuation
```

3. 发送后更新：

```text
project.activeTimelineNodeId
conversation.activeTimelineNodeId
timelinePath.headNodeId
```

4. assistant answer / document version 生成后，也会更新 active node。
5. 如果本次 assistant answer 创建了新的 DocumentVersion，则 active node 优先更新为 DocumentVersion 的 timeline node。
6. 回退后继续提问时，新消息会从 revert target node 继续，而不是接到被 inactive 的旧末尾。
7. 构建 main context 时，如果存在 active path，只把 active path 上的 message 加入 recent messages。

### Context Snapshot 状态排除规则

文件：

```text
src/services/revision/ContextSnapshotService.ts
src/services/revision/LocalThreadMessageService.ts
```

新增统一状态原因：

- `deleted` -> `because deleted_memory_never_included`
- `discarded` -> `because discarded_excluded_by_default`
- `inactive` -> `because inactive_path_excluded`
- `superseded` -> `because superseded_answer_excluded`
- `pending` -> `because pending_proposal_not_confirmed`
- `cancelled` -> `because cancelled_object_excluded`
- `failed` -> `because failed_generation_excluded`
- `conflict` -> `because conflict_not_resolved`

为了兼容 Phase 4/6 的旧验收：

- annotation discarded 仍保留 `because discarded_note_excluded_by_default`
- merge pending 仍保留 `because pending_merge_not_confirmed`

但是 Phase 7 的通用状态原因也会出现在 Context Review 中。

### 新增 API

新增 route：

```text
POST /api/revision/objects/discard
POST /api/revision/objects/delete
POST /api/revision/objects/restore
POST /api/revision/revert/preview
POST /api/revision/revert/confirm
```

#### discard body

```json
{
  "object_type": "annotation",
  "object_id": "...",
  "reason": "..."
}
```

#### delete body

```json
{
  "object_type": "annotation",
  "object_id": "...",
  "reason": "...",
  "confirmed": true
}
```

#### restore body

```json
{
  "object_type": "annotation",
  "object_id": "...",
  "reason": "..."
}
```

#### revert preview / confirm body

```json
{
  "project_id": "project-1",
  "conversation_id": "conversation-1",
  "target_node_id": "timeline-node-id"
}
```

### Timeline API 输出扩展

文件：

```text
src/services/revision/timelineApiShape.ts
```

Timeline graph node 额外返回：

- `active_path_id`
- `previous_status`
- `new_status`
- `revert_id`
- `state_transition_id`

Timeline graph edge 额外返回：

- `memory_effect`
- `revert_id`
- `state_transition_id`

### 测试记录

扩展：

```text
src/__tests__/revision-foundation.test.ts
```

新增 Phase 7 测试覆盖：

1. `discardObject(annotation)`
   - annotation status -> discarded
   - memoryPolicy -> excluded_by_default
   - includeInContext -> false
   - 写入 ObjectStateTransition
   - 写入 annotation.discarded event
   - ContextSnapshot 排除 note，reason 包含 `discarded_excluded_by_default`

2. `restoreObject(annotation)`
   - annotation status -> active
   - includeInContext -> true
   - main context 按 scope 包含该 note

3. `deleteObject(annotation)`
   - 必须 confirmed
   - annotation status -> deleted
   - memoryPolicy -> never_include
   - includeInContext -> false
   - ContextSnapshot 排除 note，text 为空
   - 普通 restore deleted object 会抛错

4. `previewRevert`
   - 不修改原 state
   - 能计算目标 document version
   - 能计算 target 后面需要 inactive 的 node ids

5. `confirmRevert`
   - 写入 RevertRecord
   - activeTimelineNodeId 更新为 target node
   - activeDocumentVersionId 更新为 target node 对应 DocumentVersion
   - target 后面的节点 status -> inactive
   - 写入 timeline.reverted
   - 写入 timeline.active_path_changed
   - 写入 timeline.continuation_path_created
   - 创建 revert edge

6. revert 后继续发送 main message
   - 新 user message 的 edgeType = continuation
   - sourceNodeId = revert target node
   - 被 inactive 的旧消息不会进入 included context
   - inactive timeline node 出现在 excluded context，reason = `because inactive_path_excluded`

### 验证命令

```text
pnpm typecheck
pnpm test
```

### 验证结果

```text
typecheck passed
2 test files passed
42 tests passed
```

备注：

- 普通 `pnpm test` 在当前 Windows sandbox 下仍会触发 Vitest / Vite `spawn EPERM`。
- 已按权限规则使用提升权限重跑 `pnpm test`，测试通过。

## 2026-07-04: Phase 7 二次验收补齐

### 本次补齐原因

用户追加了更严格的 Phase 7 验收标准，要求 logic line 不仅记录通用 `object.*` 事件，还要记录更细的对象类型事件，例如：

- `branch.discarded`
- `branch.deleted`
- `branch.restored`
- `local_thread.discarded`
- `local_thread.deleted`
- `local_thread.restored`
- `message.discarded`
- `message.deleted`
- `message.restored`
- `merge.restored`
- `timeline.revert_previewed`

之前 Phase 7 已经具备状态转换能力，但部分对象仍使用通用事件；本次改为优先使用对象专用事件。

### 新增事件类型

在 `src/types/revision.ts` 中新增：

```text
message.discarded
message.deleted
message.restored

branch.discarded
branch.deleted
branch.restored

local_thread.discarded
local_thread.deleted
local_thread.restored

merge.restored

timeline.revert_previewed
```

### ObjectStateService 事件映射更新

文件：

```text
src/services/revision/ObjectStateService.ts
```

现在事件映射规则为：

```text
annotation discard/delete/restore -> annotation.*
message discard/delete/restore -> message.*
revision_branch discard/delete/restore -> branch.*
local_thread discard/delete/restore -> local_thread.*
merge_record discard/delete/restore -> merge.*
其他对象 -> object.*
```

### state transition node payload 补齐

每个 state transition timeline node 的 payload 现在会记录：

```text
node_id
project_id
conversation_id
event_id
event_type
target_object_type
target_object_id
previous_status
new_status
state_transition_id
actor_type
actor_id
created_at
from_status
to_status
reason
parent_path_status
previous_memory_scope
previous_memory_policy
memory_scope
memory_effect
memory_policy
redaction_policy
```

其中：

- delete 使用 `redaction_policy = hide_full_content_from_context_review`
- discard 使用 `memory_policy = excluded_by_default`
- delete 使用 `memory_policy = never_include`
- restore 使用 `memory_effect = restored_to_scope`

### Restore parent deleted 规则补齐

restore 现在会检查：

- `parentSelectionId`
- `sourceSelectionId`
- annotation 的 `scopeType = selected_text` 时对应的 `scopeId / scopeObjectId`
- `parentLocalSelectionId`
- `sourceLocalSelectionId`

如果 parent selection 或 parent local selection 已经 `deleted`，restore 会失败。

### Revert preview logic line

文件：

```text
src/services/revision/RevertService.ts
src/services/revision/revisionRepository.ts
```

保留：

```text
RevertService.previewRevert
```

为纯计算，不修改 state。

新增：

```text
RevertService.recordRevertPreview
```

用于写入：

```text
EventLog: timeline.revert_previewed
TimelineNode: timeline.revert_previewed
```

repository / API 的 preview 现在会使用 record 版本，因此用户在界面点击 Preview Revert 时会留下 logic line。

### Revert node payload 补齐

`timeline.reverted` node 的 payload 现在记录：

```text
node_id
project_id
conversation_id
event_id
event_type
source_object_type = timeline_node
source_object_id = previous_active_node_id
target_object_type = timeline_node
target_object_id = target_node_id
document_version_before_id
document_version_after_id
revert_id
from_node_id
to_node_id
previous_active_path_id
new_active_path_id
previous_active_document_version_id
new_active_document_version_id
affected_node_ids
inactive_node_ids
memory_scope = timeline
memory_effect = changes_active_path
```

### 新增测试覆盖

扩展：

```text
src/__tests__/revision-foundation.test.ts
```

新增/补强验收：

1. Discarded annotation 在 local LLM context 中被排除，reason 包含：

```text
because discarded_excluded_by_default
```

2. local thread 生命周期事件：

```text
local_thread.discarded
local_thread.restored
```

3. parent selection deleted 后，restore local thread 会失败。

4. branch 生命周期事件：

```text
branch.discarded
branch.restored
branch.deleted
```

5. message 生命周期事件：

```text
message.discarded
message.restored
message.deleted
```

6. merge restore：

```text
merge.discarded
merge.restored
```

并确认 merge restore 后 status 回到：

```text
pending
```

7. Revert preview 记录：

```text
timeline.revert_previewed
```

8. 纯 `previewRevert` 仍不修改 state。

### 验证命令

```text
pnpm typecheck
pnpm test
```

### 验证结果

```text
typecheck passed
2 test files passed
43 tests passed
```

备注：

- 普通 `pnpm test` 仍受 Windows sandbox `spawn EPERM` 影响。
- 已使用提升权限重跑测试，结果通过。

## 2026-07-04: Phase 8 二次验收补齐

### 本次补齐原因

用户追加了 Phase 8 更严格验收标准，重点要求：

- Comparison timeline node 的 payload 必须具备完整 logic line 字段。
- ComparisonPanel 内提问的 ContextSnapshot 必须包含 active ComparisonRun、source objects、summary 和必要 graph_data。
- Delete Comparison 后 Context Review 不得显示 graph_data / summary 正文。
- Export 不应该进入 LLM context。

### Timeline Node Payload 补齐

文件：

```text
src/services/revision/ComparisonService.ts
```

以下节点 payload 已补齐：

- `comparison.created`
- `comparison.generated`
- `comparison.regenerated`
- `comparison.cleared`
- `comparison.exported`

每个 comparison timeline node 现在记录：

```text
node_id
project_id
conversation_id
event_id
event_type
target_object_type
target_object_id
source_object_type
source_object_id
comparison_id
comparison_run_id
source_object_types
source_object_ids
llm_call_id
context_snapshot_id
model
memory_scope
memory_effect
status
created_at
scope_type
scope_id
source_hashes
graph_node_count
graph_edge_count
summary_hash
previous_run_id
new_run_id
export_type
```

其中：

- `comparison.created` 的 graph count 为 0。
- `comparison.generated` 记录当前 run 的 graph node / edge 数。
- `comparison.regenerated` 记录 `previous_run_id` 和 `new_run_id`。
- `comparison.exported` 记录 `export_type`、`source_object_type = comparison_run` 和 `source_object_id = run_id`。

### ComparisonPanel Context 补齐

文件：

```text
src/services/revision/ContextSnapshotService.ts
```

当 `callType = comparison_chat` 且当前 comparison 为 active 时，ContextSnapshot 现在包含：

```text
included_comparison
comparison_source_object
comparison_graph_data
```

这些 included items 的 reason 都是：

```text
active_comparison_panel_context
```

其中：

- `included_comparison` 包含 summary / difference summary / conflict summary。
- `comparison_source_object` 来自 ComparisonGraph.sourceSnapshot。
- `comparison_graph_data` 包含 active run 的 summary、graphData、semanticGroups。

### Export Context 规则

Export 只作为 `ComparisonExport` 持久记录和 timeline node，不进入 ContextSnapshot。

测试已验证：

- export id 不出现在 includedItems。
- export id 不出现在 excludedItems。

### 新增 / 加强测试断言

文件：

```text
src/__tests__/revision-foundation.test.ts
```

新增断言覆盖：

1. `comparison.created` TimelineNode payload 包含：

```text
node_id
project_id
conversation_id
target_object_type
target_object_id
comparison_id
source_object_types
source_object_ids
source_hashes
graph_node_count
graph_edge_count
```

2. `comparison.generated` TimelineNode payload 包含：

```text
comparison_run_id
llm_call_id
context_snapshot_id
model
source_hashes
graph_node_count
graph_edge_count
summary_hash
```

3. `comparison.regenerated` TimelineNode payload 包含：

```text
previous_run_id
new_run_id
summary_hash
```

4. ComparisonPanel context 包含：

```text
included_comparison
comparison_source_object
comparison_graph_data
```

5. Delete comparison 后有：

```text
TimelineNode eventType = comparison.deleted
status = deleted
```

6. Export node payload 包含：

```text
comparison_id
comparison_run_id
export_type
source_object_type = comparison_run
source_object_id = run_id
graph_node_count
graph_edge_count
summary_hash
```

7. Export 不进入 LLM context。

### 验证命令

```text
pnpm typecheck
pnpm test
```

### 验证结果

```text
typecheck passed
2 test files passed
47 tests passed
```

备注：

- 测试仍需在当前 Windows 环境中提升权限运行，因为普通 sandbox 会触发 Vitest / Vite `spawn EPERM`。

## 2026-07-04: Phase 8 Semantic Comparison Graph Persistent Foundation

### 本次目标

Phase 8 的目标是把 Semantic Comparison 从前端临时结果升级为持久 revision workspace 对象。

本次实现的核心能力：

- ComparisonGraph 持久化
- ComparisonRun 持久化
- ComparisonExport 持久化
- regenerate 不覆盖旧 run
- clear 不等于 delete
- comparison 默认不进入 main/local LLM context
- deleted comparison 永远不进入 context，也不在 Context Review 暴露正文
- comparison summary 可以保存为 Annotation
- timeline 能显示 source -> comparison -> run -> regenerated run -> export/note

### 新增 / 扩展类型

文件：

```text
src/types/revision.ts
```

新增事件：

```text
comparison.created
comparison.run.created
comparison.generated
comparison.regenerated
comparison.cleared
comparison.discarded
comparison.deleted
comparison.restored
comparison.exported
comparison.summary_kept_as_note
```

新增 timeline edge type：

```text
comparison_attach
comparison_run
supersede
export
```

新增 Comparison constants：

```text
COMPARISON_GRAPH_STATUSES
COMPARISON_RUN_STATUSES
COMPARISON_SOURCE_TYPES
COMPARISON_GRAPH_NODE_TYPES
COMPARISON_GRAPH_EDGE_TYPES
COMPARISON_EXPORT_TYPES
```

新增模型：

```text
ComparisonRunModel
ComparisonExportModel
```

扩展 `ComparisonGraphModel`：

```text
comparisonId
conversationId
title
description
scopeType
scopeId
sourceObjectTypes
sourceObjectIds
sourceSnapshot
sourceHashes
activeRunId
createdBy
createdAt
updatedAt
status
metadata
```

为兼容旧 UI，仍保留：

```text
graphNodes
graphEdges
summary
```

### Repository / Store 状态表

新增状态表：

```text
comparisonRuns
comparisonExports
```

已接入：

- `createEmptyRevisionState`
- `revisionRepository.mergeState`
- `useAnswerAtlasStore`
- project snapshot save / restore
- `/api/revision/sync` counts

### ComparisonService

新增文件：

```text
src/services/revision/ComparisonService.ts
```

实现：

```text
createComparison
resolveComparisonSources
generateComparisonRun
regenerateComparison
clearComparison
discardComparison
deleteComparison
restoreComparison
getComparison
getComparisonRun
getComparisonsForObject
getComparisonsByScope
exportComparison
keepSummaryAsNote
```

### Source Resolution 规则

支持 source type：

```text
document_version
revision_branch
message
local_selection
text_selection
merge_record
annotation
```

规则：

- deleted source 不允许使用。
- discarded / inactive source 默认不允许，必须显式 `allowNonActiveSources`。
- resolved source 会记录：

```text
object_type
object_id
label
content
content_hash
status
source_version
requires_confirmation
```

### Comparison Generation 规则

当前实现使用 deterministic semantic engine 生成严格结构化结果，后续可替换为真实 LLM。

仍然完整记录：

- ContextSnapshot
- LLMCallRecord
- `context_snapshot.created`
- `llm.call.started`
- `llm.call.completed`
- `comparison.run.created`
- `comparison.generated`
- TimelineNode
- TimelineEdge

生成输出结构：

```json
{
  "summary": "...",
  "similarities": [],
  "differences": [],
  "conflicts": [],
  "semanticGroups": [],
  "graph": {
    "nodes": [],
    "edges": []
  },
  "recommendations": []
}
```

保存到：

```text
ComparisonRun.graphData
ComparisonRun.summary
ComparisonRun.semanticGroups
ComparisonRun.differenceSummary
ComparisonRun.similaritySummary
ComparisonRun.conflictSummary
ComparisonRun.recommendationSummary
ComparisonGraph.activeRunId
ComparisonGraph.graphNodes
ComparisonGraph.graphEdges
ComparisonGraph.summary
```

### Regenerate 规则

`regenerateComparison` 会：

- 创建新的 `ComparisonRun`
- 不覆盖旧 run
- 将旧 active run 标记为 `superseded`
- 将 `ComparisonGraph.activeRunId` 指向新 run
- 创建 `comparison.regenerated`
- 创建 `supersede` timeline edge

### Clear 规则

`clearComparison` 会：

- 将 ComparisonGraph.status 设置为 `cleared`
- 保留 ComparisonGraph
- 保留所有 ComparisonRun
- 写入 `comparison.cleared`
- 创建 timeline node，status = `cleared`
- memory_effect = `excluded_by_default`

Clear 不等于 Delete。

### Discard / Delete / Restore

ComparisonGraph 已接入 `ObjectStateService`：

- discard -> `comparison.discarded`
- delete -> `comparison.deleted`
- restore -> `comparison.restored`

Delete 时：

- status = `deleted`
- summary 清空
- graphNodes 清空
- graphEdges 清空
- metadata 记录 redaction policy
- ContextSnapshot 不显示正文

### Export

`exportComparison` 支持：

```text
json
markdown
svg 类型已在 enum 预留
```

当前文件不写入真实磁盘，而是保存为：

```text
ComparisonExport.fileMetadata.content
ComparisonExport.fileUrl = memory://comparison-exports/{id}
```

并记录：

- `comparison.exported`
- TimelineNode target = `comparison_export`
- TimelineEdge edge_type = `export`

### Keep Summary as Note

`keepSummaryAsNote` 会：

- 从 ComparisonRun.summary / differenceSummary / conflictSummary 创建 Annotation
- source_type = `comparison_summary`
- source_id = comparison_run_id
- 根据 comparison scope 选择默认 scope：
  - selected_text -> selected_text
  - branch -> branch
  - document -> document
  - otherwise -> comparison
- 写入 `comparison.summary_kept_as_note`
- 创建 run -> annotation 的 `annotation_attach` timeline edge

### ContextSnapshot 规则

文件：

```text
src/services/revision/ContextSnapshotService.ts
src/services/revision/LocalThreadMessageService.ts
```

Main conversation：

- comparison 默认排除
- active / pinned / explicitly referenced comparison 才进入 context
- deleted comparison text = ""
- cleared comparison reason = `cleared_comparison_excluded`
- discarded comparison reason = `discarded_excluded_by_default`
- default exclusion reason = `comparison_not_active_or_pinned`
- active panel inclusion reason = `active_comparison_panel_context`
- unrelated active comparison reason = `unrelated_comparison_scope`

Local / nested local：

- comparison 默认排除
- deleted / discarded / cleared 使用对应状态原因
- 默认 reason = `comparison_not_active_or_pinned`

### API

新增：

```text
POST /api/comparisons
GET /api/comparisons/:comparisonId
GET /api/comparisons/:comparisonId/runs
GET /api/comparison-runs/:runId
POST /api/comparisons/:comparisonId/regenerate
POST /api/comparisons/:comparisonId/clear
POST /api/comparisons/:comparisonId/discard
POST /api/comparisons/:comparisonId/delete
POST /api/comparisons/:comparisonId/restore
POST /api/comparisons/:comparisonId/export
POST /api/comparisons/:comparisonId/keep-summary-as-note
GET /api/comparisons/by-object
GET /api/comparisons/by-scope
```

### Timeline API 输出

文件：

```text
src/services/revision/timelineApiShape.ts
```

comparison node 现在直接输出：

```text
comparison_id
comparison_run_id
source_object_types
source_object_ids
scope_type
scope_id
model
context_snapshot_id
llm_call_id
status
memory_effect
```

### 测试覆盖

扩展：

```text
src/__tests__/revision-foundation.test.ts
```

新增 Phase 8 测试覆盖：

1. 从两个 DocumentVersion 创建 comparison。
2. comparison 不修改 DocumentVersion。
3. 创建 ComparisonGraph。
4. 创建 ComparisonRun。
5. 创建 LLMCallRecord。
6. 创建 ContextSnapshot。
7. graphData 持久化。
8. 创建 comparison.created / comparison.run.created / comparison.generated events。
9. 创建 comparison_attach / comparison_run timeline edges。
10. 支持 document_version + revision_branch source。
11. 支持 text_selection + local_selection source。
12. getComparisonsForObject。
13. getComparisonsByScope。
14. regenerate 创建新 run。
15. regenerate 不覆盖旧 run。
16. previous run 变 superseded。
17. 创建 supersede edge。
18. main conversation 默认排除 comparison。
19. ComparisonPanel context 包含 active comparison run。
20. clear 不删除 graph / run。
21. cleared comparison 从 context 排除。
22. discard comparison 写 comparison.discarded。
23. delete comparison 清空 summary / graph data。
24. deleted comparison context text 为空。
25. export markdown 创建 ComparisonExport。
26. export 创建 comparison.exported event 和 export edge。
27. Keep Summary as Note 创建 annotation。
28. Keep Summary as Note 写 comparison.summary_kept_as_note。
29. Keep Summary as Note 创建 annotation_attach edge。

### 验证命令

```text
pnpm typecheck
pnpm test
```

### 验证结果

```text
typecheck passed
2 test files passed
47 tests passed
```

备注：

- 普通 `pnpm test` 仍受 Windows sandbox `spawn EPERM` 影响。
- 已使用提升权限重跑测试，结果通过。

## 2026-07-04: Phase 5 stricter acceptance update - document version logic line

### Scope of this update

This update tightens Phase 5 so the manual edit flow is not only visible in UI state, but is also represented in the persistent revision foundation:

- `DocumentVersion`
- `ManualEditDraft`
- `EventLog`
- `TimelineNode`
- `TimelineEdge`
- `ContextSnapshot`
- `TextSelection` anchor status records

No files or records were bulk-deleted for this update.

### Manual edit draft lifecycle

When the user clicks Edit, the system creates or reuses a `ManualEditDraft`.

For a newly created draft, the system now records:

- `ManualEditDraft.status = draft`
- `base_document_version_id`
- `base_content_hash`
- `draft_content_hash`
- `memory_policy = draft_not_confirmed`
- `EventLog.event_type = document.edit_draft.created`
- `TimelineNode.target_object_type = manual_edit_draft`
- `TimelineNode.memory_scope = document`
- `TimelineNode.memory_effect = excluded_by_default`

This means the draft is stored and traceable, but it does not enter future LLM context as document memory.

When draft content is updated, the system records:

- `EventLog.event_type = document.edit_draft.updated`
- old draft content hash
- new draft content hash
- changed fields
- a timeline node connected to the latest draft node

When the user cancels a draft, the system records:

- `ManualEditDraft.status = cancelled`
- `EventLog.event_type = document.edit_draft.cancelled`
- `TimelineNode.memory_effect = none`

Cancelled drafts remain retained for traceability, but are excluded from context by default.

### Preview Diff behavior

When the user clicks Preview Diff, the system computes a diff without creating a new `DocumentVersion`.

The diff includes:

- added text
- removed text
- changed text
- summary
- changed ranges
- old content hash
- new content hash

The system records:

- `EventLog.event_type = document.manual_edit.diff_generated`
- `TimelineNode.target_object_type = manual_edit_draft`
- `TimelineNode.memory_scope = document`
- `TimelineNode.memory_effect = excluded_by_default`

This confirms Preview Diff is review-only and does not update document memory.

### Confirm Save behavior

When the user confirms saving a manual edit, the system now creates:

- `DocumentVersion v2`
- `parent_document_version_id = v1`
- `source_type = manual_edit`
- `source_id = manual_edit_draft_id`
- `status = active`
- previous active version becomes `status = superseded`
- `Project.active_document_version_id = v2`
- `MainConversation.active_document_version_id = v2`
- `ManualEditDraft.status = confirmed`

The system records these events:

- `document.version.created`
- `document.manual_edited`
- `document.version.activated`

The manual edit timeline node contains the required logic-line fields:

- `node_id`
- `project_id`
- `conversation_id`
- `event_id`
- `event_type = document.manual_edited`
- `target_object_type = document_version`
- `target_object_id = new_document_version_id`
- `source_object_type = manual_edit_draft`
- `source_object_id = draft_id`
- `document_version_before_id`
- `document_version_after_id`
- `actor_type = user`
- `actor_id = user`
- `memory_scope = document`
- `memory_effect = updates_document_memory`
- `status = active`
- `created_at`
- `old_content_hash`
- `new_content_hash`
- `diff_summary`
- `changed_ranges`
- `affected_selection_ids`

The timeline includes an edge from the previous document version node toward the new document version/manual edit sequence.

### Selection anchor status behavior

When a confirmed document edit affects selections anchored to the old version, the system records `selection.anchor_status_changed`.

For each affected `TextSelection`, the system updates:

- `anchor_status = needs_review` when the selection overlaps a changed range
- `anchor_status = previous_version` when it belongs to the previous version but does not overlap the changed range

Each selection anchor status timeline node records:

- `target_object_type = text_selection`
- `target_object_id = selection_id`
- `selection_id`
- `source_object_type = document_version`
- `source_object_id = new_document_version_id`
- `document_version_before_id`
- `document_version_after_id`
- `memory_scope = selected_text`
- `memory_effect = none`
- `old_anchor_status`
- `new_anchor_status`
- `reason`
- `overlap_with_changed_range`

This preserves old local threads and selections while marking whether their anchors may need review against the active document.

### Context snapshot behavior after manual edit

After v2 becomes active, future main conversation context snapshots include:

- `DocumentVersion v2`
- reason includes `because active_document_version`

The snapshot excludes:

- `DocumentVersion v1`
- reason includes `because inactive_document_version`

The snapshot also excludes unconfirmed manual edit drafts:

- `ManualEditDraft`
- reason includes `because draft_not_confirmed`

This means draft memory never pollutes LLM context, and only the active document version is treated as document memory.

### Verification

Commands run:

```text
pnpm typecheck
pnpm test
```

Results:

```text
typecheck passed
2 test files passed
34 tests passed
```

## 2026-07-04: Phase 6 - Selective Merge into Document

### Goal

Phase 6 adds selective merge as a persistent, event-driven workflow.

The key rule is:

```text
Local answer / nested local answer / branch draft
-> MergeRecord proposal
-> diff review
-> user confirmation
-> new active DocumentVersion
```

Unconfirmed merge content does not enter document memory.

### Data Model Updates

`MergeRecordModel` was extended to track:

- `merge_id`
- `project_id`
- `conversation_id`
- `source_type`
- `source_id`
- `source_text`
- `source_message_id`
- `source_local_selection_id`
- `source_selection_id`
- `source_local_thread_id`
- `source_branch_id`
- `source_document_version_id`
- `target_document_version_id`
- `target_document_version_hash`
- `target_selection_id`
- `target_range_start`
- `target_range_end`
- `target_before_context`
- `target_after_context`
- `merge_mode`
- `proposed_content`
- `result_content_preview`
- `diff`
- `diff_summary`
- `status`
- `conflict_status`
- `conflict_reason`
- `created_by`
- `confirmed_by`
- timestamps for created / updated / confirmed / cancelled / discarded / deleted
- `result_document_version_id`
- flexible metadata payload

New merge source types:

- `local_selection`
- `local_answer`
- `nested_local_selection`
- `nested_local_answer`
- `revision_branch`
- `branch_draft`

New merge statuses:

- `pending`
- `diff_ready`
- `confirmed`
- `cancelled`
- `conflict`
- `discarded`
- `deleted`

New conflict statuses:

- `none`
- `source_version_outdated`
- `target_selection_changed`
- `target_range_missing`
- `active_document_changed`
- `hash_mismatch`
- `needs_manual_target`

### MergeService

Added `src/services/revision/MergeService.ts`.

Implemented:

- `createMergeProposal`
- `resolveMergeSource`
- `resolveMergeTarget`
- `applyMergeMode`
- `generateMergeDiff`
- `confirmMerge`
- `cancelMerge`
- `discardMerge`
- `deleteMerge`
- `getMergeRecord`
- `getMergeRecordsForSelection`
- `getMergeRecordsForLocalThread`
- `getMergeRecordsForBranch`

Merge target resolution rules:

- If the parent `TextSelection` belongs to the active `DocumentVersion` and has an active anchor, use its stored offsets.
- If the selection is from an older version, try one exact text match in the active document.
- If there is no match, multiple matches, or `anchor_status = needs_review`, return `conflict_status = needs_manual_target`.
- If a manual target range is provided, use it and generate the diff.

Merge modes implemented:

- `replace_selection`
- `insert_before_selection`
- `insert_after_selection`
- `append_to_paragraph`
- `new_paragraph_after_selection`
- `replace_custom_range`
- `apply_patch` currently behaves like a replace placeholder

### Merge Proposal Behavior

`createMergeProposal` now:

- creates `MergeRecord`
- creates `EventLog: merge.proposed`
- creates `TimelineNode: merge.proposed`
- creates `TimelineEdge: merge_proposal`
- generates diff when target is resolved
- marks unresolved target as `status = conflict`
- creates `EventLog: merge.conflict_detected` when needed

No `DocumentVersion` is created at proposal time.

### Merge Diff Behavior

`generateMergeDiff`:

- applies merge mode to active target content
- stores `proposed_content`
- stores `result_content_preview`
- stores `diff`
- stores `diff_summary`
- sets `status = diff_ready`
- creates `EventLog: merge.diff_generated`
- creates a merge-scoped timeline node

The diff remains outside document memory until confirmation.

### Confirm Merge Behavior

`confirmMerge`:

- requires `status = diff_ready`
- checks active document id/hash against the proposal target
- returns `conflict_status = active_document_changed` if the active document changed
- creates a new `DocumentVersion`
- sets `source_type = merge`
- sets `source_id = merge_id`
- marks previous active version as `superseded`
- updates `Project.activeDocumentVersionId`
- updates `MainConversation.activeDocumentVersionId`
- sets `MergeRecord.status = confirmed`
- sets `result_document_version_id`
- creates `EventLog: merge.confirmed`
- creates `EventLog: document.version.created`
- creates timeline edges:
  - source -> merge proposal
  - source -> merge confirmed
  - old document version -> new document version
  - merge confirmed -> new document version

If the source is a branch, confirm also:

- marks `RevisionBranch.status = merged`
- creates `EventLog: branch.merged`
- creates a branch status timeline edge

Affected `TextSelection` anchors are updated to:

- `needs_review` when changed ranges overlap
- `previous_version` when they come from the old version but do not overlap

### Context Rules

Main conversation context:

- includes active `DocumentVersion` after confirmed merge
- reason: `because active_document_version_after_confirmed_merge`
- excludes pending/diff-ready merge proposals
- reason: `because pending_merge_not_confirmed`
- excludes conflict merge proposals
- reason: `because merge_conflict_not_confirmed`
- excludes deleted merge records
- reason: `because deleted_memory_never_included`
- excludes unmerged branches
- reason: `because unmerged_branch`
- excludes ordinary unmerged local threads
- reason: `because ordinary_local_thread_not_merged`

Local and nested local context:

- may include related confirmed merge history for the same local thread or selected text
- excludes unrelated merge proposals
- excludes pending/conflict/cancelled/discarded/deleted merge records

### API Routes

Added:

- `POST /api/merges/propose`
- `POST /api/merges/[mergeId]/diff`
- `POST /api/merges/[mergeId]/confirm`
- `POST /api/merges/[mergeId]/cancel`
- `POST /api/merges/[mergeId]/discard`
- `POST /api/merges/[mergeId]/delete`
- `GET /api/merges/[mergeId]`
- `GET /api/merges/by-selection/[selectionId]`
- `GET /api/merges/by-local-thread/[localThreadId]`
- `GET /api/merges/by-branch/[branchId]`

These routes use the existing revision repository singleton and enforce project checks where project id is supplied.

### UI Wiring

Added `src/components/merge/MergeModal.tsx`.

The modal displays:

- source content
- source type
- target selection
- active target document version
- merge mode selector
- diff preview
- conflict warning
- Choose Target Manually button for unresolved targets
- Confirm Merge
- Cancel
- Save as Note Instead placeholder button

Merge entry points:

- whole local answer: Side Thread action bar `Merge into Document`
- selected local answer fragment: selection toolbar `Merge`
- revision branch: Branch Panel `Merge into Document`

The UI does not merge immediately. It always creates a proposal and shows diff/conflict state first.

### Tests

Added Phase 6 tests covering:

- creating merge proposal from `LocalSelection`
- pending merge does not create `DocumentVersion`
- pending merge is excluded from main context
- diff generation before confirmation
- confirmed merge creates new `DocumentVersion` with `source_type = merge`
- active document ids update after confirmed merge
- timeline contains `merge_proposal`, `merge_back`, and `sequence`
- context includes active document version after confirmed merge
- conflict when target selection cannot be found
- manual target range resolving target conflict
- branch merge marking branch as `merged`

### Verification

Commands run:

```text
pnpm typecheck
pnpm test
```

Results:

```text
typecheck passed
2 test files passed
40 tests passed
```

## 2026-07-04: Phase 6 strict acceptance pass

### Additional strict logic-line fixes

After reviewing the stricter Phase 6 acceptance checklist, the merge logic line was tightened further.

Added / confirmed:

- `document.version.activated` is now recorded after a confirmed merge creates a new `DocumentVersion`.
- `merge.target_changed` is recorded when a manual target range is supplied.
- `merge.confirmed` payload now includes the full audit fields required by the Phase 6 checklist.
- `merge.proposed`, `merge.diff_generated`, `merge.conflict_detected`, `merge.target_changed`, `merge.cancelled`, `merge.discarded`, and `merge.deleted` nodes now use a consistent merge audit payload shape.

Each merge node now records:

- `node_id`
- `project_id`
- `conversation_id`
- `event_id`
- `event_type`
- `target_object_type = merge_record`
- `target_object_id = merge_id`
- `source_object_type`
- `source_object_id`
- `selection_id`
- `local_selection_id`
- `local_thread_id`
- `branch_id`
- `document_version_before_id`
- `document_version_after_id`
- `merge_mode`
- `target_selection_id`
- `target_range_start`
- `target_range_end`
- `memory_scope`
- `memory_effect`
- `status`
- `conflict_status`
- `actor_type`
- `actor_id`
- `created_at`
- `source_type`
- `source_text_hash`
- `target_document_version_id`
- `result_document_version_id`
- `diff_summary`
- `changed_ranges`
- `conflict_reason`

### Strict acceptance checks covered by tests

The test suite now verifies:

- selecting a local answer fragment creates/reuses `LocalSelection`
- merge proposal creates `MergeRecord.status = diff_ready`
- proposal creates `merge.proposed` and `merge.diff_generated`
- proposal creates `TimelineEdge.edge_type = merge_proposal`
- proposal does not create a new `DocumentVersion`
- confirmed merge creates `MergeRecord.status = confirmed`
- confirmed merge creates `DocumentVersion.source_type = merge`
- confirmed merge updates active document version ids
- confirmed merge creates `merge.confirmed`
- confirmed merge creates `document.version.created`
- confirmed merge creates `document.version.activated`
- confirmed merge creates `merge_back` and `sequence` timeline edges
- only the selected local fragment enters the new document content
- the rest of the local answer does not enter document memory
- pending/diff-ready merge proposals are excluded from main context with `because pending_merge_not_confirmed`
- confirmed merge enters context through active `DocumentVersion` with `because active_document_version_after_confirmed_merge`
- manual target range creates `merge.target_changed`
- branch merge marks branch status as `merged`

### Verification

Commands run:

```text
pnpm typecheck
pnpm test
```

Results:

```text
typecheck passed
2 test files passed
40 tests passed
```

## 2026-07-04：Phase 4 验收补齐 - Annotation 审计字段与 Context Reason Codes

### 本次修改目标

根据新的 Phase 4 验收标准，补齐显式 memory 通道的底层记录能力。
重点不是重做 UI，而是保证每一条 note / annotation 都能被追溯：

- 从哪里来。
- 作用在哪个 scope。
- 是否进入 LLM context。
- 为什么进入或为什么被排除。
- 后续 update / scope change / discard / delete / restore 怎么记录。

### Annotation event payload

`AnnotationService` 现在会为 annotation 相关事件写入更完整的 payload。

事件包括：

- `annotation.created`
- `annotation.kept_from_answer`
- `annotation.kept_from_selection`
- `annotation.updated`
- `annotation.scope_changed`
- `annotation.discarded`
- `annotation.deleted`
- `annotation.restored`

每个 annotation event 至少记录：

- `content_hash`
- `scope_type`
- `scope_id`
- `source_type`
- `source_id`
- `source_object_type`
- `source_object_id`
- `selection_id`
- `local_selection_id`
- `local_thread_id`
- `branch_id`
- `document_version_id`
- `memory_policy`
- `status`
- `actor_type`
- `actor_id`

### Annotation timeline node payload

annotation timeline node 现在记录：

- `node_id`
- `project_id`
- `conversation_id`
- `event_id`
- `event_type`
- `target_object_type = annotation`
- `target_object_id`
- `source_object_type`
- `source_object_id`
- `selection_id`
- `local_selection_id`
- `local_thread_id`
- `branch_id`
- `document_version_id`
- `scope_type`
- `scope_id`
- `memory_scope = annotation`
- `memory_effect`
- `status`
- `created_at`
- `actor_type`
- `actor_id`
- `payload.content_hash`
- `payload.scope_type`
- `payload.scope_id`
- `payload.source_type`
- `payload.source_id`
- `payload.memory_policy`

这保证 Timeline 不是前端画假的，而是可以从 revision state 恢复 note 的来源关系。

### Update / Scope Change 记录

`annotation.updated` 和 `annotation.scope_changed` 现在额外记录：

- `old_content_hash`
- `new_content_hash`
- `old_scope_type`
- `old_scope_id`
- `new_scope_type`
- `new_scope_id`
- `changed_fields`

这样之后能知道 note 是内容变了，还是 scope 变了。

### Context Review reason codes

Context Snapshot 里的 note inclusion / exclusion reason 改成稳定规则码。

Local Window 会包含：

- `because active_note_matching_parent_selection`
- `because active_note_matching_current_local_thread`

Local Window 会排除：

- `because unrelated_selected_text_scope`
- `because unrelated_local_thread_scope`
- `because branch_note_outside_branch_context`
- `because discarded_note_excluded_by_default`
- `because deleted_memory_never_included`

Main Conversation 默认只包含 project / conversation / document 这类全局或主会话 scope note。
Main Conversation 默认排除局部 note：

- selected text note：`because selected_text_scope_requires_active_focus`
- local thread note：`because local_thread_scope_requires_active_focus`
- branch note：`because branch_scope_requires_active_focus`

### 测试补充

新增 / 强化测试覆盖：

- Add Context Note 创建 Annotation、EventLog、TimelineNode、TimelineEdge。
- Add Context Note 的 event payload 包含 `content_hash`、scope、source、actor、memory policy。
- Add Context Note 的 timeline node payload 包含完整审计字段。
- Keep as Note from whole local answer 使用 `source_type = local_answer`，source 指向 local assistant message。
- Keep as Note from selected local fragment 使用 `source_type = selected_fragment`，source 指向 LocalSelection。
- Main Conversation 默认排除 selected_text / local_thread scoped notes。
- Local Window context 包含 parent selected_text note 和 current local_thread note。
- Local Window context 排除 unrelated / discarded / deleted notes，并给出稳定 reason code。
- Annotation lifecycle 记录 update、scope change、discard、delete、restore。
- update / scope change 事件记录 old/new content hash、old/new scope、changed_fields。

### 验证命令

```text
pnpm typecheck
pnpm test
```

### 验证结果

```text
typecheck passed
2 test files passed
28 tests passed
```

注意：第一次在 sandbox 内运行 `pnpm test` 时，Vitest/Vite 在 Windows 上 spawn 子进程被拦截，报 `spawn EPERM`。
随后使用提升权限重新运行同一条 `pnpm test`，测试通过。

## 2026-07-04：Phase 5 persistent DocumentVersion / Manual Edit / Diff foundation

### 本次目标

实现 Global Direct Edit 的持久化基础。
用户可以直接编辑主文档 / 最新 main assistant answer，但保存时不会覆盖旧内容。
编辑先进入 `ManualEditDraft`，确认后才创建新的 `DocumentVersion`。

本阶段仍然不实现：

- Local Window merge into Document
- selective merge
- full revert
- conflict-aware local merge
- full fuzzy re-anchoring

### 新增 / 扩展模型

扩展 `DocumentVersionModel`：

- `documentVersionId`
- `conversationId`
- `parentDocumentVersionId`
- `versionNumber`
- `contentHash`
- `createdFromEventId`
- `createdFromTimelineNodeId`
- `sourceType`
- `sourceId`
- `createdBy`
- `metadata`

新增 `ManualEditDraftModel`：

- `editDraftId`
- `projectId`
- `conversationId`
- `baseDocumentVersionId`
- `baseContentHash`
- `draftContent`
- `draftContentHash`
- `editedRangeStart`
- `editedRangeEnd`
- `status`
- `createdBy`
- `createdAt`
- `updatedAt`
- `metadata`

新增 / 扩展常量：

- `document.version.activated`
- `selection.anchor_status_changed`
- `manual_edit_draft`
- `updates_document_memory`
- document version source types:
  - `initial_answer`
  - `manual_edit`
  - `merge`
  - `revert`
  - `regenerate`
  - `import`
- manual draft status:
  - `draft`
  - `ready_for_review`
  - `confirmed`
  - `cancelled`
  - `discarded`
- selection anchor status:
  - `active`
  - `needs_review`
  - `previous_version`

### DiffService

新增 `src/services/revision/DiffService.ts`。

实现：

- `createTextDiff(oldContent, newContent)`
- `summarizeDiff(diff)`
- `getChangedRanges(diff)`
- `hashContent(content)`

Diff JSON 包含：

- `oldContentHash`
- `newContentHash`
- `chunks`
- `summary`
- `changedRanges`

### DocumentVersionService

新增 `src/services/revision/DocumentVersionService.ts`。

实现：

- `getActiveDocumentVersion`
- `createInitialDocumentVersionFromAnswer`
- `createManualEditDraft`
- `updateManualEditDraft`
- `generateDiffForDraft`
- `confirmManualEdit`
- `getDocumentVersion`
- `getDocumentVersionHistory`
- `compareDocumentVersions`

核心规则：

- 旧 document version 永不覆盖。
- ManualEditDraft 默认不进入 document memory。
- ManualEditDraft 默认不进入后续 LLM context。
- Preview Diff 只生成 diff，不创建 DocumentVersion。
- Confirm Manual Edit 才创建新的 active DocumentVersion。
- 旧 active version 会变成 `superseded`。
- `project.activeDocumentVersionId` 和 `conversation.activeDocumentVersionId` 会更新。
- 如果 draft base version 不是当前 active version，返回 conflict，不覆盖当前 active version。

### Initial DocumentVersion

主 assistant answer 完成后，如果缺少对应版本，会创建：

- `DocumentVersion.sourceType = initial_answer`
- `sourceId = assistant message id`
- `versionNumber = 1` 或上一版本 + 1
- `status = active`
- `EventLog: document.version.created`
- `TimelineNode: document.version.created`
- `memoryScope = document`
- `memoryEffect = updates_document_memory`

重复同一个 assistant message 不会创建 duplicate document version。

### Manual Edit Confirmation

确认 manual edit 时会：

1. 读取 draft。
2. 读取 base document version。
3. 读取 current active document version。
4. 检查 conflict。
5. 生成 diff。
6. 创建新的 `DocumentVersion`。
7. 标记旧 active version 为 `superseded`。
8. 更新 active document version id。
9. 标记 draft 为 `confirmed`。
10. 创建 `EventLog: document.manual_edited`。
11. 创建 `TimelineNode: document.manual_edited`。
12. 创建 previous document version node 到 new manual edit node 的 `sequence` edge。
13. 返回 new version 和 diff。

Timeline node payload 包含：

- `source_object_type = manual_edit_draft`
- `source_object_id`
- `document_version_before_id`
- `document_version_after_id`
- `old_content_hash`
- `new_content_hash`
- `diff_summary`
- `changed_ranges`
- `memory_effect = updates_document_memory`

### Affected TextSelections

确认 manual edit 后，会查找：

```text
TextSelection.sourceDocumentVersionId = old_document_version_id
```

如果 selection range 与 changed ranges 重叠：

```text
anchorStatus = needs_review
```

否则：

```text
anchorStatus = previous_version
```

并创建：

- `EventLog: selection.anchor_status_changed`
- `TimelineNode: selection.anchor_status_changed`
- `TimelineEdge: selection`

不会删除 selection 或 local thread。
本阶段不做 fuzzy re-anchor。

### ContextSnapshot 更新

Main Conversation context：

- 包含 active DocumentVersion。
- 排除 old / inactive / superseded document versions。
- 排除 ManualEditDraft，reason = `because draft_not_confirmed`。
- deleted document version 不显示全文。

Local Window context：

- 包含 source selected text。
- 包含 source document version metadata。
- 包含 active document version reference。
- 如果 local thread source version 不是当前 active version：
  - `metadata.source_version_is_not_active = true`
  - included item reason = `because local_thread_source_version_is_not_active`
- 排除 ManualEditDraft，reason = `because draft_not_confirmed`。

Context Review 现在显示：

- active document version id
- version number
- source type
- included item reason
- excluded draft / old version reason

### UI 接入

主 answer 最新 assistant message 增加：

- `Edit`
- `View Versions`
- `View Diff`

Edit flow：

1. 点击 `Edit`。
2. 创建或恢复 `ManualEditDraft`。
3. 显示 textarea。
4. 点击 `Preview Diff` 或 `Save Edit`。
5. 打开 `DiffReviewModal`。
6. 点击 `Confirm Save`。
7. 创建新的 active DocumentVersion。
8. 主 answer 显示新的 active DocumentVersion 内容。

新增组件：

- `DiffReviewModal`
- `DocumentVersionHistoryPanel`

Local Window：

- 如果 source selection 来自旧 DocumentVersion，显示 warning。
- 如果 selection `anchorStatus = needs_review`，显示 badge。

### 验证命令

```text
pnpm typecheck
pnpm test
```

### 验证结果

```text
typecheck passed
2 test files passed
33 tests passed
```

注意：`pnpm test` 在 Windows sandbox 内仍会因为 Vitest/Vite spawn 子进程报 `spawn EPERM`。
本次使用提升权限重新运行同一条 `pnpm test` 后通过。

## 2026-07-04: Phase 3 persistent nested local revision workspace

### Scope

Implemented the Phase 3 foundation for selecting text inside local assistant
answers, creating persistent LocalSelection records, opening nested local
threads through Revise, creating basic branch-only RevisionBranch records
through Branch, and recording all of these objects in EventLog and Timeline
Graph.

This phase intentionally does not implement document merge, selective merge,
direct document editing, Keep as Note, Add Context Note, comparison graph
generation, revert, or full discard/delete UI for these new objects.

### Data model updates

- Added event types:
  - `local_selection.created`
  - `nested_local_thread.created`
  - `nested_local_message.user.created`
  - `nested_local_message.assistant.created`
  - `branch.created`
- Added timeline edge type:
  - `nested_branch`
- Extended LocalThread with nested local linkage:
  - `parentLocalSelectionId`
  - `sourceType = local_selection`
  - `threadType = nested_local`
  - `memoryScope = nested_local_thread`
- Extended LocalSelection with:
  - `conversationId`
  - `sourceLocalThreadId`
  - `sourceMessageId`
  - `sourceAnswerId`
  - `parentSelectionId`
  - `parentLocalSelectionId`
  - source context offsets/hash
  - `sourceThreadType`
- Extended RevisionBranch with:
  - `parentSelectionId`
  - `parentLocalSelectionId`
  - `sourceLocalThreadId`
  - `sourceMessageId`
  - `baseDocumentVersionId`
  - `content`
  - `draftContent`
  - `memoryEffect = branch_only`
- Added `threadType` to ContextSnapshot and LLMCallRecord so local and
  nested-local calls can be audited separately.

### Services added or extended

- Added `LocalSelectionService`
  - `createOrGetLocalSelection`
  - `getLocalSelection`
  - `findExistingLocalSelection`
  - `getRelatedObjectsForLocalSelection`
- Extended `LocalThreadService`
  - `getOrCreateNestedLocalThreadForLocalSelection`
- Added `RevisionBranchService`
  - `createBranchFromLocalSelection`
  - `getBranch`
  - `getBranchesForLocalSelection`
  - `getBranchesForSelection`
- Extended `LocalThreadMessageService`
  - local threads still record `local_message.*`
  - nested local threads record `nested_local_message.*`
  - nested local LLM calls keep `threadType = nested_local`
  - nested context includes:
    - current LocalSelection
    - selected local fragment
    - source parent local assistant answer
    - parent LocalThread chain
    - original main TextSelection
    - active document version
    - current nested thread history
  - nested context excludes:
    - unrelated local threads
    - local threads from other selections
    - deleted/discarded objects
    - unmerged branches
    - unrelated annotations
    - comparison graphs not explicitly pinned

### API updates

- Extended `POST /api/local-threads/[threadId]/messages`
  - supports `threadType = nested_local`
  - uses the LocalSelection text as the model anchor for nested local calls
  - returns the related LocalSelection when available
- Added:
  - `GET /api/revision/local-selections/[localSelectionId]/related`

### UI updates

- Local assistant answer selections now show a local-selection toolbar:
  - `Revise`
  - `Branch`
- `Revise` creates or restores:
  - LocalSelection
  - nested LocalThread
  - nested local window state
  - persisted prior nested conversation
- `Branch` creates:
  - RevisionBranch
  - EventLog `branch.created`
  - TimelineNode
  - TimelineEdge from LocalSelection to branch
- Added a basic BranchPanel:
  - shows branch id/status/scope/effect
  - shows source selected fragment
  - shows editable `draftContent`
  - shows original main TextSelection
  - shows source LocalThread
  - allows saving draft content
  - does not merge into the document

### Timeline behavior

The persisted graph now supports:

```text
main answer
  -> text selection
    -> local thread
      -> local assistant answer
        -> local selection
          -> nested local thread
            -> nested local user message
            -> nested local assistant answer
          -> revision branch
```

Important edge types:

- `selection_attach`: local assistant answer -> LocalSelection
- `nested_branch`: LocalSelection -> nested LocalThread
- `branch`: LocalSelection -> RevisionBranch
- `sequence`: nested local user message -> nested local assistant answer

### Verification

Commands:

```text
pnpm typecheck
pnpm test
```

Results:

```text
typecheck passed
2 test files passed
22 tests passed
```

## 2026-07-04: Phase 4 annotation and context-note memory

### Scope

Implemented persistent annotation memory for Answer Atlas. Users can now save
explicit scoped memory through Add Context Note, Keep as Note from a whole local
answer, Keep Note from a selected local/nested fragment, and branch-scoped notes
inside the Branch Panel.

This phase intentionally does not implement merge into document, selective merge,
direct document editing, comparison graph generation, full revert, or final
branch merge.

### Data model updates

- Extended AnnotationModel with:
  - `annotationId`
  - `conversationId`
  - `title`
  - `scopeType`
  - `scopeId`
  - `sourceType`
  - `sourceId`
  - `sourceText`
  - `sourceMessageId`
  - `sourceSelectionId`
  - `sourceLocalSelectionId`
  - `sourceLocalThreadId`
  - `sourceBranchId`
  - `sourceDocumentVersionId`
  - `createdFromEventId`
  - `createdFromTimelineNodeId`
  - `memoryPolicy`
  - `createdBy`
  - `discardedAt`
  - `deletedAt`
  - metadata payload
- Added annotation scope constants:
  - `project`
  - `conversation`
  - `document`
  - `selected_text`
  - `local_thread`
  - `nested_local_thread`
  - `branch`
  - `comparison`
- Added annotation source constants:
  - `manual_note`
  - `keep_as_note`
  - `assistant_answer`
  - `selected_fragment`
  - `local_answer`
  - `nested_local_answer`
  - `branch_draft`
  - `comparison_summary`
- Added memory policies:
  - `auto_by_scope`
  - `always_include_when_scope_matches`
  - `manual_only`
  - `excluded_by_default`
  - `never_include`
- Added event types:
  - `annotation.created`
  - `annotation.kept_from_answer`
  - `annotation.kept_from_selection`
  - `annotation.updated`
  - `annotation.scope_changed`
  - `annotation.discarded`
  - `annotation.deleted`
  - `annotation.restored`
- Added timeline edge:
  - `annotation_attach`
- Added memory effects:
  - `adds_annotation_memory`
  - `excluded_by_default`
  - `permanently_excluded`

### Services

Added `AnnotationService`:

- `createAnnotation`
- `createAnnotationFromManualNote`
- `createAnnotationFromAnswer`
- `createAnnotationFromLocalSelection`
- `updateAnnotation`
- `discardAnnotation`
- `deleteAnnotation`
- `restoreAnnotation`
- `getAnnotation`
- `getAnnotationsByScope`
- `getRelatedAnnotations`

Rules implemented:

- Active annotations can enter future LLM context if their scope matches.
- Discarded annotations are retained but excluded by default.
- Deleted annotations are tombstoned and never included with full content.
- Create/update/scope-change/discard/delete/restore creates EventLog records.
- Timeline nodes use annotation memory effects.
- `annotation_attach` edges connect the source scope, answer, or LocalSelection to
  the Annotation node.

### Context behavior

Main conversation context:

- Includes active project annotations.
- Includes active conversation annotations when session matches.
- Includes active document annotations when document/version matches.
- Excludes selected_text/local_thread/nested_local_thread/branch annotations by
  default.
- Excludes discarded/deleted annotations.

Local thread context:

- Includes active annotations scoped to parent selected_text.
- Includes active annotations scoped to current local_thread.
- Includes relevant document annotations.
- Excludes unrelated selected_text/local_thread/branch annotations.
- Excludes discarded/deleted annotations.

Nested local context:

- Includes active annotations scoped to current nested_local_thread.
- Includes active annotations scoped to parent local_thread.
- Includes active annotations scoped to original selected_text.
- Excludes unrelated branch/local/selected annotations and deleted/discarded
  memory.

Context Review now separates Included Notes and Excluded Notes.

### UI updates

- Local/nested answer selection toolbar now has `Keep Note`.
- Local/Nested Local Window:
  - `Add Context Note` now creates persistent revision Annotation memory.
  - `Keep as Note` now creates `annotation.kept_from_answer`.
  - Related Notes panel shows scoped notes.
- Branch Panel:
  - can add branch-scoped context notes.
  - shows Related Notes.

### API

Added:

```text
GET /api/revision/annotations
```

It accepts optional filters:

```text
scopeType
scopeId
sourceType
sourceId
```

### Verification

Commands:

```text
pnpm typecheck
pnpm test
```

Results:

```text
typecheck passed
2 test files passed
27 tests passed
```

## 2026-07-04：Phase 2 Persistent Local Window Foundation

### 本阶段范围

本阶段只实现：

- 主回答 / 主文档里的鼠标文本选择捕获。
- `TextSelection` 持久化。
- 同一段选择复用已有 `TextSelection`。
- 为 `TextSelection` 创建或恢复 active `LocalThread`。
- Local Window 消息持久化为 revision `MessageModel`。
- local LLM 调用记录 `LLMCallRecord`。
- local LLM 调用前保存 `ContextSnapshot`。
- selection / local thread / local messages 写入 timeline graph。
- local assistant answer 旁边支持手动 `Context Review`。

本阶段明确不实现：

- selective merge
- nested local windows
- direct document editing
- Keep as Note
- Add Context Note 的真实 revision memory
- full branch editing
- full comparison graph
- revert
- discard/delete UI

这些按钮目前保留为 UI placeholder，但已禁用，避免用户误以为这些动作已经完成。

### Selection Capture

新增：

```text
src/lib/selection/readTextSelection.ts
```

负责从主回答容器读取浏览器选区，并生成：

- `selectedText`
- `startOffset`
- `endOffset`
- `contextBefore`
- `contextAfter`
- `textHash`
- `conversationId`
- `sourceType`
- `sourceId`
- `sourceDocumentVersionId`
- `sourceMessageId`

主回答的 assistant message 选择来源现在默认记录为：

```text
sourceType = message
sourceId = rev-message-assistant-...
sourceDocumentVersionId = doc-version-{activeVersionNodeId}
```

### TextSelectionService

新增：

```text
src/services/revision/TextSelectionService.ts
```

实现：

```text
createOrGetSelection
```

复用条件：

- `projectId`
- `conversationId`
- `sourceType`
- `sourceId`
- `sourceDocumentVersionId`
- `startOffset`
- `endOffset`
- `textHash`
- `status = active`

如果找不到 active selection，则创建新的 `TextSelectionModel`。

创建时会同时写入：

- `EventLog`: `selection.created`
- `TimelineNode`: target object 为 `text_selection`
- `TimelineEdge`: `selection_attach`

selection node 的 memory 规则：

```text
memory_scope = selected_text
memory_effect = none
```

### LocalThreadService

新增：

```text
src/services/revision/LocalThreadService.ts
```

实现：

```text
getOrCreateLocalThreadForSelection
```

规则：

- 如果同一个 `selectionId` 下已有 active `LocalThread`，直接恢复。
- 如果没有，则创建 `LocalThreadModel`。
- LocalThread 只属于 selected text / local window，不进入全局 document memory。

创建时会同时写入：

- `EventLog`: `local_thread.created`
- `TimelineNode`: target object 为 `local_thread`
- `TimelineEdge`: `branch`

local thread node 的 memory 规则：

```text
memory_scope = local_thread
memory_effect = local_only
```

### Local Message Send Flow

新增：

```text
src/services/revision/LocalThreadMessageService.ts
src/app/api/local-threads/[threadId]/messages/route.ts
```

新的 local message endpoint：

```text
POST /api/local-threads/[threadId]/messages
```

发送 local question 时流程为：

1. 验证 `LocalThread` 存在且 `status = active`。
2. 保存 local user `MessageModel`。
3. 创建 `local_message.user.created` event。
4. 创建 local user timeline node。
5. 构建并保存 local `ContextSnapshot`。
6. 创建 `context_snapshot.created` event。
7. 创建 started `LLMCallRecord`。
8. 创建 `llm.call.started` event。
9. 调用 LLM。
10. 保存 local assistant `MessageModel`。
11. 更新 `LLMCallRecord` 为 completed。
12. 创建 `llm.call.completed` event。
13. 创建 `local_message.assistant.created` event。
14. 创建 local assistant timeline node。
15. 创建 local user -> assistant `sequence` edge。

local assistant timeline node 会保存：

```json
{
  "local_thread_id": "...",
  "selection_id": "...",
  "llm_call_id": "...",
  "context_snapshot_id": "..."
}
```

### Local ContextSnapshot 规则

local LLM call 的 included items：

- source `TextSelection`
- selected text 周边 source excerpt
- active document version reference
- current local thread message history
- parent selection metadata
- active annotations scoped to this selection

local LLM call 的 excluded items：

- unrelated local threads
- unmerged branches
- discarded objects
- deleted objects
- inactive timeline nodes
- unrelated annotations
- comparison graphs not explicitly opened or pinned

规则保持：

```text
deleted memory must never be included
discarded memory is retained but excluded by default
local window content stays local_only and does not enter global document memory
```

### Local Window UI

Local Window 现在会：

- 根据同一 selection 恢复已有 active local thread。
- 显示 selected text。
- 显示 persisted local messages。
- local assistant answer 保存 `llmCallId` 和 `contextSnapshotId`。
- assistant answer 旁边有 Context Review 按钮。

Context Review 点击后读取：

```text
GET /api/revision/llm-calls/[llmCallId]/context-snapshot
```

并显示：

- model
- thread id
- token estimate
- memory scope
- included items
- excluded items
- exclusion reasons

### Timeline / Logic Line

本阶段新增 timeline 关系：

```text
main answer/document node
  -- selection_attach -->
text_selection node
  -- branch -->
local_thread node
  -- sequence -->
local user message node
  -- sequence -->
local assistant message node
```

### Tests

新增/扩展 `src/__tests__/revision-foundation.test.ts`，覆盖：

- selecting text creates `TextSelection`
- selecting same text reuses existing `TextSelection`
- opening local window creates `LocalThread`
- opening local window again restores active `LocalThread`
- local message send creates user message / assistant message
- local message send creates events
- local message send creates timeline nodes and edges
- local message send creates `LLMCallRecord`
- local message send creates `ContextSnapshot`
- local context includes selected text and local thread history
- local context excludes unrelated local threads
- local timeline contains branch edge from selection to local thread

验证命令：

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
2 test files passed
18 tests passed
```

## 2026-07-04：Phase 1 二次验收修复

### 发现的问题

实际发 main message 后，页面能够显示 user / assistant 对话，但一开始 `GET /api/revision/projects/default/timeline` 查不到记录。

排查后发现：

- `/api/revision/sync` route 内部有 revision records。
- `/api/revision/projects/[projectId]/timeline` 和 `/api/revision/events` route 查不到同一份 records。
- 原因是 Next dev 环境下不同 API route 可能拿到不同的 module instance，原来的 in-memory `let repositoryState` 不是可靠的跨 route 存储。

### 修复方式

把 `src/services/revision/revisionRepository.ts` 改成基于 `globalThis.__answerAtlasRevisionRepositoryState` 的 server-side singleton。

这样这些 route 会共享同一份 revision state：

- `POST /api/revision/sync`
- `GET /api/revision/projects/[projectId]/timeline`
- `GET /api/revision/events`
- `GET /api/revision/llm-calls/[llmCallId]/context-snapshot`
- `GET /api/revision/llm-calls/[llmCallId]`

### 新增 LLMCallRecord 只读 API

新增：

```text
GET /api/revision/llm-calls/[llmCallId]
```

返回字段包括：

```json
{
  "llm_call": {
    "id": "...",
    "project_id": "...",
    "call_type": "main_conversation",
    "model": "gpt-5.5",
    "provider": "openai",
    "status": "completed",
    "session_id": "session-main",
    "thread_id": null,
    "context_snapshot_id": "...",
    "output_message_id": "..."
  }
}
```

其中 main conversation 使用 `session_id` 表示所属主会话；local thread 接入后会使用 `thread_id`。

### 本次真实验收记录

实际在页面发送 main message：

```text
验收测试 1783148294931: 请只回复“通过”。
```

验收结果：

- timeline graph 可查。
- user timeline node 存在。
- assistant timeline node 存在。
- assistant timeline node 含 `llm_call_id`。
- assistant timeline node 含 `context_snapshot_id`。
- timeline edge 为 `sequence`。
- event logs 可查，包含 user message、context snapshot、LLM started、LLM completed、assistant message。
- context snapshot 可查，包含 active document version 和 recent main messages。
- LLMCallRecord 可查，包含 model、session、context snapshot、output assistant message。

本次仍需注意：

- 当前是 localStorage + server-side in-memory singleton，不是 SQLite / Postgres 这类真正数据库。
- server process 重启后 in-memory records 会清空；浏览器 localStorage 仍会保留前端状态。
- 如果验收标准里的“数据库”要求进程重启后也保留，下一阶段必须接入真实 DB 和 migration。

验证命令：

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
2 test files passed
15 tests passed
```

## 2026-07-05：Phase 9 记录索引补充

本轮 Phase 9 的详细实现记录已经写入本文档上方的：

```text
2026-07-05：Phase 9 统一 Action Layer 与安全规则补强
```

该记录包含：

```text
message.regenerated
merge.cancel
deleted memory context review redaction
regenerate supersede edge
store wrapper action-backed 改造
merge / manual edit / revert / discard / delete 的 action 化路径
setManualMergeTarget 的 action-backed merge target change
本轮 typecheck 与测试结果
```

本轮最终验证结果：

```text
pnpm typecheck passed
pnpm test passed
3 test files passed
61 tests passed
```

## 2026-07-05：Phase 10 持久迁移 / Backfill / Integrity Foundation

### 本次目标

Phase 10 目标不是增加新 UI，而是给已有 legacy project / conversation / message / local window / annotation 数据提供安全迁移基础。

本次实现重点：

```text
migration tracking
audit report
idempotent backfill
reconstructed ContextSnapshot
legacy LLMCallRecord
active path reconstruction
logical index registry
feature flags
high-risk action blocking before backfill ready
integrity validator
dry-run repair
rollback safety
observability metrics
```

### 新增模型

新增到 `RevisionRepositoryState`：

```text
MigrationJob
MigrationBatch
MigrationIssue
BackfillRecord
FeatureFlag
WorkspaceIndexDefinition
WorkspaceMetricRecord
```

这些记录用于回答：

```text
迁移什么时候开始？
处理了哪些 entity？
哪些数据被 backfill？
哪些 issue 是 warning / error？
是否可以安全重跑？
哪些记录是 backfilled？
是否可以 rollback？
```

### 新增事件类型

新增 logic line events：

```text
migration.started
migration.batch.started
migration.batch.completed
migration.completed
migration.failed
migration.rolled_back
backfill.document_version.created
backfill.event_log.created
backfill.timeline_node.created
backfill.context_snapshot.reconstructed
backfill.active_path.created
integrity.validation.completed
integrity.issue.detected
integrity.repair.applied
conversation.created
```

### Audit

新增：

```text
WorkspaceMigrationAuditService.auditLegacyWorkspaceData
```

它会扫描：

```text
projects
conversations
messages
localThreads
annotations
branches
merges
comparisons
existing documentVersions / eventLogs / timelineNodes
```

会记录：

```text
missing_project_id
missing_conversation_id
messages_without_role
assistant_messages_without_content
messages_without_created_at
projects_without_active_conversation
conversations_without_messages
orphan_local_window_data
orphan_annotations
invalid_status
```

Audit 不修改 workspace 主体数据，只写 migration tracking issue/report。

### Backfill

新增：

```text
WorkspaceBackfillService
```

主要函数：

```text
backfillProject
backfillConversation
backfillMessages
backfillDocumentVersions
backfillEventLogs
backfillTimeline
backfillLLMCalls
backfillContextSnapshots
backfillLegacyLocalThreads
backfillLegacyAnnotations
backfillActivePath
markProjectRevisionWorkspaceReady
```

Backfill 幂等规则：

```text
每个 source_entity + backfill_type 都会写 BackfillRecord
重复运行先查 BackfillRecord
已存在目标记录不会重复创建
可恢复 warning/error 会写 MigrationIssue
单条失败不阻塞后续记录
```

DocumentVersion backfill 规则：

```text
每个 main assistant message 生成一个 DocumentVersion
source_type = initial_answer
source_id = assistant_message_id
content_hash = hashContent(content)
version_number = chronological order
parent_document_version_id = previous version
latest version = active
older versions = inactive
conversation.activeDocumentVersionId = latest
```

LLMCallRecord backfill 规则：

```text
outputMessageId = assistant message id
inputMessageId = nearest previous user message
model = message.model or unknown_legacy_model
modelProvider = unknown if legacy missing
status = completed
metadata.backfilled = true
metadata.model_unknown = true when needed
```

ContextSnapshot backfill 规则：

```text
status = reconstructed
metadata.reconstructed = true
metadata.reconstruction_quality = partial
metadata.warning = Original runtime context was not stored in legacy system.
includedItems = best effort previous messages / previous document version
excludedItems = []
```

LocalThread backfill 规则：

```text
if source TextSelection missing:
  try exact selected_text match inside source document version
  unique match -> anchorStatus = active
  no/multiple match -> anchorStatus = needs_review
  record MigrationIssue ambiguous_selection_anchor
```

Annotation backfill 规则：

```text
scope known -> memoryPolicy = auto_by_scope
scope uncertain -> memoryPolicy = manual_only
scope uncertain -> MigrationIssue uncertain_annotation_scope
```

### Integrity

新增：

```text
WorkspaceIntegrityService
```

支持：

```text
validateProject
validateConversation
validateTimeline
validateDocumentVersions
validateMemoryRules
validateNoDeletedContentInContext
```

能检测：

```text
missing active conversation
missing active timeline path/node
missing active document version when assistant answers exist
multiple active DocumentVersion
content_hash mismatch
missing timeline parent
timeline edge source/target missing
active node not on active path
deleted/discarded/inactive object marked includeInContext
deleted object included in ContextSnapshot
```

### Repair

新增：

```text
WorkspaceRepairService.repairWorkspaceIntegrity
scripts/repairWorkspaceIntegrity.ts
```

支持：

```text
--dry-run
--apply
--project-id
--conversation-id
```

自动修复：

```text
missing / wrong content_hash
missing DocumentVersion when assistant messages exist
missing active timeline path when unambiguous
missing sequential edge between obvious main message nodes
```

不会自动修复：

```text
ambiguous selection anchors
multiple active document versions
deleted object referenced by active context
orphan branch with no source
uncertain annotation scope
```

### Rollback

新增：

```text
WorkspaceRollbackService.rollbackWorkspaceMigration
scripts/rollbackWorkspaceMigration.ts
```

默认 rollback 行为：

```text
revision_workspace_enabled = false
legacy_compatibility_mode = true
不删除 legacy data
不删除 backfilled records
```

只有显式传入：

```text
--delete-backfilled-records
```

并且记录满足：

```text
metadata.backfilled = true
BackfillRecord points to it
no new user-created dependency
```

才会考虑移除 backfilled target。

### Feature Flags

新增：

```text
FeatureFlagService
```

默认 flags：

```text
revision_workspace_enabled
event_log_enabled
timeline_graph_enabled
context_snapshot_enabled
document_version_enabled
local_thread_persistence_enabled
annotation_memory_enabled
selective_merge_enabled
revert_enabled
comparison_graph_enabled
action_registry_enabled
legacy_compatibility_mode
```

高风险 action 在 project 未 ready 时会被阻止：

```text
merge.into_document
merge.cancel
timeline.revert_to_node
object.delete
comparison.regenerate
document.confirm_edit
```

返回原因：

```text
revision_workspace_backfill_required
```

### Index Registry

新增：

```text
WorkspaceIndexService
WORKSPACE_INDEX_DEFINITIONS
```

覆盖 Phase 10 要求的 EventLog / Timeline / Message / DocumentVersion / Selection / LocalThread / Annotation / Branch / Merge / Comparison / ContextSnapshot / LLMCall / BackfillRecord 等逻辑索引。

当前项目没有真实数据库 migration，因此这里是可校验的 logical index registry。
如果后续接 SQLite/Postgres，可以把这些 definitions 转成真实 migration。

### Observability

新增：

```text
WorkspaceObservabilityService
```

支持记录：

```text
migration_projects_total
migration_projects_completed
migration_projects_failed
migration_messages_backfilled
migration_document_versions_created
migration_timeline_nodes_created
migration_context_snapshots_reconstructed
migration_issues_warning
migration_issues_error
workspace_action_success_count
workspace_action_failure_count
context_build_latency_ms
timeline_query_latency_ms
document_version_create_latency_ms
merge_confirm_latency_ms
revert_latency_ms
```

日志 / metric 只记录 id、error code、count、duration，不保存完整用户正文或 deleted content。

### 本次验证

新增测试：

```text
src/__tests__/workspace-migration.test.ts
```

覆盖：

```text
audit detects missing fields without mutating workspace data
backfill is idempotent
assistant messages generate DocumentVersions
latest DocumentVersion becomes active
EventLog records are backfilled
TimelineNodes and TimelineEdges are backfilled
active path is reconstructed
LLMCallRecord gets unknown_legacy_model when model missing
ContextSnapshot is reconstructed/partial
legacy local window becomes TextSelection + LocalThread
ambiguous selection anchor becomes needs_review
legacy note with uncertain scope becomes manual_only
integrity validator catches multiple active document versions
repair dry-run does not mutate
repair apply fixes missing content_hash
indexes are present
feature flag compatibility mode exists
high-risk actions blocked before project backfill completes
rollback does not delete legacy data
```

验证命令：

```text
pnpm typecheck
pnpm test
```

验证结果：

```text
typecheck passed
4 test files passed
66 tests passed
```

## 2026-07-05：Phase 10 验收复查补充

根据 Phase 10 验收标准又做了一次逐项复查，补齐了三个实现细节：

### 1. Migration / Backfill / Integrity Logic Line

之前类型里已经有这些 event type，但 system/admin 级别的迁移事件没有全部写入 EventLog。

本次补齐：
```text
migration.started
migration.completed
migration.failed
migration.rolled_back
backfill.document_version.created
backfill.timeline_node.created
backfill.context_snapshot.reconstructed
integrity.validation.completed
integrity.issue.detected
integrity.repair.applied
```

含义：
```text
migration.started / completed / failed / rolled_back
  记录 MigrationJob 生命周期。

backfill.document_version.created
  记录某个旧 assistant answer 被补成 DocumentVersion。

backfill.timeline_node.created
  记录某个 TimelineNode 是迁移补出来的。

backfill.context_snapshot.reconstructed
  记录旧 LLM answer 的 ContextSnapshot 是 reconstructed，不是假装完整原始上下文。

integrity.validation.completed
  记录一次完整性校验结束。

integrity.issue.detected
  记录完整性问题或迁移警告。

integrity.repair.applied
  记录自动修复实际应用了哪些 repair 项。
```

### 2. Legacy Timeline 顺序链修正

旧 conversation backfill 后，Timeline 现在按 revision 顺序恢复：

```text
Legacy project upgraded to revision workspace
→ user message
→ assistant message
→ document version
→ user message
→ assistant message
→ document version
```

也就是说，DocumentVersion 不再只是挂在 assistant message 旁边，而是成为 active path 上的正式顺序节点。

### 3. Deleted / Discarded 迁移安全规则

修正 legacy object backfill 的默认规则：

```text
deleted message
  status = deleted
  includeInContext = false
  reconstructed ContextSnapshot 中 text = ""

discarded message
  status = discarded
  includeInContext = false
  reconstructed ContextSnapshot 中 text = ""

deleted annotation
  status = deleted
  memoryPolicy = never_include
  includeInContext = false

discarded annotation
  status = discarded
  memoryPolicy = excluded_by_default
  includeInContext = false
```

这保证旧 deleted / discarded 内容不会因为迁移默认值被误纳入未来 LLM context。

### 本次新增/更新测试

更新：
```text
src/__tests__/workspace-migration.test.ts
```

新增覆盖：
```text
legacy timeline has assistant -> document version -> next user sequence
migration/backfill event log entries are created
reconstructed context snapshot backfill event is recorded
deleted message is excluded from context after backfill
discarded message is excluded from context after backfill
deleted annotation becomes never_include
discarded annotation becomes excluded_by_default
integrity validation writes admin/debug event logs
repair apply writes integrity.repair.applied
rollback writes migration.rolled_back
```

### 本次验证

命令：
```text
pnpm typecheck
pnpm test
```

结果：
```text
typecheck passed
4 test files passed
67 tests passed
```

## 2026-07-05：Phase 11 Performance / Projection / Cache Foundation

Phase 11 目标不是新增用户工作流，而是给 revision workspace 加可扩展的数据读取层：

```text
timeline 不再只能全量读取
local thread 不再默认加载全部消息
context builder 可以基于 ContextItemIndex 做候选发现
document context 可以使用 DocumentChunk
comparison graph 可以按 summary/window 加载
cache 只保存 refs 和 inclusion/exclusion 决策，不保存完整正文
cache 不能成为 source of truth
deleted / discarded / inactive 内容不能因为 cache 进入未来 context
```

### 新增 Projection / Cache Models

新增到 `src/types/revision.ts`：

```text
TimelineNodeProjectionModel
TimelineGraphSnapshotModel
ObjectRelationIndexModel
ContextItemIndexModel
ThreadSummaryModel
DocumentChunkModel
ContextBuildCacheModel
```

并接入：

```text
RevisionRepositoryState
createEmptyRevisionState
revisionRepository.mergeState
useAnswerAtlasStore snapshot / persist / revisionStateFromStore / revisionStorePatch
```

### Timeline Scaling

新增：

```text
WorkspaceProjectionService
TimelineService.getActivePathOverview
TimelineService.getTimelineWindow
TimelineService.getObjectSubgraph
TimelineService.getBranchSubgraph
TimelineService.getMergeBackEdges
GET /api/timeline/window
```

规则：

```text
overview/window 查询优先使用 TimelineNodeProjection
projection 缺失时可从 TimelineNode 即时构造
window query 默认 limit = 50
返回 node projections + relevant edge projections + hasMoreBefore/hasMoreAfter
```

10k node projection 重建做了预计算优化：

```text
edgesBySource
edgesByTarget
relationsByObject
```

避免每个 node 反复扫描全量 edges。

### ObjectRelationIndex

新增关系索引重建：

```text
WorkspaceProjectionService.rebuildObjectRelationIndex
WorkspaceProjectionService.getRelationsForObject
WorkspaceProjectionService.relatedObjectCounts
```

覆盖：

```text
TextSelection -> LocalThread
TextSelection -> Annotation
TextSelection -> RevisionBranch
TextSelection -> MergeRecord
TextSelection -> ComparisonGraph
LocalThread -> Message
LocalThread -> NestedLocalThread
LocalThread -> Annotation
LocalThread -> MergeRecord
RevisionBranch -> MergeRecord
RevisionBranch -> Annotation
RevisionBranch -> ComparisonGraph
ComparisonGraph -> ComparisonRun
ComparisonRun -> ComparisonExport
```

`revisionRepository.getRelatedObjectsForSelection` 现在会优先使用 ObjectRelationIndex；缺失时自动重建。

### Local Thread Lazy Loading

新增：

```text
LocalThreadQueryService.openLocalThread
LocalThreadQueryService.getMessagePage
GET /api/local-threads/:id
GET /api/local-threads/:id/messages?before=&after=&limit=
```

打开 LocalWindow 默认返回：

```text
thread metadata
parent selected text
last 20 messages
related object counts
latest related notes preview
merge history summary
```

不会默认加载全部 local messages。

### DocumentChunk

新增：

```text
DocumentChunkService.createChunksForDocumentVersion
DocumentChunkService.getChunksForVersion
DocumentChunkService.getChunkAroundOffset
DocumentChunkService.getChunksForRange
```

规则：

```text
paragraph-based chunks
target 500-1000 tokens
preserve start_offset / end_offset
DocumentVersion created by initial answer / manual edit / legacy backfill 时自动生成 chunks
```

### ThreadSummary

新增：

```text
ThreadSummaryService.getOrCreateThreadSummary
ThreadSummaryService.updateThreadSummaryIfNeeded
ThreadSummaryService.summarizeMessages
ThreadSummaryService.markThreadSummaryStale
```

规则：

```text
message_count > 50 或 token threshold 超过时 summarization
recent messages 保留 raw
older messages 进入 ThreadSummary
默认使用 deterministic summary
如果 useLLM=true，会创建 LLMCallRecord 和 ContextSnapshot
```

### ContextItemIndex

新增：

```text
WorkspaceProjectionService.rebuildContextItemIndex
```

索引对象：

```text
DocumentVersion
DocumentChunk
Message
ThreadSummary
Annotation
RevisionBranch
confirmed MergeRecord summary
ComparisonRun summary
TextSelection
LocalSelection
```

每条 index 至少记录：

```text
scope_type / scope_id
memory_scope
memory_effect
memory_policy
status
active_path_id
token_estimate
content_preview
content_hash
```

deleted 内容：

```text
content_preview = ""
token_estimate = 0
memory_policy = never_include
metadata.usable = false
```

### Scalable Context Builder

新增：

```text
ContextSnapshotService.buildScalableContextSnapshot
ContextSnapshotService.getContextReviewSummary
ContextSnapshotService.getContextSnapshotItemsPage
GET /api/context-snapshots/:id
GET /api/context-snapshots/:id/items?group=included|excluded|compressed|truncated&limit=&cursor=
```

Pipeline：

```text
1. candidate discovery from ContextItemIndex
2. status filter
3. scope filter
4. priority ranking
5. token budgeting
6. compression/truncation groups
7. save ContextSnapshot
8. save ContextBuildCache refs
9. record latency metrics
```

优先级规则已实现：

```text
current selected text / local selection = 95
active document chunks = 90
current thread recent messages = 85
active scoped annotations = 80
parent/current thread summary = 75
confirmed merge summary = 70
older thread summary = 60
project notes = 50
active comparison summary = 45
```

### ContextBuildCache

新增：

```text
ContextBuildCacheService
CONTEXT_RULES_VERSION = phase-11-v1
```

cache key 包含：

```text
project_id
conversation_id
thread_type
thread_id
scope_type
scope_id
active_document_version_id
active_timeline_node_id
active_path_id
context_rules_version
input_fingerprint
```

缓存只保存：

```text
included item refs
excluded item refs
compressed item refs
token estimate
decision metadata
```

不保存完整正文。

Cache stale 防护：

```text
如果 cached included/compressed refs 当前变成 deleted/discarded/inactive
  -> invalidate cache
  -> record cache_stale_read_prevented_count
  -> fresh build with useCache=false
```

excluded refs 可以包含 deleted 对象，因为它们本来就是排除解释来源，不会导致 cache miss。

### Comparison Graph Scaling

新增：

```text
ComparisonGraphQueryService.getGraphSummary
ComparisonGraphQueryService.getGraphWindow
ComparisonGraphQueryService.exportGraphFromBackend
GET /api/comparisons/:id/graph-summary
GET /api/comparison-runs/:id/graph-window
```

规则：

```text
node_count > 200 或 edge_count > 500
  -> defaultView = semantic_groups
  -> 不默认加载完整 graphData

graph-window 支持 groupId / cursor / limit
source fragments 仍通过 ref 延迟打开
```

### Metrics

新增 Phase 11 metrics：

```text
timeline_overview_latency_ms
timeline_window_latency_ms
object_subgraph_latency_ms
related_objects_latency_ms
context_candidate_query_latency_ms
context_status_filter_latency_ms
context_ranking_latency_ms
context_compression_latency_ms
context_total_build_latency_ms
context_cache_hit_rate
local_thread_open_latency_ms
local_thread_message_page_latency_ms
document_chunk_create_latency_ms
document_chunk_query_latency_ms
comparison_graph_load_latency_ms
comparison_export_latency_ms
slow_query_count
cache_invalidation_count
cache_stale_read_prevented_count
```

### Logical Index Registry

`WorkspaceIndexService` 增加 Phase 11 logical indexes：

```text
TimelineNodeProjection
TimelineGraphSnapshot
ObjectRelationIndex
ContextItemIndex
ThreadSummary
DocumentChunk
ContextBuildCache
```

当前仍是 logical index registry，不是真实数据库索引。未来接 SQLite/Postgres 时可以转成 migration。

### 新增测试

新增：

```text
src/__tests__/workspace-performance.test.ts
```

覆盖：

```text
10,000 timeline nodes projection rebuild
timeline window query returns 50 nodes
object subgraph query stays bounded
local thread open returns last 20 messages
related object counts from ObjectRelationIndex
DocumentChunk creation
ContextItemIndex population
indexed context build
context cache hit
cache stale read prevention when included object becomes deleted
ThreadSummary for > 50 messages
large comparison graph summary defaults to semantic groups
comparison graph window paging
```

### 本次验证

命令：
```text
pnpm typecheck
pnpm test
```

结果：
```text
typecheck passed
5 test files passed
71 tests passed
```

## Phase 11 验收补丁记录：轻量加载、性能事件、缓存安全

### 本次补齐目标

这一轮不是重做 UI，而是把 Phase 11 的验收点补成可查询、可追溯的底层行为：

```text
project open 不再要求全量消息 / context snapshot / timeline 一次性加载
timeline overview 只返回轻量概览和少量节点
timeline window 默认 50 个节点分页
context cache create / hit / invalidate 写入 EventLog
thread summary create / update / invalidate 写入 EventLog
document chunks created 写入 EventLog
comparison large graph 支持 summary/group/window/source refs 延迟加载
cache hit 时生成的 ContextSnapshot 也必须持久保存
delete/discard/restore 后会重建 ContextItemIndex 并让相关 context cache 失效
```

### 新增 / 修改的 API

新增：

```text
GET /api/revision/projects/:projectId/open
```

返回内容只包含：

```text
project metadata
conversation metadata
current document version metadata
active path overview
active path overview snapshot
initial timeline window
```

注意：`currentDocumentVersion` 只返回 metadata 和 contentHash，不返回完整 content，避免打开大 project 时把主文档正文和全部历史一起拉出来。

新增：

```text
GET /api/timeline/overview
```

用途：

```text
创建 / 读取 active_path_overview snapshot
写入 timeline.snapshot.created
返回轻量 overview，不返回完整 timeline graph
```

新增：

```text
GET /api/comparison-runs/:runId/node-source-refs?nodeId=...
```

用途：

```text
点击 comparison node 时再加载 source refs
不在初始 comparison summary / graph window 中加载所有来源正文
```

修改：

```text
GET /api/comparisons/:comparisonId/graph-summary
GET /api/comparison-runs/:runId/graph-window
```

现在通过 repository action 查询，从而可以记录：

```text
comparison.graph.clustered
comparison.graph.window_loaded
```

### Timeline 轻量概览规则

`TimelineService.getActivePathOverview` 已调整为轻量返回。

规则：

```text
nodeCount = active path projection total count
nodes = latest 10 projection nodes only
returnedNodeCount = nodes.length
fullNodeListTruncated = nodeCount > returnedNodeCount
```

完整节点不走 overview 返回，必须走：

```text
TimelineService.getTimelineWindow
GET /api/timeline/window
```

默认窗口：

```text
limit = 50
max limit = 200
direction = before / after / around
```

### Timeline Snapshot

新增：

```text
TimelineService.createActivePathOverviewSnapshot
```

它会保存：

```text
TimelineGraphSnapshot
snapshotType = active_path_overview
graphSummary = overview metadata
graphData.nodes = latest lightweight overview nodes only
collapsedGroupCount = hidden node count
```

并写入：

```text
EventLog: timeline.snapshot.created
```

当 timeline node 变化并导致旧 snapshot 过期时：

```text
WorkspaceProjectionService.markTimelineGraphSnapshotsStale
```

会写入：

```text
EventLog: timeline.snapshot.invalidated
```

### Context Cache 事件与安全规则

`ContextBuildCacheService` 现在记录：

```text
context.cache.created
context.cache.hit
context.cache.invalidated
```

cache 仍然只保存 refs，不保存完整正文：

```text
includedItemRefs
excludedItemRefs
compressedItemRefs
tokenEstimate
contextRulesVersion
inputFingerprint
```

cache hit 时修复了一个重要问题：

```text
命中 cache 后生成的 ContextSnapshot 现在会写入 contextSnapshots
```

也就是说，每次 LLM 调用都能查到对应 snapshot，即使这次上下文决策来自 cache。

delete / discard / restore 后的处理：

```text
ObjectStateService.runStateChange
  -> 更新对象状态
  -> 写 EventLog / TimelineNode
  -> rebuild ContextItemIndex
  -> invalidate related ContextBuildCache
```

这保证：

```text
deleted note 不会因为旧 cache 再进入 LLM context
discarded note 默认排除
Context Review 不显示 deleted note 正文
下一次 ContextSnapshot 会 fresh build
```

### Thread Summary 事件

`ThreadSummaryService` 现在记录：

```text
thread.summary.created
thread.summary.updated
thread.summary.invalidated
```

长 thread 规则保持不变：

```text
message_count > 50
或 total token > 6000
  -> older messages 生成 ThreadSummary
  -> recent raw messages 保留 12 条
```

### Document Chunk 事件

`DocumentChunkService.createChunksForDocumentVersion` 现在记录：

```text
document.chunks.created
```

payload 包含：

```text
document_version_id
chunk_count
chunk_ids
content_hash
```

### Comparison 大图加载规则

大图判断：

```text
node_count > 200
或 edge_count > 500
  -> defaultView = semantic_groups
```

加载顺序：

```text
graph-summary
  -> semantic groups / summary
graph-window
  -> groupId + cursor + limit 分页加载 nodes/edges
node-source-refs
  -> 点击某个 node 后再加载 source refs
export
  -> 仍从后端 run.graphData 生成完整导出
```

### 本次新增验收测试

扩展：

```text
src/__tests__/workspace-performance.test.ts
```

新增覆盖：

```text
active path overview 只返回 <= 10 个轻量节点
timeline.snapshot.created 写入 EventLog
project open payload 只返回 metadata + initial 50 node window
currentDocumentVersion 不返回 content
cache hit snapshot 被持久保存
delete annotation 后 context.cache.invalidated 被记录
delete annotation 后下一次 ContextSnapshot fresh build
deleted note 的 Context Review text 为空
comparison node source refs 延迟加载
```

### 本次验证

命令：

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

说明：

```text
第一次 pnpm test 在 sandbox 内遇到 Windows spawn EPERM。
按权限规则使用提升权限重跑 pnpm test 后通过。
```

## Semantic Difference Map 修复记录：local answer 后自动生成 semantic map

### 问题原因

Semantic Difference Map 没有内容，并不是底层 semantic map 生成器被删掉，而是调用链断了。

旧 UI 的显示逻辑是：

```text
ArgumentEvidenceComparison
  -> 从 store.comparisons 中按 selectedAnchorId 找 active comparison
  -> 读取 comparison.semanticMap
  -> 渲染 SemanticDifferenceMapView
```

但当前 `askLocalQuestion` 流程只保存了：

```text
local user message
local assistant message
context snapshot
llm call record
timeline nodes / edges
revisionSuggestions[threadId]
```

它没有再调用：

```text
/api/llm/argument-comparison
```

也没有写回：

```text
store.comparisons[comparisonId].semanticMap
```

因此右侧 Semantic Difference Map 面板会进入空状态。

### 本次修复

修改位置：

```text
src/store/useAnswerAtlasStore.ts
```

修复后的流程：

```text
用户在 Local Window 提问
  -> /api/local-threads/:threadId/messages 生成 local answer
  -> 如果有 revisedText，则使用 revisedText
  -> 如果没有 revisedText，则使用 assistant answer
  -> 调用 /api/llm/argument-comparison
  -> 生成 ArgumentComparison.semanticMap
  -> 写入 store.comparisons
  -> 创建 / 恢复对应 tree comparison window
  -> 设置 activeTreeWindowId
  -> SemanticDifferenceMapView 自动显示内容
```

### fallback 规则

如果 `/api/llm/argument-comparison` 失败：

```text
使用 createArgumentComparisonFromTexts 本地 deterministic fallback
```

这样即使模型/API 暂时失败，Semantic Difference Map 也不会空白。

fallback 只用于保证 UI 有结构化比较结果；正常情况下仍然优先使用模型生成的 semantic map。

### persistent revision graph 同步

为了不只修旧 UI，本次也同步创建 persistent comparison：

```text
ComparisonService.createComparison
```

sources：

```text
text_selection = 原始选中文本
message = local assistant answer
```

scope：

```text
scopeType = comparison
scopeId = visible legacy comparison id
```

并在 persistent `ComparisonGraph.payload` 中记录：

```text
legacy_comparison_id
legacyComparisonId
```

这样旧 UI 的 `ArgumentComparison` 和新 revision workspace 的 `ComparisonGraph/ComparisonRun` 可以互相找到。

### memory / context 影响

Semantic Difference Map 生成本身不会直接进入 main conversation memory。

进入 context 的规则仍然是：

```text
main conversation 默认排除 comparison
comparison panel 内提问可以包含 active comparison
deleted comparison 永不进入 context
cleared comparison 默认不进入 context
```

本次生成的 persistent comparison 会写入：

```text
comparison.created
comparison.run.created
comparison.generated
llm.call.started
llm.call.completed
context_snapshot.created
timeline nodes / edges
```

### 验证

命令：

```text
pnpm typecheck
pnpm test
```

结果：

```text
typecheck passed
5 test files passed
72 tests passed
```

说明：

```text
pnpm test 第一次在 sandbox 内仍然遇到 Windows spawn EPERM。
提升权限重跑后通过。
```
## 2026-07-06 - Timeline anchor hub and zoom controls

### Change reason

The timeline was still hard to read when the same selected text created several actions. Multiple nodes for the same selected sentence could appear as repeated branches, and the graph used large slots that forced horizontal scrolling before the user could understand the structure.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/components/timeline/TimelineNode.tsx
src/components/timeline/BranchLane.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New visualization rule

The timeline now separates stored event history from visual reasoning structure:

```text
Persistent EventLog / VersionNode data
-> remains unchanged

Visual timeline graph
-> groups repeated selections into one anchor hub
-> connects actions on the same selected text back to that hub
-> hides duplicate anchor nodes from the visible graph
```

This means one selected text should appear once as a human-readable anchor, for example:

```text
Check: "selected sentence..."
```

Different actions on that same selection become sibling actions from the same hub:

```text
Check: "selected sentence..."
|- Suggest: "selected sentence..."
|- Draft: "selected sentence..."
`- Merged back
```

This is only a visualization aggregation. It does not delete events, messages, branches, notes, memory, or database objects.

### Memory and LLM context effect

This change has no direct LLM memory effect.

```text
memory_scope = timeline_visualization
memory_effect = none
```

The visual hub only changes how timeline nodes are displayed and connected. ContextSnapshot inclusion / exclusion still depends on object status, active path, merge confirmation, note scope, and deleted / discarded rules.

### UI changes

The timeline graph now has explicit zoom controls:

```text
-     zoom out
+     zoom in
Fit   compresses the visible graph so more levels fit on screen
```

Mouse wheel still scrolls the timeline. It does not zoom.

The node chip size and horizontal slot width were reduced so the first view can show more of the reasoning structure. Hover still shows detailed information; the visible label stays short.
## 2026-07-06 - Timeline logical-source layout

### Change reason

The previous timeline still used visible event order as the horizontal position. That made related actions drift to the right by time even when they logically belonged under an earlier answer, selected text, local answer, branch, or note. The user clarified that the timeline should reflect human reasoning first; time should be secondary metadata.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New layout rule

The timeline now computes two display coordinates for each visible node:

```text
logicColumn
-> horizontal logical progression

stackIndex
-> vertical offset inside the same lane and same logical column
```

`logicColumn` is not the raw event time index. It is derived from the object that the action actually acts on.

### Source attachment rules

```text
document_created / document_revised / merged / reverted
-> main path progression

anchor_selected
-> same logicColumn as its source answer / source version
-> one level below source

local_answer_generated
-> attaches to the existing anchor hub or previous local answer in the same thread
-> moves one logic step to the right from that source

branch_created / revision_generated
-> attaches to the previous local/thread object when available
-> otherwise attaches to the selected text hub

annotation_added / annotation_deleted
-> attaches to the object it came from: local thread, branch, selected text hub, or raw parent fallback
-> displays in memory lane

discarded / deleted
-> attaches to the object being discarded/deleted
-> displays in inactive/deleted history lane

merged
-> attaches to latest branch/local-thread object when available
-> displays as a return to the main path
```

### Visual behavior

If two actions happen to the same object, they no longer appear as unrelated timeline events. They share the same source object and then branch out according to their action type.

Example:

```text
Answer v1
|
`- Check: "selected sentence..."
   |- Suggest: "selected sentence..."
   |- Draft: "selected sentence..."
   |- Saved note
   `- Merged back -> main path
```

Multiple nodes in the same lane and same logic column use `stackIndex`, so they do not overlap.

### Memory and LLM context effect

This change only affects timeline visualization.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not delete event history, does not delete messages, does not change document versions, and does not include/exclude anything from future LLM context. ContextSnapshot behavior still follows object status, active path, note scope, merge confirmation, discarded/deleted rules, and explicit memory policy.
## 2026-07-06 - Timeline source-parent resolver for checks

### Change reason

The timeline could still attach a new Check node to the latest Suggest/local answer when that Check actually came from the main answer. This happened because thread sequence was still stronger than source identity in some cases.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New resolver rule

Timeline parent resolution is now split conceptually:

```text
source parent
-> the object the action is about

sequence parent
-> the previous message/action in a local conversation
```

`anchor_selected` / Check nodes must use source parent first. They do not use the latest node in a thread.

### Message source mapping

The visualizer now maps known message ids back to their source VersionNode ids:

```text
rev-message-assistant-{suffix}
-> v-created-{suffix}
-> v-main-answer-{suffix}

conv-assistant-{suffix}
-> v-created-{suffix}
-> v-main-answer-{suffix}

rev-message-regenerated-{suffix}
-> v-main-answer-{suffix}
-> v-created-{suffix}

rev-local-message-assistant-{suffix}
-> v-local-answer-{suffix}

rev-nested-local-message-assistant-{suffix}
-> v-local-answer-{suffix}

msg-assistant-{suffix}
-> v-local-answer-{suffix}
```

If a Check was selected from the main answer, it attaches to that main answer node even if another local thread node was created more recently.

If a Check was selected from a local answer, it attaches to that local answer node.

If source message metadata is missing and the Check has no source thread, it falls back to the latest main document node before the Check was created.

### Regression coverage

Added `src/__tests__/timeline-humanize.test.ts`.

The tests cover:

```text
main-answer check after a local suggest
-> visualParentId remains the main answer

local-answer check
-> visualParentId is the local answer
```

### Memory and LLM context effect

This is still visualization-only.

```text
memory_scope = timeline_visualization
memory_effect = none
```

No event, message, document version, note, branch, merge record, or context snapshot is deleted or changed by this resolver.
## 2026-07-06 - Timeline edge fan routing

### Change reason

Several timeline edges could overlap when multiple actions shared the same source node or the same visual parent. This made the logical structure look like one thick or ambiguous line.

### Updated files

```text
src/components/timeline/VersionTimeline.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New edge routing rule

The timeline now builds explicit edge routes before rendering SVG paths.

```text
visible node
-> resolve visual parent
-> create edge route
-> group routes by parent node
-> sort by target position
-> assign fan offset
-> render separated curved path
```

Edges from the same parent no longer share the exact same curve. Each outgoing edge receives a bounded offset.

### Routing details

```text
EDGE_FAN_GAP = 16
EDGE_FAN_LIMIT = 40
```

The offset affects:

```text
start x
end x
control points
```

Same-column edges use a vertical curved route with a shifted control x. Cross-column edges use shifted cubic control points.

This keeps edges attached visually to their nodes while making sibling branches readable.

### Memory and LLM context effect

This change only affects SVG edge drawing.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change EventLog, TimelineNode, document versions, active path, notes, branches, merges, or ContextSnapshot rules.
## 2026-07-06 - Timeline port-based orthogonal edge routing

### Change reason

The previous fan offset still allowed edges to visually overlap because paths started near the same dot center and curved through node cards. In dense logic branches, several lines could pass through the same card area and become unreadable.

### Updated files

```text
src/components/timeline/VersionTimeline.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New routing rule

Timeline edges now use port-based orthogonal routing instead of direct Bezier routing.

```text
node card
-> exposes virtual side / bottom / top ports

edge
-> exits from a card edge
-> travels through a side rail or mid rail
-> enters the target card edge
```

This keeps lines out of the text card area.

### Route types

```text
same-column / branch-down
-> parent bottom port
-> side rail
-> child top port

rightward sequence
-> parent right port
-> middle vertical rail
-> child left port

leftward return / back edge
-> parent left port
-> middle vertical rail
-> child right port

fallback overlap case
-> top rail above both cards
```

### Offset rules

Edges still receive offsets, but the offsets now affect ports and rails rather than only Bezier control points.

```text
outgoing routes from the same parent
-> sorted by target position
-> assigned source offset

incoming routes to the same child
-> sorted by source position
-> assigned target offset
```

Constants:

```text
EDGE_FAN_GAP = 16
EDGE_FAN_LIMIT = 40
SIDE_RAIL_GAP = 28
```

### Memory and LLM context effect

This is a pure SVG routing change.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change timeline data, EventLog, active path, document versions, local threads, notes, branches, merges, or ContextSnapshot inclusion rules.

## 2026-07-06 - Timeline lightweight logic path visualization

### User request

The previous timeline still looked too much like a boxed flowchart. Curved/straight edges overlapped with node cards, and some local checks appeared directly below the main answer, making them look like vertical continuations instead of user-created branch actions. The user asked for a more human-logic-oriented timeline:

- no large cards for each node;
- show only a short action label by default;
- show details only on hover or click;
- draw smooth forward curves instead of stiff box-routed lines;
- place a check/selection slightly after its source answer rather than exactly below it;
- reduce visual overlap between several actions that come from the same source.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/TimelineNode.tsx
src/components/timeline/VersionTimeline.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Layout rule changes

Timeline layout is now closer to a logic map than a time-only row.

```text
main progress node
-> keeps advancing on the main path

selection / check node
-> attaches to the actual source answer
-> appears about half a step after that source answer
-> no longer sits exactly underneath the source answer

memory note
-> stays close to its source
-> moves a small step forward so it is readable as an action

discard / delete state node
-> appears shortly after the object it changes
```

When several nodes share the same parent and lane, the layout now gives them a small horizontal spread. This makes related actions read as sibling branches instead of stacked duplicates.

### Node rendering rule changes

Timeline nodes now render as:

```text
colored dot + short label
```

The visible label is intentionally short. Detailed information is moved into the hover panel:

```text
relation label
status label
active marker
anchor action count
full title
subtitle / selected text excerpt
folded branch reason
timestamp
```

Clicking the dot or short label still opens the same action menu:

```text
Revert to This Node
View Diff
Open Related Thread
Delete Related Answer
```

### Edge rendering rule changes

Timeline edges now use smooth forward Bezier curves from dot to dot.

```text
parent dot
-> forward curved path
-> child dot
```

For multiple outgoing or incoming edges, the route receives a fan offset. The offset changes the curve control points so several lines do not sit on top of each other.

### Memory and LLM context effect

This update only changes timeline visualization.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change EventLog data, active path data, document version data, local thread storage, notes, branches, merges, LLMCallRecord, ContextSnapshot, or context inclusion/exclusion rules.

## 2026-07-06 - Timeline semantic lanes and forward-curve action routing

### User correction

The previous compact timeline still placed different operations too close together. The user clarified that operations should live in different semantic layers, but edges should not fall vertically downward. Each operation should move slightly forward with a detailed curve:

```text
Answer -> Check
Check -> Ask
Ask -> Suggest
```

`Local Question -> Suggest` should mainly move to the right because it is the answer generated from the local question.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/TimelineNode.tsx
src/components/timeline/VersionTimeline.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New lane rules

Timeline lanes are now based on user-visible action semantics instead of generic numeric depth labels:

```text
Main Path
-> document answers, document versions, revert points

Checks
-> selected text / check actions

Local Questions
-> user questions about selected text

Suggestions
-> local LLM answers and suggested wording

Drafts
-> branches and draft revisions

Merge Back
-> confirmed merges returning to the main document

Memory Notes
-> explicit notes

Inactive History
-> hidden inactive / discarded / deleted history when enabled
```

### New position rules

Nodes still attach to their real logical source object, but their x-position is determined by action type:

```text
Check
-> parent column + small forward step

Ask
-> check column + small forward step

Suggest
-> ask column + larger rightward step

Draft
-> suggest column + forward step

Merge
-> returns toward the main path visually through the merge lane
```

This keeps operations separated by lane while preserving the feeling that every step moves forward.

### Label visibility rules

Timeline nodes remain lightweight:

```text
dot + short label
```

The short label now uses a subtle background without a border so curves do not visually cut through the text. Full source text, relation labels, status, and timestamps remain in hover/click details.

### Memory and LLM context effect

This is a visualization-only update.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change stored events, timeline nodes, active path state, document versions, local thread state, notes, branches, merges, LLM calls, or ContextSnapshot inclusion rules.

## 2026-07-06 - Timeline branch-row layout by check/thread

### User correction

The previous semantic-lane timeline was still wrong because it treated `Check`, `Ask`, and `Suggest` as different vertical layers. The corrected model is:

```text
Main answer
  -> Check A -> Ask/Suggest/Draft/Merge...
  -> Check B -> Ask/Suggest/Draft/Merge...

Check A's suggestion
  -> nested Check A.1 -> Ask/Suggest/Draft...
```

The vertical axis now represents separate local revision paths. The horizontal axis represents progress inside the same local path.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/components/timeline/TimelineNode.tsx
src/components/timeline/BranchLane.tsx
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New row rules

Timeline rows are now dynamic.

```text
row-main
-> main document path only

row-anchor-{anchor/check id}
-> one row per check / selected-text local revision path

row-memory
-> explicit notes when enabled

row-inactive
-> inactive, discarded, or deleted history when enabled
```

Every check creates or reuses a row keyed by its anchor/check identity. All operations that belong to that check stay on the same row:

```text
Check -> Ask -> Suggest -> Draft -> Merge proposal
```

Nested checks create child rows under the parent check row. Their source parent remains the actual local answer or suggestion node, not the main answer.

### Row ordering rules

Rows are ordered as a tree:

```text
Main Path
  Check 1
    Nested Check
  Check 2
  Check 3
Memory Notes
Inactive History
```

This keeps nested local reasoning visually near the parent branch instead of grouping all checks, all questions, or all suggestions together.

### Label placement rules

The visible label is no longer placed on the line height.

```text
label
dot ------ edge
```

The dot remains the routing point. The short label sits above and to the right of the dot with a subtle white background, so horizontal branch edges do not run through text. Hover/click details still contain full text and metadata.

### Test coverage

The timeline humanize tests now verify:

```text
source answer checks attach to the source answer
same-check suggestion stays in the same row as its check
different checks from the same answer use different rows
nested checks from local answers create a different child row
```

### Memory and LLM context effect

This is still a visualization-only update.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change EventLog records, TimelineNode storage, active path state, document versions, local thread state, notes, branches, merges, LLM calls, or ContextSnapshot inclusion rules.

## 2026-07-06 - Timeline tooltip pinning and hover stability

### User request

Timeline details were visually useful, but the hover card could flicker near the edge of a node because the card appeared and disappeared as the mouse crossed the hover boundary. The user requested a way to make the detail card stay open:

```text
right click node -> keep detail card visible
click again / close -> hide detail card
```

### Updated files

```text
src/components/timeline/TimelineNode.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Interaction rules

Timeline node details now use React state instead of pure CSS `group-hover`.

```text
mouse enter
-> show details

mouse leave
-> wait briefly, then hide details

right click node
-> pin / unpin details

left click pinned node
-> close pinned details

click X in pinned card
-> close pinned details
```

The brief leave delay reduces edge flicker when the cursor moves between the node label and the detail card.

### Memory and LLM context effect

This is a UI-only change.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change EventLog, TimelineNode storage, active path state, document versions, local threads, notes, branches, merges, LLM calls, or ContextSnapshot inclusion rules.

### Follow-up fix

Pinned and hovered timeline detail cards now use a higher z-index than timeline nodes and SVG edges.

```text
hovered / pinned node container -> z-[80]
detail card / action menu -> z-[90]
```

This ensures the detail card visually covers nearby labels and lines instead of being covered by them.

### Follow-up interaction change

Left click no longer opens a persistent timeline box.

```text
left click normal node
-> no persistent box
-> keeps only the temporary hover detail behavior

left click pinned node
-> closes the pinned detail card

right click node
-> still pins / unpins the detail card
```

This keeps persistent details reserved for the explicit right-click action.

### Follow-up correction

The left-click behavior was corrected again:

```text
left click node
-> opens / closes the original action menu
-> does not pin the detail page
-> clears any hover or pinned detail page first

right click node
-> pins / unpins the detail page
```

This separates the two interactions clearly: left click is for actions, right click is for persistent details.

## 2026-07-06 - Timeline main path separation and state visuals

### User request

The timeline should primarily show human reasoning logic rather than flattening every action onto one time line. The user also pointed out that deleted or discarded local work should visibly change the line / dot state instead of looking like a normal active branch.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Main path rule

The main path now represents only accepted global document movement:

```text
document_created
document_revised
reverted
```

Local actions no longer become part of the main row just because they happened later in time.

When a normal main answer / manual document update is created after local work, the timeline display connects it to the latest previous main-path document node. This prevents the main path from accidentally appearing to continue from a local suggestion.

### Merge-back rule

If a document revision is created from a real merge node, the display keeps that relationship:

```text
local check / suggestion
-> merge action in local row
-> new document version on main path
```

So the merge action itself stays in the local branch row, while the resulting document version lands back on the main path.

### Discard / Delete visual rule

Discarded and deleted objects stay attached to the affected local row when they have related anchor/thread/branch ids.

```text
discarded local thread
-> same local check row
-> amber dot / amber row tint
-> dashed lower-opacity edge

deleted local thread
-> same local check row
-> red dot / red row tint
-> dashed lower-opacity edge
```

This makes the state change visible without pretending the discarded/deleted object is a new logical branch.

### Test coverage

The timeline humanize tests now verify:

```text
checks from main answers attach to their source answer
checks from local answers attach to the source local answer
main answers after local work stay on the main path
merge nodes stay in the local row while the document version merges back
discarded and deleted nodes stay in the affected local row with the right tone
```

### Memory and LLM context effect

This update is timeline visualization logic only.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change EventLog records, TimelineNode persistence, active path storage, document versions, local thread state, annotations, merge records, LLM calls, or ContextSnapshot inclusion / exclusion rules.

## 2026-07-06 - Timeline answer naming and removed-path visibility

### User request

The timeline showed some main answer continuation nodes as:

```text
Saved revision
```

This was confusing because the user was continuing the main answer conversation, not explicitly saving a manual revision. The user also noted that there was no clear option for hiding deleted branches.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/BranchLane.tsx
src/components/timeline/VersionTimeline.tsx
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Naming rule

Main answer nodes now use action-oriented names instead of internal version numbers:

```text
Initial response
Follow-up response
```

This keeps main chat continuation understandable as a user action instead of exposing internal sequence labels like `v1`, `v2`, or `v3`.

Manual document versions still keep document wording:

```text
Edited document
Merged local change
Updated document
```

### Removed paths visibility rule

The timeline sidebar now has a removed-path toggle:

```text
Show removed paths (N)
Hide removed paths (N)
```

Removed paths mean timeline rows affected by:

```text
discarded
deleted
```

By default, removed paths are hidden so the main reasoning map does not stay cluttered with deleted or discarded local branches. Turning the option on restores those rows with their existing amber/red styling and dashed edges.

If a deleted/discarded row has nested follow-up rows, the nested rows are folded with it. This prevents orphaned child rows from appearing without their deleted parent branch.

### Test coverage

The timeline humanize tests now verify:

```text
main answer continuation is named Follow-up response instead of Saved revision
removed paths are hidden when showRemovedPaths = false
removed paths return when showRemovedPaths = true
main path nodes remain visible while removed local rows are hidden
```

### Memory and LLM context effect

This is still a visualization-only change.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not delete timeline records, local threads, messages, branches, EventLog records, TimelineNodes, document versions, LLM calls, or ContextSnapshot data. Hidden removed paths are only hidden from the current visual timeline view.

## 2026-07-06 - Timeline content-aware labels

### User request

The user clarified that timeline labels should not be generic names such as:

```text
Initial response
Follow-up response
Answer v1
Answer v2
```

Every short label should make clear what the step is about.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Label rule

Timeline nodes now use:

```text
action: content topic
```

Examples:

```text
Answered: What is Quanzhou?
Follow-up: Add more about Quanzhou history
Check: Quanzhou is a major coastal city...
Suggest: Can this sentence be more specific...
Edited: Quanzhou overview
Merge: historic port sentence
Delete: local check on Quanzhou history
```

### Data sources used

The title generator now reads real workspace context instead of relying only on fixed node labels.

```text
main answer nodes
-> user conversation message matched by node id suffix
-> fallback to document title

check nodes
-> selected anchor text

local answer nodes
-> local user question matched by node id suffix
-> fallback to local answer text
-> fallback to selected text

edit / merge / delete / discard nodes
-> selected text, local answer, document title, or user question depending on source
```

### Detail subtitle rule

The one-line label remains short. Hover details now preserve fuller context, for example:

```text
User asked: ...
User followed up: ...
Selected text: ...
Local question: ...
Affected branch: ...
```

This keeps the visual graph readable while still letting the user inspect the exact source.

### Test coverage

The timeline humanize tests now verify:

```text
main answer title uses the user prompt
follow-up answer title uses the follow-up prompt
local suggestion title uses the local question
removed-path hiding still works with content-aware labels
```

### Memory and LLM context effect

This is a visualization-only change.

```text
memory_scope = timeline_visualization
memory_effect = none
```

It does not change EventLog, TimelineNode storage, local threads, messages, document versions, LLM calls, or ContextSnapshot inclusion rules.

## 2026-07-06 - Timeline impact previews and path-aware chat visibility

### User request

The user clarified that timeline operations should affect more than the visual node. Revert should switch the active memory path, while later chat and workspace objects should become inactive rather than being physically deleted. Delete should also be explicit and preview its effect before changing related messages or local work.

### Updated files

```text
src/components/timeline/TimelineNode.tsx
src/components/timeline/TimelineImpactDialog.tsx
src/components/timeline/VersionTimeline.tsx
src/components/document/MainDocumentPanel.tsx
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Timeline node menu

The node menu now uses preview-oriented actions:

```text
View Details
View Context Impact
Preview Revert
View Diff
Open Related Thread
Preview Delete
```

This makes destructive or path-changing behavior explicit before the user confirms anything.

### Revert preview

Preview Revert now shows:

```text
target node
current status
future active nodes that would become inactive
related threads / selections
memory effect
warnings
```

Confirming still calls the existing `revertToNode` flow. The dialog explains that records are not physically removed; later nodes become inactive and should be excluded from future LLM context.

### Delete preview

Preview Delete now shows affected related objects and memory effect.

Current confirm behavior is intentionally conservative:

```text
node with related local thread
-> can confirm using existing local-answer delete flow

main answer / document / node without related local thread
-> confirm disabled
-> dialog explains that full timeline.node.delete cascade action is still required
```

This avoids pretending a full cascade delete exists before the data layer can update messages, selections, local threads, annotations, branches, comparisons, context cache, and timeline status together.

### Context impact preview

View Context Impact explains whether a node is currently active, inactive, discarded, or deleted from the perspective of future LLM context.

Examples:

```text
active path -> eligible for context if scope matches
inactive path -> excluded because inactive_path_excluded
discarded -> excluded because discarded_excluded_by_default
deleted -> excluded because deleted_memory_never_included
```

### Path-aware main chat visibility

The main chat now has a path visibility control:

```text
Active
Inactive
Removed
All
```

Messages are classified from their related timeline node:

```text
active
-> normal display
-> default visible path

inactive
-> gray display
-> excluded from current memory path

discarded
-> amber display
-> removed view

deleted
-> red placeholder
-> body hidden as [deleted message]
```

The default chat view is active only, so a revert can make old future-path messages disappear from the normal conversation without physically deleting them.

### Memory and LLM context effect

This update improves UI semantics and visibility. It does not yet implement the full backend cascade action for arbitrary timeline node deletion.

```text
memory_scope = timeline_visualization + chat_visibility
memory_effect = visible_state_explanation
```

Actual context exclusion still depends on the existing active path, deleted status, discarded status, and context builder rules.

## 2026-07-06 - Revert focus reconciliation for selections and comparison windows

### User request

After returning to an earlier timeline point, the active selection and Semantic Difference Map were still visible even though they belonged to the later path. The expected behavior is that reverting changes the current workspace focus: stale selected text, local windows, merge/diff state, and comparison panels should close or clear when their source object is no longer on the active path.

### Updated files

```text
src/store/useAnswerAtlasStore.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New reconciliation rule

`revertToNode` now runs a workspace focus reconciliation after the active document version / timeline node checkout finishes.

The reconciliation checks the active-path state of these focused objects:

```text
selected anchor / selected text
selected local thread
active Semantic Difference Map window
active context review focus
active revision branch
active merge record
pending merge diff / conflict modal
```

If the focused object is deleted, discarded, or attached to an inactive future path, the UI focus is cleared.

Anchor and local-thread checks include a small visited-object guard because legacy or nested local data can contain cross references such as:

```text
anchor -> sourceThreadId
thread -> anchorId
```

The guard prevents a malformed or cyclic relation from blocking a timeline revert.

### UI behavior after revert

When the user reverts to an earlier node:

```text
selection from later path -> cleared
side thread from later path -> closed
Semantic Difference Map from later path -> closed
expanded comparison state -> collapsed
pending merge/diff from later path -> closed
context preview -> refreshed against the new active path
```

This does not physically delete the selection, thread, comparison, merge record, or messages. It only removes them from the current active workspace focus so the screen matches the active timeline path.

### Memory behavior

The memory rule is unchanged but now reflected more consistently in UI state:

```text
active path object -> may remain focused if still relevant
inactive path object -> removed from active UI focus
discarded object -> excluded from active UI focus and default context
deleted object -> excluded from active UI focus and never included in future context
```

`refreshContextPreview()` still runs after the revert, so the context preview follows the new active document version and selected focus, if any.

## 2026-07-06 - Revision Logic Map and logic-focus routing

### User request

The user clarified that this module should not be understood as a simple Timeline. It should reflect human revision logic. A local conversation under one selected sentence does not always mean every later question belongs to the same issue. The user may discuss one issue, move to another issue, then return to the earlier issue later.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/VersionTimeline.tsx
src/components/timeline/BranchLane.tsx
src/components/timeline/TimelineNode.tsx
src/components/timeline/TimelineImpactDialog.tsx
src/components/thread/RevisionExplorerPanel.tsx
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Naming update

The visible UI language now shifts from timeline wording to logic-map wording:

```text
Version Timeline -> Revision Logic Map
Timeline view -> Logic map
Main Path -> Main Reasoning
Check row -> Logic focus
Preview Revert -> Preview Return
Return to This Point -> Return to This Logic Point
```

This is meant to make clear that the graph is organized around reasoning and revision intent, not raw time order.

### Logic focus rule

The graph now separates two concepts:

```text
selected source
-> the text / answer fragment the user selected

logic focus
-> the concrete issue being discussed about that source
```

Example:

```text
Selected source: "Quanzhou was one of the world's busiest ports."
  Logic 1: tone / certainty
  Logic 2: evidence / examples
  Logic 3: context / background
```

This means the same selected sentence can create multiple independent logic rows.

### Lightweight focus classification

For now, logic focus is inferred without another LLM call. The visualizer reads the local question and assigns a stable focus key using explainable patterns:

```text
tone / certainty
evidence / examples
context / background
precision / clarity
structure / flow
wording / rewrite
brevity
```

If no pattern matches, it falls back to a stable text signature based on the question. This keeps the graph fast and deterministic.

### New start vs resume behavior

Local answer nodes no longer attach to the latest message in the same local window by default.

The new resolver checks:

```text
same selected source + new logic focus
-> start a separate logic row from the selected source

same selected source + previously seen logic focus
-> resume that earlier logic row

branch / merge / discard / delete / note with no new question
-> inherit the current thread's latest logic focus
```

Example:

```text
Source sentence
  Logic A: tone
    Suggest A1
  Logic B: evidence
    Suggest B1
  Logic A: tone resumed
    Suggest A2
```

The resumed node receives a `resumed` badge in hover details.

### Visual behavior

Source selection nodes are now labeled as `Source: ...` instead of pretending every selection is already one logical check.

Logic rows are titled with the inferred focus:

```text
Logic 1: tone / certainty
Logic 2: evidence / examples
Logic 3: precision / clarity
```

Hover details can show:

```text
logic focus label
new logic
resumed
source text
status
context impact
```

### Return / revert semantics

The UI copy now says return to a logic point, not revert a timeline node. The underlying action still calls the existing `revertToNode` flow for now, but the explanation is logic-path-oriented:

```text
affected logic path becomes inactive
records are not physically deleted
inactive logic can still be viewed and returned to later
context preview follows the new active path
```

### Memory and LLM context effect

This update changes visual grouping and UI wording. It does not yet create a persisted `LogicFocus` data model and does not directly change ContextSnapshot inclusion rules.

```text
memory_scope = revision_logic_visualization
memory_effect = none
```

Future data-layer work should persist logic focus ids so LLM context can include:

```text
current logic focus history
current selected source
active document version
active scoped notes
```

and exclude:

```text
other independent logic focuses
inactive returned-from paths
discarded objects
deleted objects
unconfirmed merges
unmerged branches
```

### Test coverage

`src/__tests__/timeline-humanize.test.ts` now verifies:

```text
same selected text + different local questions -> separate logic rows
later question returning to earlier focus -> resumes earlier logic row
source selection remains separate from logic focus rows
merge / delete / discard attach to the affected logic row
removed logic can be hidden without deleting the source selection
```

## 2026-07-06 - Main reasoning connection fix and question labels

### User request

The user pointed out two issues in the Revision Logic Map:

```text
1. The first main reasoning point was not connected to the following main point.
2. The first main point was labeled "Answered", but it visually represents the user's question.
```

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### Connection fix

The graph previously sorted version nodes only by `createdAt`. When two main reasoning points had the same timestamp or extremely close generated timestamps, the follow-up could be processed before its parent. That meant it had no previous main node available in the visual resolver, so the first edge was missing.

The visualizer now uses a deterministic comparator:

```text
createdAt
parent before child
node type rank
id fallback
```

This ensures the first main question node is processed before its follow-up, so the edge is created.

### Label fix

Main reasoning labels now describe the user's question:

```text
document_created -> Question: ...
main answer update -> Follow-up question: ...
```

This avoids implying that the node itself is the assistant answer. The assistant answer remains the generated content behind that reasoning point.

### Test coverage

Added a regression test for equal timestamps:

```text
document_created and document_revised with the same createdAt
-> document_created is processed first
-> document_revised visualParentId points to document_created
-> both remain in the main reasoning row
```

### Memory and LLM context effect

This change only affects visual ordering and labels.

```text
memory_scope = revision_logic_visualization
memory_effect = none
```

No messages, document versions, events, timeline records, or context snapshots are deleted or rewritten.

## 2026-07-06 - Revision Logic Map manual logic assignment and compact labels

### User request

The user clarified that automatic logic grouping can be wrong, especially when a follow-up belongs to an earlier topic or when two checks are about different parts of the same answer. They also asked that the text shown directly on graph nodes should be shorter and topic-aware, not generic labels such as `Answer v1` or `Saved revision`.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/TimelineNode.tsx
src/components/timeline/VersionTimeline.tsx
src/store/useAnswerAtlasStore.ts
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New persistent UI state

Added `logicAssignments` to the project snapshot and persisted workspace state.

```text
logicAssignments[node_id] = {
  nodeId,
  logicFocusKey,
  logicFocusLabel,
  targetNodeId,
  source = user,
  assignmentType = user_new | user_previous,
  reason,
  createdAt,
  updatedAt
}
```

This is project-scoped. Switching projects also switches the correction map, so one project's logic corrections do not affect another project.

### Logic assignment flow

The graph now resolves logic focus in this order:

```text
1. If the node has a user logic assignment, use it.
2. Otherwise infer the logic focus from local question / selected text / local answer.
3. Otherwise inherit the current thread focus.
```

The node menu now includes:

```text
Start Separate Logic
Move to Previous Logic
```

`Start Separate Logic` creates a new user logic key for that node. `Move to Previous Logic` finds the nearest previous logic point with the same anchor/thread scope and connects the node back to that focus. The correction is visual and structural for the graph; it does not rewrite messages, document versions, LLM calls, or context snapshots.

### Compact node labels

Graph nodes now use `shortTitle` for the visible inline label:

```text
Q: user prompt
Follow-up: user prompt
Source: selected text
Check: local question
Answer: local answer / local question
Note: saved note
Draft: branch draft
Revise: revision draft
Merge: adopted change
Return: revert point
```

The full title and subtitle remain available in hover/right-click details. This keeps the graph readable while preserving enough detail for inspection.

### Chinese logic matching

Added Unicode-safe Chinese keyword rules before the old fallback rules for:

```text
tone / certainty
evidence / examples
context / background
precision / clarity
structure / flow
wording / rewrite
brevity
```

This avoids the previous mojibake issue where Chinese logic keywords could fail to match reliably.

### Memory and LLM context effect

```text
memory_scope = revision_logic_visualization
memory_effect = none
```

These assignments affect graph grouping, lane placement, and visual parent links only. They do not enter LLM context as content memory and do not change deleted/discarded/inactive memory rules.

## 2026-07-06 - Main chat failure visibility and API model range fix

### User request

The user observed that the main answer window showed several user messages but no assistant answer after the app appeared to think.

### Root cause

The main send flow saved the user message before calling `/api/llm/generate-document`.

```text
save user message
-> create context snapshot
-> create started LLMCallRecord
-> call LLM API
-> append assistant message only if API succeeds
```

If the LLM API failed after the user message was saved, the catch block only reset `isGeneratingDocument`.

```text
catch {
  isGeneratingDocument = false
}
```

So the UI showed the user message but never showed an assistant response or failure reason.

### Model range issue

The model catalog also prioritized `gpt-5.5` by prepending it to the model list. That could make the frontend display a model even if the OpenAI `/v1/models` response did not include it for the current API key.

This violated the intended rule:

```text
Only show models that the provided API key can actually use.
```

### Fix

The model catalog now only prioritizes `gpt-5.5` if it is actually present in the model list. In mock fallback mode, `gpt-5.5` remains available as a demo model.

Main chat failure handling now creates a visible assistant failure message:

```text
includeInContext = false
contentState = normal
role = assistant
```

The failure message is visible to the user but does not enter future LLM context.

The revision foundation also records:

```text
LLMCallRecord.status = failed
EventLog: llm.call.failed
TimelineNode: Assistant response failed
memory_effect = excluded
```

The active reasoning path remains at the user message so the user can retry or change model.

### Memory and LLM context effect

```text
failed assistant UI message -> excluded from LLM context
failed revision message -> includeInContext = false
failed LLMCallRecord -> recorded for debugging
```

No existing user messages, assistant messages, document versions, notes, branches, selections, or comparison graphs are deleted.

## 2026-07-06 - Main-message Revision Logic Router v1

### User request

The user pointed out that chronological main-chat messages should not always form one logic chain. Example:

```text
Q: 说说我爱你
Q: ICLR 截稿日期
```

These are adjacent in time but unrelated in revision logic, so the Logic Map should not draw a continuation edge between them. The user also clarified that later messages can return to an older logic node, so the structure must be a graph, not a linear topic chain.

### Updated files

```text
src/components/timeline/timelineHumanize.ts
src/components/timeline/TimelineNode.tsx
src/components/timeline/VersionTimeline.tsx
src/__tests__/timeline-humanize.test.ts
ANSWER_ATLAS_IMPLEMENTATION_LOG.md
```

### New rule

Main conversation nodes now go through a lightweight `routeMainLogicNode` step before the graph chooses a visual parent.

The router decides:

```text
new_root
continue
return_to
merge_back
```

The key change is:

```text
time adjacency does not create a logic edge by itself
```

If no return signal, continuation signal, or shared core terms are found, the main question becomes a new logic root.

### Signal extraction

The router extracts lightweight logic tokens from each main prompt:

```text
English words and acronyms
Chinese two-character phrases
explicit return signals
explicit continuation signals
```

Examples:

```text
说说我爱你
-> tokens include 我爱 / 爱你

ICLR 截稿日期
-> tokens include iclr / 截稿 / 日期

回到刚才那个我爱你
-> return signal + tokens matching 我爱 / 爱你
```

### Routing priority

The first implemented priority order is:

```text
1. document_created -> new_root
2. merge-created document version -> merge_back
3. explicit return signal + matching old node -> return_to old node
4. shared core tokens with old node -> continue that node
5. explicit continuation signal -> continue latest main node
6. otherwise -> new_root
```

This is intentionally conservative. It avoids drawing a wrong edge when the system cannot justify a logical relation.

### Visual behavior

For a new root:

```text
visualParentId = null
logicRelationType = new_root
visible label = Q: ...
```

The renderer now treats `visualParentId = null` as an explicit no-edge decision. It no longer falls back to the chronological `node.parentId`.

For a return:

```text
visualParentId = earlier matching main node
logicRelationType = return_to
```

Hover details show the router reason and confidence so the decision is inspectable.

### Regression tests

Added tests for:

```text
说说我爱你 -> ICLR 截稿日期
=> second question is new_root, no visual parent

ICLR 截稿日期 -> 那投稿格式呢？
=> second question continues the ICLR node

说说我爱你 -> ICLR -> 投稿格式 -> 回到刚才那个我爱你
=> final question returns to the earlier 我爱你 node

merge_back document versions
=> still attach to merge node, not the main-message router
```

### Memory and LLM context effect

```text
memory_scope = revision_logic_visualization
memory_effect = none
```

This change affects the visual Logic Map and node parent rendering only. It does not delete messages, rewrite conversation history, change document versions, change EventLog, or include/exclude items from LLM context. Future work can persist these router decisions as first-class `LogicAssignment` records or replace the lightweight router with a trained relation classifier.

## 2026-07-06 - Logic-parent layout for returning main topics

### User-facing issue

The Revision Logic Map still looked too chronological in mixed-topic main chat sessions. A case like:

```text
Q: Say I love you
Q: ICLR submission deadline
Follow-up: CVPR submission deadline
Q: Do you know the World Cup?
Follow-up: AAAI submission deadline
```

should not place the AAAI question after the unrelated World Cup question. Logically, AAAI belongs to the conference-deadline chain, so it should be laid out after the CVPR node and connected to CVPR.

### Change

Main-path layout now uses the resolved logical parent as the horizontal anchor:

```text
new_root -> column 0 on its own root track
continue / return_to -> parent logicColumn + 1
merge_back -> keep the merge source parent
```

Chronological order still sorts siblings, but it no longer decides the visual parent or horizontal position for a returned topic.

### Root tracks

Independent main questions now get separate root tracks inside the main reasoning lane:

```text
conference deadline chain:
ICLR -> CVPR -> AAAI

unrelated root:
World Cup
```

The unrelated root no longer captures later nodes that are routed back to an earlier topic.

### Token cleanup

The lightweight topic router now ignores generic conversation words such as:

```text
you
your
me
my
do
does
did
know
say
tell
```

This prevents false matches like:

```text
Say I love you
Do you know the World Cup?
```

from being treated as one logic chain just because they share generic dialogue words.

### Regression test

Added a test that verifies:

```text
ICLR -> CVPR
World Cup -> new independent root
AAAI -> returns to CVPR, not World Cup
```

The test also checks that AAAI appears one logical column after CVPR, and that World Cup uses a separate root track.

### Memory and LLM context effect

```text
memory_scope = revision_logic_visualization
memory_effect = none
deleted_data = none
```

This change only affects Revision Logic Map routing and layout. It does not delete messages, change document versions, alter EventLog records, or change which memories enter future LLM context.

## 2026-07-06 - Historical assistant answer selection

### User-facing issue

After a long main conversation, earlier assistant answers were visible but could no longer be selected with the mouse for local follow-up questions. The UI only enabled text selection for the latest assistant answer.

### Change

Main chat rendering now treats every non-deleted assistant message as a selectable source:

```text
active assistant answer -> selectable
inactive historical assistant answer -> selectable as historical context
discarded visible assistant answer -> selectable but still carries discarded source status
deleted assistant answer -> not selectable, still rendered as deleted placeholder
```

The latest answer still keeps the edit / version / diff controls. Earlier answers get a small historical-source notice and then render through the same selection toolbar used by the latest answer.

### Source binding

Selections now bind to the actual assistant message they came from instead of implicitly binding to the latest active answer:

```text
sourceType = message
sourceId = rev-message-assistant-...
sourceMessageId = rev-message-assistant-...
sourceDocumentVersionId = matching document version when available
sourceVersionNodeId = matching visual version node when available
sourcePathStatus = active | inactive | discarded | deleted
```

For message-based selections, the store no longer fills in the current active document version as a fallback. That prevents old-answer selections from silently inheriting the newest document version.

### Timeline attachment

`TextSelectionService` now resolves the selection source in this order:

```text
1. exact sourceType + sourceId timeline node
2. sourceMessageId timeline node
3. sourceDocumentVersionId timeline node
4. activeTimelineNodeId fallback
5. latest active project node fallback
```

Source node lookup allows inactive, non-deleted nodes. This is necessary because historical visible answers may belong to inactive paths after revert or path changes, but selecting them should still attach the local branch to the old answer, not to the current active answer.

### Regression test

Added a service-layer test that creates:

```text
old inactive assistant answer node
current active assistant answer node
selection from old assistant answer
```

The test verifies:

```text
selection timeline parent = old assistant node
selection edge source = old assistant node
payload.source_path_status = inactive
payload.source_version_node_id is preserved
payload.source_document_version_number is preserved
```

### Memory and LLM context effect

```text
memory_scope = selected_text
memory_effect = none until local thread/question/merge/note action
deleted_data = none
```

This change does not delete messages or change existing document versions. It only makes historical visible assistant answers selectable and records their true source so later local windows, context reviews, and logic-map branches can explain where the local question came from.

## 2026-07-06 - Revision Logic Map control strip visibility

### User-facing issue

The Revision Logic Map left control strip still showed an explanatory `LOGIC MAP` text block that repeated information already implied by the graph. The `Visible logic` switch also sat too low in the strip and behaved like a decorative status item rather than a real layout control.

### Change

The left strip now removes the static explanatory block:

```text
LOGIC MAP
Separate local questions by reasoning intent, not just time or window.
```

The visibility control moved into the map header as a persistent `Visible logic` switch. When it is on, the left control strip is shown with depth, inactive-path, removed-path, memory-note, and large-branch controls. When it is off, the entire left control strip is not rendered, and the graph canvas expands into that space.

### Layout behavior

```text
Visible logic = on
-> render BranchLane control strip
-> graph uses remaining width

Visible logic = off
-> do not render BranchLane control strip
-> graph flex area expands to the left
-> no empty gutter is left behind
```

The same control applies in the normal embedded map and in fullscreen map mode, so the user sees consistent behavior in both layouts.

### Memory and timeline effect

```text
memory_scope = none
memory_effect = none
timeline_effect = none
storage_effect = none
```

This is a view-only change. It does not create, delete, discard, restore, or mutate project objects. It does not affect `EventLog`, `TimelineNode`, `ContextSnapshot`, document versions, selected text records, local threads, or LLM memory inclusion rules.

## 2026-07-06 - Revision Logic Map full panel minimize

### User-facing correction

The previous `Visible logic` behavior only hid the left control strip. The intended behavior is broader: pressing `Visible logic` should minimize the entire Revision Logic Map panel so the main workspace above can use the released height.

### Change

The collapsed state moved from inside the timeline component to the outer app layout:

```text
expanded:
main workspace row = flexible
logic map row = 260px

collapsed:
main workspace row = flexible and taller
logic map row = 50px restore bar
```

When collapsed, the Logic Map no longer renders the graph canvas or the left control strip. It renders only a compact restore bar with:

```text
Revision Logic Map
Minimized status text
Visible logic switch
Show map button
```

Clicking `Visible logic` again or clicking `Show map` restores the full panel.

### Layout behavior

```text
Visible logic = on
-> full Revision Logic Map panel
-> BranchLane controls visible
-> graph canvas visible

Visible logic = off
-> entire Revision Logic Map panel minimized
-> only restore bar remains
-> app grid bottom row shrinks to 50px
-> main / local / comparison panels expand vertically
```

The fullscreen map still uses the full BranchLane and graph canvas when the panel is expanded.

### Memory and timeline effect

```text
memory_scope = none
memory_effect = none
timeline_effect = none
storage_effect = none
context_snapshot_effect = none
```

This remains a view-only UI state. It does not change active path, selected text records, local threads, document versions, EventLog entries, TimelineNode records, TimelineEdge records, LLM context, or future memory inclusion.

## 2026-07-06 - Main chat filter bar collapse

### User-facing issue

The main answer window kept the message visibility filter bar pinned above the conversation:

```text
Active / Inactive / Removed / All
Active messages are the only default main-chat memory path.
```

This was useful for inspecting active-path memory, but it could take too much space when the user simply wanted to read or select previous answers.

### Change

The filter bar now has a hide/show control:

```text
expanded:
-> full Active / Inactive / Removed / All filter bar
-> memory-path explanation visible
-> hide icon button on the right

collapsed:
-> compact filter icon button only
-> current filter name and count shown on desktop
-> clicking it restores the full filter bar
```

The current selected filter is preserved while the bar is hidden. For example, hiding the bar while viewing `Active` messages keeps the conversation in the active-message view until the user opens the bar and chooses another filter.

### Memory and timeline effect

```text
memory_scope = none
memory_effect = none
timeline_effect = none
storage_effect = none
context_snapshot_effect = none
```

This is a UI-only display preference inside the main answer panel. It does not mark messages active, inactive, discarded, deleted, restored, or removed. It also does not change EventLog records, TimelineNode records, ContextSnapshot generation, or future LLM memory inclusion.

## 2026-07-06 - Source locator for answer cards, local windows, and logic nodes

### User-facing issue

Older assistant answers were selectable, but they still did not feel like first-class answer objects. They also did not clearly show whether local threads had already been created from them. After opening a local window from a selected passage, it was easy to lose the connection between:

```text
main assistant answer
selected source text
local thread
logic map node
```

The user needed a way to get back to the original answer and reopen related local windows.

### Change

Added a shared source-locator utility:

```text
conversationMessageIdFromSource
focusMainMessageBySource
focusMainSelectionByAnchor
requestSourceFocus
```

`requestSourceFocus` emits a local UI event. The main answer panel listens for that event, switches to the correct message filter when necessary, then scrolls and flashes the relevant answer card or selection chip.

### Main answer cards

Every assistant card now shows clearer identity metadata:

```text
Assistant
Active / Earlier / Historical / Discarded / Deleted
Local N, when local threads exist for that answer
Model badge, using message model or window fallback
```

If an answer has related local threads, the card also renders `Source locals` chips. Clicking a chip:

```text
opens the related local thread
requests source focus
scrolls back to the source answer card / source anchor chip
flashes the source marker
```

### Local window source navigation

The local window header now has a `Go to Source` button beside the selected-text header. It uses the active local thread's source selection and source message id, then asks the main answer panel to locate the original source.

This works even when the source answer is hidden by the current main-chat filter, because the main panel switches to the matching visibility filter first:

```text
active source -> Active view
inactive source -> Inactive view
discarded/deleted source -> Removed view
```

### Logic map source navigation

The logic-map node menu now labels the navigation action as:

```text
Open / Locate Source
```

When a node has a related local thread, it opens that thread. When a node has a source anchor or source message, it also requests source focus in the main answer panel. For answer nodes that do not have a local thread, the node id is used to infer the corresponding assistant source message when possible.

### Visual feedback

The source locator adds a temporary pulse highlight:

```text
data-source-locator-focus = true
```

This makes the source answer or source anchor chip visible after scrolling, so the user can see where the local thread came from.

### Memory and timeline effect

```text
memory_scope = none
memory_effect = none
timeline_effect = none
storage_effect = none
context_snapshot_effect = none
```

This is a navigation and visibility improvement only. It does not create new selections, local threads, EventLog records, TimelineNode records, TimelineEdge records, ContextSnapshot records, or LLM memory entries. It only makes already-recorded relationships easier to find again.

## Semantic Map Window Recovery and Main-Only Initial Workspace

### User-facing goal

The workspace should not open every analysis panel by default. A new project/session should begin with the Main Answer Window as the only main work surface. Local windows, revision branch windows, and Semantic Difference Map windows should appear only after the user opens or generates them.

The user also needed a way to reopen old Semantic Difference Maps after returning to previous answers, source selections, local threads, or logic-map nodes.

### Layout behavior

`AppShell` now treats the right analysis panel as conditional:

```text
right panel visible =
  activeRevisionBranchId exists
  OR activeTreeWindowId exists
```

If neither exists, the main answer panel expands across the available top workspace. If a local thread or Semantic Difference Map is opened later, the grid recalculates so the active panels share the top workspace.

### Semantic Map open / close logic

The store now exposes:

```text
openComparisonWindow(comparisonId)
closeComparisonWindow()
```

`openComparisonWindow`:

```text
1. Finds the saved comparison by id.
2. Refuses to open deleted comparisons.
3. Reuses or creates the matching tree_compare window.
4. Reuses or creates the matching tree_chat session.
5. Sets activeTreeWindowId to that window id.
```

`closeComparisonWindow` only hides the current map window:

```text
activeTreeWindowId = null
isComparisonExpanded = false
```

It does not clear, discard, delete, supersede, or mutate the comparison graph. The comparison remains recoverable from its source answer, local thread, or logic-map node.

### Reopen entry points

Main assistant answer cards now show:

```text
Map N
Semantic maps
```

when saved Semantic Difference Maps exist for selections inside that answer. Clicking a map chip opens the saved map in the right panel.

Local windows now show:

```text
Map N
```

beside `Go to Source` when the selected local anchor has one or more saved maps.

Logic-map node menus now use:

```text
Open Related Window
```

When the node has a related local thread, it opens the local thread. When the node has a source anchor with a saved Semantic Difference Map, it also opens the related map. It still requests source focus in the main answer panel so the user can see where the logic point came from.

### Semantic Map panel

The Semantic Difference Map panel now has a close button. Closing the panel is a UI operation only:

```text
storage_effect = none
memory_effect = none
timeline_effect = none
context_snapshot_effect = none
```

Clear and Delete remain separate menu actions with their existing action contracts.

### Memory / persistence rule

This change does not create new memory. It only makes previously persisted comparison data visible again.

```text
open map:
  memory_scope = none
  memory_effect = none
  event_log_effect = none

close map:
  memory_scope = none
  memory_effect = none
  event_log_effect = none

clear map:
  handled by comparison.clear action

delete map:
  handled by object.delete action
```

Deleted comparison maps still cannot be reopened and must never enter future LLM context.

## 2026-07-07 - Revision Logic Map source-anchor collapse and source-owned local branches

### User-facing issue

The Revision Logic Map was still too close to a raw event timeline. It showed `Source:` as a visible node and then connected it to an `Answer:` node whose text was actually the user's local question. This created two problems:

```text
1. The visual node name was semantically wrong.
   "CHI呢" is a question, not an answer.

2. The source selection was treated as a separate reasoning step.
   A selected source passage should explain where a local question came from,
   but it should not become its own main visible logic node.
```

The map also placed branches mainly by creation time. When the user asked later main questions and then returned to an earlier answer to ask a local question, the local branch could visually drift toward the latest lower layer, causing crossing and overlapping lines.

### New visual rule

The logic map now treats a selected source as metadata for the local question node:

```text
Main Q
  -> Local Q
       details:
         source selected text
         assistant reply
```

The visible map should no longer show:

```text
Main Q -> Source -> Answer: <user question>
```

Instead it should show:

```text
Main Q -> Q: <user local question>
```

The selected source passage is still available in the hover/detail content.

### Source node behavior

`anchor_selected` version nodes are no longer emitted as visible `HumanTimelineNode` items.

Important: this does not delete or discard any data.

```text
storage_effect = none
event_log_effect = none
timeline_record_effect = none
memory_effect = none
```

The underlying selection / anchor records remain available for:

```text
source lookup
local thread recovery
context review
comparison map recovery
go-to-source navigation
memory scoping
```

Only the map rendering collapses them out of the main visual path.

### Local question node behavior

The current store records each completed local exchange as a `local_answer_generated` version node. Because that node represents the user's local question plus the assistant reply, the map now labels it as a local question:

```text
shortTitle = Q: <local question>
title = Question: <local question>
relationLabel = local question
```

The hover/detail subtitle includes:

```text
Question: <user local question>
Source: <selected source passage>
Reply: <assistant local answer>
```

This keeps the map readable while preserving the answer content in the node details.

### Parent assignment rule

Local branches now choose their visual parent by source ownership before time:

```text
1. If the selection has sourceMessageId, map it to the corresponding main/local answer node.
2. If the selection is nested inside a local thread, map it to the parent local answer node when possible.
3. If source lookup fails, fall back to the latest main answer before the selection.
4. Only use raw parentId as a final fallback.
```

This means:

```text
If the user asks a later main question,
then goes back and asks about an earlier answer,
the local branch stays under the earlier answer.
```

Time still orders siblings within the same source-owned branch, but time no longer decides which main answer owns the branch.

### Layout rule

Branch rows are now sorted by their source parent before their creation time:

```text
parent stack index
parent logic column
parent created time
branch created time
```

This keeps local rows visually near the main question/answer they came from and reduces lines crossing over unrelated main questions.

### Color rule

Because the visible local node is now a question node, `local_answer_generated` uses the local-question visual tone:

```text
green = local question / local check
purple = draft / merge idea / generated revision
```

The left legend was updated from:

```text
C logic focus
S suggest / draft
```

to:

```text
Q local question
D draft / merge idea
```

### Memory and context effect

This is a visualization and interpretation change only. It does not change which objects enter future LLM context.

```text
selected text:
  still exists as source/anchor memory metadata

local question:
  still scoped to its local thread / selected text

assistant local reply:
  still stored in local thread messages

main context:
  still excludes unmerged local branches by default

deleted/discarded objects:
  still follow their existing exclusion rules
```

No EventLog records, TimelineNode records, TimelineEdge records, ContextSnapshot records, LLMCallRecord records, messages, selections, or annotations are deleted by this change.

## 2026-07-07 - Main-scoped logic rows and selection toolbar cleanup

### Selection toolbar behavior

The text-selection action toolbar is now treated as transient UI state:

```text
click blank space -> hide toolbar
click another message/window -> hide toolbar
start a new text selection -> clear old toolbar, then show the new toolbar on mouseup
click a toolbar button -> keep it alive long enough to run the action, then hide it
browser selection collapses -> hide toolbar
```

This does not create, delete, discard, or mutate any persistent workspace memory by itself. Persistent records are still created only after the user chooses an action such as opening a local window or saving a note.

### Main-scoped Logic Map rows

The Logic Map no longer places every local branch under one global main row. Main reasoning is now split into source-owned main reasoning units.

```text
Main Q1
  Q1.1 local logic
  Q1.2 local logic

Main Q2
  Q2.1 local logic
```

If a local branch was created from a selected passage inside a specific main answer, its row is scoped to that main reasoning unit and rendered between that main unit and the next main unit. This prevents branches from an earlier answer from being pushed to the bottom of the whole map after later main questions are asked.

### Logic numbering rule

Global `Logic 1`, `Logic 2`, `Logic 3` labels are replaced by source-scoped numbering:

```text
Main Q1 -> Q1.1, Q1.2, Q1.3
Main Q2 -> Q2.1, Q2.2
nested local rows -> Q1.1.1, Q1.1.2
```

Fallback rows that cannot be traced to a main reasoning unit still render with an `L#` label so legacy or incomplete data remains visible instead of being dropped.

### Memory and persistence effect

This change is visual/layout only:

```text
messages: unchanged
text selections: unchanged
local threads: unchanged
annotations: unchanged
document versions: unchanged
event log: unchanged
timeline data: unchanged
context inclusion/exclusion rules: unchanged
```

No history or memory is deleted. The layout uses existing source ownership metadata to decide where each local branch belongs.

## 2026-07-07 - Semantic Difference Map vertical Layer 2 / Layer 3 layout

### User-facing change

The Semantic Difference Map no longer places Layer 2 and Layer 3 side by side on wide screens.

```text
Before:
Layer 2 Difference Lens | Layer 3 Difference Inspector

After:
Layer 2 Difference Lens
Layer 3 Difference Inspector
```

The short explanatory sentence under the Layer 2 title was removed so the panel starts directly with the filter controls and the visible difference rows.

### Memory and persistence effect

This is a presentation-only change:

```text
comparison graph data: unchanged
comparison runs: unchanged
semantic rows: unchanged
context snapshots: unchanged
event log: unchanged
timeline data: unchanged
LLM memory rules: unchanged
```

No comparison records, local threads, selections, messages, annotations, or document versions are deleted.
