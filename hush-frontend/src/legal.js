import rulesMd from './legal/rules.md?raw';
import privacyMd from './legal/privacy.md?raw';
import termsMd from './legal/terms.md?raw';

// The canonical legal texts live in src/legal/*.md (mirrored to
// public/legal/ for the web). They are bundled into the app so the
// signup screen and the drawer always carry the current version.
export const LEGAL_VERSION = '1.0';

export const LEGAL_DOCS = {
  rules: { id: 'rules', title: 'Site Rules', md: rulesMd },
  privacy: { id: 'privacy', title: 'Privacy Policy', md: privacyMd },
  terms: { id: 'terms', title: 'Terms of Use', md: termsMd }
};
