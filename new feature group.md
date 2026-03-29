# Feature: Site Grouping

## Overview

When adding a new site, the user is prompted to input a **group name** (e.g., `system`, `others`, `zoloblocks`, `elementpack-demo`). The group organizes sites into logical folders on disk and prefixes their Caddy config filenames.

---

## How It Worked (Reverse-Engineered from Existing Data)

### 1. Directory Structure

Sites are stored under `www/{group}/{primaryKey}/public` instead of `www/{primaryKey}/public`:

```
www/
├── system/
│   ├── db.dev.sh/public/
│   └── test.wp.sh/public/
├── others/
│   ├── pixelgallery.wp.sh/public/
│   └── primeslider.wp.sh/public/
├── elementpack/
│   ├── elementpack.wp.sh/public/
│   └── elementpack.wp.sh_blog/public/    ← subdirectory site, same group as parent
├── elementpack-demo/
│   └── demo.elementpack.wp.sh/public/
├── elementpack-templates/
│   └── templates.elementpack.wp.sh/public/
└── zoloblocks/
    ├── zoloblocks.dev.sh/public/
    └── templates.zoloblocks.dev.sh/public/
```

### 2. Caddy Config Naming

Caddy filenames use the pattern `{group}__{primaryKey}.caddy` (double underscore separator):

```
caddy/
├── system__db.dev.sh.caddy
├── others__pixelgallery.wp.sh.caddy
├── elementpack__elementpack.wp.sh.caddy
├── elementpack-demo__demo.elementpack.wp.sh.caddy
├── zoloblocks__zoloblocks.dev.sh.caddy
```

### 3. sites.json

Each site entry includes a `"group"` field:

```json
{
  "domain": "db.dev.sh",
  "type": "site",
  "primaryKey": "db.dev.sh",
  "path": ".../www/system/db.dev.sh/public",
  "caddyConfig": ".../caddy/system__db.dev.sh.caddy",
  "group": "system",
  "status": "published"
}
```

---

## What Needs to Change

### `addSite.js` — The main gap

The current code is missing all group logic. Changes needed:

#### a) Add group prompt during site creation

After selecting site type and entering the domain, prompt the user for a group. Offer two options:

1. **Choose from existing groups** — read existing group directories from `www/` or unique `group` values from `sites.json`
2. **Create a new group** — free-text input

```
? Select or create a group:
  ❯ elementpack
    elementpack-demo
    elementpack-templates
    others
    system
    zoloblocks
    ── Create new group ──
```

If user picks "Create new group", prompt for the group name.

**Exception — subdirectory sites**: When the domain contains `/` (e.g., `elementpack.wp.sh/blog`), the group is **auto-inherited** from the parent domain. No group prompt should be shown. Look up the parent site's `group` field from `sites.json`.

#### b) Use group in the directory path

```js
// BEFORE (broken):
sitePath = path.join(__dirname, '..', '..', 'www', primaryKey);

// AFTER (with group):
sitePath = path.join(__dirname, '..', '..', 'www', group, primaryKey);
```

#### c) Pass group to caddyManager.createConfig()

```js
// Pass group in options
const caddyConfigPath = caddyManager.createConfig(primaryKey, domain, type, publicPath, {
    enablePhp, proxyAddress, corsOrigin, group
});
```

The `caddyManager` already supports `group` in all its methods (`createConfig`, `removeConfig`, `getConfigPath`, `addSubdirToParentConfig`, `removeSubdirFromParentConfig`). No changes needed there.

#### d) Store group in sites.json

Add `group` to both the initial site data and the complete site data:

```js
const initialSiteData = {
    domain, type, primaryKey,
    path: publicPath,
    caddyConfig: null,
    database: null,
    status: 'initializing',
    group   // ← ADD THIS
};

const completeSiteData = {
    domain, type, primaryKey,
    path: publicPath,
    caddyConfig: caddyConfigPath,
    database: dbName,
    status: 'published',
    group,   // ← ADD THIS
    ...
};
```

#### e) Fix cleanup on failure

The cleanup section needs group-aware caddy removal:

