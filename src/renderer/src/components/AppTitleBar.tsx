import type { ReactElement } from 'react'
import { appIdentity } from '@shared/appIdentity'
import { useSettingsStore } from '@renderer/store/settingsStore'
import TitleBar from './TitleBar'
import appIcon from '@renderer/assets/corvath-128.webp'

/**
 * Corvath's title bar: the house `TitleBar` (title-bar v1, HTOO-572), wired to
 * corvath's settings store, icon, product name and window calls. The house
 * module stays as the template has it; corvath changes this file, not that one.
 * Corvath puts no controls of its own on the bar, so it passes no children.
 *
 * The maximize button calls `toggleMaximize`, so a second click restores the
 * window. The house module draws one Maximize glyph in both states.
 */
export default function AppTitleBar(): ReactElement {
  const theme = useSettingsStore((s) => s.theme)
  return (
    <TitleBar
      name={appIdentity.productName}
      icon={appIcon}
      theme={theme}
      platform={window.api.platform}
      controls={{
        minimize: () => window.api.window.minimize(),
        maximize: () => window.api.window.toggleMaximize(),
        close: () => window.api.window.close()
      }}
    />
  )
}
