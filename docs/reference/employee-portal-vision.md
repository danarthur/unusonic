# Employee Portal: Vision and Implementation

Reference doc for all portal work. Last updated: 2026-04-02.

---

## 1. Vision Statement

The Unusonic Employee Portal is a personal operations console for crew whose office changes every week.

For technicians, it is a schedule and day sheet: "where am I going, when do I need to be there, who else is on the crew, and what does the timeline look like." For DJs and entertainers, it is a show prep workspace: "what songs does the couple want, what is the pronunciation of their names, when is the first dance."

Production crew today use 3-5 disconnected apps (scheduling, payroll, messaging, timesheets, run-of-show). Every competing platform shows crew *when* they work. None show them *what they do minute-by-minute*. Unusonic closes that gap because the Plan tab's run-of-show data and the portal's schedule view read from the same `ops.events.run_of_show_data` JSONB column. The timeline a production manager builds in the admin dashboard is the same timeline crew see on their phone before the show.

This is not an HR portal. It is not a payroll system. It is the app a tech opens in the parking lot five minutes before call time to check the crew roster, tap the production manager's phone number, and see the venue loading dock address.

---

## 2. Information Architecture

### Navigation (4 tabs, mobile bottom bar)

| Tab | Icon | Route | Purpose |
|---|---|---|---|
| **Schedule** | `CalendarDays` | `/(portal)/schedule` | Default landing. Upcoming/past assignments. |
| **Calendar** | `Calendar` | `/(portal)/calendar` | Month view of all gigs. Phase 2. |
| **Pay** | `Banknote` | `/(portal)/pay` | Rates, assignment pay history, period totals. |
| **Profile** | `UserCircle` | `/(portal)/profile` | Personal info, skills, employment context. |

### Key routing rules

- Schedule is the default landing page (redirect `/(portal)` to `/(portal)/schedule`).
- **Gig Detail** is reached by tapping a schedule card. Route: `/(portal)/schedule/[assignmentId]`. Not a nav tab.
- Gig Detail is **role-aware**: read-only day sheet for techs, editable show prep workspace for DJs/entertainers.
- Non-employee roles are redirected to `/lobby` by the portal layout (already implemented).

### Mobile-first hierarchy

```
Bottom Tab Bar
  |-- Schedule (default)
  |     |-- [assignmentId] → Gig Detail (push, back arrow)
  |-- Calendar
  |     |-- tap date → filtered day view
  |-- Pay
  |-- Profile
```

---

## 3. Current State

The portal has 3 pages, a top-bar shell, and a profile update server action. All routes live under `src/app/(portal)/`.

### 3a. Portal Layout (`layout.tsx`)

- Auth-gated: redirects unauthenticated users to `/login`.
- Role-gated: redirects non-employee roles to `/lobby` via `get_member_role_slug()`.
- Provides `WorkspaceProvider`, `PreferencesProvider`, `AuthGuard`, `InactivityLogoutProvider`.
- Renders `PortalShell` (sticky top header with nav links, workspace name, user info, sign-out).
- Full-bleed dark background with grain overlay (Stage Engineering).

### 3b. Schedule Page (`/schedule`)

- Resolves the current user's `directory.entities` person record via `claimed_by_user_id`.
- Fetches upcoming and past assignments from `getEntityCrewSchedule` / `getEntityCrewHistory`.
- Renders `ScheduleList` — a client component with animated cards showing event title, role, status badge, date/time, venue name.
- Cards are **not tappable** — no gig detail page exists yet.
- Data comes from `ops.entity_crew_schedule` view.
- Missing: day rate, venue address, call time, confirm/decline, next-gig hero.

### 3c. Pay Page (`/pay`)

- Resolves person entity, then fetches:
  - Default hourly rate from `cortex.relationships` ROSTER_MEMBER edge `context_data.default_hourly_rate`.
  - Per-skill rates from `ops.crew_skills`.
  - Assignment pay history from `ops.deal_crew` (confirmed gigs with `day_rate`).
