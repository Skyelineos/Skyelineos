import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    fallbackLng: 'en',
    debug: false, // Disable debug to prevent console spam

    interpolation: {
      escapeValue: false, // React already does escaping
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    resources: {
      en: {
        translation: {
          // Navigation
          'nav.dashboard': 'Dashboard',
          'nav.projects': 'Projects',
          'nav.schedule': 'Schedule',
          'nav.contacts': 'Contacts',
          'nav.documents': 'Documents',
          'nav.financials': 'Financials',
          'nav.messaging': 'Messaging',
          'nav.reports': 'Reports',
          'nav.settings': 'Settings',
          'nav.logout': 'Logout',
          
          // Project Management
          'projects.title': 'Projects',
          'projects.new': 'New Project',
          'projects.active': 'Active Projects',
          'projects.completed': 'Completed Projects',
          'projects.status': 'Status',
          'projects.client': 'Client',
          'projects.budget': 'Budget',
          'projects.progress': 'Progress',
          
          // Common Actions
          'common.save': 'Save',
          'common.cancel': 'Cancel',
          'common.edit': 'Edit',
          'common.delete': 'Delete',
          'common.view': 'View',
          'common.add': 'Add',
          'common.search': 'Search',
          'common.filter': 'Filter',
          'common.export': 'Export',
          'common.import': 'Import',
          'common.loading': 'Loading...',
          'common.error': 'An error occurred',
          'common.success': 'Success',
          
          // Dashboard
          'dashboard.title': 'Dashboard',
          'dashboard.overview': 'Overview',
          'dashboard.recentActivity': 'Recent Activity',
          'dashboard.urgentItems': 'Urgent Items',
          'dashboard.weatherForecast': 'Weather Forecast',
          'dashboard.quickActions': 'Quick Actions',
          
          // Schedule
          'schedule.title': 'Schedule',
          'schedule.timeline': 'Timeline',
          'schedule.calendar': 'Calendar',
          'schedule.tasks': 'Tasks',
          'schedule.milestones': 'Milestones',
          'schedule.dependencies': 'Dependencies',
          
          // Accessibility
          'a11y.skipToContent': 'Skip to main content',
          'a11y.openMenu': 'Open navigation menu',
          'a11y.closeMenu': 'Close navigation menu',
          'a11y.userMenu': 'User menu',
          'a11y.searchInput': 'Search input',
        }
      }
    }
  });

export default i18n;