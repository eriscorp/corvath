// The single per-app identity constant for two house modules: Report Issue and
// update-check v1. This is the ONE file a sibling app edits to adopt either
// module; everything else in `shared/{scrub,osName,diagnostics,issueUrl}.ts` and
// `shared/updateVersion.ts` is drop-in.
//
// No electron/node imports, like every other file in `shared/` — main composes the
// issue URL from it, the renderer names the intake and the app in its copy, and
// scripts/publish-version.mjs reads `updateKey` out of this file as text.
//
// **Corvath's own repository is not the intake, and that is the point.** Every
// house app files to one public intake, `hybrasyl/cernunnos`, so a maintainer
// triages all of them in one place, and `appLabel` says which app a report came
// from. The same repository holds the version manifest that `updateKey` names.

export interface AppIdentity {
  /** Shown in the diagnostics block, beside the version. */
  productName: string
  /** The public intake repository — the same one for every house app. */
  intakeOwner: string
  intakeRepo: string
  /**
   * Applied through the prefill URL's `labels=` parameter.
   *
   * **It must already exist on the intake repository.** GitHub applies a
   * `labels=` value only for a label that exists and drops it SILENTLY
   * otherwise, so a typo here costs a triage label with no error anywhere.
   * `app:corvath` was created on `hybrasyl/cernunnos` on 2026-08-06, ahead of
   * this adoption.
   */
  appLabel: string
  /**
   * The app's key in the house version manifest (update-check module). Lower
   * case, the repo name. Set explicitly, so a package rename cannot move the app
   * to a key that nothing writes. The manifest has no `corvath` key until the
   * first release runs `npm run publish:version`, so until then the check
   * answers `no-entry`.
   */
  updateKey: string
  /**
   * The update notice opens a manifest `url` only when it starts with this. It is
   * the releases path of `eriscorp/corvath`, where release.yml publishes. Anyone
   * who can push to cernunnos can edit the manifest, so this prefix is what keeps
   * a bad entry from sending corvath's users to another repository.
   */
  releaseUrlPrefix: string
}

/**
 * The house module doc's fifth field, `homepage`, is deliberately ABSENT.
 *
 * Balor dropped it after finding it consumed by nothing in five prior adoptions,
 * and its note says not to keep copying it forward. A value with no consumer has
 * never had to be right, so its first caller inherits a defect rather than a
 * feature. Add it when something needs it, with the right value at that moment.
 */
export const appIdentity: AppIdentity = {
  productName: 'Corvath',
  intakeOwner: 'hybrasyl',
  intakeRepo: 'cernunnos',
  appLabel: 'app:corvath',
  updateKey: 'corvath',
  releaseUrlPrefix: 'https://github.com/eriscorp/corvath/releases/'
}
