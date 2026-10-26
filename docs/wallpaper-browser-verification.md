# Wallpaper, search, and wizard verification

On **https://devenv.playctrl.me**, these pages now use native Node routes,
JavaScript templates, and the Node frontend bundle. Replace `ID` with your link
number and `USERNAME` with a username. Use a temporary link for write checks.

| Page | What to check |
| --- | --- |
| `/links` | Your links, empty state, link navigation, New link and Link Wizard. |
| `/links/new` | Create a link; expiry, friends-only, blacklist, score and theme. |
| `/links/ID` | Card, current image, Expand/Collapse, Copy, reply, comments, presence/viewers, Search and Post ID tabs, Delete confirmation. |
| `/links/ID/edit` | Save settings; invalid inputs retain values and show errors; Update and Test; all four abilities; custom URL after 300 sets. |
| `/links/CUSTOM-SLUG` | Same link through its custom URL, when enabled. |
| `/browse` | Public online cards, new-user cards, search navigation, empty state. |
| `/search` | Woogle form, online-only checkbox, results and pagination. |
| `/search/query?q=TAG` | Direct result navigation and the results frame. |
| `/porn_search/index?link=ID` | Embedded/standalone e621 form and profile kink shortcuts. |
| `/porn_search/search?link=ID&tags=TAG` | Results, back/next, selecting an image, recent-change confirmation when embedded. |
| `/links/ID/comments` | Comments frame, usernames, safe image attachments. |
| `/links/ID/comments/new` | Send a comment; signed-out login prompt. Also test from the wallpaper sidebar. |
| `/links/ID/walltaker.toml` | Configuration download. `/links/ID/walltaker` is an alias. |
| `/links/ID/show_similar` | Redirect to another visible link, or explain that none was found. |
| `/links/ID/embed` | Default embedded card, details and selector. |
| `/links/ID/embed?type=form` | Selector only. |
| `/links/ID/embed?type=short` | Card and selector. |
| `/links/ID/embed?type=link` | Card only. |
| `/links/ID/embed?type=wallpaper` | Image preview, live text/comments. Try `fit=contain`, `background=ff0000`, and `hide_text=true`. |
| `/users/USERNAME/history` | Last 50 received wallpapers grouped by setter. |
| `/users/USERNAME/sets` | Last 50 sent wallpapers. |
| `/porn_search/index?message_thread=THREAD_ID` | Attachment search from a conversation you belong to; selection sends to that conversation. |

Start a new wizard at `/links/wizard` (this creates a draft). Follow these eight
pages in order, replacing ID with the created draft's ID:

1. `/links/ID/wizard/intro`
2. `/links/ID/wizard/summon`
3. `/links/ID/wizard/control`
4. `/links/ID/wizard/kinks`
5. `/links/ID/wizard/gender`
6. `/links/ID/wizard/surprise`
7. `/links/ID/wizard/no_fun`
8. `/links/ID/wizard/orgasmic_conclusion`

Check that “Come back later” and “Finish Wizard” resume the saved step, an old
wizard tab returns to the current step, “decide later” advances without a theme,
and the final buttons open settings or the completed link. The cloaca checkbox
now submits the spelling accepted by the existing Node wizard service. Invalid
rating-filter theme suggestions are omitted because themes accept one plain tag.

Check wallpaper pages at desktop and phone widths. Also verify private links
signed out and as a nonfriend; expired links as owner and visitor; and master-only
selection as owner, master and visitor. All unsafe forms retain the shared Node
CSRF verification. Account/profile editing, friendships, messages themselves,
kink editing and other groups still use their existing delivery paths.

Compatibility URLs: `/search/index`, `/search/results`, `/links.json`, and
`/links/ID.json`. The external `/api/links*` endpoints are unchanged.

## Automated checks

`services/web/test/wallpaper.test.js` covers native routes with the Rails fallback
unavailable, settings validation/whitelisting, CSRF, privacy failures, ban and
quarantine guards, verified e621 selection policy, wizard persistence/conflicts,
outage handling, comments/reactions/abilities, embeds and configuration export.
The live browser script also checks actual Turbo forms, live comment delivery,
all wizard pages, stylesheet cleanup and horizontal overflow at 1280/390 px.
Live HTTP verification uses disposable accounts and checks resulting database
rows; no production user account is modified.
