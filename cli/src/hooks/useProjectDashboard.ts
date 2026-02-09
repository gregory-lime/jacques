/**
 * useProjectDashboard Hook
 *
 * Manages the project dashboard view: stats, sessions, plans,
 * section navigation, and the plan viewer sub-view.
 * Extracted from App.tsx.
 */

import { useState, useCallback, useRef } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  aggregateProjectStatistics,
  buildProjectSessionList,
  getProjectPlans,
  readLocalPlanContent,
  computePlanProgress,
  computePlanProgressSummary,
} from "@jacques/core";
import type {
  ProjectStatistics,
  ProjectSessionItem,
  PlanEntry,
  PlanProgress,
  PlanProgressListItem,
  Session,
} from "@jacques/core";
import { VISIBLE_SESSIONS, VISIBLE_PLANS } from "../components/ProjectDashboardView.js";
import { PLAN_VIEWER_VISIBLE_LINES } from "../components/PlanViewerView.js";

export interface UseProjectDashboardParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  returnToMain: () => void;
}

export interface UseProjectDashboardState {
  stats: ProjectStatistics | null;
  dashboardSessions: ProjectSessionItem[];
  plans: PlanEntry[];
  section: "sessions" | "plans";
  selectedIndex: number;
  scrollOffset: number;
  loading: boolean;
  planProgressMap: Map<string, PlanProgressListItem>;
  planViewerPlan: PlanEntry | null;
  planViewerContent: string;
  planViewerScrollOffset: number;
  planViewerProgress: PlanProgress | null;
  planViewerProgressLoading: boolean;
}

export interface UseProjectDashboardReturn {
  state: UseProjectDashboardState;
  open: (cwd: string, sessions: Session[], focusedSessionId: string | null) => void;
  handleInput: (input: string, key: Key, view: "project-dashboard" | "plan-viewer") => void;
  reset: () => void;
}

