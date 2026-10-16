# HuSH Privacy Policy

Version 1.0 — October 15, 2026

Plain version first: HuSH collects what it needs to run the app and keep scammers and ban-evaders out. It does not sell your data. It does not run third-party ad trackers. This document says exactly what is collected and why.

## What we collect and why

### Account identifiers — email and phone number

- Registration requires an email address and a phone number. They exist for one reason: **one account per person**. Each email and each phone number can only be attached to a single account, which is how duplicate and alt accounts get stopped.
- Your email and phone are **private**. They are never shown on your public profile, never returned in people or feed listings, and never visible to other users. Only you see your own, in your account settings.
- Honest limit: today these are *claimed* identifiers — HuSH does not send SMS or email verification codes yet. Uniqueness is enforced; ownership-by-code is a future upgrade, and we will not pretend otherwise.

### IP addresses

- The server records the IP address you register from and the IPs you log in from (a short rolling history per account). This is **anti-abuse data**: it is how double accounts and ban evasion are detected, and IP evidence is attached to moderation flags, warnings, and bans so decisions have their receipts.
- IPs are server-side only, visible only to the admin. They are never shown to other users.

### Profile content, uploads, and posts

- Your display name, bio, avatar, profile settings, photos, and tracks you upload, and the posts and comments you write, are stored on the app's server so the service can show them to the people you allow.
- Photos and tracks you upload are served as files to viewers who can see your profile — treat uploads as publishable content, because that is what they are.

### Messages

- Room and DM messages travel through the server so they can be delivered. Chat is **live** — HuSH does not keep a browsable message history; when a first message is held as a DM request, the sender's first message is stored with the request until it is accepted or denied.
- Messages, posts, and profiles pass through **automated pattern checks** for scam and harassment signals (see the Site Rules). Flagged content is logged for admin review.
- Straight talk: **HuSH messages are not end-to-end encrypted.** The server can read what passes through it. Do not send anything through HuSH that you need to be cryptographically secret.

### Presence and activity

- When you are connected, the server normally reports you as online (presence lists, People page). If you turn on **invisible mode**, the server does not broadcast you as online at all — while you keep full use of the app.
- Anyone you share a room with can see you are in that room; invisible mode hides your global online status, not your existence in a room you chose to join (your name is shown to room members under a generic label in member lists).

### Safety data

- Your block list, DM accept/deny state, privacy preferences, warnings, and signal history are stored on your account so the safety features work and enforcement has a record.

## What we do NOT do

- **No selling data.** Your information is not sold, rented, or traded. Ever.
- **No third-party ad trackers.** HuSH does not embed advertising trackers or analytics beacons from ad networks.
- **No public exposure of private fields.** Email, phone, and IP addresses are never part of public profiles or listings.

## Your controls

Inside your profile settings you can:

- Choose who can DM you: everyone / your Confidants only / nobody
- Choose who can video-call you: everyone / Confidants only / nobody
- Turn video off entirely for your account (you become text-only; cypher listening still works)
- Choose who can see your profile and posts: everyone / Confidants only
- Go invisible (appear offline everywhere)
- Block anyone, and unblock them from your blocked list
- Feature up to five Confidants as your Inner Five

Existing accepted conversations and safety decisions (blocks, bans) override preference changes where the Site Rules say so.

## Where data lives and how long it stays

- Account data, content, uploads, and safety records live on the app's server (and its JSON data files) for as long as the account exists.
- **Ban records are kept after a ban** — identifiers and IPs on the ban list, plus the moderation log — because enforcement that forgets is not enforcement. This retention is limited to what ban enforcement needs.
- If the hosting filesystem is reset by the provider, uploaded files and records can be lost; backups and durable storage are an operational roadmap item, not a promise this document makes today.

## Changes

If this policy changes, the version and date at the top change, and you will be asked to accept the new version.
