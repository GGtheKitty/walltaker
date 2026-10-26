# Site page verification checklist

Base URL: **https://devenv.playctrl.me**. Replace `<username>`, IDs and tokens with valid records from your account. For example, your profile URL is `/users/GGtheKitty`.

This lists implemented browser pages and embedded views from the current routes/controllers, rather than every automatically generated Rails resource URL. Generated routes with no implemented page are omitted. Query and pagination states reuse the same pages.

Native groups now include homepage/authentication, wallpaper/search/wizard, profiles/interests, account flows, social/community pages, tracker/activity pages, moderation, help/guides and Blazer. See [profiles and interests](profiles-interests-verification.md), [account flows](account-flows-verification.md), [social/community pages](social-community-verification.md) and [tracker/activity pages](tracker-activity-verification.md) and [moderation/help/Blazer](moderation-remaining-verification.md) for the migrated URLs and checks.

**Native Node** means JavaScript templates/layout/assets. The page groups below now use native Node delivery; Blazer keeps its separate original Bootstrap/Ace layout. All application delivery is now Node-owned. Unknown URLs return native 404s; see [the Node-only cutover](node-only-cutover.md).

Check the native pages first at desktop and mobile widths, in light and dark modes. For the Changes table, check that each header sits over the corresponding data column with one, several and many rows.

Mark a row checked only after its relevant controls, validation/empty states, images, navigation and live updates have been reviewed. Check your own account and another user where privacy or permissions matter.

## Native Node pages

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Homepage (signed out) | `/` | Public | Intro, client tables, images, age dialog; desktop/mobile and light/dark. |
| [ ] | Dashboard (signed in) | `/` | Signed in | Changes heading/chart/table alignment, recent images, viewers, totals, newsroom, leaderboard and pledge state. |
| [ ] | Login | `/login` | Public | Wrong credentials, valid login, remember-me, CSRF rejection, flash and footer links. |
| [ ] | Login alias | `/session/new` | Public | Same login form and layout. |
| [ ] | Error pages | `/404` · `/422` · `/500` | Public | Expected error status and usable return link. |

## Discovery and help

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Browse | `/browse` | Public | Cards, online indicators, images, pagination/updates. |
| [ ] | Site search | `/search` | Public | Search input and filters. |
| [ ] | Search results | `/search/query?q=<query>` | Public | Results, empty results, online filter and pagination. |
| [ ] | Leaderboard | `/leaderboard` | Public | Standalone/frame rendering and user flair. |
| [ ] | Community interests | `/link_lists` | Public | Lists, q filter, pagination; also filter=mine when signed in. |
| [ ] | Community interest links | `/link_lists/<interest_id>` | Public | Matching wallpaper cards and pagination. |
| [ ] | Interest details | `/kinks/<interest_id>` | Public | Interest and matching users. |
| [ ] | Help | `/help` | Public | Images and navigation. |
| [ ] | FAQ | `/help/faq` | Public | Footer navigation should reach this URL. |
| [ ] | Client guide | `/help/client_guide` | Public | Code blocks and mobile overflow. |
| [ ] | Deprecated client guide | `/help/deprecated_client_guide` | Public | Older documentation remains accessible. |

## Accounts and profiles

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Signup | `/signup` | Public | Validation errors, invite-only and normal signup states. |
| [ ] | Request password reset | `/i-forgor` | Public | Form and confirmation; use a test account for sends. |
| [ ] | Apply password reset | `/i-forgor/commit/<valid_reset_token>` | Token holder | Valid, invalid and expired token states. |
| [ ] | User profile | `/users/<username>` | Public/visibility rules | Own and other users; live links, biography, images and social controls. |
| [ ] | Profile editor | `/users/<username>/edit` | Owner | Simple/advanced editing, validation and preview. |
| [ ] | Profile document | `/users/<username>/profile-document` | Visibility rules | Profile iframe styling, assets and links. |
| [ ] | Profile details fragment | `/users/<user_id>/details` | Visibility rules | Normally loaded inside profile/editor UI. |
| [ ] | User wallpaper history | `/users/<username>/history` | Visibility rules | History cards and pagination. |
| [ ] | Wallpapers set by user | `/users/<username>/sets` | Visibility rules | Cards, attribution and empty state. |
| [ ] | Settings | `/settings` | Signed in | Username/password/colour forms, errors and success messages. |
| [ ] | Profile styles | `/profiles` | Signed in | Own style list and switching/creation controls. |
| [ ] | User profile styles | `/users/<user_id>/profiles` | Signed in | User-scoped style listing. |
| [ ] | Profile style editor | `/profiles/<profile_id>` | Allowed user | Style editor and save validation. |
| [ ] | Profile style preview | `/profiles/<profile_id>/preview` | Allowed user | Preview iframe, assets and desktop/mobile size. |
| [ ] | User interests | `/users/<username>/kinks` | Public/visibility rules | Own/other user lists, stars and controls. |
| [ ] | Add interest form | `/kinks/new` | Signed in | Validation and dynamic updates. |