- Renders `PayView` — rates card + assignment history list with role, date, day rate.
- Missing: pay period grouping/totals, month summaries, event titles on assignments.

### 3d. Profile Page (`/profile`)

- Resolves person entity with `display_name`, `avatar_url`, `attributes`.
- Fetches employment context from ROSTER_MEMBER edge (`job_title`, `role`, `employment_status`, `default_hourly_rate`).
- Fetches skills from `ops.crew_skills`.
- Renders `ProfileView` — identity header, info card (email read-only, phone editable, job title read-only, emergency contact editable, employment status read-only), skills badges.
- Edit mode toggles phone and emergency contact fields. Saves via `updateMyProfile` server action.
- Allowed self-service fields: `phone`, `emergency_contact`, `instagram`.

### 3e. Portal Shell (`components/portal-shell.tsx`)

- Sticky top bar with workspace name (left), nav links (center), user name + sign out (right).
- Nav renders from `portalNavItems` (3 items: Schedule, Profile, Pay).
- Labels hidden on mobile (icon-only). Active state: white text + subtle bg.

### 3f. Nav Items (`shared/ui/layout/portal-nav-items.ts`)

- 3 items: Schedule (`/schedule`), Profile (`/profile`), Pay (`/pay`).
- `isPortalNavActive` helper for pathname matching.

---

## 4. Phases

### Phase 1: Ship Now — Portal becomes indispensable

The goal: after Phase 1, crew open the portal instead of texting their PM "where am I going Saturday?"

| # | Feature | Description | Route / File |
|---|---|---|---|
| 1 | **Next-gig hero card** | Prominent card at the top of Schedule: event title, venue (tappable maps link), call time, role, day rate, countdown ("in 3 days"). Uses the first entry from `getEntityCrewSchedule` with additional fields. | `/(portal)/schedule/page.tsx`, new `NextGigHero` component |
| 2 | **Gig detail page** | Tap a schedule card to see the full day sheet. Reuses `compileDaySheetData` pattern: venue + maps link, timeline, crew roster with phone numbers, show-day contacts, venue notes. Read-only for tech roles. | New route: `/(portal)/schedule/[assignmentId]/page.tsx` |
| 3 | **Confirm/decline on requested gigs** | Buttons on schedule cards and gig detail. Day rate MUST be visible before confirming (no blind acceptance). Server action writes `confirmed_at` or `declined_at` + `declined_reason` on `ops.deal_crew`. Status updates immediately via `useOptimistic`. | New server action, schedule card UI update |
| 4 | **Crew roster on gig detail** | Names, roles, call times, tappable phone numbers (`tel:` links). "You" badge on the current user's row. Same pattern as the public day sheet page. | `/(portal)/schedule/[assignmentId]/page.tsx` |
| 5 | **Pay period totals** | Group assignments by month on the Pay page. Show summary line per month (total gigs, total earned). Running YTD total at top. | `/(portal)/pay/pay-view.tsx` update |
| 6 | **Bottom tab bar on mobile** | Move nav from sticky top header to fixed bottom bar on mobile (below `md` breakpoint). Top header remains on desktop. Bottom bar sits in thumb zone. Safe area inset padding for notched devices. | `portal-shell.tsx` refactor, `portal-nav-items.ts` add Calendar item |

#### Phase 1 data requirements

- `ops.entity_crew_schedule` view needs to expose: `day_rate` (from `ops.deal_crew`), `venue_address` (from venue entity or `ops.events.location_address`), `deal_id` (for `compileDaySheetData`).
- `ops.deal_crew` needs `confirmed_at`, `declined_at`, `declined_reason` columns if not already present.
- Gig detail page needs a server action to resolve `assignmentId` → `(eventId, dealId)` → `compileDaySheetData`.

---

### Phase 2: Ship Next — Portal becomes system of record

The goal: after Phase 2, DJs prep their entire show in the portal, and crew never miss a gig because it syncs to their phone calendar.