export function useProjectDashboard({
  setCurrentView,
  showNotification,
  returnToMain,
}: UseProjectDashboardParams): UseProjectDashboardReturn {
  // Project dashboard state
  const [projectDashboardStats, setProjectDashboardStats] = useState<ProjectStatistics | null>(null);
  const [projectDashboardSessions, setProjectDashboardSessions] = useState<ProjectSessionItem[]>([]);
  const [projectDashboardPlans, setProjectDashboardPlans] = useState<PlanEntry[]>([]);
  const [projectDashboardSection, setProjectDashboardSection] = useState<"sessions" | "plans">("sessions");
  const [projectDashboardSelectedIndex, setProjectDashboardSelectedIndex] = useState<number>(0);
  const [projectDashboardScrollOffset, setProjectDashboardScrollOffset] = useState<number>(0);
  const [projectDashboardLoading, setProjectDashboardLoading] = useState<boolean>(false);

  // Plan viewer state
  const [planViewerPlan, setPlanViewerPlan] = useState<PlanEntry | null>(null);
  const [planViewerContent, setPlanViewerContent] = useState<string>("");
  const [planViewerScrollOffset, setPlanViewerScrollOffset] = useState<number>(0);

  // Plan progress state
  const [planProgressMap, setPlanProgressMap] = useState<Map<string, PlanProgressListItem>>(new Map());
  const [planViewerProgress, setPlanViewerProgress] = useState<PlanProgress | null>(null);
  const [planViewerProgressLoading, setPlanViewerProgressLoading] = useState<boolean>(false);

  // Store cwd from open() for use in plan viewer enter handler
  const cwdRef = useRef<string>("");

  // Open project dashboard - load stats, sessions, plans, compute progress
  const open = useCallback((cwd: string, sessions: Session[], focusedSessionId: string | null) => {
    // Store cwd for later use in plan viewer
    cwdRef.current = cwd;

    // Initialize dashboard state
    setProjectDashboardLoading(true);
    setProjectDashboardSection("sessions");
    setProjectDashboardSelectedIndex(0);
    setProjectDashboardScrollOffset(0);
    setCurrentView("project-dashboard");

    // Load dashboard data
    Promise.all([
      aggregateProjectStatistics(cwd, sessions),
      buildProjectSessionList(cwd, sessions, focusedSessionId),
      getProjectPlans(cwd),
    ]).then(async ([stats, sessionList, plans]) => {
      setProjectDashboardStats(stats);
      setProjectDashboardSessions(sessionList);
      setProjectDashboardPlans(plans);
      setProjectDashboardLoading(false);

      // Compute plan progress asynchronously (don't block dashboard load)
      setPlanProgressMap(new Map()); // Reset progress map
      for (const plan of plans) {
        try {
          const content = await readLocalPlanContent(cwd, plan);
          if (content) {
            const summary = await computePlanProgressSummary(plan, content, cwd);
            setPlanProgressMap((prev) => {
              const next = new Map(prev);
              next.set(plan.id, summary);
              return next;
            });
          }
        } catch {
          // Skip failed progress computation for individual plans
        }
      }
    }).catch((err) => {
      showNotification(`Failed to load dashboard: ${err instanceof Error ? err.message : String(err)}`);
      setProjectDashboardLoading(false);
    });
  }, [setCurrentView, showNotification]);

  // Handle keyboard input for project-dashboard and plan-viewer views
  const handleInput = useCallback((input: string, key: Key, view: "project-dashboard" | "plan-viewer") => {
    if (view === "project-dashboard") {
      // Project dashboard view
      if (key.escape) {
        returnToMain();
        return;
      }

      // Tab to switch between sessions and plans
      if (key.tab) {
        setProjectDashboardSection((prev) =>
          prev === "sessions" ? "plans" : "sessions"
        );
        setProjectDashboardSelectedIndex(0);
        setProjectDashboardScrollOffset(0);
        return;
      }

      // Arrow key navigation
      if (key.upArrow) {
        const items = projectDashboardSection === "sessions"
          ? projectDashboardSessions
          : projectDashboardPlans;
        const visibleCount = projectDashboardSection === "sessions"
          ? VISIBLE_SESSIONS
          : VISIBLE_PLANS;

        const newIndex = Math.max(0, projectDashboardSelectedIndex - 1);
        setProjectDashboardSelectedIndex(newIndex);
        // Adjust scroll if needed
        if (newIndex < projectDashboardScrollOffset) {
          setProjectDashboardScrollOffset(newIndex);
        }
        return;
      }

      if (key.downArrow) {
        const items = projectDashboardSection === "sessions"
          ? projectDashboardSessions
          : projectDashboardPlans;
        const visibleCount = projectDashboardSection === "sessions"
          ? VISIBLE_SESSIONS
          : VISIBLE_PLANS;

        const newIndex = Math.min(items.length - 1, projectDashboardSelectedIndex + 1);
        setProjectDashboardSelectedIndex(newIndex);
        // Adjust scroll if needed
        if (newIndex >= projectDashboardScrollOffset + visibleCount) {
          setProjectDashboardScrollOffset(newIndex - visibleCount + 1);
        }
        return;
      }

      // Enter to view plan content (only in plans section)
      if (key.return && projectDashboardSection === "plans" && projectDashboardPlans.length > 0) {
        const selectedPlan = projectDashboardPlans[projectDashboardSelectedIndex];
        if (selectedPlan) {
          const cwd = cwdRef.current;
          setPlanViewerPlan(selectedPlan);
          setPlanViewerScrollOffset(0);
          setPlanViewerProgress(null);
          setPlanViewerProgressLoading(true);
          setCurrentView("plan-viewer");

          // Load plan content and compute progress
          readLocalPlanContent(cwd, selectedPlan).then(async (content) => {
            const planContent = content || "Failed to load plan content";
            setPlanViewerContent(planContent);

            // Compute full progress for detailed view
            if (content) {
              try {
                const progress = await computePlanProgress(selectedPlan, content, cwd);
                setPlanViewerProgress(progress);
              } catch {
                // Progress computation failed - that's okay
              }
            }
            setPlanViewerProgressLoading(false);
          }).catch(() => {
            setPlanViewerContent("Failed to load plan content");
            setPlanViewerProgressLoading(false);
          });
        }
        return;
      }
    } else if (view === "plan-viewer") {
      // Plan viewer - scrolling and exit
      if (key.escape) {
        setCurrentView("project-dashboard");
        return;
      }

      // Scroll content
      if (key.upArrow) {
        setPlanViewerScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setPlanViewerScrollOffset((prev) => prev + 1);
        return;
      }

      // Page up/down
      if (key.pageUp) {
        setPlanViewerScrollOffset((prev) =>
          Math.max(0, prev - PLAN_VIEWER_VISIBLE_LINES)
        );
        return;
      }

      if (key.pageDown) {
        setPlanViewerScrollOffset((prev) => prev + PLAN_VIEWER_VISIBLE_LINES);
        return;
      }
    }
  }, [
    projectDashboardSection,
    projectDashboardSessions,
    projectDashboardPlans,
    projectDashboardSelectedIndex,
    projectDashboardScrollOffset,
    returnToMain,
    setCurrentView,
  ]);

  // Reset all state
  const reset = useCallback(() => {
    setProjectDashboardStats(null);
    setProjectDashboardSessions([]);
    setProjectDashboardPlans([]);
    setProjectDashboardSection("sessions");
    setProjectDashboardSelectedIndex(0);
    setProjectDashboardScrollOffset(0);
    setProjectDashboardLoading(false);
    setPlanProgressMap(new Map());
    setPlanViewerPlan(null);
    setPlanViewerContent("");
    setPlanViewerScrollOffset(0);
    setPlanViewerProgress(null);
    setPlanViewerProgressLoading(false);
  }, []);

  return {
    state: {
      stats: projectDashboardStats,
      dashboardSessions: projectDashboardSessions,
      plans: projectDashboardPlans,
      section: projectDashboardSection,
      selectedIndex: projectDashboardSelectedIndex,
      scrollOffset: projectDashboardScrollOffset,
      loading: projectDashboardLoading,
      planProgressMap,
      planViewerPlan,
      planViewerContent,
      planViewerScrollOffset,
      planViewerProgress,
      planViewerProgressLoading,
    },
    open,
    handleInput,
    reset,
  };
}
