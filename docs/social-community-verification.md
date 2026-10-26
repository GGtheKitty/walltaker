# Native Node social and community pages

Base URL: **https://devenv.playctrl.me**. These browser routes now use native
JavaScript templates and the existing signed Node social/browser/automation
services. Original paragraphs, form names, frame IDs, modal hooks and CSS classes
are retained. Newsroom audio/video is delivered by Node with byte-range support.

Check desktop/mobile appearance and light/dark modes. Use disposable accounts
for membership, friendship, leash, surrender and scoop changes.

| Page / flow | URL | Verify |
| --- | --- | --- |
| Friends | `/friendships` | Confirmed friends, outgoing pending requests, request indicator, unfriend/cancel dialogs, Leashes and Surrender shortcuts. Take control appears for valid surrenders only. |
| Incoming requests | `/friendships/requests` | Accept/Ignore, empty state and Back to friends. |
| New request | `/friendships/new?with=USERNAME` | Prefilled username, Send Request, duplicate/self/unknown-user errors. |
| Friendship | `/friendships/FRIENDSHIP_ID` | Other user's name, friendship date and removal; foreign accounts cannot access it. |
| Threads | `/messages` | Names/default participant names, New thread and leave/remove controls. |
| New thread | `/messages/new` | Creates a thread and opens its member editor; HEAD/prefetch does not create anything. |
| Direct thread | `/messages/resolve_thread_with/USER_ID` | Reuses or creates a two-person thread for a confirmed friend. |
| Conversation | `/messages/THREAD_ID` | Newest/older messages, self/other alignment, formatting and links, e621 image/video attachments, send form, live messages and Manage Members. |
| History | Load more in a conversation | Appends older messages and eventually shows You have reached the top! A cursor from another thread is rejected. |
| Members/settings | `/messages/THREAD_ID/edit` | Members/Not Members, add/remove, Set/Reset thread name and Leave. Only friends are eligible to add. Removed users lose page and stream access. |
| Notify Me | Conversation toolbar | Checkbox updates in place and controls new-message notifications. Cannot update another participant's preference. |
| Notifications | `/notifications` | Original icons, text and dates, header popover, Nuke 'em all/Delete All, and read-and-follow links. Foreign or speculative visits do not consume notifications. |
| Public leashes | `/users/USERNAME/leashes` | Owner/pets, original explanation for own page and Get Leashed shortcut. |
| Pick Owner | `/leashes/new` | Confirmed friends, Leash me dialog, Cancel and Woof! (Yes). |
| Leash | `/leashes/LEASH_ID` | Pet preview and owner-only Unleash/Add flair. |
| Flair editor | `/leashes/LEASH_ID/edit` | Original description, preview, Flair text and Save; only the owner may edit or release. |
| Surrender overview | `/surrenders` | Original warnings, current surrender or embedded creation form. An actively surrendered account may be redirected to its own surrender panel. |
| Create surrender | `/surrenders/new` | Friend, duration, pending checkbox, explicit consent and Give them my account. |
| Surrender panel | `/surrenders/SURRENDER_ID` | Controller, expiry, Your Links and Stop and return account. Only the subject may configure/cancel it. |
| Take control / Return | Friends and shared-header controls | Full navigation rotates browser identity, keeps attribution, and reconnects live updates under the appropriate session. Foreign/nonmember/admin/nested takeover attempts remain rejected by the existing Node policy. |
| Newsroom | `/news_room/index` or `/news_room` | Full-width backdrop, desk images, live story changes, looping globe and music after a click if the browser blocks autoplay. |
| Your Scoops | `/scoops` | Own submissions, waiting/aired state and disabled controls for aired scoops. |
| New scoop | `/scoops/new` | Original form, Details, Send in!, one-week submission limit unless a reporter. |
| Edit scoop | `/scoops/SCOOP_ID/edit` | Owner only; changes before airing; Stop the presses! deletes an unaired scoop. |
| Interview | `/scoops/SCOOP_ID` | Public scoop text with its author's mascot image. |
| Leaderboard | `/leaderboard` | Original top-ten wording, user-reference badges, counts and links; frame loading works too. |

## Verification performed

- 78 lightweight web tests passed with the Rails HTTP fallback unavailable for
  native flows, including account/profile/wallpaper regression coverage.
- Live disposable-account checks passed for friend requests/acceptance, private
  threads, message formatting/history/names, notification preferences and owner
  checks, leash creation/flair/release, surrender creation/takeover/return/cancel,
  scoop creation/edit/public interview/deletion, leaderboard and newsroom media.
- Byte-range, suffix, HEAD and invalid-range asset checks passed.
- Original static paragraph comparisons passed for warnings, introductions and
  member-management help; temporary records were removed.

No headless browser was launched. Visual layout, dialogs, playback and live
updates in multiple browser tabs remain manual review items. Existing Node
delivery workers continue sending compatible Turbo fragments through the same
streams; native pages use the existing participant-specific stream IDs.