| # | Feature | Description |
|---|---|---|
| 7 | **Calendar page** | Month view showing all gigs. Essential for DJs and freelancers who plan months ahead. Tapping a date filters to that day's gigs. Dots on dates with gigs. Simple grid, no drag-drop (crew don't manage schedule, PMs do). |
| 8 | **DJ show prep workspace** | Role-aware editable sections on gig detail (when entity has DJ/entertainer skill or role). Sections described below. Data writes to `ops.events.run_of_show_data` JSONB, syncing back to admin Plan tab. |
| 9 | **Push notifications** | Service worker registration + permission prompt. Notify on: new gig request, gig confirmation needed, schedule change, day-of reminder (24h and 2h before call time). |
| 10 | **iCal feed** | Tokenized per-user URL serving an ICS file. Auto-syncs to Apple Calendar, Google Calendar, Outlook. Calendar events include: event title, venue name, venue address (as location), call time as start, end time, crew role in description. Token stored on `directory.entities` or a dedicated table. |
| 11 | **Availability calendar** | Tap dates to mark unavailable. Stored on person entity or dedicated table. CRM shows warnings when booking crew on unavailable dates. Admin override possible with confirmation. |

#### DJ Show Prep Workspace sections (Feature 8)

All data lives in `ops.events.run_of_show_data` JSONB under namespaced keys.

| Section | Key | Content |
|---|---|---|
| **Timeline builder** | `run_of_show_data.dj_timeline` | Ordered moments: cocktail hour, intros, first dance, dinner, open dancing, last dance. Each has a label, start time, optional end time, notes. Drag to reorder. |
| **Song list** | `run_of_show_data.dj_songs` | Songs tied to timeline moments ("First Dance -> At Last by Etta James"). Fields: moment reference, song title, artist, notes. Must-play flag, do-not-play flag. |
| **Client notes** | `run_of_show_data.dj_client_notes` | Free-text: preferences, vibe description, dress code, meeting notes, special requests. |
| **Client info** | `run_of_show_data.dj_client_info` | Structured: couple/host names, pronunciation guide, wedding party names, sensitive topics to avoid. |

Changes made by DJs in the portal appear in the admin Plan tab in real time (or on next load). Admins can also edit these sections. Last-write-wins with `updated_at` timestamp per section.

---

### Phase 3: Ship Later — Competitive moat

| # | Feature | Description |
|---|---|---|
| 12 | **Live timeline on show day** | "Now" indicator on the gig detail timeline. Real-time updates via Supabase Realtime subscription on `ops.events`. Auto-scrolls to current moment. |
| 13 | **Shift pool** | Unclaimed crew positions surface as open gigs. Crew can claim positions matching their skills. Manager approval required. Feeds from `ops.deal_crew` rows with `entity_id IS NULL` and required skill tags. |
| 14 | **Drive-time-aware notifications** | Calculated from home address (person entity `attributes.address`) + venue address. Fires notification at calculated departure time. Uses a mapping API (Google/Mapbox) server-side. |
| 15 | **Cross-workspace profile** | One identity across multiple production companies. A person entity can have ROSTER_MEMBER edges to multiple workspaces. Portal shows a workspace switcher. Freelancer passport pattern. |
| 16 | **Documents section on gig detail** | Parking maps, stage plots, dress code PDFs attached to the event. Uses `ops.events` attachments or Supabase Storage paths. View-only for crew. |

---

## 5. What NOT to Build

| Feature | Reason |
|---|---|
| **In-app messaging** | Crew use iMessage and WhatsApp. Building another chat app creates a channel nobody checks. Instead: make phone numbers one-tap on crew roster and show-day contacts. |
| **Time tracking / clock-in** | Regulated payroll territory with complex legal requirements (meal penalties, OT tiers, union rules). Partner with Wrapbook/Gusto, don't build. |
| **Calendar drag-and-drop** | Crew don't manage their own schedule. PMs do. A draggable calendar implies crew can move their shifts, which creates confusion. |
| **Training modules** | Different product category entirely. If needed, link out to an LMS. |
| **Expense submission** | Belongs in the admin finance layer. Crew expenses route through PMs. |
| **Gamification / badges** | Infantilizes professional relationships. A 15-year veteran stagehand does not need a "Gold Star Rigger" badge. Preferred freelancer status is handled through the existing `tier: 'preferred'` on PARTNER edges. |
| **Social features / feed** | The portal is a tool, not a social network. No likes, no comments, no "team celebrations." |

