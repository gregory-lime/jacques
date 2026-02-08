/**
 * Context Page - Three-panel orchestrator for the context catalog GUI
 *
 * Layout: [CatalogPanel 240px] [ChatPanel flex:1]
 * Manages catalog state, chat state, and modal display.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectScope } from '../hooks/useProjectScope';
import { useJacquesClient } from '../hooks/useJacquesClient';
import { useCatalog } from '../hooks/useCatalog';
import { useCatalogChat } from '../hooks/useCatalogChat';
import { useAssetModal } from '../hooks/useAssetModal';
import { usePersistedState } from '../hooks/usePersistedState';
import { CatalogPanel } from '../components/context/CatalogPanel';
import { ChatPanel } from '../components/context/ChatPanel';
import { ContentModal } from '../components/ui/ContentModal';
import { contextFileModalConfig, planModalConfig } from '../components/ui/contentModalConfigs';
import { getContextFileContent, getPlanCatalogContent } from '../api';
import type { CatalogItem, CatalogPlanEntry, CatalogSessionEntry } from '../types';

/**
 * Encode a project path for API use (dash-separated path segments)
 */
function encodeProjectPath(projectPath: string): string {
  // Convert /Users/gole/Desktop/project → -Users-gole-Desktop-project
  return projectPath.replace(/\//g, '-');
}

export function Context() {
  const { selectedProject } = useProjectScope();
  const { sendChatMessage, abortChat, setChatCallbacks } = useJacquesClient();
  const encodedPath = selectedProject ? encodeProjectPath(selectedProject) : null;

  // Catalog state
  const { catalog, loading: catalogLoading, refresh: refreshCatalog } = useCatalog(encodedPath);

  // Chat state
  const {
    messages,
    isStreaming,
    currentStreamText,
    currentTools,
    sendMessage,
    abort,
    error: chatError,
  } = useCatalogChat({
    projectPath: selectedProject,
    sendChatMessage,
    abortChat,
    setChatCallbacks,
    onCatalogRefresh: refreshCatalog,
  });

  // Modal state
  const { openAsset, modalProps } = useAssetModal();

  // Catalog panel collapse
  const [catalogCollapsed, setCatalogCollapsed] = usePersistedState('catalogCollapsed', false);
  const toggleCatalogCollapse = useCallback(() => {
    setCatalogCollapsed(!catalogCollapsed);
  }, [catalogCollapsed, setCatalogCollapsed]);

  // Handle catalog item clicks
  const handleItemClick = useCallback(async (
    type: 'context' | 'plan' | 'session',
    item: CatalogItem | CatalogPlanEntry | CatalogSessionEntry,
  ) => {
    if (!encodedPath) return;

    if (type === 'context') {
      const ctxItem = item as CatalogItem;
      openAsset(
        contextFileModalConfig(ctxItem.name, ctxItem.source, '', ctxItem.description),
        async () => {
          const data = await getContextFileContent(encodedPath, ctxItem.id);
          return { content: data.content };
        },
      );
    } else if (type === 'plan') {
      const planItem = item as CatalogPlanEntry;
      openAsset(
        planModalConfig(planItem.title, 'embedded', ''),
        async () => {
          const data = await getPlanCatalogContent(encodedPath, planItem.id);
          return { content: data.content };
        },
      );
    }
    // Sessions: could navigate to session viewer, but for now just show a message
  }, [encodedPath, openAsset]);

  // Auto-collapse catalog on narrow viewports
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const manualOverrideRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (!manualOverrideRef.current) {
          // Auto-collapse catalog when content area is less than 800px
          if (width < 800 && !catalogCollapsed) {
            setAutoCollapsed(true);
          } else if (width >= 800 && autoCollapsed) {
            setAutoCollapsed(false);
          }
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [catalogCollapsed, autoCollapsed]);

  const effectiveCollapsed = manualOverrideRef.current ? catalogCollapsed : (catalogCollapsed || autoCollapsed);

  const handleToggleCatalog = useCallback(() => {
    manualOverrideRef.current = true;
    toggleCatalogCollapse();
  }, [toggleCatalogCollapse]);

  // Handle add context (placeholder - opens a simple prompt)
  const handleAddContext = useCallback(() => {
    // For now, send a chat message asking to create a note
    if (selectedProject) {
      sendMessage('Create a new context note for this project');
    }
  }, [selectedProject, sendMessage]);

  return (
    <div ref={containerRef} style={styles.container}>
      <CatalogPanel
        catalog={catalog}
        loading={catalogLoading}
        collapsed={effectiveCollapsed}
        onToggleCollapse={handleToggleCatalog}
        onItemClick={handleItemClick}
        onAddContext={handleAddContext}
      />
      <ChatPanel
        messages={messages}
        isStreaming={isStreaming}
        currentStreamText={currentStreamText}
        currentTools={currentTools}
        catalog={catalog}
        error={chatError}
        projectSelected={!!selectedProject}
        onSend={sendMessage}
        onAbort={abort}
      />
      {modalProps && <ContentModal {...modalProps} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
  },
};
