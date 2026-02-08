/**
 * useAssetModal - Reusable hook for opening content modals with async fetching.
 *
 * The pattern: show modal immediately with title/badge/icon in loading state,
 * then fetch content asynchronously and update the modal when ready.
 *
 * Usage:
 *   const { openAsset, modalProps } = useAssetModal();
 *
 *   // Sync (content already available)
 *   openAsset(webSearchModalConfig(query, count, urls));
 *
 *   // Async (fetch content on click)
 *   openAsset(
 *     planModalConfig(title, source, ''),
 *     async () => {
 *       const data = await getSessionPlanContent(sessionId, idx);
 *       return { content: data.content };
 *     },
 *   );
 */

import { useCallback } from 'react';
import { useContentModal } from '../components/ui/ContentModal';
import type { ContentModalConfig } from '../components/ui/ContentModal';

export type AssetFetcher = () => Promise<Partial<ContentModalConfig>>;

export function useAssetModal() {
  const { openModal, updateModal, closeModal, modalProps } = useContentModal();

  /**
   * Open a content modal, optionally fetching content asynchronously.
   *
   * @param config  Initial modal config (title, badge, icon, etc.)
   *                If no fetcher is provided, this is the final config.
   * @param fetcher Optional async function that returns content updates.
   *                When provided, the modal opens in loading state and
   *                updates once the fetcher resolves.
   */
  const openAsset = useCallback(async (
    config: ContentModalConfig,
    fetcher?: AssetFetcher,
  ) => {
    if (!fetcher) {
      openModal(config);
      return;
    }

    // Show modal immediately in loading state
    openModal({ ...config, loading: true, content: '' });

    try {
      const updates = await fetcher();
      updateModal({ ...updates, loading: false });
    } catch {
      updateModal({ content: '*Failed to load content*', loading: false });
    }
  }, [openModal, updateModal]);

  return { openAsset, closeModal, modalProps };
}
