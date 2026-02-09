/**
 * Components barrel export
 */

export { App } from './App.js';
export { ContextProgress } from './ContextProgress.js';
export { Dashboard } from './Dashboard.js';
export { Header } from './Header.js';
export { Mascot } from './Mascot.js';
export { Menu, DEFAULT_MENU_ITEMS } from './Menu.js';
export type { MenuItem } from './Menu.js';
export { ProgressBar, MiniProgress } from './ProgressBar.js';
export { ImageMascot } from './ImageMascot.js';
export { ContentBox } from './ContentBox.js';
export { VerticalMenu } from './VerticalMenu.js';
export type { VerticalMenuItem } from './VerticalMenu.js';

// LoadContext views
export { LoadContextView, LOAD_OPTIONS } from './LoadContextView.js';
export type { LoadOption } from './LoadContextView.js';
export { SourceSelectionView, buildSourceItems } from './SourceSelectionView.js';
export type { SourceItem } from './SourceSelectionView.js';
export { ObsidianConfigView } from './ObsidianConfigView.js';
export { ObsidianBrowserView, VISIBLE_ITEMS } from './ObsidianBrowserView.js';
export { AddContextConfirmView } from './AddContextConfirmView.js';

// Project Dashboard views
export { ProjectDashboardView, VISIBLE_SESSIONS, VISIBLE_PLANS } from './ProjectDashboardView.js';
export type { ProjectDashboardViewProps } from './ProjectDashboardView.js';
export { PlanViewerView, PLAN_VIEWER_VISIBLE_LINES } from './PlanViewerView.js';

// ASCII Art utilities
export * from './ascii-art/index.js';
