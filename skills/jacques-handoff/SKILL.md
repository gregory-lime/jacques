---
name: jacques-handoff
description: Generate a session handoff document for continuing work in a new session
---

## CRITICAL: No File Operations

DO NOT use Read, Glob, Grep, Bash, or any tool except Write.
All necessary information is provided in the "Pre-Extracted Session Context" section below.
The context was already extracted from CLAUDE.md and the conversation transcript.

If you use any tool besides Write, you are wasting tokens.

---

## Instructions

Generate a comprehensive session handoff document (~1000 tokens) by extracting from the CURRENT conversation context. Be thorough and specific.

**Save to:** `.jacques/handoffs/{YYYY-MM-DDTHH-mm-ss}-handoff.md`

---

## Extraction Priority

1. **Use the Project Info section** - The pre-extracted context includes project information from CLAUDE.md. Use this instead of reading files.

2. **Recall user decisions** - When the user said "yes do that", "no use this instead", "let's go with option 2" - these are KEY DECISIONS to capture.

3. **Use the Plan Context section** - The pre-extracted context includes any active plans. Use this instead of searching for plan files.

---

## Required Sections

### Header
```markdown
# Session Handoff

> Project: [name] | Generated: [timestamp]
```

### Project Context (from pre-extracted context)
Brief orientation for the next session:
- What is this project?
- Tech stack
- Key directories (2-3 most relevant)

Use the "Project Info" section from the pre-extracted context.

### Current Task (2-3 sentences)
What specific problem/feature are we working on? What's the end goal?

### Progress Made (DETAILED)
Group by component/feature. Include:
- **Numbered items** with clear descriptions
- **File paths** (absolute) with what was created/modified
- **Function names** where relevant
- **Status markers**: [DONE], [PARTIAL], [BLOCKED]

```markdown
**Completed - [Feature Name]:**

1. **Component Name** (`/absolute/path/file.ts`)
   - `functionName()` - what it does
   - Technical detail worth noting

2. **Another Component** (`/absolute/path/other.ts`)
   - What it does
```

### User Decisions (IMPORTANT)
Capture moments when the user chose between approaches:

| Decision | User's Choice | Context |
|----------|---------------|---------|
| "Should we use X or Y?" | User chose Y | Because [reason if given] |
| Architecture question | User's direction | What they wanted |

Look for:
- "Yes, do that" / "No, try this instead"
- "Let's go with option X"
- "I prefer..." / "Use..."
- Rejections of suggestions

### Plan Status (if active plan exists)
If there was a plan file or planning discussion:

```markdown
**Plan:** [filename or inline plan]

Progress:
☑ Task 1: Description [DONE]
☑ Task 2: Description [DONE]
☐ Task 3: Description ← CURRENT POSITION
□ Task 4: Description [REMAINING]
□ Task 5: Description [REMAINING]

Notes:
- Task 2 took longer because [reason]
- Task 3 is blocked by [issue]
```

If no plan: "No active plan file."

### Blockers & Bugs
- Issues hit and their resolution status
- If none: "None in this session."

### What Didn't Work
Failed approaches that the next session should NOT repeat:
- Approach tried → Why it failed
- If none: "None in this session."

### Warnings & Gotchas
Things the next session MUST know upfront:
- API quirks discovered
- Configuration requirements
- Edge cases found
- "Watch out for X"

### Next Steps (numbered, priority order)
1. **First priority** - specific action with file paths
2. **Second priority** - another specific action
3. Continue...

---

## Quality Requirements

- **Be specific**: "`listGoogleDriveFiles()` with pagination" not "added file listing"
- **Absolute file paths**: For all files mentioned
- **Function names**: Name actual functions/components
- **User decisions matter**: Capture what the user chose
- **~1000 tokens**: Comprehensive but focused

---

## After Saving

Tell the user:
> Handoff saved to `.jacques/handoffs/{filename}`
>
> To continue in a new session, run `/jacques-paste`
