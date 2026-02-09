/**
 * Hidden Projects Tests
 */

import { jest } from '@jest/globals';
import * as path from 'path';

// Mock fs module (ESM-compatible)
const mockReadFile = jest.fn<(...args: any[]) => Promise<string>>();
const mockWriteFile = jest.fn<(...args: any[]) => Promise<void>>();
const mockMkdir = jest.fn<(...args: any[]) => Promise<void>>();

jest.unstable_mockModule('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

describe('hidden-projects', () => {
  let getHiddenProjects: typeof import('../hidden-projects.js').getHiddenProjects;
  let hideProject: typeof import('../hidden-projects.js').hideProject;
  let unhideProject: typeof import('../hidden-projects.js').unhideProject;
  let HIDDEN_PROJECTS_FILE: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../hidden-projects.js');
    getHiddenProjects = mod.getHiddenProjects;
    hideProject = mod.hideProject;
    unhideProject = mod.unhideProject;
    const types = await import('../types.js');
    HIDDEN_PROJECTS_FILE = types.HIDDEN_PROJECTS_FILE;
  });

  describe('getHiddenProjects', () => {
    it('should return empty set when file does not exist', async () => {
      mockReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const result = await getHiddenProjects();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should return empty set when file contains invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not json');

      const result = await getHiddenProjects();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should return empty set when file contains non-array JSON', async () => {
      mockReadFile.mockResolvedValue('{"foo": "bar"}');

      const result = await getHiddenProjects();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should return set of hidden project names', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(['project-a', 'project-b']));

      const result = await getHiddenProjects();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('project-a')).toBe(true);
      expect(result.has('project-b')).toBe(true);
    });

    it('should read from HIDDEN_PROJECTS_FILE path', async () => {
      mockReadFile.mockResolvedValue('[]');
      await getHiddenProjects();
      expect(mockReadFile).toHaveBeenCalledWith(HIDDEN_PROJECTS_FILE, 'utf-8');
    });
  });

  describe('hideProject', () => {
    it('should add project to hidden list and write file', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await hideProject('my-project');

      expect(mockMkdir).toHaveBeenCalledWith(
        path.dirname(HIDDEN_PROJECTS_FILE),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        HIDDEN_PROJECTS_FILE,
        expect.any(String)
      );

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toContain('my-project');
    });

    it('should preserve existing hidden projects when adding', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(['existing-project']));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await hideProject('new-project');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toContain('existing-project');
      expect(parsed).toContain('new-project');
    });

    it('should not duplicate when hiding already-hidden project', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(['my-project']));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await hideProject('my-project');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent) as string[];
      expect(parsed.filter((p: string) => p === 'my-project').length).toBe(1);
    });
  });

  describe('unhideProject', () => {
    it('should remove project from hidden list', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(['project-a', 'project-b']));
      mockWriteFile.mockResolvedValue(undefined);

      await unhideProject('project-a');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed).not.toContain('project-a');
      expect(parsed).toContain('project-b');
    });

    it('should handle unhiding non-existent project gracefully', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(['other']));
      mockWriteFile.mockResolvedValue(undefined);

      await unhideProject('nonexistent');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toContain('other');
    });
  });
});
