/**
 * Project API routes
 *
 * GET    /api/projects                                      — List all discovered projects
 * DELETE /api/projects/:name                                — Hide a project
 * GET    /api/projects/:path/plans                          — List plans for a project
 * GET    /api/projects/:path/plans/:planId/content          — Get plan content
 * POST   /api/projects/:path/active-plans                   — Register active plan
 * GET    /api/projects/:path/active-plans                   — Get active plans
 * DELETE /api/projects/:path/active-plans/:planId           — Remove active plan
 * GET    /api/projects/:path/catalog                        — Get project catalog
 * GET    /api/projects/:path/context/:id/content            — Get context file content
 * POST   /api/projects/:path/context                        — Add context note
 * PUT    /api/projects/:path/context/:id                    — Update context file
 * DELETE /api/projects/:path/context/:id                    — Delete context file
 * GET    /api/projects/:path/subagents/:id/content          — Get subagent content
 * GET    /api/projects/:path/handoffs                       — List handoffs
 * GET    /api/projects/:path/handoffs/:filename/content     — Get handoff content
 */

import { promises as fsPromises } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { RouteContext } from './types.js';
import { sendJson, parseBody } from './http-utils.js';
import type { PlanEntry, ContextFile } from '@jacques/core';
import {
  discoverProjects,
  hideProject,
  decodeProjectPath,
  getProjectPlans,
  readLocalPlanContent,
  readProjectIndex,
  writeProjectIndex,
  findDuplicatePlan,
  addContextToIndex,
  removeContextFromIndex,
  listHandoffs,
  getHandoffContent,
} from '@jacques/core';

