/**
 * The IPC contract between the Electron main process and the renderer.
 * Both sides import these channel names so they cannot drift apart.
 */

export const IPC = {
  // Vault lifecycle
  openVault: 'vault:open',
  createVault: 'vault:create',
  pickVaultFolder: 'vault:pick-folder',
  getVaultTree: 'vault:tree',
  getIndexSnapshot: 'vault:index-snapshot',
  getCurrentVault: 'vault:current',
  closeVault: 'vault:close',

  // Tab session — which notes were open, per vault
  getSession: 'session:get',
  setSession: 'session:set',

  // Files
  readFile: 'file:read',
  writeFile: 'file:write',
  createNote: 'file:create-note',
  createFolder: 'file:create-folder',
  renamePath: 'file:rename',
  deletePath: 'file:delete',
  uniqueNotePath: 'file:unique-path',
  revealInFolder: 'file:reveal',

  // Links
  getBacklinks: 'link:backlinks',
  getOutgoingLinks: 'link:outgoing',
  getUnlinkedMentions: 'link:unlinked-mentions',
  getAllNotePaths: 'link:all-paths',
  resolveLink: 'link:resolve',
  createNoteFromLink: 'link:create-from-link',
  updateLinksOnRename: 'link:update-on-rename',

  // Search
  search: 'search:query',
  getTags: 'tag:list',
  getNotesWithTag: 'tag:notes',

  // Settings
  getSettings: 'settings:get',
  setSettings: 'settings:set',

  // Daily notes
  openDailyNote: 'daily:open',

  // App
  getVersion: 'app:version',
  getPlatform: 'app:platform',

  // Push events (main -> renderer)
  onIndexUpdated: 'event:index-updated',
  onFileChanged: 'event:file-changed',
  onVaultChanged: 'event:vault-changed',
  onSettingsChanged: 'event:settings-changed',
  onCommand: 'event:command',
} as const

export const IPC_CHANNELS = Object.values(IPC)