## Wallpaper management and e621 selection

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Own wallpaper links | `/links` | Signed in | Cards, empty state and create controls. |
| [ ] | New wallpaper link | `/links/new` | Signed in | Creation form and errors. |
| [ ] | Wallpaper link | `/links/<link_id>` | Visibility rules | Public/private/expired, own/other, wallpaper selection, reactions, comments and live updates. |
| [ ] | Edit wallpaper link | `/links/<link_id>/edit` | Owner/allowed user | Settings, validation, permissions and save redirects. |
| [ ] | Embedded wallpaper | `/links/<link_id>/embed` | Visibility rules | Iframe sizing and background/image/video rendering. |
| [ ] | Wallpaper comments | `/links/<link_id>/comments` | Visibility rules | Usually a nested frame, with existing and empty lists. |
| [ ] | New comment form | `/links/<link_id>/comments/new` | Allowed user | Usually opened inside the wallpaper page. |
| [ ] | e621 search form | `/porn_search/index?link=<link_id>` | Link access | Tags, filters, selectable media and blacklist rules. |
| [ ] | e621 search results | `/porn_search/search?link=<link_id>&tags=<tags>` | Link access | Grid, empty/error states, next/previous page and selection. |
| [ ] | Message attachment search | `/porn_search/search?message_thread=<thread_id>&tags=<tags>` | Thread member | Search and sending a selected item back to the thread. |
| [ ] | Search-interest suggestions | `/porn_search/search/kinks_for/<link_id>` | Link access | Usually a search-frame fragment. |

## Wallpaper wizard steps

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Introduction | `/links/<link_id>/wizard/intro` | Owner | Use a fresh wizard link; saved progress can redirect old steps. |
| [ ] | Summon | `/links/<link_id>/wizard/summon` | Owner | Form and next/back navigation. |
| [ ] | Control | `/links/<link_id>/wizard/control` | Owner | Form and next/back navigation. |
| [ ] | Interests | `/links/<link_id>/wizard/kinks` | Owner | Form and next/back navigation. |
| [ ] | Gender | `/links/<link_id>/wizard/gender` | Owner | Form and next/back navigation. |
| [ ] | Surprise | `/links/<link_id>/wizard/surprise` | Owner | Form and next/back navigation. |
| [ ] | No fun | `/links/<link_id>/wizard/no_fun` | Owner | Form and next/back navigation. |
| [ ] | Conclusion | `/links/<link_id>/wizard/orgasmic_conclusion` | Owner | Completed state and final wallpaper link. |

## Social, messages and delegated accounts

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Friends | `/friendships` | Signed in | Accepted and pending relationships, empty state. |
| [ ] | Friend requests | `/friendships/requests` | Signed in | Incoming/outgoing requests, accept/reject controls. |
| [ ] | New friend form | `/friendships/new` | Signed in | Username validation and submit redirect. |
| [ ] | Friendship details | `/friendships/<friendship_id>` | Participant | Relationship controls and access checks. |
| [ ] | Messages | `/messages` | Signed in | Thread list and notifications. |
| [ ] | Message thread | `/messages/<thread_id>` | Member | Send/receive live messages, attachments, older messages and notification settings. |
| [ ] | Thread settings | `/messages/<thread_id>/edit` | Member | Name, membership and participant controls. |
| [ ] | Older-message fragment | `/messages/<thread_id>/load_more?after_id=<message_id>` | Member | Use Load more in a thread; returns a Turbo response. |
| [ ] | Notifications | `/notifications` | Signed in | Empty/nonempty list and clear controls; also check the shared header popover. |
| [ ] | User leashes | `/users/<username>/leashes` | Visibility rules | Master/pet lists and relationship flair. |
| [ ] | New leash | `/leashes/new` | Signed in | Friend selection and validation. |
| [ ] | Leash details | `/leashes/<leash_id>` | Participant | Current relationship and permissions. |
| [ ] | Edit leash | `/leashes/<leash_id>/edit` | Participant | Flair editing and permissions. |
| [ ] | Surrenders | `/surrenders` | Signed in | Existing and empty state. |
| [ ] | New surrender | `/surrenders/new` | Signed in | Consent, duration and pending option. |
| [ ] | Surrender details | `/surrenders/<surrender_id>` | Participant | Pending/active/expired/revoked states and session transitions. |
| [ ] | Report a user | `/users/<user_id>/reports/new` | Signed in | Report reason and validation; use disposable reports. |
| [ ] | Report a wallpaper | `/links/<link_id>/reports/new` | Signed in | Report reason and validation; use disposable reports. |

