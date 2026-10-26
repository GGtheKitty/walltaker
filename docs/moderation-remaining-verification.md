# Moderation, help and Node Blazer verification

Test site: **https://devenv.playctrl.me**, branch `node`.

These pages use native Node routing, forms, templates and assets. Reports and
administration call the existing Node moderation policies. Blazer now has a Node
SQL/check/dashboard engine and keeps the existing `blazer_*` PostgreSQL tables.
No saved queries or dashboards need to be copied to new tables.

## Pages to review

Use desktop/mobile widths and the existing light/dark themes for ordinary site
pages. Blazer retains its separate Bootstrap/Ace layout.

| Page | URL | Access and checks |
| --- | --- | --- |
| Help | `/help` | Public; original text, client list, native images and guide links |
| FAQ | `/help/faq` | Public; original text and navigation |
| Client guide | `/help/client_guide` | Public; highlighted code/examples and horizontal overflow |
| Older client guide | `/help/deprecated_client_guide` | Public; original examples and highlighting |
| Report user | `/users/<user_id>/reports/new` | Signed in; open from a profile, submit a disposable report |
| Report link | `/links/<link_id>/reports/new` | Signed in; open from a visible link, submit a disposable report |
| Admin dashboard | `/mod_tools` | Admin; navigation, counts and existing feature-toggle controls |
| PornBot & PornLizards | `/mod_tools/bots` | Admin; per-mode tags, timing, batch limits, worker status, Save, Start/Stop and Check now |
| Invites | `/mod_tools/invites` | Admin; generate/delete, redeemed state, pagination and invite-only toggle |
| Link emoji | `/mod_tools/emoji_links` | Admin; create/edit/delete on a disposable link |
| User icons | `/mod_tools/user_icons` | Admin; create/edit/delete for a disposable account |
| Wallpaper clients | `/mod_tools/clients` | Admin; create/edit/delete, section/device choices and ordering |
| Domain review | `/mod_tools/profile_domains` | Admin; pending/approved/blocked tabs, independent pagination and review actions |
| Account lookup | `/mod_tools/users?query=<username>` | Admin; account fields, profile source, flags and validation |
| Deleted accounts | `/mod_tools/users/deleted` | Admin; restore and permanent purge on disposable accounts |
| Password tool | `/mod_tools/passwords` | Admin; instructions and both email-match modes; issued token appears only after POST |
| Quarantine | `/mod_tools/quarantine` | Admin; recent visits, quarantine/revive, original IP-ban controls |
| Recent events | `/mod_tools/events` | Admin; event properties, previews and original IP-ban controls |
| Reports | `/mod_tools/reports` | Admin; also `?closed=1`, user/link targets and snapshots |
| Report detail | `/mod_tools/reports/<report_id>` | Admin; snapshot escaping, account/link actions and Close ticket; `/edit` is an alias |
| System analytics | `/mod_tools/analytics/system` | Admin; machine, database, Redis and queue sections |
| Activity analytics | `/mod_tools/analytics/activity` | Admin; totals and chart |
| Lizard tools | `/lizard_tools` | Admin or existing lizard role; mascot navigation |
| Mascot lists | `/lizard_tools/ki`, `/lizard_tools/warren`, `/lizard_tools/taylor` | Same role; native wallpaper cards and pagination |
| SQL home | `/blazer` | Admin; saved queries/dashboards, filtering, All/Viewed/Mine |
| SQL editor | `/blazer/queries/new` | Admin; Ace highlighting, Preview table, variable fields, Run/Cancel and Ctrl/Cmd+Enter |
| Saved SQL | `/blazer/queries/<query_id>` | Admin; variables, safe results, charts, CSV, Fork and Refresh |
| Edit SQL | `/blazer/queries/<query_id>/edit` | Admin; Update/Fork/Delete, protected `*`/`#` names |
| SQL docs/schema | `/blazer/queries/docs`, `/blazer/queries/schema` | Admin; configured source, chart combinations and table/column listing |
| Checks | `/blazer/checks` | Admin; state, search and Run Now |
| Check forms | `/blazer/checks/new`, `/blazer/checks/<check_id>/edit` | Admin; query, alert condition, schedule, recipients, Save/Delete |
| Dashboard forms | `/blazer/dashboards/new`, `/blazer/dashboards/<dashboard_id>/edit` | Admin; add/remove/reorder queries and Save/Delete |
| Dashboard | `/blazer/dashboards/<dashboard_id>` | Admin; ordered panels, shared variables and Refresh |

