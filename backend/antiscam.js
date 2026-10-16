'use strict';

// ===================== ANTI-SCAM SIGNAL DATA =====================
// Daniel's rule (2026-10-15): "Anything that has more than 5 signs of a
// scammer's playbook gets a warning to correct it, or they're gone."
// This module is DATA + pure matchers only. The server owns per-user
// state (which signals fired, when), the warning ladder and bans.
//
// Everything here is tunable: add a phrase, a name or a pattern and
// the assessment picks it up. A signal is a sign, never proof — the
// ladder is warning first, ban only on a fresh >5 assessment after the
// warning (one hard exception: the opener-trio rule in server.js).
//
// Weights: most signals weigh 1 toward the distinct-type count.
// fee_to_release weighs 3 — it is the advance-fee core of the lottery
// playbook and Daniel wants it among the heaviest single signs.

// Common first names — used by the "two first names" tell (a display
// name built from two of these, e.g. "James Michael", is a classic
// fake-profile construction).
const FIRST_NAMES = [
  'james', 'michael', 'john', 'robert', 'david', 'william', 'richard', 'joseph',
  'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven',
  'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'timothy',
  'ronald', 'edward', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric',
  'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin',
  'samuel', 'gregory', 'frank', 'alexander', 'raymond', 'patrick', 'jack',
  'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'henry', 'nathan',
  'douglas', 'zachary', 'kyle', 'noah', 'alan', 'ethan', 'jeremy', 'harold',
  'keith', 'christian', 'roger', 'arthur', 'terry', 'lawrence', 'austin',
  'jesse', 'jordan', 'bryan', 'billy', 'bruce', 'gabriel', 'logan', 'albert',
  'willie', 'alan', 'juan', 'wayne', 'ralph', 'gabriel', 'roy', 'eugene',
  'randy', 'vincent', 'russell', 'elijah', 'louis', 'bobby', 'philip', 'johnny',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra',
  'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'dorothy', 'amanda',
  'deborah', 'melissa', 'rebecca', 'stephanie', 'rebecca', 'laura', 'sharon',
  'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela',
  'emma', 'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra',
  'rachel', 'carolyn', 'janet', 'ruth', 'maria', 'olivia', 'heather', 'diane',
  'julie', 'joyce', 'victoria', 'kelly', 'christina', 'lauren', 'joan',
  'evelyn', 'judith', 'andrea', 'hannah', 'megan', 'cheryl', 'jacqueline',
  'martha', 'madison', 'teresa', 'gloria', 'sara', 'janice', 'grace', 'julia',
  'judy', 'theresa', 'rose', 'beverly', 'denise', 'marilyn', 'amber', 'danielle',
  'abigail', 'brittany', 'diana', 'natalie', 'sophia', 'kayla', 'alexis',
  'lori', 'charlotte', 'kate', 'evans', 'leach', 'ann', 'marie', 'lynn',
  'grace', 'faith', 'hope', 'joy', 'ruby', 'pearl', 'hazel', 'violet', 'iris'
];
const FIRST_NAME_SET = new Set(FIRST_NAMES);

// Fake-profile name archetypes Daniel named explicitly (2026-10-15) —
// scammer-favorite fake identities. A name match SCORES a signal; a
// name alone never bans.
const ARCHETYPE_NAMES = [
  'kay michelle',
  'charlotte davis',
  'kate evans',
  'julie leach'
];

// Real lottery winners who are heavily impersonated by scammers
// (incl. the misspelling scammers actually use). Name/content signal.
const LOTTERY_WINNER_NAMES = [
  'mavis wanczyk', // won $758.7M Powerball (MA, 2017)
  'mavis wick',    // the misspelled variant scammers use
  'becky bell'     // won $754.6M Powerball (WA, 2023)
];

