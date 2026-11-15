# Releasing

Builds are made by GitHub Actions (`.github/workflows/release.yml`): pushing a tag `vX.Y.Z` tests the code, builds Windows (x64) and macOS (Apple silicon and Intel) zips, and publishes them as a GitHub Release. The release notes are that version's section of `CHANGELOG.md`, followed by download instructions.

1. Add a `## X.Y.Z` section at the top of `CHANGELOG.md`.
2. If EASY-TUBER's runtime changed, run `npm run sync-runtime` and `npm test`.
3. Bump the version, commit and tag in one step, then push:

   ```
   npm version X.Y.Z -m "Release %s"
   git push --follow-tags
   ```

   The workflow refuses a tag that doesn't match `package.json`.
4. Watch the **Actions** tab. The release appears under **Releases** when all three builds are done.

To try the builds without releasing, open **Actions > Release > Run workflow**; the zips are attached to the run as artifacts.

To build locally: `npm run dist:win` (on Windows) or `npm run dist:mac` (on a Mac). The app lands in `dist/`.

The apps aren't code-signed: Windows SmartScreen and macOS Gatekeeper ask once before opening them (the release notes say how).