## Bot controls

Open **Mod Tools → PornBot & PornLizards**. Each bot has separate tags for the
link owner's normal/perverted preference. Checks run every 60–86,400 seconds;
the wallpaper cooldown can be 0–604,800 seconds, and each check selects at most
1–60 links. Cooldown measures time since any wallpaper change on that link.
Existing link opt-ins, mascot selection, themes, blacklists and media rules
still apply. Original defaults are preserved until saved.

Save settings before using Start/Stop or Check now. Start and Check now enable
the bot and schedule an immediate check; the worker normally notices within
five seconds. Stop disables its checks and invalidates queued/in-flight
selections before wallpaper persistence. Changes remain saved across restarts;
older forms are rejected if another administrator changed that bot.

Worker health comes from scheduler checks, not just the enabled flag. Refresh
status to see the latest heartbeat, next check and job counts for the current
settings. These controls manage the four bot schedules inside the existing
Node worker; a worker outage still requires restoring the API service. A
missing/inactive system account is identified and cannot be started.

Deploy the SQL migration and rerun provisioning with `scripts/devenv run --rm
--no-deps migrate` (use `scripts/compose` outside this preview). Bot state is in
`node_bot_settings`. Moderation can change settings/schedules; automation and
the wallpaper writer can only read the settings. Administrative mutations use
the existing audited, actor-checked moderation commands and CSRF-protected forms.

## Blazer engine and deployment

`BLAZER_DB_USER` and `BLAZER_DB_PASSWORD` configure a separate SQL reader.
Run `scripts/provision-blazer.sh` inside the database environment with these
values and the existing `MODERATION_DB_USER`, then recreate `wallpaper_api`.
It grants the metadata role access to the existing Blazer tables and grants the
query role SELECT access to current public tables. Re-run provisioning after
adding tables that should be queryable. The web service receives no DB credentials.

Queries run as the reader in a read-only transaction with a 10-second statement
timeout, two simultaneous executions, 1,000-row output limit, capped returned
cell/output sizes and an audit record. A third connection remains available for
canceling a running query. Variables are PostgreSQL parameters, including quoted
templates. CSV uses the same result limits. Query text and values are excluded
from HTTP logs; intended SQL statements remain in the existing audit table.

The Node API checks due schedules every 30 seconds under a PostgreSQL advisory
lock. Existing 5-minute/hour/day schedules, bad-data/missing-data conditions,
failure/recovery email notifications, and manual Run Now are supported. Empty
email lists do not send mail. SMTP delivery failure leaves the previous state
so the next execution can retry notification. Cohort-analysis queries retain the
`/* cohort analysis */` marker and day/week/month periods. Ordinary line, column,
scatter, pie and grouped charts use the native Chartkick bundle.

This ports the configured PostgreSQL source. The repository has no enabled smart
variables/linked columns, caching, maps, uploads, forecasting, anomaly checks or
Slack webhooks. Those optional integrations are not enabled by this migration.

## Verification performed

- Native web regression tests, including all new pages with Rails unavailable,
  login/admin/lizard/delegation policy, CSRF, escaping and form-command fields.
- 13 API tests, including transport, actor-scoped cancellation, bounded SQL concurrency, scheduled
  state transitions/retry, native cohort formatting and mocked SMTP checks.
- Live disposable-account checks for all page groups, reports, moderation CRUD,
  account editing/reset/quarantine/restore/purge, link deletion and assumption.
- Live PostgreSQL checks for parameter binding, read-only transactions, rejected
  multi-statement/writing queries, CSV, query persistence/fork/delete, ordered
  dashboards, scheduled check execution and audits. All check recipients empty.
- 11 preview watcher tests and shell syntax validation for provisioning.
- Live native asset delivery, actual SQL cancellation, and day/week/month cohorts.
- Temporary users, reports, queries, checks, dashboards, audits, clients, icons,
  emoji and sessions removed. No real-account credentials or content changed.

Checks are lightweight HTTP/service checks; visual layout, editor keyboard use
and interactive chart behavior still need the browser review above.

The final Node-only cutover has removed the framework adapters, view compiler,
Ruby source/configuration and Rails container. Database setup now uses Node/SQL.
See [the cutover notes](node-only-cutover.md) for the deployed architecture and
full verification results.
