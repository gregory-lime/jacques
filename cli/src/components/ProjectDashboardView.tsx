/**
 * Project Dashboard View Component
 *
 * A minimalist zen-like dashboard showing:
 * - Night sky scene with block gradient art
 * - Sessions list (live, saved, archived)
 * - Plans list
 * - Statistics panel
 *
 * Three responsive layouts based on terminal width:
 * - Full (≥90): Scene art + two-column layout
 * - Compact (70-89): Compact scene + stacked sections
 * - Minimal (<70): Text only, no scene art
 */

import React from "react";
import { Box, Text } from "ink";
import type { ProjectStatistics, ProjectSessionItem, PlanEntry, PlanProgressListItem } from "@jacques-ai/core";
import {
  SCENE_FULL,
  SCENE_COMPACT,
  dotLine,
  sectionLine,
  progressBar,
  formatTokens,
  formatDuration,
  formatDate,
  truncate,
  pad,
} from "./ascii-art/index.js";
import { ACCENT_COLOR, MUTED_TEXT, SUCCESS_COLOR } from "./layout/index.js";

// Layout constants
const FULL_LAYOUT_MIN_WIDTH = 90;
const COMPACT_LAYOUT_MIN_WIDTH = 70;
const VISIBLE_SESSIONS = 4;
const VISIBLE_PLANS = 3;

const SCENE_COLOR = MUTED_TEXT;

export interface ProjectDashboardViewProps {
  projectName: string;
  terminalWidth: number;
  terminalHeight: number;
  statistics: ProjectStatistics | null;
  sessions: ProjectSessionItem[];
  plans: PlanEntry[];
  activeSection: "sessions" | "plans";
  selectedIndex: number;
  scrollOffset: number;
  loading?: boolean;
  /** Plan progress map: planId -> progress info */
  planProgress?: Map<string, PlanProgressListItem>;
}

/**
 * Render the full layout (≥90 chars)
 */
function FullLayout({
  projectName,
  terminalWidth,
  statistics,
  sessions,
  plans,
  activeSection,
  selectedIndex,
  scrollOffset,
  planProgress,
}: Omit<ProjectDashboardViewProps, "terminalHeight" | "loading">): React.ReactElement {
  // Left side: Scene + Sessions/Plans
  // Right side: Statistics
  const leftWidth = Math.floor(terminalWidth * 0.65);
  const rightWidth = terminalWidth - leftWidth - 2;

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {/* Top border */}
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>

      {/* Scene + Title */}
      <Box flexDirection="row" marginTop={1}>
        {/* Scene on left */}
        <Box flexDirection="column" width={52}>
          {SCENE_FULL.map((line, i) => (
            <Text key={i} color={SCENE_COLOR}>
              {line}
            </Text>
          ))}
        </Box>
        {/* Title on right of scene */}
        <Box flexDirection="column" justifyContent="flex-end" marginLeft={4}>
          <Text bold color={ACCENT_COLOR}>
            PROJECT DASHBOARD
          </Text>
          <Text color={MUTED_TEXT}>{truncate(projectName, 30)}</Text>
        </Box>
      </Box>

      {/* Divider under scene */}
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>

      {/* Main content: two columns */}
      <Box flexDirection="row" marginTop={1}>
        {/* Left column: Sessions and Plans */}
        <Box flexDirection="column" width={leftWidth}>
          {/* Sessions section */}
          <Box flexDirection="column">
            <Text color={activeSection === "sessions" ? ACCENT_COLOR : MUTED_TEXT} bold>
              SESSIONS
            </Text>
            <Text color={MUTED_TEXT}>{sectionLine(leftWidth - 2)}</Text>
            <SessionsList
              sessions={sessions}
              isActive={activeSection === "sessions"}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxWidth={leftWidth - 2}
            />
          </Box>

          <Box height={1} />

          {/* Plans section */}
          <Box flexDirection="column">
            <Text color={activeSection === "plans" ? ACCENT_COLOR : MUTED_TEXT} bold>
              PLANS
            </Text>
            <Text color={MUTED_TEXT}>{sectionLine(leftWidth - 2)}</Text>
            <PlansList
              plans={plans}
              isActive={activeSection === "plans"}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxWidth={leftWidth - 2}
              planProgress={planProgress}
            />
          </Box>
        </Box>

        {/* Right column: Statistics */}
        <Box flexDirection="column" marginLeft={2} width={rightWidth}>
          <Text color={MUTED_TEXT} bold>
            STATISTICS
          </Text>
          <Text color={MUTED_TEXT}>{sectionLine(rightWidth - 2)}</Text>
          <StatisticsPanel statistics={statistics} width={rightWidth - 2} />
        </Box>
      </Box>

      {/* Bottom border */}
      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
      </Box>

      {/* Controls */}
      <Text color={MUTED_TEXT}>
        {" "}[Tab] Section   [↑↓] Navigate   [Enter] View Plan   [Esc] Back
      </Text>
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
    </Box>
  );
}