---

## 6. Data Architecture

### Schedule cards

```
Source:     ops.entity_crew_schedule (view)
Fields:     assignment_id, event_id, role, status, event_title, starts_at, ends_at,
            venue_name, event_archetype
Missing:    day_rate (from ops.deal_crew), venue_address (from ops.events.location_address
            or venue entity), deal_id (for gig detail data fetch), call_time (from ops.deal_crew)
Action:     Extend the view or add a wrapper query to include these fields.
```

### Gig detail

```
Source:     compileDaySheetData(eventId, dealId)
Returns:    eventTitle, eventDate, venueName, venueAddress, mapsUrl, crewList (name, role,
            callTime, phone, email, entityId), showDayContacts, timeline, specialNotes,
            workspaceName, runOfShowUrl
Pattern:    Reuse the exact data compilation from the admin day sheet feature.
            The portal gig detail page calls this server action, then renders a
            mobile-optimized layout matching the public day sheet page pattern.
Resolution: assignmentId → ops.deal_crew row → (deal_id, event_id) → compileDaySheetData
```

### Confirm / decline

```
Target:     ops.deal_crew
Columns:    confirmed_at (timestamptz), declined_at (timestamptz), declined_reason (text)
Auth:       Server action verifies the deal_crew.entity_id matches the current user's
            person entity. RLS + application-level check.
Constraint: Only one of confirmed_at / declined_at can be non-null.
```

### DJ show prep

```
Target:     ops.events.run_of_show_data (JSONB)
Keys:       dj_timeline, dj_songs, dj_client_notes, dj_client_info
Write path: Server action with Zod validation per section schema.
            Uses patch merge (not full replace) to avoid clobbering other ROS data.
Auth:       Verify user's person entity is on the deal_crew for this event.
            Role check: only DJ/entertainer roles can write these sections.
Sync:       Admin Plan tab reads the same JSONB. Changes are visible on next page load.
            Phase 3 adds Realtime subscription for live sync.
```

### Pay

```
Rates:      cortex.relationships (ROSTER_MEMBER edge) → context_data.default_hourly_rate
            ops.crew_skills → skill_tag, hourly_rate (per-skill overrides)
Per-gig:    ops.deal_crew → day_rate, role_note, call_time, confirmed_at
Grouping:   Client-side grouping by month from call_time. YTD running total.
```

### Profile

```
Identity:   directory.entities (type=person) → display_name, avatar_url, attributes
            Editable: phone, emergency_contact, instagram (via patch_entity_attributes RPC)
            Read-only: email, job_title (from ROSTER_MEMBER edge)
Employment: cortex.relationships (ROSTER_MEMBER) → context_data (job_title, role,
            employment_status, default_hourly_rate)
Skills:     ops.crew_skills → skill_tag, proficiency
```

### iCal feed

```
Token:      UUID stored per person entity (or dedicated ops.ical_tokens table).
Route:      /api/portal/ical/[token] — returns text/calendar ICS.
            System client (bypasses RLS — token IS auth, same pattern as day sheet tokens).
Events:     All upcoming assignments from ops.entity_crew_schedule.
            VEVENT per assignment: SUMMARY=event_title, DTSTART=call_time or starts_at,
            DTEND=ends_at, LOCATION=venue_address, DESCRIPTION=role + crew roster summary.
```

### Availability

```
Target:     New table or JSONB on person entity attributes.
            Recommended: ops.crew_availability (entity_id, date, available boolean, note text).
Read:       CRM deal crew assignment UI queries availability before booking.
Write:      Portal server action — crew can only write their own availability.
```

