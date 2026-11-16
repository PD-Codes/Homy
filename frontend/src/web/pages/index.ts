import type { PageDef } from '@/ui/host';
import { AdminPage } from './admin';
import { FavoritesPage } from './favorites';
import { IntegrationsPage } from './integrations';
import { SettingsPage } from './settings';

export const PAGES: PageDef[] = [
  { id: 'favorites', label: { de: 'Favoriten', en: 'Favorites' }, icon: 'star', component: FavoritesPage },
  { id: 'integrations', label: { de: 'Integrationen', en: 'Integrations' }, icon: 'plug', component: IntegrationsPage },
  { id: 'settings', label: { de: 'Einstellungen', en: 'Settings' }, icon: 'settings', component: SettingsPage },
  { id: 'admin', label: { de: 'Verwaltung', en: 'Administration' }, icon: 'shield-check', adminOnly: true, component: AdminPage },
];