## Newsroom and activity

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Newsroom | `/news_room` | Public | Scene, media, audio controls and live updates. |
| [ ] | My scoops | `/scoops` | Signed in | Existing and empty list. |
| [ ] | New scoop | `/scoops/new` | Signed in | Form and validation. |
| [ ] | Scoop details | `/scoops/<scoop_id>` | Visibility rules | Content, author and aired/pending state. |
| [ ] | Edit scoop | `/scoops/<scoop_id>/edit` | Owner | Save, errors and aired-state controls. |
| [ ] | Account activity history | `/history` | Signed in | Grouped visits/events and wallpaper cards. |

## Tracker and pledges

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Tracker entries | `/nut/orgasms` | Public | Entry list and pagination. |
| [ ] | User tracker entries | `/nut/orgasmers/<username>` | Public | User-specific list. |
| [ ] | New tracker entry | `/nut/orgasms/new` | Signed in | Form and validation. |
| [ ] | Tracker entry | `/nut/orgasms/<entry_id>` | Visibility rules | Attribution and details. |
| [ ] | Edit tracker entry | `/nut/orgasms/<entry_id>/edit` | Owner | Edit form and permissions. |
| [ ] | Pledge | `/users/<username>/nut_pledge` | Feature/visibility rules | Often a dashboard frame; active/failed states. |
| [ ] | New pledge | `/users/<username>/nut_pledge/new` | Owner + feature enabled | Form and signed state. |
| [ ] | Pledge history | `/users/<username>/nut_pledge/history` | Feature/visibility rules | Past pledges, failure previews and empty state. |

## Moderation and administration

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Moderation home | `/mod_tools` | Admin | Navigation and role checks. |
| [ ] | Invites | `/mod_tools/invites` | Admin | List, creation, deletion and invite-only toggle. |
| [ ] | Emoji links | `/mod_tools/emoji_links` | Admin | Create/edit/delete and validation. |
| [ ] | User icons | `/mod_tools/user_icons` | Admin | Create/edit/delete and previews. |
| [ ] | Wallpaper clients | `/mod_tools/clients` | Admin | Create/edit/delete, reordering and homepage client tables. |
| [ ] | Profile domains | `/mod_tools/profile_domains` | Admin | Allow/block decisions and validation. |
| [ ] | System analytics | `/mod_tools/analytics/system` | Admin | Charts, counters and empty state. |
| [ ] | Activity analytics | `/mod_tools/analytics/activity` | Admin | Charts, counters and filters. |
| [ ] | Reports | `/mod_tools/reports` | Admin | Open and closed lists; also ?closed=1. |
| [ ] | Report details | `/mod_tools/reports/<report_id>` | Admin | Snapshot, reporter, target and close action. |
| [ ] | Report edit alias | `/mod_tools/reports/<report_id>/edit` | Admin | Currently renders the report detail page. |
| [ ] | Password-reset tool | `/mod_tools/passwords` | Admin | User lookup/reset controls. |
| [ ] | User lookup/editor | `/mod_tools/users` | Admin | Query/user selection, edit form and role controls. |
| [ ] | Deleted users | `/mod_tools/users/deleted` | Admin | List, restore and purge controls. |
| [ ] | Quarantine | `/mod_tools/quarantine` | Admin | User lookup, quarantine and IP-ban controls. |
| [ ] | Recent events | `/mod_tools/events` | Admin | Event list, filters and ban controls. |
| [ ] | Lizard tools | `/lizard_tools` | Admin/lizard role | Navigation and permissions. |
| [ ] | Warren tools | `/lizard_tools/warren` | Admin/lizard role | Native mascot link cards and pagination. |
| [ ] | Ki tools | `/lizard_tools/ki` | Admin/lizard role | Native mascot link cards and pagination. |
| [ ] | Taylor tools | `/lizard_tools/taylor` | Admin/lizard role | Native mascot link cards and pagination. |

## Blazer analytics engine (Node)

