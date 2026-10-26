# Native Node tracker and activity pages

Base URL: **https://devenv.playctrl.me**. These routes now use native JavaScript
templates and the existing signed Node tracker/activity services. Profile logging
forms and pledge panels share the native tracker templates.

The standalone `/nut` pages retain the isolated engine's original content layout
without the shared header/footer. Embedded tracker forms retain the surrounding
profile styling. Editing an entry navigates to the full entry page after saving;
creating one in a profile keeps its form and local flash messages in place.

**NNN is currently disabled on the test site.** This migration preserves that
setting. Pledge URLs redirect home with the original notice while it is disabled.
Enabled signing/failure/history flows were verified in automated HTTP tests.

| Page / flow | URL | Verify |
| --- | --- | --- |
| All tracker entries | `/nut/orgasms` | Original list, ruined/rating text, Show this orgasm/New orgasm links and Previous/Next page controls. Public read access. |
| User entries | `/nut/orgasmers/USERNAME` | Only that user's entries and matching pagination URLs. |
| Log an orgasm | `/nut/orgasms/new` | Original text, credit groups, satisfaction radios, Was Ruined, Log Orgasm and Back to orgasms. Validation/cooldown messages appear inside the form. |
| Embedded log form | Own `/users/USERNAME` profile | Submission stays in `orgasm_form`, shows success/error feedback and can be submitted again. Refresh the profile to review its chart totals. |
| Entry | `/nut/orgasms/ENTRY_ID` | Original ruined/rating values, edit/back links and delete action. Reads remain public; changes require ownership. |
| Edit entry | `/nut/orgasms/ENTRY_ID/edit` | Current radio/ruined state, no credit selector; saving preserves ownership, credit and creation time. |
| Delete entry | Destroy this orgasm on its page | Owner only, original success notice and redirect to all entries. Use a disposable entry. |
| Sign pledge | `/users/USERNAME/nut_pledge/new` | When enabled: original pledge text, mascot witness/signature and Accept; username must match exactly and only the owner/delegated actor can sign. Existing current pledge redirects to profile. |
| Current pledge | `/users/USERNAME/nut_pledge` | When enabled: original signed/failed states, Tracker History, owner-only I Failed and confirmation. Frame updates work inside a profile. An absent pledge returns an empty `pledge` frame. |
| Pledge history | `/users/USERNAME/nut_pledge/history` | When enabled: original Year/Status/Signed table, empty state, success/in-progress/failure states and failure-image links. Video failures use thumbnails. |
| Activity history | `/history` | Signed in only; visit groups, visitless records, per-link grouping, client/decorated cards, action text and delegated “on behalf of” attribution. Private/expired/removed links remain unavailable according to current access. |
| Wallpaper image history | `/users/USERNAME/history` and `/users/USERNAME/sets` | These were already native in the wallpaper group and remain separate from `/history`, which records visits/actions. |

## Verification performed

- 87 lightweight web tests passed, including the existing account, profile,
  social and wallpaper tests, and the new tracker/activity tests with the Rails
  HTTP fallback unavailable.
- Live disposable-account checks passed for logging, credit notification,
  five-minute cooldown, CSRF rejection, owner-only edits/deletion, immutable
  attribution/creation time and profile chart totals.
- Live history checks passed for visit and visitless groups, delegated
  attribution, user-parameter tampering and private-link suppression. History
  rendering never rehydrates IDs excluded by the activity service's policy.
- Disabled-pledge redirects were checked live. Enabled signing, duplicate signing,
  exact signature, owner enforcement, idempotent failure, frame responses and
  history states were checked in automated HTTP tests.
- Original static form/pledge paragraph comparisons passed. Disposable users,
  entries, links, history, visits and verification records were removed.

No headless browser was launched. Desktop/mobile layout, radio/checkbox clicks,
embedded form interaction and pledge confirmation remain manual review items.