// Celebrity / public-figure names commonly impersonated.
const CELEBRITY_NAMES = [
  'elon musk', 'keanu reeves', 'brad pitt', 'taylor swift', 'johnny depp',
  'tom cruise', 'will smith', 'kim kardashian', 'drake', 'beyonce',
  'justin bieber', 'selena gomez', 'ariana grande', 'bill gates',
  'jeff bezos', 'mark zuckerberg', 'dwayne johnson', 'oprah winfrey'
];

function normName(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// -------------------- content signal matchers --------------------
// Each matcher is a pure function text -> bool. `weight` feeds the
// distinct-type score in server.js (fee_to_release = 3, others = 1).

const has = (re) => (t) => re.test(t);
const both = (reA, reB) => (t) => reA.test(t) && reB.test(t);

const SCAM_SIGNALS = [
  {
    id: 'off_platform',
    label: 'Asking to move the conversation off HuSH (WhatsApp/Telegram/…)',
    weight: 1,
    test: both(
      /\b(whatsapp|telegram|kik|viber|wechat|signal app|google chat|hangouts)\b/i,
      /\b(add|message|text|chat|talk|continue|move|reach|contact|find|meet)\b/i
    )
  },
  {
    id: 'external_payment',
    label: 'External payment links / crypto wallet solicitation',
    weight: 1,
    test: (t) =>
      /(paypal\.me|cash\.app|venmo\.com)/i.test(t) ||
      /\b(send|pay|wire|transfer)( me)?\b[^.]{0,30}\b(paypal|venmo|cash ?app|zelle)\b/i.test(t) ||
      /\b(paypal|venmo|cash ?app|zelle)\b[^.]{0,20}\b(send|pay|me)\b/i.test(t) ||
      /\b(my )?(btc|bitcoin|eth|ethereum|usdt|crypto) (wallet|address)\b/i.test(t) ||
      /\b(bc1[a-zA-HJ-NP-Za-km-z]{20,}|[13][a-km-zA-HJ-NP-Za-km-z]{25,34})\b/.test(t)
  },
  {
    id: 'investment_returns',
    label: 'Investment pitch / guaranteed returns',
    weight: 1,
    test: (t) =>
      /(guaranteed?|risk[- ]free|assured)[^.]{0,45}(return|profit|income|earning)/i.test(t) ||
      /double your (money|investment|crypto|bitcoin)/i.test(t) ||
      /\b(forex|crypto|bitcoin|trading)[^.]{0,35}(signals?|profits?|returns?|mentor|platform|investment)/i.test(t) ||
      /earn \$[\d,]+ (a|per) (day|week|month)/i.test(t) ||
      /investment opportunit/i.test(t)
  },
  {
    id: 'giftcard_wire',
    label: 'Gift-card or wire-transfer request',
    weight: 1,
    test: both(
      /(gift ?cards?|itunes card|steam card|google play card|prepaid cards?|western union|moneygram|wire transfer)/i,
      /(send|buy|get|scratch|code|pay|transfer|load|redeem)/i
    )
  },
  {
    id: 'money_ask',
    label: 'Asking other users for money',
    weight: 1,
    test: (t) =>
      /(can|could) you (please )?(send|lend|loan|spot|give) me/i.test(t) ||
      /\b(send|lend|loan|spot) me \$?\s?\d/i.test(t) ||
      /\bi (really )?need \$\d{2,}/i.test(t) ||
      /borrow \$\d/i.test(t) ||
      /help me with \$\d/i.test(t)
  },
  {
    id: 'credential_harvest',
    label: 'Asking for verification codes or passwords',
    weight: 1,
    test: (t) =>
      (/(verification|security|otp|one[- ]time|2fa|login) code/i.test(t) && /(send|share|tell|give|forward|reply)/i.test(t)) ||
      /send me the code (you|that|they)/i.test(t) ||
      /\byour (account )?password\b/i.test(t) ||
      /what is the code (you|that) (got|received|was sent)/i.test(t)
  },
  {
    id: 'data_harvest',
    label: 'Harvesting personal data (name/address/occupation/income/photo)',
    weight: 1,
    test: (t) => {
      const fields = [
        /full name/i, /(home |mailing )?address/i, /occupation|job title|what (do you|u) do for (a living|work)/i,
        /monthly income|your income|salary/i, /date of birth/i, /social security/i,
        /send (me )?(a |your )?photo of yourself/i
      ];
      return fields.filter((re) => re.test(t)).length >= 2;
    }
  },
  {
    id: 'romance_money',
    label: 'Romance script mixed with money',
    weight: 1,
    test: both(
      /\b(dear|darling|my love|honey|sweetheart|babe|baby|my queen|my king)\b/i,
      /(money|send|help|hospital|bill|stranded|fee|gift ?card|cash)/i
    )
  },
  {
    id: 'urgency_pressure',
    label: 'High-pressure urgency script',
    weight: 1,
    test: (t) => {
      const markers = (t.match(/(urgent(ly)?|act now|right now|immediately|asap|before it'?s too late|last chance|expires (soon|today)|hurry|don'?t tell (anyone|nobody)|keep this (between|secret))/gi) || []).length;
      return markers >= 2 || (markers >= 1 && /(send|pay|claim|reply|respond)/i.test(t));
    }
  },
  {
    id: 'shortener_spam',
    label: 'URL-shortener link spam',
    weight: 1,
    test: has(/(bit\.ly|tinyurl(\.com)?|t\.co\/|rb\.gy|cutt\.ly|is\.gd|shorturl|rebrand\.ly|ow\.ly|buff\.ly)\b/i)
  },
  {
    id: 'stranded_script',
    label: 'Military / deployed / stranded money script',
    weight: 1,
    test: (t) =>
      (/(deployed|peacekeeping|military|army|soldier|on a mission|overseas)/i.test(t) &&
        /(stranded|stuck|need (money|a fee|help)|leave (form|paperwork)|processing fee|come home|retirement paperwork)/i.test(t)) ||
      /stranded (in|abroad|overseas)/i.test(t)
  },
  {
    id: 'too_good_sale',
    label: 'Too-good-to-be-true sale pushing payment off-app',
    weight: 1,
    test: (t) =>
      (/(for sale|selling|i am selling)/i.test(t) && /(paypal|venmo|zelle|gift ?card|wire|cash ?app)/i.test(t)) ||
      /(brand new|unopened|sealed)[^.]{0,60}\$[\d,]+[^.]{0,60}(free shipping|ship (it )?today|must go)/i.test(t)
  },
  {
    id: 'claimant_code',
    label: 'Asking for a "claimant code"',
    weight: 1,
    test: has(/(claimant|claim|winner'?s?) (code|id|number)/i)
  },
  {
    id: 'fee_to_release',
    label: 'Fee-to-release: pay a fee to unlock a prize (heaviest signal)',
    weight: 3,
    test: (t) =>
      (/(prize|winning|lottery|jackpot|sweepstake|you (have )?won|your funds)/i.test(t) &&
        /(processing|delivery|release|customs|insurance|tax|handling|clearance) (fee|charge|cost)/i.test(t)) ||
      /(pay|send)[^.]{0,35}(fee|charge)[^.]{0,50}(release|deliver|claim|receive|unlock)/i.test(t) ||
      (/(gift ?cards?|prepaid cards?|steam cards?)/i.test(t) && /(fee|release|tax|prize|unlock|deliver)/i.test(t))
  },
  {
    id: 'lottery_claim',
    label: 'Lottery-winner claim / giveaway of winnings',
    weight: 1,
    test: (t) =>
      /\b(i|we) (won|win|am a winner of|am the winner of)\b[^.]{0,35}(powerball|mega ?millions|lottery|jackpot)/i.test(t) ||
      /won \$[\d,.]+\s?(million|billion)/i.test(t) ||
      /(giving|give|sharing) (away )?\$\d[\d,]*/i.test(t) ||
      /sharing my (good fortune|winnings|blessings?)/i.test(t) ||
      /(first|1st) [\d,]+ (people|persons|followers) (who|to|that)/i.test(t) && /(giv|shar|bless|receiv)/i.test(t) ||
      /lottery winner (giving|sharing|here to)/i.test(t)
  },
  {
    id: 'lottery_winner_name',
    label: 'Using an impersonated lottery winner\'s name',
    weight: 1,
    test: (t) => {
      const n = normName(t);
      return LOTTERY_WINNER_NAMES.some((name) => n.includes(name));
    }
  },
  {
    id: 'leadon_opener',
    label: 'Romance-script lead-on opener to a stranger',
    weight: 1,
    // Only meaningful in opener context; server calls assessOpener()
    // for first-contact messages instead of the generic text pass.
    test: () => false
  },
  {
    id: 'trolling',
    label: 'Trolling / harassment pattern',
    weight: 1,
    // Stateful in the server (insult counts + identical-message flood).
    test: () => false
  }
];

const SIGNAL_BY_ID = Object.fromEntries(SCAM_SIGNALS.map((s) => [s.id, s]));

// Content pass over one message/post/profile text. Returns the list of
// signal ids matched (content-only signals; opener/trolling are
// stateful and handled by the server).
function assessText(text) {
  const t = (text || '').toString();
  if (!t.trim()) return [];
  const hits = [];
  for (const sig of SCAM_SIGNALS) {
    if (sig.id === 'leadon_opener' || sig.id === 'trolling') continue;
    try { if (sig.test(t)) hits.push(sig.id); } catch (err) { /* a bad pattern must never take the server down */ }
  }
  return hits;
}

// Romance-script openers — assessed only on a user's opening messages
// to a NEW contact (server decides the context).
const OPENER_PATTERNS = [
  /(hello|hi|hey|good (morning|afternoon|evening)),? (dear|beautiful|handsome|gorgeous|angel|sweetie|pretty lady|handsome man)\b/i,
  /i saw your profile (and|&|,)/i,
  /(noticed|found|came across) your profile (and|,)? (i )?(had|want|needed|have) to/i,
  /\byou (are|look) (so |very )?(beautiful|gorgeous|stunning|pretty|lovely)\b[^.]{0,60}(say (hi|hello)|message|write|reach out)/i,
  /^(hi|hello|hey)?,? ?(dear|honey|sweetheart|darling|my dear|beautiful)\b/i,
  /\b(i am|i'?m) (really )?(interested in|attracted to) you\b[^.]{0,40}(profile|picture|photo)/i
];
function assessOpener(text) {
  const t = (text || '').toString();
  return OPENER_PATTERNS.some((re) => re.test(t));
}

// Harassment/insult markers for the trolling counter (stateful in the
// server: it takes repetition or slur-class hits to fire the signal).
const INSULT_RE = /\b(fuck you|f\*+ck you|screw you|bitch|whore|slut|hoe|n[i1]gg[ae]r?|f[a4]gg?[o0]t|retard|kill yourself|kys|dumb(ass)? bitch|piece of shit|shut the fuck up)\b/i;

// -------------------- name signal matchers --------------------
// Evaluated at registration, on display-name changes, and over bio
// text. A name can score signals but can never ban by itself (the
// name-signal set is smaller than the >5 threshold on its own).

function assessName(displayName, handle) {
  const hits = [];
  const dn = normName(displayName);
  const tokens = dn.split(' ').filter(Boolean);

  // Two first names, e.g. display name "James Michael", or a handle
  // that is two first names fused ("jamesmichael").
  let twoFirst = tokens.length === 2 && tokens.every((tok) => FIRST_NAME_SET.has(tok));
  if (!twoFirst && handle) {
    const h = handle.toLowerCase().replace(/[^a-z]/g, '');
    for (const name of FIRST_NAMES) {
      if (name.length >= 3 && h.startsWith(name)) {
        const rest = h.slice(name.length);
        if (FIRST_NAME_SET.has(rest)) { twoFirst = true; break; }
      }
    }
  }
  if (twoFirst) hits.push('two_first_names');

  // Daniel's named fake-profile archetypes.
  if (ARCHETYPE_NAMES.includes(dn)) hits.push('fake_name_archetype');

  // Impersonated lottery winners as a name.
  if (LOTTERY_WINNER_NAMES.some((name) => dn.includes(name))) hits.push('lottery_winner_name');

  // "Names that scream scammer": rank/title claims, wealth/romance
  // bait words, celebrity impersonation.
  const raw = (displayName || '').toString();
  if (/^(general|colonel|col\.?|prince|princess|king|pastor|reverend|bishop|dr\.?|doctor|major|captain|sergeant|sgt\.?|officer|agent|chief)\s/i.test(raw) ||
      /\b(millionaire|billionaire|sugar ?(daddy|mama|momma|baby)|lonely (man|woman|widow|heart)|widow(er)?|rich (man|woman|daddy)|investor|ceo)\b/i.test(raw) ||
      CELEBRITY_NAMES.some((name) => dn.includes(name))) {
    hits.push('scammer_name_pattern');
  }
  return hits;
}

const NAME_SIGNAL_DEFS = [
  { id: 'two_first_names', label: 'Name built from two first names (classic fake-profile tell)', weight: 1 },
  { id: 'fake_name_archetype', label: 'Known fake-profile name archetype', weight: 1 },
  { id: 'scammer_name_pattern', label: 'Rank/title claim, bait words, or celebrity impersonation in the name', weight: 1 }
];

// -------------------- opener-trio question matchers --------------------
// Daniel's hard rule (verbatim): "if the first questions are how old
// are you and where you from and what are you looking for here, those
// 3 in a row, they're gone." Variant-tolerant intent matchers.

const QUESTION_AGE = [
  /how old (are|r) (you|u)\b/i,
  /what'?s your age\b/i,
  /\byour age\??\s*$/i,
  /^age\??$/i,
  /\b(ur|yr) age\b/i,
  /how old r u\b/i
];
const QUESTION_LOCATION = [
  /where (are|r) (you|u) from\b/i,
  /where (u|you) from\b/i,
  /where are you located\b/i,
  /where (do|does) (you|u) live\b/i,
  /what (city|state|country) are (you|u) (in|from)\b/i,
  /where (you|u) at\??$/i
];
const QUESTION_INTENT = [
  /what are (you|u) looking for\b/i,
  /what (r|are) (u|you) looking for\b/i,
  /what are you looking for (on|in) (here|this app|hush)\b/i,
  /what brings (you|u) (here|to hush|to this app)\b/i,
  /what are (you|u) (here for|on here for)\b/i,
  /what (kind of|type of) (relationship|thing) are (you|u) looking for\b/i
];

const isQuestion = (t) => /\?/.test(t) ||
  /^(how|what|where|when|why|who|are|r|do|does|can|could|is|am)\b/i.test((t || '').trim());

function classifyQuestion(text) {
  const t = (text || '').toString();
  if (QUESTION_AGE.some((re) => re.test(t))) return 'age';
  if (QUESTION_LOCATION.some((re) => re.test(t))) return 'location';
  if (QUESTION_INTENT.some((re) => re.test(t))) return 'intent';
  return isQuestion(t) ? 'other' : null;
}

module.exports = {
  SCAM_SIGNALS,
  SIGNAL_BY_ID,
  NAME_SIGNAL_DEFS,
  ALL_SIGNAL_DEFS: [...SCAM_SIGNALS, ...NAME_SIGNAL_DEFS],
  FIRST_NAMES,
  ARCHETYPE_NAMES,
  LOTTERY_WINNER_NAMES,
  assessText,
  assessOpener,
  assessName,
  classifyQuestion,
  INSULT_RE,
  normName
};
