import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Every packaging target electron-builder.yml declares must reach the published
 * release, and this file is the only thing that can say so on a commit.
 *
 * **It exists because the answer was no in three sibling repositories, and
 * nothing noticed for months.** Taliesin declared both `nsis` and `portable`
 * while its workflow packaged `--win portable`, so eight releases shipped no
 * installer (HTOO-369); balor published four assets where five were configured;
 * dagda shipped v1.0.0 through v1.3.0 with the same hole. Every gate in every
 * one of them passed the whole time: the config was right, the workflow was
 * valid YAML, and `fail_on_unmatched_files: true` says nothing at all about a
 * file **nobody asked for**. **A requirement expressed only as a list of globs
 * cannot report the entry that is missing from the list.**
 *
 * Corvath was the inverse case and had it easier: the workflow already packaged
 * a bare `--win`, and the config declared only `portable`, so nothing was
 * silently dropped -- there simply was no installer. This guard lands with the
 * nsis target so the honest state cannot drift back.
 *
 * Read as raw text rather than parsed: there is no YAML dependency in this
 * repository, these are files it owns, and the job is to catch a human edit
 * rather than to be a general parser.
 */

const REPO_ROOT = join(import.meta.dirname, '..')
const builder = readFileSync(join(REPO_ROOT, 'electron-builder.yml'), 'utf8')
const workflowRaw = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8')

/**
 * Comments out before any anchored pattern is matched.
 *
 * The comment explaining why the packaging step must not name a target
 * necessarily contains the form it is forbidding, so an assertion that reads the
 * raw file fails against a correct workflow. Describe the pattern; never write
 * it.
 */
const workflow = workflowRaw.replace(/^\s*#.*$/gm, '')

/** The `files:` block of the Create GitHub Release step, comments stripped. */
const releaseGlobs = (() => {
  const start = workflow.indexOf('          files: |')
  expect(start).toBeGreaterThan(-1)
  const rest = workflow.slice(start).split('\n').slice(1)
  const globs = []
  for (const line of rest) {
    if (!/^ {12}\S/.test(line)) break // the block ends at the next shallower key
    if (!line.trim().startsWith('#')) globs.push(line.trim())
  }
  return globs
})()

describe('every configured target reaches the release', () => {
  // suffix → the glob that must publish it. Keyed on what the artifact is
  // CALLED, because that is what both halves have to agree about: the left is
  // derived from electron-builder.yml's artifactName templates, the right is
  // what the workflow asks GitHub to upload.
  const EXPECTED = [
    { target: 'nsis', suffix: '-setup.exe' },
    { target: 'portable', suffix: '-portable.exe' },
    { target: 'AppImage', suffix: '.AppImage' },
    { target: 'deb', suffix: '.deb' },
    { target: 'dmg', suffix: '.dmg' }
  ]

  it.each(EXPECTED)('$target is declared, and has a release glob', ({ target, suffix }) => {
    expect(builder).toMatch(new RegExp(`^\\s*(- )?(target: )?${target}\\s*$`, 'm'))
    expect(releaseGlobs.some((g) => g.endsWith(suffix))).toBe(true)
  })

  it('publishes nothing the configuration does not declare', () => {
    // The other direction, and it is not symmetry for its own sake. A glob with
    // no target behind it makes `fail_on_unmatched_files: true` red every
    // release until somebody deletes the glob -- a failure that arrives on a
    // tag, which is the most expensive moment to find one.
    const known = EXPECTED.map((e) => e.suffix)
    for (const glob of releaseGlobs) {
      expect(known.some((suffix) => glob.endsWith(suffix))).toBe(true)
    }
    expect(releaseGlobs).toHaveLength(EXPECTED.length)
  })

  it('leaves the Windows target list in electron-builder.yml alone', () => {
    // `--win` with no targets after it. Naming them here as well would put the
    // list in two files, which is the shape the missing installer came from in
    // taliesin, balor and dagda: the config said two and the workflow said one,
    // and the config is the half a reader checks.
    expect(workflow).toMatch(/npx electron-builder --win --publish never/)
    expect(workflow).not.toMatch(/--win \w/)
  })

  // Signing (one step for both exes, one guard for both steps, each signature
  // read back) is pinned in release-signing.test.mjs (HTOO-517).

  it('uploads every Windows artifact out of the build job', () => {
    // The step between packaging and publishing, and the one the release job's
    // globs cannot speak for: `artifacts/**` can only match what was uploaded.
    // `if-no-files-found: error` then covers both names, so a rename in
    // electron-builder.yml fails the build rather than shipping one artifact.
    for (const { suffix } of EXPECTED.filter((e) => e.suffix.endsWith('.exe'))) {
      expect(workflow).toContain(`dist/*${suffix}`)
    }
  })

  it('installs per-user, assisted, with a directory page', () => {
    // Pinned because changing perMachine after a release is the expensive one:
    // an existing per-user installation is not upgraded by a per-machine
    // installer, and the user ends up with two.
    // allowToChangeInstallationDirectory only takes effect while oneClick is
    // false, so the three are asserted together rather than separately.
    expect(builder).toMatch(/^ {2}oneClick: false$/m)
    expect(builder).toMatch(/^ {2}perMachine: false$/m)
    expect(builder).toMatch(/^ {2}allowToChangeInstallationDirectory: true$/m)
  })

  it('does not collect the installer blockmap', () => {
    // electron-builder writes `<installer>.exe.blockmap` beside the setup exe
    // for electron-updater's differential download. Corvath has no updater --
    // updateCheck.ts notifies and downloads nothing -- so publishing it would
    // hand users a file with no consumer.
    expect(workflow).not.toContain('.blockmap')
  })
})

describe('after the release is published', () => {
  it('reminds the releaser to publish the version manifest, before Discord', () => {
    // The workflow has no credential for the house version manifest, so a
    // person runs `npm run publish:version` (update-check module v1, HTOO-382).
    // Until they do, running copies of Corvath do not see the release. The step
    // comes before Discord, so a failed webhook cannot skip it (epona's case).
    const remind = workflow.indexOf('- name: Remind to publish the version manifest')
    const release = workflow.indexOf('- name: Create GitHub Release')
    const discord = workflow.indexOf('- name: Notify Discord')
    expect(remind).toBeGreaterThan(release)
    expect(remind).toBeLessThan(discord)
    expect(workflow.slice(remind, discord)).toContain(
      'npm run publish:version -- ${{ github.ref_name }}'
    )
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts['publish:version']).toBe('node scripts/publish-version.mjs')
  })
})
