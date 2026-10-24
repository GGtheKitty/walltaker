export function exportLink(id, baseUrl, now = new Date()) {
  return `# Walltaker Configuration File
# Exported at ${now.toISOString()}

[Base] # do not change
base = ${JSON.stringify(baseUrl.replace(/\/$/, '') + '/links/')} # DO NOT EDIT.

[Feed] # the link number to watch
feed = ${id} # DO NOT EDIT.

[Preferences]
# interval: how many seconds to wait between check-ins. Recommended: 10
interval = 10
# mode: whether to "crop" or "fit" the images
mode = "crop"
discordPresence = false
saveLocally = false
notifications = false
`;
}
