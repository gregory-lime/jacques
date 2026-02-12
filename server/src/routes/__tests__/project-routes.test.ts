/**
 * Project routes tests
 */

import { jest } from '@jest/globals';

const mockProjects = [
  { name: 'project-a', path: '/Users/test/project-a', sessions: [] },
];

const mockIndex = {
  context: [
    { id: 'ctx-1', name: 'Note 1', path: '.jacques/context/note.md', source: 'local', sizeBytes: 100 },
  ],
  plans: [
    { id: 'plan-1', title: 'Plan One', filename: 'plan.md', contentHash: 'abc', sessions: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  sessions: [],
  subagents: [],
  updatedAt: '2024-01-01T00:00:00Z',
  activePlanIds: [] as string[],
};

const mockDiscoverProjects = jest.fn<() => Promise<unknown[]>>();
const mockHideProject = jest.fn<() => Promise<void>>();
const mockGetProjectPlans = jest.fn<() => Promise<unknown[]>>();
const mockReadLocalPlanContent = jest.fn<() => Promise<string>>();
const mockReadProjectIndex = jest.fn<() => Promise<unknown>>();
const mockWriteProjectIndex = jest.fn<() => Promise<void>>();
const mockFindDuplicatePlan = jest.fn<() => Promise<unknown | null>>();
const mockListHandoffs = jest.fn<() => Promise<unknown>>();
const mockGetHandoffContent = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('@jacques-ai/core', () => ({
  discoverProjects: mockDiscoverProjects,
  hideProject: mockHideProject,
  decodeProjectPath: jest.fn<(path: string) => Promise<string>>().mockImplementation((path: string) => Promise.resolve('/decoded/' + path)),
  getProjectPlans: mockGetProjectPlans,
  readLocalPlanContent: mockReadLocalPlanContent,
  readProjectIndex: mockReadProjectIndex,
  writeProjectIndex: mockWriteProjectIndex,
  findDuplicatePlan: mockFindDuplicatePlan,
  addContextToIndex: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  removeContextFromIndex: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  listHandoffs: mockListHandoffs,
  getHandoffContent: mockGetHandoffContent,
  indexEmbeddedPlan: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'auto-archived', title: 'Auto Plan', filename: 'auto-plan.md' }),
  extractPlanTitle: jest.fn<(content: string) => string>().mockReturnValue('Auto Plan'),
  generatePlanFilename: jest.fn<(title: string) => string>().mockReturnValue('auto-plan.md'),
  generateVersionedFilename: jest.fn<() => Promise<string>>().mockResolvedValue('auto-plan-2.md'),
}));

const { projectRoutes } = await import('../project-routes.js');
import { createMockContext, getSentJson } from './test-helpers.js';

describe('projectRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjects.mockResolvedValue(mockProjects);
    mockHideProject.mockResolvedValue(undefined);
    mockGetProjectPlans.mockResolvedValue([{ id: 'plan-1', title: 'Plan One' }]);
    mockReadLocalPlanContent.mockResolvedValue('# Plan content');
    mockReadProjectIndex.mockResolvedValue({ ...mockIndex });
    mockWriteProjectIndex.mockResolvedValue(undefined);
    mockFindDuplicatePlan.mockResolvedValue({ id: 'plan-1', title: 'Plan One' });
    mockListHandoffs.mockResolvedValue({
      directory: '/decoded/test/.jacques/handoffs',
      entries: [
        { filename: 'handoff-2024.md', timestamp: new Date('2024-01-01'), path: '/handoff.md', tokenEstimate: 500 },
      ],
    });
    mockGetHandoffContent.mockResolvedValue('# Handoff content');
  });

  describe('GET /api/projects', () => {
    it('returns discovered projects', async () => {
      const { ctx, res } = createMockContext({ url: '/api/projects' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { projects: unknown[] }).projects).toHaveLength(1);
    });
  });

  describe('DELETE /api/projects/:name', () => {
    it('hides a project', async () => {
      const { ctx, res } = createMockContext({ method: 'DELETE', url: '/api/projects/my-project' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { hidden: string }).hidden).toBe('my-project');
      expect(mockHideProject).toHaveBeenCalledWith('my-project');
    });
  });

  describe('GET /api/projects/:path/plans', () => {
    it('returns project plans', async () => {
      const { ctx, res } = createMockContext({ url: '/api/projects/encoded-path/plans' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { plans: unknown[] }).plans).toHaveLength(1);
    });
  });

  describe('GET /api/projects/:path/plans/:planId/content', () => {
    it('returns plan content', async () => {
      const { ctx, res } = createMockContext({ url: '/api/projects/encoded-path/plans/plan-1/content' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { content: string }).content).toBe('# Plan content');
    });

    it('returns 404 for unknown plan', async () => {
      mockReadProjectIndex.mockResolvedValueOnce({ ...mockIndex, plans: [] });

      const { ctx, res } = createMockContext({ url: '/api/projects/encoded-path/plans/unknown/content' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(404);
    });
  });

  describe('GET /api/projects/:path/catalog', () => {
    it('returns project catalog', async () => {
      const { ctx, res } = createMockContext({ url: '/api/projects/encoded-path/catalog' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      const typed = data as { context: unknown[]; plans: unknown[]; updatedAt: string };
      expect(typed.context).toHaveLength(1);
      expect(typed.plans).toHaveLength(1);
      expect(typed.updatedAt).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('POST /api/projects/:path/active-plans', () => {
    it('returns 400 for missing planPath', async () => {
      const { ctx, res } = createMockContext({
        method: 'POST',
        url: '/api/projects/encoded-path/active-plans',
        body: {},
      });

      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status } = getSentJson(res);
      expect(status).toBe(400);
    });
  });

  describe('GET /api/projects/:path/active-plans', () => {
    it('returns active plans', async () => {
      const { ctx, res } = createMockContext({ url: '/api/projects/encoded-path/active-plans' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { activePlanIds: string[] }).activePlanIds).toEqual([]);
    });
  });

  describe('GET /api/projects/:path/handoffs', () => {
    it('returns handoff list', async () => {
      const { ctx, res } = createMockContext({ url: '/api/projects/encoded-path/handoffs' });
      const handled = await projectRoutes(ctx);

      expect(handled).toBe(true);
      const { status, data } = getSentJson(res);
      expect(status).toBe(200);
      expect((data as { handoffs: unknown[] }).handoffs).toHaveLength(1);
    });
  });

  it('returns false for non-matching routes', async () => {
    const { ctx } = createMockContext({ url: '/api/sessions' });
    const handled = await projectRoutes(ctx);
    expect(handled).toBe(false);
  });
});