/**
 * Render the compact layout (70-89 chars)
 */
function CompactLayout({
  projectName,
  terminalWidth,
  statistics,
  sessions,
  plans,
  activeSection,
  selectedIndex,
  scrollOffset,
  planProgress,
}: Omit<ProjectDashboardViewProps, "terminalHeight" | "loading">): React.ReactElement {
  return (
    <Box flexDirection="column" width={terminalWidth}>
      {/* Top border */}
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>

      {/* Scene + Title in row */}
      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" width={32}>
          {SCENE_COMPACT.map((line, i) => (
            <Text key={i} color={SCENE_COLOR}>
              {line}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" justifyContent="center" marginLeft={2}>
          <Text bold color={ACCENT_COLOR}>
            PROJECT DASHBOARD
          </Text>
          <Text color={MUTED_TEXT}>{truncate(projectName, 25)}</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>

      {/* Two columns: Sessions/Plans on left, Stats on right */}
      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" width={Math.floor(terminalWidth * 0.55)}>
          {/* Sessions */}
          <Text color={activeSection === "sessions" ? ACCENT_COLOR : MUTED_TEXT} bold>
            SESSIONS
          </Text>
          <Text color={MUTED_TEXT}>{sectionLine(Math.floor(terminalWidth * 0.5))}</Text>
          <SessionsList
            sessions={sessions.slice(0, 3)}
            isActive={activeSection === "sessions"}
            selectedIndex={selectedIndex}
            scrollOffset={scrollOffset}
            maxWidth={Math.floor(terminalWidth * 0.5)}
            compact
          />

          <Box height={1} />

          {/* Plans */}
          <Text color={activeSection === "plans" ? ACCENT_COLOR : MUTED_TEXT} bold>
            PLANS
          </Text>
          <Text color={MUTED_TEXT}>{sectionLine(Math.floor(terminalWidth * 0.5))}</Text>
          <PlansList
            plans={plans.slice(0, 2)}
            isActive={activeSection === "plans"}
            selectedIndex={selectedIndex}
            scrollOffset={scrollOffset}
            maxWidth={Math.floor(terminalWidth * 0.5)}
            planProgress={planProgress}
          />
        </Box>

        <Box flexDirection="column" marginLeft={2}>
          <Text color={MUTED_TEXT} bold>
            STATISTICS
          </Text>
          <Text color={MUTED_TEXT}>{sectionLine(20)}</Text>
          <StatisticsPanel statistics={statistics} width={20} compact />
        </Box>
      </Box>

      {/* Bottom */}
      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
      </Box>
      <Text color={MUTED_TEXT}>
        {" "}[Tab] Section  [↑↓] Navigate  [Esc] Back
      </Text>
    </Box>
  );
}

/**
 * Render the minimal layout (<70 chars)
 */
function MinimalLayout({
  projectName,
  terminalWidth,
  statistics,
  sessions,
  plans,
  activeSection,
  selectedIndex,
  scrollOffset,
  planProgress,
}: Omit<ProjectDashboardViewProps, "terminalHeight" | "loading">): React.ReactElement {
  return (
    <Box flexDirection="column" width={terminalWidth}>
      <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>

      <Box marginTop={1}>
        <Text bold color={ACCENT_COLOR}>
          PROJECT DASHBOARD
        </Text>
      </Box>
      <Text color={MUTED_TEXT}>{truncate(projectName, terminalWidth - 2)}</Text>
      <Text color={MUTED_TEXT}>{sectionLine(terminalWidth - 2)}</Text>

      <Box height={1} />

      {/* Sessions */}
      <Text color={activeSection === "sessions" ? ACCENT_COLOR : MUTED_TEXT} bold>
        SESSIONS
      </Text>
      <SessionsList
        sessions={sessions.slice(0, 3)}
        isActive={activeSection === "sessions"}
        selectedIndex={selectedIndex}
        scrollOffset={scrollOffset}
        maxWidth={terminalWidth - 2}
        compact
      />

      <Box height={1} />

      {/* Plans */}
      <Text color={activeSection === "plans" ? ACCENT_COLOR : MUTED_TEXT} bold>
        PLANS
      </Text>
      <PlansList
        plans={plans.slice(0, 2)}
        isActive={activeSection === "plans"}
        selectedIndex={selectedIndex}
        scrollOffset={scrollOffset}
        maxWidth={terminalWidth - 2}
        planProgress={planProgress}
      />

      <Box marginTop={1}>
        <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
      </Box>
      <Text color={MUTED_TEXT}> [↑↓] Navigate  [Esc] Back</Text>
    </Box>
  );
}

/**
 * Sessions list component
 */
interface SessionsListProps {
  sessions: ProjectSessionItem[];
  isActive: boolean;
  selectedIndex: number;
  scrollOffset: number;
  maxWidth: number;
  compact?: boolean;
}

function SessionsList({
  sessions,
  isActive,
  selectedIndex,
  scrollOffset,
  maxWidth,
  compact = false,
}: SessionsListProps): React.ReactElement {
  const visibleCount = compact ? 3 : VISIBLE_SESSIONS;
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + visibleCount);
  const hasMore = sessions.length > scrollOffset + visibleCount;

  if (sessions.length === 0) {
    return <Text color={MUTED_TEXT}>No sessions yet</Text>;
  }

  const titleWidth = compact ? maxWidth - 12 : maxWidth - 20;

  return (
    <Box flexDirection="column">
      {visibleSessions.map((session, i) => {
        const globalIndex = scrollOffset + i;
        const isSelected = isActive && globalIndex === selectedIndex;
        const prefix = session.isActive ? (
          <Text color={SUCCESS_COLOR}>● </Text>
        ) : (
          <Text>  </Text>
        );

        // Format the date
        const dateStr = formatDate(new Date(session.date));

        // Context or duration
        const suffix = session.contextPercent !== undefined
          ? `${session.contextPercent}%`
          : formatDuration(session.durationMinutes);

        return (
          <Text key={session.id} color={isSelected ? "white" : MUTED_TEXT}>
            {isSelected ? "> " : "  "}
            {prefix}
            {session.isActive ? (
              <Text color="white">Active</Text>
            ) : (
              <Text>{dateStr}</Text>
            )}
            {"  "}
            <Text color={isSelected ? "white" : undefined}>
              {truncate(session.title, titleWidth)}
            </Text>
            {"  "}
            <Text>{pad(suffix, 5, "right")}</Text>
          </Text>
        );
      })}
      {hasMore && (
        <Text color={MUTED_TEXT}>
          {"                    "}▼ {sessions.length - scrollOffset - visibleCount} more
        </Text>
      )}
    </Box>
  );
}

/**
 * Plans list component
 */
interface PlansListProps {
  plans: PlanEntry[];
  isActive: boolean;
  selectedIndex: number;
  scrollOffset: number;
  maxWidth: number;
  planProgress?: Map<string, PlanProgressListItem>;
}

/** Width reserved for progress display: "████░░░░ 100%" = ~14 chars */
const PROGRESS_DISPLAY_WIDTH = 14;

function PlansList({
  plans,
  isActive,
  selectedIndex,
  scrollOffset,
  maxWidth,
  planProgress,
}: PlansListProps): React.ReactElement {
  const visiblePlans = plans.slice(scrollOffset, scrollOffset + VISIBLE_PLANS);
  const hasMore = plans.length > scrollOffset + VISIBLE_PLANS;

  if (plans.length === 0) {
    return <Text color={MUTED_TEXT}>No plans yet</Text>;
  }

  // Calculate title width (reserve space for progress if available)
  const hasProgress = planProgress && planProgress.size > 0;
  const titleWidth = hasProgress ? maxWidth - 4 - PROGRESS_DISPLAY_WIDTH : maxWidth - 4;

  return (
    <Box flexDirection="column">
      {visiblePlans.map((plan, i) => {
        const globalIndex = scrollOffset + i;
        const isSelected = isActive && globalIndex === selectedIndex;
        const progress = planProgress?.get(plan.id);

        // Progress bar display
        let progressDisplay = "";
        let progressColor = MUTED_TEXT;
        if (progress && !progress.loading) {
          const pct = progress.percentage;
          progressDisplay = `${progressBar(pct, 6)} ${pad(pct.toString(), 3, "left")}%`;
          if (pct === 100) {
            progressColor = SUCCESS_COLOR;
          } else if (pct > 0) {
            progressColor = ACCENT_COLOR;
          }
        } else if (progress?.loading) {
          progressDisplay = "...";
        }

        return (
          <Text key={plan.id} color={isSelected ? "white" : MUTED_TEXT}>
            {isSelected ? "> " : "  "}
            <Text color={isSelected ? "white" : undefined}>
              {truncate(plan.title, titleWidth)}
            </Text>
            {hasProgress && (
              <>
                {"  "}
                <Text color={isSelected ? "white" : progressColor}>
                  {progressDisplay}
                </Text>
              </>
            )}
          </Text>
        );
      })}
      {hasMore && (
        <Text color={MUTED_TEXT}>
          {"                    "}▼ more
        </Text>
      )}
    </Box>
  );
}

/**
 * Statistics panel component
 */
interface StatisticsPanelProps {
  statistics: ProjectStatistics | null;
  width: number;
  compact?: boolean;
}

function StatisticsPanel({
  statistics,
  width,
  compact = false,
}: StatisticsPanelProps): React.ReactElement {
  if (!statistics) {
    return <Text color={MUTED_TEXT}>Loading...</Text>;
  }

  const barWidth = compact ? 8 : 12;

  // Calculate token percentages (assume 200k context window max for visualization)
  const maxTokens = 200_000;
  const inputPercent = Math.min(100, (statistics.totalInputTokens / maxTokens) * 100);
  const outputPercent = Math.min(100, (statistics.totalOutputTokens / maxTokens) * 100);

  // Model usage entries
  const modelEntries = Object.entries(statistics.modelUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, compact ? 2 : 4);

  return (
    <Box flexDirection="column">
      <Text color={MUTED_TEXT}>Tokens</Text>
      <Text>
        in  {progressBar(inputPercent, barWidth)}  {formatTokens(statistics.totalInputTokens)}
      </Text>
      <Text>
        out {progressBar(outputPercent, barWidth)}  {formatTokens(statistics.totalOutputTokens)}
      </Text>

      <Box height={1} />

      <Text color={MUTED_TEXT}>
        Sessions: {statistics.totalSessions}  Handoffs: {statistics.totalHandoffs}
      </Text>

      {!compact && modelEntries.length > 0 && (
        <>
          <Box height={1} />
          <Text color={MUTED_TEXT} bold>
            MODELS
          </Text>
          <Text color={MUTED_TEXT}>{sectionLine(width)}</Text>
          {modelEntries.map(([model, count]) => {
            const percent = (count / statistics.totalSessions) * 100;
            // Shorten model names
            const shortName = model.replace("Claude ", "").toLowerCase();
            return (
              <Text key={model}>
                {pad(shortName, 7)}  {progressBar(percent, 8)}  {count}
              </Text>
            );
          })}
        </>
      )}
    </Box>
  );
}

/**
 * Main ProjectDashboardView component
 */
export function ProjectDashboardView(props: ProjectDashboardViewProps): React.ReactElement {
  const { terminalWidth, loading } = props;

  if (loading) {
    return (
      <Box flexDirection="column" width={terminalWidth}>
        <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
        <Box marginTop={1}>
          <Text color={ACCENT_COLOR}>Loading project dashboard...</Text>
        </Box>
        <Text color={MUTED_TEXT}>{dotLine(terminalWidth)}</Text>
      </Box>
    );
  }

  // Choose layout based on terminal width
  if (terminalWidth >= FULL_LAYOUT_MIN_WIDTH) {
    return <FullLayout {...props} />;
  } else if (terminalWidth >= COMPACT_LAYOUT_MIN_WIDTH) {
    return <CompactLayout {...props} />;
  } else {
    return <MinimalLayout {...props} />;
  }
}

// Export constants for use in App.tsx
export { VISIBLE_SESSIONS, VISIBLE_PLANS };
