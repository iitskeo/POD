# CLAUDE.md

Instrucciones para Claude Code en este proyecto. Prevalecen sobre el comportamiento por defecto; las instrucciones directas del usuario prevalecen sobre este archivo.


**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Be exhaustive in your reasoning before providing a concise output.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- Keep solutions simple and direct.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Prioritize editing over complete file rewriting.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Never use emojis in the code.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

## 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- Transform tasks into verifiable goals:
  - *"Add validation"* &rarr; *"Write tests for invalid inputs, then make them pass"*
  - *"Fix the bug"* &rarr; *"Write a test that reproduces it, then make it pass"*
  - *"Refactor X"* &rarr; *"Ensure tests pass before and after"*

For multi-step tasks, state a brief plan:
1. `[Step]` &rarr; verify: `[check]`
2. `[Step]` &rarr; verify: `[check]`
3. `[Step]` &rarr; verify: `[check]`

## 5. Tooling and Efficiency
**Optimize for accuracy and up-to-date information.**

- Always verify skill availability before executing any task.
- Always use the `context7` MCP to search or consult updated documentation.
- Do not re-read files you have already read unless they might have changed.

## 6. Communication and Meta-Rules
- Always respond in **Spanish**.
- Be concise in the output.
- Avoid fawning opening phrases and unnecessary filler when closing.
- User instructions always prevail over these guidelines.