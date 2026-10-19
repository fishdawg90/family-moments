import profileDefinitions from './profiles.json';
export const BASE = '/family-moments/';
export const FIREBASE_APP_NAME = 'la-spesa-5cc7a';
// Public web app configuration copied from Our Days. No private credentials.
export const FIREBASE_CONFIG = {
  apiKey: 'REMOVED_FIREBASE_WEB_API_KEY',
  authDomain: 'la-spesa-5cc7a.firebaseapp.com',
  projectId: 'la-spesa-5cc7a',
  appId: '1:767696505467:web:82873e463a2f93782bb0de',
};
// Existing bucket verified by the owner in Firebase Storage. This is public configuration.
export const STORAGE_BUCKET =
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'la-spesa-5cc7a.firebasestorage.app';
export const profiles = profileDefinitions;
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
