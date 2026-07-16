# Claude Code - Istruzioni di Comportamento

## UI/UX Development
Always use the `ui-ux-component-builder` skill when changing the UI.

## Task Completion Summary
After completing a task that involves tool use, provide a quick summary of the work you have done.

## Default Action Mode
By default, **implement changes rather than only suggesting them**. 

If the user's intent is unclear:
- Infer the most useful likely action and proceed
- Use tools to discover any missing details instead of guessing
- Try to infer the user's intent about whether a tool call (e.g. file edit or read) is intended or not
- Act accordingly

## Parallel Tool Calls
**Use parallel tool calls whenever possible:**

If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. 

**Priority:** Call tools simultaneously whenever the actions can be done in parallel rather than sequentially.

**Example:** When reading 3 files, run 3 tool calls in parallel to read all 3 files into context at the same time.

**Maximize use of parallel tool calls** where possible to increase speed and efficiency.

**Important:** If some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel. Instead, call them sequentially. 

**Never use placeholders or guess missing parameters in tool calls.**

## Reduce Hallucinations

**Critical Rules:**
- Never speculate about code you have not opened
- If the user references a specific file, you MUST read the file before answering
- Make sure to investigate and read relevant files BEFORE answering questions about the codebase
- Never make any claims about code before investigating unless you are certain of the correct answer
- Give grounded and hallucination-free answers

**Always verify before answering.**


** Simplicity First **

Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.

No abstractions for single-use code.

No "flexibility" or "configurability" that wasn't requested.

No error handling for impossible scenarios.

If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.