---

## 7. Key Files

### Portal routes and components

| File | Purpose |
|---|---|
| `src/app/(portal)/layout.tsx` | Auth + role gate, providers, shell wrapper |
| `src/app/(portal)/components/portal-shell.tsx` | Top nav bar (to become bottom tab bar on mobile) |
| `src/app/(portal)/schedule/page.tsx` | Schedule page server component |
| `src/app/(portal)/schedule/schedule-list.tsx` | Schedule card list client component |
| `src/app/(portal)/pay/page.tsx` | Pay page server component |
| `src/app/(portal)/pay/pay-view.tsx` | Pay rates + history client component |
| `src/app/(portal)/profile/page.tsx` | Profile page server component |
| `src/app/(portal)/profile/profile-view.tsx` | Profile form client component |
| `src/app/(portal)/profile/actions.ts` | `updateMyProfile` server action |
| `src/shared/ui/layout/portal-nav-items.ts` | Nav item definitions + active helper |

### Data layer (reuse for gig detail)

| File | Purpose |
|---|---|
| `src/features/ops/actions/get-entity-crew-schedule.ts` | `getEntityCrewSchedule` + `getEntityCrewHistory` — reads `ops.entity_crew_schedule` view |
| `src/app/(dashboard)/(features)/crm/actions/compile-day-sheet-data.ts` | `compileDaySheetData` — compiles full day sheet from event + deal + crew + venue |
| `src/app/(dashboard)/(features)/crm/lib/day-sheet-utils.ts` | `getCallTime`, `googleMapsUrl` helpers |
| `src/shared/lib/entity-attrs.ts` | `readEntityAttrs` — typed attribute access for entity JSONB |

### Public day sheet (pattern reference)

| File | Purpose |
|---|---|
| `src/app/(public)/crew/daysheet/[token]/page.tsx` | Tokenized no-login day sheet. Mobile-first layout. Reference for gig detail page UI. |

### Auth and middleware

| File | Purpose |
|---|---|
| `src/shared/ui/providers/WorkspaceProvider.tsx` | Workspace context provider |
| `src/shared/ui/providers/AuthGuard.tsx` | Client-side auth state guard |
| `src/shared/ui/providers/InactivityLogoutProvider.tsx` | Inactivity timeout |

### Related admin features (data sources)

| File | Purpose |
|---|---|
| `src/app/(dashboard)/(features)/crm/actions/send-day-sheet.ts` | Day sheet email sending (adjacent, not directly reused) |
| `src/features/ops/actions/deal-crew-actions.ts` | Deal crew CRUD (confirm/decline will extend this) |

### Benchmark reference

| File | Purpose |
|---|---|
| `docs/reference/employee-portal-benchmark.md` | Industry research: LASSO, Nowsta, Deputy, Gusto, 7shifts patterns |

---

## Appendix: Phase 1 Implementation Checklist

This is the build order for Phase 1. Each item is a discrete PR.

1. **Extend `ops.entity_crew_schedule` view** — add `day_rate`, `deal_id`, `call_time`, `location_address` from joined tables.
2. **Add `confirmed_at` / `declined_at` columns to `ops.deal_crew`** — migration + types regen.
3. **Confirm/decline server action** — verify entity ownership, write timestamp, return updated status.
4. **Next-gig hero component** — reads first upcoming entry, renders hero card with countdown, maps link, day rate.
5. **Gig detail page** — `/(portal)/schedule/[assignmentId]/page.tsx`. Resolves assignment to event+deal, calls `compileDaySheetData`, renders mobile layout.
6. **Make schedule cards tappable** — wrap in `Link` to `/(portal)/schedule/[assignmentId]`.
7. **Add confirm/decline buttons** — on schedule cards (requested status only) and gig detail page.
8. **Pay period grouping** — group assignments by month, add summary totals.
9. **Bottom tab bar** — refactor portal shell for mobile bottom nav, add Calendar placeholder tab.
