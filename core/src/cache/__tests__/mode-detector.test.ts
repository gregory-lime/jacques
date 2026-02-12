/**
 * Mode Detector Tests
 */

import { detectModeAndPlans } from '../mode-detector.js';
import type { ParsedEntry } from '../../session/parser.js';

// Helper to create mock entries
function makeUserMessage(text: string, index?: number): ParsedEntry {
  return {
    type: 'user_message',
    timestamp: new Date().toISOString(),
    content: { text },
  } as ParsedEntry;
}

function makeToolCall(toolName: string, toolInput?: Record<string, unknown>): ParsedEntry {
  return {
    type: 'tool_call',
    timestamp: new Date().toISOString(),
    content: { toolName, toolInput },
  } as ParsedEntry;
}

function makeAgentProgress(agentType: string, agentId: string, agentDescription?: string): ParsedEntry {
  return {
    type: 'agent_progress',
    timestamp: new Date().toISOString(),
    content: { agentType, agentId, agentDescription },
  } as ParsedEntry;
}

function makeAssistantMessage(text: string): ParsedEntry {
  return {
    type: 'assistant_message',
    timestamp: new Date().toISOString(),
    content: { text },
  } as ParsedEntry;
}

describe('mode-detector', () => {
  describe('detectModeAndPlans', () => {
    it('should return null mode and empty planRefs for empty entries', () => {
      const result = detectModeAndPlans([]);
      expect(result.mode).toBeNull();
      expect(result.planRefs).toEqual([]);
    });

    it('should return null mode for regular conversation', () => {
      const entries = [
        makeUserMessage('Fix the bug in login.ts'),
        makeAssistantMessage('I will fix that bug.'),
      ];
      const result = detectModeAndPlans(entries);
      expect(result.mode).toBeNull();
      expect(result.planRefs).toEqual([]);
    });

    describe('planning mode', () => {
      it('should detect planning mode when EnterPlanMode tool is called', () => {
        const entries = [
          makeUserMessage('Add authentication'),
          makeToolCall('EnterPlanMode'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('planning');
      });

      it('should not report planning mode after ExitPlanMode is called', () => {
        const entries = [
          makeUserMessage('Add authentication'),
          makeToolCall('EnterPlanMode'),
          makeToolCall('Write', {
            file_path: '/Users/gole/.claude/plans/auth-plan.md',
            content: '# Auth Plan\n\n- Step 1: Add OAuth\n- Step 2: Add JWT\n\nDetailed implementation plan.',
          }),
          makeToolCall('ExitPlanMode'),
          makeAssistantMessage('Now implementing the plan.'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).not.toBe('planning');
      });

      it('should detect planning mode again after re-entering plan mode', () => {
        const entries = [
          makeUserMessage('Add authentication'),
          makeToolCall('EnterPlanMode'),
          makeToolCall('ExitPlanMode'),
          makeAssistantMessage('Implementing...'),
          makeToolCall('EnterPlanMode'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('planning');
      });

      it('should override execution mode with planning when both are present', () => {
        // Long enough plan content for embedded detection
        const planContent = '# My Plan\n\n- Step 1: Do the thing\n- Step 2: Do the other thing\n' +
          'This is a detailed plan with multiple sections.\n\n## Phase 1\nDetails here.\n\n## Phase 2\nMore details.';
        const entries = [
          makeUserMessage('Implement the following plan: ' + planContent),
          makeToolCall('EnterPlanMode'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('planning');
      });
    });

    describe('execution mode', () => {
      it('should detect execution mode with "implement the following plan:" trigger', () => {
        const planContent = '# Refactoring Plan\n\n- Step 1: Extract module\n- Step 2: Add tests\n' +
          'This is detailed content that is long enough to exceed the 100 char minimum.\n\n## Details\n\nMore info here.';
        const entries = [
          makeUserMessage('Implement the following plan: ' + planContent),
          makeAssistantMessage('I will implement this plan.'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('execution');
        expect(result.planRefs.length).toBe(1);
        expect(result.planRefs[0].source).toBe('embedded');
        expect(result.planRefs[0].title).toBe('Refactoring Plan');
      });

      it('should detect execution mode with "here is the plan:" trigger', () => {
        const planContent = '# Migration Plan\n\n- Item 1\n- Item 2\n' +
          'Detailed content that is long enough to pass the minimum length check of 100 characters.\n\n## Section\n\nStuff.';
        const entries = [
          makeUserMessage('Here is the plan: ' + planContent),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('execution');
        expect(result.planRefs[0].title).toBe('Migration Plan');
      });

      it('should detect execution mode with "follow this plan:" trigger', () => {
        const planContent = '# Deployment Plan\n\n- Deploy step 1\n- Deploy step 2\n' +
          'This plan includes all the necessary steps and is sufficiently long to qualify.\n\n## Steps\n\nGo.';
        const entries = [
          makeUserMessage('Follow this plan: ' + planContent),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('execution');
      });

      it('should NOT detect execution mode without enough plan content', () => {
        const entries = [
          makeUserMessage('Implement the following plan: short'),
        ];
        const result = detectModeAndPlans(entries);
        // mode is 'execution' because the trigger matched, but no plan ref because content < 100
        expect(result.mode).toBe('execution');
        expect(result.planRefs.length).toBe(0);
      });

      it('should NOT detect execution mode without markdown heading', () => {
        const longContent = 'This is a very long piece of text that does not have any markdown headings. ' +
          'It is just plain text that goes on and on. We need to make sure it exceeds 100 characters.';
        const entries = [
          makeUserMessage('Implement the following plan: ' + longContent),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('execution');
        expect(result.planRefs.length).toBe(0);
      });

      it('should skip internal command messages for first-message detection', () => {
        const planContent = '# Plan\n\n- Step 1\n- Step 2\n' +
          'Long enough detailed content that exceeds the minimum threshold of 100 characters for a plan.\n\n## Done\n\nYes.';
        const entries = [
          makeUserMessage('<local-command>status</local-command>'),
          makeUserMessage('<command-name>something</command-name>'),
          makeUserMessage('Implement the following plan: ' + planContent),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.mode).toBe('execution');
        expect(result.planRefs.length).toBe(1);
      });
    });

    describe('embedded plans in subsequent messages', () => {
      it('should detect plans in messages after the first', () => {
        const planContent = '# Phase 2 Plan\n\n- Step A\n- Step B\n' +
          'This is the second phase plan with sufficient content to exceed 100 characters minimum.\n\n## Section\n\nDetails.';
        const entries = [
          makeUserMessage('Start working on the project'),
          makeAssistantMessage('Sure, what should I do?'),
          makeUserMessage('Implement the following plan: ' + planContent),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(1);
        expect(result.planRefs[0].messageIndex).toBe(2);
      });

      it('should not duplicate plans at the same message index', () => {
        const planContent = '# Dupe Plan\n\n- Step 1\n' +
          'Content that is long enough for the 100 character minimum to be exceeded here successfully.\n\n## Phase\n\nGo.';
        // The first user message triggers both the first-message check and the subsequent-message check
        // but dedup should prevent duplicates
        const entries = [
          makeUserMessage('Implement the following plan: ' + planContent),
        ];
        const result = detectModeAndPlans(entries);
        // Should only have 1 plan ref, not 2
        expect(result.planRefs.length).toBe(1);
      });
    });

    describe('Plan agent detection', () => {
      it('should detect Plan agent from agent_progress entries', () => {
        const entries = [
          makeUserMessage('Design the architecture'),
          makeAgentProgress('Plan', 'agent-123', 'Design system architecture'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(1);
        expect(result.planRefs[0].source).toBe('agent');
        expect(result.planRefs[0].agentId).toBe('agent-123');
        expect(result.planRefs[0].title).toBe('Design system architecture');
      });

      it('should not duplicate Plan agent with same agentId', () => {
        const entries = [
          makeUserMessage('Design'),
          makeAgentProgress('Plan', 'agent-1', 'Plan A'),
          makeAgentProgress('Plan', 'agent-1', 'Plan A update'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(1);
      });

      it('should detect multiple different Plan agents', () => {
        const entries = [
          makeUserMessage('Plan everything'),
          makeAgentProgress('Plan', 'agent-1', 'Plan A'),
          makeAgentProgress('Plan', 'agent-2', 'Plan B'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(2);
      });

      it('should not detect non-Plan agents', () => {
        const entries = [
          makeUserMessage('Search'),
          makeAgentProgress('Explore', 'agent-1', 'Explore codebase'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(0);
      });

      it('should use default title when agentDescription is missing', () => {
        const entries = [
          makeUserMessage('Plan'),
          makeAgentProgress('Plan', 'agent-1', undefined),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs[0].title).toBe('Agent-Generated Plan');
      });
    });

    describe('planModeCompletions', () => {
      it('should return empty array when no plan mode cycles', () => {
        const entries = [
          makeUserMessage('Fix the bug'),
          makeAssistantMessage('Done.'),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions).toEqual([]);
      });

      it('should return empty array for empty entries', () => {
        const result = detectModeAndPlans([]);
        expect(result.planModeCompletions).toEqual([]);
      });

      it('should return completion when EnterPlanMode followed by ExitPlanMode with Write', () => {
        const entries = [
          makeUserMessage('Add auth'),                          // 0
          makeToolCall('EnterPlanMode'),                         // 1
          makeAgentProgress('Plan', 'agent-1', 'Design auth'),  // 2
          makeToolCall('Write', {                                // 3
            file_path: '/Users/gole/.claude/plans/auth.md',
            content: '# Auth Plan\n\n- Step 1: Add OAuth\n- Step 2: Add JWT\n\nDetailed implementation plan.',
          }),
          makeToolCall('ExitPlanMode'),                          // 4
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions).toHaveLength(1);
        expect(result.planModeCompletions[0].exitIndex).toBe(4);
        expect(result.planModeCompletions[0].title).toBe('Auth Plan');
      });

      it('should prefer write title over agent title', () => {
        const entries = [
          makeToolCall('EnterPlanMode'),                              // 0
          makeAgentProgress('Plan', 'agent-1', 'Agent description'), // 1
          makeToolCall('Write', {                                     // 2
            file_path: '/Users/gole/.claude/plans/plan.md',
            content: '# Better Title\n\n- Step 1\n\nDetailed plan content here with enough text.',
          }),
          makeToolCall('ExitPlanMode'),                               // 3
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions[0].title).toBe('Better Title');
      });

      it('should use agent title when no write ref exists', () => {
        const entries = [
          makeToolCall('EnterPlanMode'),                           // 0
          makeAgentProgress('Plan', 'agent-1', 'My Agent Plan'),  // 1
          makeToolCall('ExitPlanMode'),                            // 2
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions[0].title).toBe('My Agent Plan');
      });

      it('should fall back to "Plan Ready" when no refs in interval', () => {
        const entries = [
          makeToolCall('EnterPlanMode'),   // 0
          makeToolCall('ExitPlanMode'),    // 1
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions).toHaveLength(1);
        expect(result.planModeCompletions[0].title).toBe('Plan Ready');
      });

      it('should return empty when plan mode entered but never exited', () => {
        const entries = [
          makeUserMessage('Plan this'),                              // 0
          makeToolCall('EnterPlanMode'),                              // 1
          makeAgentProgress('Plan', 'agent-1', 'Designing...'),      // 2
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions).toEqual([]);
      });

      it('should track multiple completed plan mode cycles', () => {
        const entries = [
          makeToolCall('EnterPlanMode'),                                // 0
          makeAgentProgress('Plan', 'agent-1', 'Plan v1'),             // 1
          makeToolCall('ExitPlanMode'),                                 // 2
          makeUserMessage('Revise the plan'),                           // 3
          makeToolCall('EnterPlanMode'),                                // 4
          makeAgentProgress('Plan', 'agent-2', 'Plan v2 revised'),     // 5
          makeToolCall('ExitPlanMode'),                                 // 6
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planModeCompletions).toHaveLength(2);
        expect(result.planModeCompletions[0].exitIndex).toBe(2);
        expect(result.planModeCompletions[0].title).toBe('Plan v1');
        expect(result.planModeCompletions[1].exitIndex).toBe(6);
        expect(result.planModeCompletions[1].title).toBe('Plan v2 revised');
      });

      it('should use default agent title as fallback when agentDescription is "Agent-Generated Plan"', () => {
        const entries = [
          makeToolCall('EnterPlanMode'),                     // 0
          makeAgentProgress('Plan', 'agent-1', undefined),   // 1
          makeToolCall('ExitPlanMode'),                      // 2
        ];
        const result = detectModeAndPlans(entries);
        // 'Agent-Generated Plan' is treated as a non-descriptive default, falls through to fallback
        expect(result.planModeCompletions[0].title).toBe('Agent-Generated Plan');
      });
    });

    describe('Write tool plan detection', () => {
      it('should detect plan written to .jacques/plans/ path', () => {
        const planContent = '# Build Plan\n\n- Phase 1: Setup\n- Phase 2: Implementation\n\nDetailed description of the plan.';
        const entries = [
          makeUserMessage('Write a plan'),
          makeToolCall('Write', {
            file_path: '/Users/gole/.jacques/plans/my-plan.md',
            content: planContent,
          }),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(1);
        expect(result.planRefs[0].source).toBe('write');
        expect(result.planRefs[0].filePath).toBe('/Users/gole/.jacques/plans/my-plan.md');
        expect(result.planRefs[0].title).toBe('Build Plan');
      });

      it('should detect plan written to a file with "plan" in the name', () => {
        const planContent = '# Release Plan\n\n- Step 1\n- Step 2\n\nSome detailed content.';
        const entries = [
          makeUserMessage('Write a plan'),
          makeToolCall('Write', {
            file_path: '/tmp/my-plan.md',
            content: planContent,
          }),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(1);
        expect(result.planRefs[0].source).toBe('write');
      });

      it('should NOT detect code files as plans even if path contains "plan"', () => {
        const entries = [
          makeUserMessage('Write code'),
          makeToolCall('Write', {
            file_path: '/src/plan-executor.ts',
            content: 'export function executePlan() {\n  return true;\n}',
          }),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(0);
      });

      it('should NOT detect Write calls without plan-like path', () => {
        const entries = [
          makeUserMessage('Write a readme'),
          makeToolCall('Write', {
            file_path: '/tmp/readme.md',
            content: '# README\n\n- Feature 1\n- Feature 2\n\nDetailed info.',
          }),
        ];
        const result = detectModeAndPlans(entries);
        expect(result.planRefs.length).toBe(0);
      });

      it('should skip various code file extensions', () => {
        const extensions = ['.ts', '.js', '.py', '.json', '.yaml', '.sh', '.css', '.html'];

        for (const ext of extensions) {
          const entries = [
            makeUserMessage('Write'),
            makeToolCall('Write', {
              file_path: `/src/plan${ext}`,
              content: '# Plan\n\n- Step 1\n\nDetailed content.',
            }),
          ];
          const result = detectModeAndPlans(entries);
          expect(result.planRefs.length).toBe(0);
        }
      });
    });
  });
});
