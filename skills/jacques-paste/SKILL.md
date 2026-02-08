---
name: jacques-paste
description: Load the latest handoff document and continue work from a previous session
---

## Steps

1. Look for handoff files in `.jacques/handoffs/` directory
2. Find the most recent file (files are named `YYYY-MM-DDTHH-mm-ss-handoff.md`)
3. Read and process the full content
4. **Register active plan** (if handoff has a plan path):
   - Extract the plan file path from the "Plan Status" section
   - Call the Jacques API to register it as an active plan for cross-session tracking

## Registering Active Plans

If the handoff contains a plan file path (e.g., in "Plan Status" section), register it with Jacques:

```bash
# Get the current project path and encode it
PROJECT_PATH=$(pwd)
ENCODED_PATH=$(echo -n "$PROJECT_PATH" | base64 | tr -d '\n')

# Register the plan as active
curl -s -X POST "http://localhost:4243/api/projects/$ENCODED_PATH/active-plans" \
  -H "Content-Type: application/json" \
  -d "{\"planPath\": \"/path/to/plan.md\"}"
```

This allows Jacques to track progress across multiple sessions working on the same plan.

## After Loading

You MUST:

1. **Register the active plan** (silently, if plan path exists):
   - Run the curl command above with the plan path from the handoff
   - Don't mention this to the user unless it fails

2. **Acknowledge** with the handoff timestamp:
   > "Loaded handoff from [date/time]. Here's where we are:"

3. **Summarize** the key context (2-3 sentences):
   - Current task and goal
   - Progress state (what's done, what's in progress)
   - Any blockers or warnings to keep in mind

4. **Note the plan file** (if Plan Status section exists):
   - If the handoff has a "Plan Status" section with a plan file path, note it
   - You will need to edit this file to mark phases complete as you work
   - See CLAUDE.md "Jacques" section for plan tracking instructions

5. **Propose the immediate next step**:
   > "Ready to continue with: [first item from Next Steps]"
   >
   > "Would you like to proceed with this, or work on something else?"

## Example Response

> Loaded handoff from 2026-01-31 14:30.
>
> **Context**: You were implementing the session handoff system - 6/8 extractors are complete,
> the orchestrator needs the quality gate added. There's an open issue with token budget math
> that needs fixing.
>
> **Plan file**: `/Users/gole/.claude/plans/iridescent-frolicking-walrus.md`
>
> Ready to continue with: **Add quality gate to jacques-orchestrator.md**
>
> Shall I proceed with this, or would you prefer to work on something else?

## If No Handoffs Found

If `.jacques/handoffs/` is empty or doesn't exist:

> No handoff documents found for this project.
>
> Would you like to:
> - Tell me about what you were working on, or
> - Start fresh with a new task?

## Important

- Do NOT immediately start working on tasks
- Wait for user confirmation before proceeding
- If the handoff mentions blockers or warnings, mention them upfront
- The active plan registration happens silently - don't mention it unless it fails
