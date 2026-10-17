// The managed-release browser profile directory (%APPDATA%/Matrix/profiles/release), migrated once from the legacy
// location inside the project.
import * as fs from 'node:fs';
import * as path from 'node:path';

export function releaseProfile(app: { getPath(name: string): string }, root: string): string {
  const profile = path.join(app.getPath('appData'), 'Matrix', 'profiles', 'release');
  const legacy = path.join(root, 'diagnostics', 'release-profile');
  if (!fs.existsSync(profile) && fs.existsSync(legacy)) fs.cpSync(legacy, profile, { recursive: true, errorOnExist: true });
  fs.mkdirSync(profile, { recursive: true });
  return profile;
}