export async function projectRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, req, res, log } = ctx;

  if (!url.startsWith('/api/projects')) return false;

  // Route: GET /api/projects
  if (method === 'GET' && url === '/api/projects') {
    try {
      const projects = await discoverProjects();
      sendJson(res, 200, { projects });
    } catch {
      sendJson(res, 500, { error: 'Failed to discover projects' });
    }
    return true;
  }

  // Route: DELETE /api/projects/:name (hide project)
  const hideMatch = url.match(/^\/api\/projects\/([^/]+)$/);
  if (method === 'DELETE' && hideMatch) {
    const projectName = decodeURIComponent(hideMatch[1]);
    try {
      await hideProject(projectName);
      sendJson(res, 200, { hidden: projectName });
    } catch {
      sendJson(res, 500, { error: 'Failed to hide project' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/plans
  const plansListMatch = url.match(/^\/api\/projects\/([^/]+)\/plans$/);
  if (method === 'GET' && plansListMatch) {
    const encodedPath = plansListMatch[1];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const plans = await getProjectPlans(projectPath);
      sendJson(res, 200, { plans });
    } catch {
      sendJson(res, 500, { error: 'Failed to get project plans' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/plans/:planId/content
  const planContentMatch = url.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/content$/);
  if (method === 'GET' && planContentMatch) {
    const encodedPath = planContentMatch[1];
    const planId = planContentMatch[2];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);
      const plan = index.plans.find(p => p.id === planId);

      if (!plan) {
        sendJson(res, 404, { error: 'Plan not found in catalog' });
        return true;
      }

      const content = await readLocalPlanContent(projectPath, plan);
      if (!content) {
        sendJson(res, 404, { error: 'Plan file not found' });
        return true;
      }

      sendJson(res, 200, {
        id: plan.id,
        title: plan.title,
        filename: plan.filename,
        contentHash: plan.contentHash,
        sessions: plan.sessions,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        content,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get plan content' });
    }
    return true;
  }

  // Route: POST /api/projects/:path/active-plans
  const activePlansPostMatch = url.match(/^\/api\/projects\/([^/]+)\/active-plans$/);
  if (method === 'POST' && activePlansPostMatch) {
    const encodedPath = activePlansPostMatch[1];
    const body = await parseBody<{ planPath: string }>(req);
    if (!body || !body.planPath) {
      sendJson(res, 400, { error: 'Missing planPath in request body' });
      return true;
    }

    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const expandedPath = body.planPath.replace(/^~/, homedir());

      let planContent: string;
      try {
        planContent = await fsPromises.readFile(expandedPath, 'utf-8');
      } catch {
        sendJson(res, 404, { error: 'Plan file not found at provided path' });
        return true;
      }

      const matchedPlan = await findDuplicatePlan(planContent, projectPath);

      if (!matchedPlan) {
        sendJson(res, 404, { error: 'Plan not found in project catalog. Extract catalog first.' });
        return true;
      }

      const index = await readProjectIndex(projectPath);
      const activePlanIds = index.activePlanIds || [];

      if (!activePlanIds.includes(matchedPlan.id)) {
        activePlanIds.push(matchedPlan.id);
        index.activePlanIds = activePlanIds;
        await writeProjectIndex(projectPath, index);
      }

      sendJson(res, 200, {
        success: true,
        plan: matchedPlan,
        activePlanIds: index.activePlanIds,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to register active plan' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/active-plans
  const activePlansGetMatch = url.match(/^\/api\/projects\/([^/]+)\/active-plans$/);
  if (method === 'GET' && activePlansGetMatch) {
    const encodedPath = activePlansGetMatch[1];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);

      const activePlans: PlanEntry[] = [];
      for (const planId of index.activePlanIds || []) {
        const plan = index.plans.find(p => p.id === planId);
        if (plan) {
          activePlans.push(plan);
        }
      }

      sendJson(res, 200, {
        activePlanIds: index.activePlanIds || [],
        activePlans,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get active plans' });
    }
    return true;
  }

  // Route: DELETE /api/projects/:path/active-plans/:planId
  const activePlanDeleteMatch = url.match(/^\/api\/projects\/([^/]+)\/active-plans\/([^/]+)$/);
  if (method === 'DELETE' && activePlanDeleteMatch) {
    const encodedPath = activePlanDeleteMatch[1];
    const planId = activePlanDeleteMatch[2];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);

      const activePlanIds = index.activePlanIds || [];
      const planIdDecoded = decodeURIComponent(planId);

      if (!activePlanIds.includes(planIdDecoded)) {
        sendJson(res, 404, { error: 'Plan not in active list' });
        return true;
      }

      index.activePlanIds = activePlanIds.filter(id => id !== planIdDecoded);
      await writeProjectIndex(projectPath, index);

      sendJson(res, 200, {
        success: true,
        activePlanIds: index.activePlanIds,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to remove active plan' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/catalog
  const catalogMatch = url.match(/^\/api\/projects\/([^/]+)\/catalog$/);
  if (method === 'GET' && catalogMatch) {
    const encodedPath = catalogMatch[1];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);
      sendJson(res, 200, {
        context: index.context,
        plans: index.plans,
        sessions: index.sessions,
        updatedAt: index.updatedAt,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get project catalog' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/context/:id/content
  const contextContentMatch = url.match(/^\/api\/projects\/([^/]+)\/context\/([^/]+)\/content$/);
  if (method === 'GET' && contextContentMatch) {
    const encodedPath = contextContentMatch[1];
    const contextId = contextContentMatch[2];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);
      const contextFile = index.context.find(f => f.id === contextId);

      if (!contextFile) {
        sendJson(res, 404, { error: 'Context file not found' });
        return true;
      }

      const filePath = join(projectPath, contextFile.path);
      const content = await fsPromises.readFile(filePath, 'utf-8');
      sendJson(res, 200, { content });
    } catch {
      sendJson(res, 500, { error: 'Failed to read context file' });
    }
    return true;
  }

  // Route: POST /api/projects/:path/context
  const contextPostMatch = url.match(/^\/api\/projects\/([^/]+)\/context$/);
  if (method === 'POST' && contextPostMatch) {
    const encodedPath = contextPostMatch[1];
    const body = await parseBody<{ name: string; content: string; description?: string }>(req);
    if (!body || !body.name || !body.content) {
      sendJson(res, 400, { error: 'Missing name or content' });
      return true;
    }

    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));

      const slug = body.name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30);
      const randomSuffix = Math.random().toString(16).substring(2, 8);
      const id = `${slug.toLowerCase()}-${randomSuffix}`;
      const filename = `${slug}.md`;
      const contextDir = join(projectPath, '.jacques', 'context');
      const filePath = join(contextDir, filename);
      const relativePath = join('.jacques', 'context', filename);

      await fsPromises.mkdir(contextDir, { recursive: true });
      await fsPromises.writeFile(filePath, body.content, 'utf-8');
      const stats = await fsPromises.stat(filePath);

      const contextFile: ContextFile = {
        id,
        name: body.name,
        path: relativePath,
        source: 'local',
        sourceFile: filePath,
        addedAt: new Date().toISOString(),
        description: body.description,
        sizeBytes: stats.size,
      };

      await addContextToIndex(projectPath, contextFile);
      sendJson(res, 201, contextFile);
    } catch {
      sendJson(res, 500, { error: 'Failed to add context note' });
    }
    return true;
  }

  // Route: PUT /api/projects/:path/context/:id
  const contextPutMatch = url.match(/^\/api\/projects\/([^/]+)\/context\/([^/]+)$/);
  if (method === 'PUT' && contextPutMatch && !url.endsWith('/content')) {
    const encodedPath = contextPutMatch[1];
    const contextId = contextPutMatch[2];

    const body = await parseBody<{ content: string }>(req);
    if (!body || typeof body.content !== 'string') {
      sendJson(res, 400, { error: 'Missing content' });
      return true;
    }

    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);
      const contextFile = index.context.find(f => f.id === contextId);

      if (!contextFile) {
        sendJson(res, 404, { error: 'Context file not found' });
        return true;
      }

      const filePath = join(projectPath, contextFile.path);
      await fsPromises.writeFile(filePath, body.content, 'utf-8');
      const stats = await fsPromises.stat(filePath);

      contextFile.sizeBytes = stats.size;
      await addContextToIndex(projectPath, contextFile);

      sendJson(res, 200, { success: true });
    } catch {
      sendJson(res, 500, { error: 'Failed to update context file' });
    }
    return true;
  }

  // Route: DELETE /api/projects/:path/context/:id
  const contextDeleteMatch = url.match(/^\/api\/projects\/([^/]+)\/context\/([^/]+)$/);
  if (method === 'DELETE' && contextDeleteMatch) {
    const encodedPath = contextDeleteMatch[1];
    const contextId = contextDeleteMatch[2];

    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);
      const contextFile = index.context.find(f => f.id === contextId);

      if (!contextFile) {
        sendJson(res, 404, { error: 'Context file not found' });
        return true;
      }

      const filePath = join(projectPath, contextFile.path);
      try {
        await fsPromises.unlink(filePath);
      } catch {
        // File may already be deleted
      }

      await removeContextFromIndex(projectPath, contextId);
      sendJson(res, 200, { success: true });
    } catch {
      sendJson(res, 500, { error: 'Failed to delete context file' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/subagents/:id/content
  const subagentContentMatch = url.match(/^\/api\/projects\/([^/]+)\/subagents\/([^/]+)\/content$/);
  if (method === 'GET' && subagentContentMatch) {
    const encodedPath = subagentContentMatch[1];
    const subagentId = subagentContentMatch[2];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const index = await readProjectIndex(projectPath);
      const entry = index.subagents.find(s => s.id === subagentId);

      if (!entry) {
        sendJson(res, 404, { error: 'Subagent not found in catalog' });
        return true;
      }

      const filePath = join(projectPath, '.jacques', entry.path);
      const content = await fsPromises.readFile(filePath, 'utf-8');

      sendJson(res, 200, {
        ...entry,
        content,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get subagent content' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/handoffs
  const handoffsMatch = url.match(/^\/api\/projects\/([^/]+)\/handoffs$/);
  if (method === 'GET' && handoffsMatch) {
    const encodedPath = handoffsMatch[1];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const catalog = await listHandoffs(projectPath);
      sendJson(res, 200, {
        directory: catalog.directory,
        handoffs: catalog.entries.map(e => ({
          filename: e.filename,
          timestamp: e.timestamp.toISOString(),
          path: e.path,
          tokenEstimate: e.tokenEstimate,
        })),
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to list handoffs' });
    }
    return true;
  }

  // Route: GET /api/projects/:path/handoffs/:filename/content
  const handoffContentMatch = url.match(/^\/api\/projects\/([^/]+)\/handoffs\/([^/]+)\/content$/);
  if (method === 'GET' && handoffContentMatch) {
    const encodedPath = handoffContentMatch[1];
    const filename = handoffContentMatch[2];
    try {
      const projectPath = await decodeProjectPath(decodeURIComponent(encodedPath));
      const catalog = await listHandoffs(projectPath);
      const entry = catalog.entries.find(e => e.filename === decodeURIComponent(filename));

      if (!entry) {
        sendJson(res, 404, { error: 'Handoff not found' });
        return true;
      }

      const content = await getHandoffContent(entry.path);
      sendJson(res, 200, {
        filename: entry.filename,
        timestamp: entry.timestamp.toISOString(),
        tokenEstimate: entry.tokenEstimate,
        content,
      });
    } catch {
      sendJson(res, 500, { error: 'Failed to get handoff content' });
    }
    return true;
  }

  return false;
}