```js
// Current (broken):
caddyManager.removeConfig(primaryKey, domain);

// Fixed:
caddyManager.removeConfig(primaryKey, domain, group);
```

#### f) Display group in success output

```js
successDetails['Group'] = group;
```

---

### `removeSite.js` — Pass group to caddy removal

The `removeSite` command reads the site from `sites.json` (which has `group`), but doesn't pass it to `caddyManager.removeConfig()`:

```js
// Current (broken):
caddyManager.removeConfig(primaryKey, domain);

// Fixed — read group from the site object:
caddyManager.removeConfig(primaryKey, domain, site.group);
```

The directory removal already works because it derives the path from `site.path` stored in `sites.json`, which already contains the group folder.

---

### `listSites.js` — (Optional) Show group column

The list command currently shows: No, Domain, Relative Path, Status. Could add a Group column, or group sites visually by their group. The Relative Path column already indirectly shows the group (e.g., `system/db.dev.sh/public`), so this is optional.

---

## Edge Cases

### 1. Subdirectory sites inherit parent group
When adding `elementpack.wp.sh/blog`:
- Look up parent site `elementpack.wp.sh` in `sites.json`
- Read its `group` field (e.g., `"elementpack"`)
- Use the same group — do NOT prompt the user
- The caddy config is appended **to the parent's config file**, which already has the group prefix (`elementpack__elementpack.wp.sh.caddy`)

### 2. Group name validation
- Allowed characters: lowercase letters, numbers, hyphens (`a-z0-9-`)
- Must not start or end with a hyphen
- Must not be empty
- Must not contain spaces, underscores, or special characters
- Examples: `system`, `others`, `elementpack-demo`, `zoloblocks`

### 3. Group directory auto-creation
When creating a site in a group that doesn't have a `www/{group}/` directory yet, create it automatically with `{ recursive: true }`.

### 4. Proxy sites still get a group
Proxy sites don't have a directory (skipped), but they still need a group for the Caddy config filename. The group prompt should still appear for proxies.

### 5. Cleanup on failure must be group-aware
If site creation fails mid-way:
- Directory removal: `www/{group}/{primaryKey}` (already built into `sitePath` if group is used)
- Caddy config removal: pass `group` to `caddyManager.removeConfig()`
- Manual cleanup hint should show the correct paths with group

### 6. Empty group directory after last site removal
After removing the last site in a group, the `www/{group}/` directory will be empty. This can be left as-is (no auto-cleanup needed). Empty directories don't cause issues and the group may be reused.

### 7. Group doesn't exist yet
If the user types a new group name that doesn't match any existing group, it's valid. The `www/{group}/` directory will be created on the fly.

### 8. Sites.json already has group data
All existing sites in `sites.json` already have the `group` field. The restore only needs to re-add the group logic to `addSite.js` and pass it through the right code paths.

### 9. `caddyManager` is already group-aware
All caddyManager methods (`createConfig`, `removeConfig`, `configExists`, `getConfigPath`, `addSubdirToParentConfig`, `removeSubdirFromParentConfig`) already accept and use the `group` parameter. **No changes needed in `caddyManager.js`**.

### 10. Other commands that reference caddy configs
Commands like `manageCors.js`, `managePhp.js`, `siteInfo.js` that read or modify caddy configs use `site.caddyConfig` from `sites.json` (the absolute path). Since the full path is stored, they work regardless of group. No changes needed.

### 11. `fixPermissions.js` and scripts
These operate on `www/` recursively or on `site.path`. Since `site.path` already includes the group folder, they work as-is.

---

## Summary of Files to Change

| File | Change | Effort |
|------|--------|--------|
| `controller/commands/addSite.js` | Add group prompt, use group in path/config/data, fix cleanup | **Main work** |
| `controller/commands/removeSite.js` | Pass `site.group` to `caddyManager.removeConfig()` | One-line fix |
| `controller/caddyManager.js` | Already supports group — **no changes needed** | None |
| `controller/siteManager.js` | Already stores whatever data is passed — **no changes needed** | None |
| `controller/utils.js` | **No changes needed** | None |