| Done | Page | URL | Access / setup | What to verify |
| --- | --- | --- | --- | --- |
| [ ] | Analytics home | `/blazer` | Admin | Saved queries, search and dashboards. |
| [ ] | New query | `/blazer/queries/new` | Admin | Editor, data source and save controls. |
| [ ] | Saved query | `/blazer/queries/<query_id>` | Admin | Parameters, results, charts and downloads. |
| [ ] | Edit query | `/blazer/queries/<query_id>/edit` | Admin | Editor and validation. |
| [ ] | Query documentation | `/blazer/queries/docs` | Admin | Configured SQL source and chart documentation. |
| [ ] | Query schema | `/blazer/queries/schema` | Admin | Table/column listing. |
| [ ] | Checks | `/blazer/checks` | Admin | Scheduled-check list. |
| [ ] | New check | `/blazer/checks/new` | Admin | Check form. |
| [ ] | Edit check | `/blazer/checks/<check_id>/edit` | Admin | Check form and schedule. |
| [ ] | New dashboard | `/blazer/dashboards/new` | Admin | Dashboard form. |
| [ ] | Saved dashboard | `/blazer/dashboards/<dashboard_id>` | Admin | Query panels and refresh. |
| [ ] | Edit dashboard | `/blazer/dashboards/<dashboard_id>/edit` | Admin | Panel selection and save. |

## Existing aliases

These reuse the pages above; check bookmarks if you use them:

- `/search/index` → site search; `/search/results?q=<query>` → results.
- `/settings/index` → settings.
- `/news_room/index` → newsroom (the homepage links here).
- `/session/new` → login. Use `/signup` for signup: the earlier `/users/:username` route shadows the generated `/users/new` route.
- `/errors/not_found` and `/errors/server_error` → remaining error-page routes.

## Navigation actions and form flows

These are controls/redirects, not additional read-only pages. Test deliberately through the UI:

- `/logout`: signs out; verify the redirect, revoked session and one-time flash.
- `/login/evilly`: enters the shared account when site policy allows; verify invite-only refusal and the returned layout. HEAD/prefetch must not log in.
- `POST /session`: normal login; verify invalid credentials, remember-me and CSRF errors.
- `POST /api/mascot/next` and `POST /api/pervert/toggle`: shared native layout controls.
- `/links/wizard`: creates a draft link and redirects to the wizard.
- `/links/<link_id>/show_similar`: redirects to another visible link, or back with an empty-result message.
- `/links/<link_id>/walltaker`: downloads the client configuration.
- `/messages/new`: creates a thread and redirects to its settings.
- `/messages/resolve_thread_with/<user_id>`: creates/resolves a conversation and redirects.
- `/notifications/<notification_id>`: marks/consumes a notification and follows its target.
- `/users/<user_id>/toggle_details_mode`: changes profile editing mode.
- Surrender assume/return/revoke, friend accept/delete, comments, reports, style selection, tracker changes and moderation controls: submit from their parent pages and verify redirects/flash/authorization.
- Blazer check-run controls execute checks; query run/refresh controls can issue database queries. They are actions rather than page previews.
- `/settings/save` is a legacy GET action, not a separate settings screen; use the settings forms.

## Diagnostics and non-page endpoints

- `/up`: Node web health JSON.
- `/api/links.json`, `/api/links/<link_id>.json`, `/api/links/<link_id>/widget.json`, `/api/users/<username>.json`: read APIs.
- `POST /api/links/<link_id>/response.json`: reaction API.
- `/node-assets/*`: native frontend files; `/live-assets/*` and `/assets/*`: assets used by remaining pages.
- `/e621-media?token=<signed_token>`: signed media proxy; verify through displayed wallpaper images.
- `/cable`: WebSockets; verify through live wallpaper, dashboard, presence, chat and notification updates.
- Blazer `/queries` search/autocomplete and `/queries/tables`, `/queries/schema` helpers live under `/blazer`; test through the query UI.
- Blazer upload pages (`/blazer/uploads`, `/new`, `/<upload_id>`, `/<upload_id>/edit`) exist only when uploads are configured; uploads are not enabled in the checked-in configuration.
- `/_internal/*` and `/_anycable*` are private service endpoints and should not be browsable publicly.

Sources: `config/routes.rb`, `nuttracker/config/routes.rb`, `services/web/src/routes.js`, implemented controller actions, and the installed Blazer engine routes.

Wallpaper/search/wizard browser flows now use native Node templates. See the
[focused page and interaction checklist](wallpaper-browser-verification.md).
