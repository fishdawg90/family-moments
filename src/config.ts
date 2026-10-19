export const BASE = '/family-moments/';
export const FIREBASE_APP_NAME = 'la-spesa-5cc7a';
// Public web app configuration copied from Our Days. No private credentials.
export const FIREBASE_CONFIG = {
  apiKey: 'REMOVED_FIREBASE_WEB_API_KEY',
  authDomain: 'la-spesa-5cc7a.firebaseapp.com',
  projectId: 'la-spesa-5cc7a',
  appId: '1:767696505467:web:82873e463a2f93782bb0de',
};
// Deliberately unset until the owner verifies the actual existing/default bucket.
export const STORAGE_BUCKET = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '';
export const profiles = [
  {
    id: 'giulia',
    name: "Giulia's Moments",
    short: 'Giulia',
    icon: 'flower',
    accent: '#95624f',
    tint: '#f4e7df',
  },
  {
    id: 'nina',
    name: "Nina's Moments",
    short: 'Nina',
    icon: 'sun',
    accent: '#6d739e',
    tint: '#eceaf5',
  },
  {
    id: 'me',
    name: 'My Moments',
    short: 'My Moments',
    icon: 'leaf',
    accent: '#47786d',
    tint: '#e1eee6',
  },
] as const;
export function profileFromPath(path: string) {
  return profiles.find((p) => path.split('/')[2] === p.id) || profiles[0];
}
// Local development fixture is gated out of production builds.
export const TEST_MODE =
  import.meta.env.DEV &&
  import.meta.env.VITE_E2E_MODE === 'true' &&
  ['localhost', '127.0.0.1'].includes(location.hostname);
export const EMULATORS =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_EMULATORS === 'true' &&
  ['localhost', '127.0.0.1'].includes(location.hostname);
