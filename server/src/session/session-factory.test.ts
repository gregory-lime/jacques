/**
 * Session Factory Tests
 */

import {
  createFromHook,
  createFromDiscovered,
  createFromContextUpdate,
  deriveProjectName,
} from './session-factory.js';
import type { SessionStartEvent, ContextUpdateEvent } from '../types.js';
import type { DetectedSession } from '../process-scanner.js';

describe('SessionFactory', () => {
  describe('deriveProjectName', () => {
    it('should derive project name from projectDir', () => {
      expect(deriveProjectName('/Users/test/my-project', '/other/path')).toBe('my-project');
    });

    it('should fall back to cwd when projectDir is undefined', () => {
      expect(deriveProjectName(undefined, '/Users/test/fallback-project')).toBe('fallback-project');
    });

    it('should return Unknown Project when both are empty', () => {
      expect(deriveProjectName(undefined, undefined)).toBe('Unknown Project');
      expect(deriveProjectName('', '')).toBe('Unknown Project');
    });

    it('should handle trailing slashes', () => {
      expect(deriveProjectName('/Users/test/project/', undefined)).toBe('project');
    });
  });

  describe('createFromHook', () => {
    it('should create a session with correct fields', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'sess-1',
        session_title: 'My Session',
        transcript_path: '/path/to/transcript.jsonl',
        cwd: '/Users/test/project',
        project: 'project',
        model: 'claude-opus-4-1',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
        autocompact: { enabled: true, threshold: 95, bug_threshold: null },
        git_branch: 'main',
        git_worktree: undefined,
        git_repo_root: '/Users/test/project',
      };

      const session = createFromHook(event);

      expect(session.session_id).toBe('sess-1');
      expect(session.source).toBe('claude_code');
      expect(session.session_title).toBe('My Session');
      expect(session.transcript_path).toBe('/path/to/transcript.jsonl');
      expect(session.cwd).toBe('/Users/test/project');
      expect(session.project).toBe('project');
      expect(session.model).toEqual({ id: 'claude-opus-4-1', display_name: 'claude-opus-4-1' });
      expect(session.terminal_key).toBe('TTY:/dev/ttys001');
      expect(session.status).toBe('active');
      expect(session.last_activity).toBe(1000);
      expect(session.registered_at).toBe(1000);
      expect(session.context_metrics).toBeNull();
      expect(session.autocompact).toEqual({ enabled: true, threshold: 95, bug_threshold: null });
      expect(session.git_branch).toBe('main');
      expect(session.last_tool_name).toBeNull();
    });

    it('should normalize source: startup -> claude_code', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'sess-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        source: 'startup' as any,
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      expect(createFromHook(event).source).toBe('claude_code');
    });

    it('should normalize source: clear -> claude_code', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'sess-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        source: 'clear' as any,
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      expect(createFromHook(event).source).toBe('claude_code');
    });

    it('should normalize source: resume -> claude_code', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'sess-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        source: 'resume' as any,
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      expect(createFromHook(event).source).toBe('claude_code');
    });

    it('should pass through cursor source unchanged', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'sess-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        source: 'cursor',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      expect(createFromHook(event).source).toBe('cursor');
    });

    it('should handle null model', () => {
      const event: SessionStartEvent = {
        event: 'session_start',
        timestamp: 1000,
        session_id: 'sess-1',
        session_title: null,
        transcript_path: null,
        cwd: '/test',
        project: 'test',
        terminal: null,
        terminal_key: 'TTY:/dev/ttys001',
      };

      expect(createFromHook(event).model).toBeNull();
    });
  });

  describe('createFromDiscovered', () => {
    it('should create session with terminal session ID key', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-1',
        cwd: '/Users/test/project',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: 'feature-x',
        gitWorktree: null,
        gitRepoRoot: '/Users/test/project',
        contextMetrics: { used_percentage: 42, remaining_percentage: 58, context_window_size: 200000, total_input_tokens: 1000, total_output_tokens: 500 },
        lastActivity: 2000,
        title: 'Feature Work',
        pid: 12345,
        tty: 'ttys001',
        project: 'project',
        terminalType: 'iTerm2',
        terminalSessionId: 'ABC-123',
        mode: 'default',
      };

      const session = createFromDiscovered(discovered);

      expect(session.session_id).toBe('disc-1');
      expect(session.source).toBe('claude_code');
      expect(session.session_title).toBe('Feature Work');
      expect(session.terminal_key).toBe('DISCOVERED:iTerm2:ABC-123');
      expect(session.status).toBe('active');
      expect(session.context_metrics).toEqual(discovered.contextMetrics);
      expect(session.git_branch).toBe('feature-x');
      expect(session.mode).toBe('default');
      expect(session.terminal).toBeNull();
      expect(session.model).toBeNull();
    });

    it('should create session with TTY-based key when no terminal session ID', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-2',
        cwd: '/test',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: 3000,
        title: null,
        pid: 67890,
        tty: 'ttys002',
        project: 'test',
      };

      const session = createFromDiscovered(discovered);

      expect(session.terminal_key).toBe('DISCOVERED:TTY:ttys002:67890');
      expect(session.session_title).toBe('Session in test');
    });

    it('should create session with PID-based key when TTY is unknown', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-3',
        cwd: '/test',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: 4000,
        title: null,
        pid: 11111,
        tty: '?',
        project: 'test',
      };

      const session = createFromDiscovered(discovered);

      expect(session.terminal_key).toBe('DISCOVERED:PID:11111');
    });

    it('should handle terminal type with spaces', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-4',
        cwd: '/test',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: 5000,
        title: null,
        pid: 22222,
        tty: 'ttys003',
        project: 'test',
        terminalType: 'Windows Terminal',
        terminalSessionId: 'WT-SESS-ID',
      };

      const session = createFromDiscovered(discovered);

      expect(session.terminal_key).toBe('DISCOVERED:WindowsTerminal:WT-SESS-ID');
    });

    it('should use detectedStatus when provided', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-status-1',
        cwd: '/test',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: 6000,
        title: null,
        pid: 33333,
        tty: 'ttys004',
        project: 'test',
        detectedStatus: 'idle',
      };

      const session = createFromDiscovered(discovered);

      expect(session.status).toBe('idle');
      expect(session.last_tool_name).toBeNull();
    });

    it('should use detectedStatus awaiting with lastToolName', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-status-2',
        cwd: '/test',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: 7000,
        title: null,
        pid: 44444,
        tty: 'ttys005',
        project: 'test',
        detectedStatus: 'awaiting',
        lastToolName: 'Edit',
      };

      const session = createFromDiscovered(discovered);

      expect(session.status).toBe('awaiting');
      expect(session.last_tool_name).toBe('Edit');
    });

    it('should fall back to active when no detectedStatus', () => {
      const discovered: DetectedSession = {
        sessionId: 'disc-status-3',
        cwd: '/test',
        transcriptPath: '/path/transcript.jsonl',
        gitBranch: null,
        gitWorktree: null,
        gitRepoRoot: null,
        contextMetrics: null,
        lastActivity: 8000,
        title: null,
        pid: 55555,
        tty: 'ttys006',
        project: 'test',
      };

      const session = createFromDiscovered(discovered);

      expect(session.status).toBe('active');
      expect(session.last_tool_name).toBeNull();
    });
  });

  describe('createFromContextUpdate', () => {
    it('should create session with AUTO: key and derived project name', () => {
      const event: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: 1000,
        session_id: 'ctx-1',
        used_percentage: 30,
        remaining_percentage: 70,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        model_display_name: 'Opus',
        cwd: '/Users/test/my-app',
        project_dir: '/Users/test/my-app',
      };

      const session = createFromContextUpdate(event);

      expect(session.session_id).toBe('ctx-1');
      expect(session.source).toBe('claude_code');
      expect(session.terminal_key).toBe('AUTO:ctx-1');
      expect(session.project).toBe('my-app');
      expect(session.session_title).toBe('Session in my-app');
      expect(session.model).toEqual({ id: 'claude-opus-4-1', display_name: 'Opus' });
      expect(session.workspace).toEqual({
        current_dir: '/Users/test/my-app',
        project_dir: '/Users/test/my-app',
      });
      expect(session.status).toBe('active');
      expect(session.context_metrics).toBeNull();
    });

    it('should handle missing project_dir', () => {
      const event: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: 2000,
        session_id: 'ctx-2',
        used_percentage: 50,
        remaining_percentage: 50,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/Users/test/fallback-proj',
      };

      const session = createFromContextUpdate(event);

      expect(session.project).toBe('fallback-proj');
      expect(session.workspace).toBeNull();
    });

    it('should handle custom source', () => {
      const event: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: 3000,
        session_id: 'ctx-3',
        used_percentage: 20,
        remaining_percentage: 80,
        context_window_size: 200000,
        model: 'cursor-model',
        cwd: '/test',
        source: 'cursor',
      };

      const session = createFromContextUpdate(event);

      expect(session.source).toBe('cursor');
    });

    it('should handle git fields', () => {
      const event: ContextUpdateEvent = {
        event: 'context_update',
        timestamp: 4000,
        session_id: 'ctx-4',
        used_percentage: 10,
        remaining_percentage: 90,
        context_window_size: 200000,
        model: 'claude-opus-4-1',
        cwd: '/test',
        git_branch: 'develop',
        git_worktree: 'feature-wt',
        git_repo_root: '/test',
      };

      const session = createFromContextUpdate(event);

      expect(session.git_branch).toBe('develop');
      expect(session.git_worktree).toBe('feature-wt');
      expect(session.git_repo_root).toBe('/test');
    });
  });
});
