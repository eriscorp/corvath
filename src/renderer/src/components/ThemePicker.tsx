import { FormControl, InputLabel, MenuItem, Select } from '@mui/material'
import type { ReactElement } from 'react'
import type { ThemeName } from '../../../shared/types'

// The six themes in picker order. They lived in themes/index.ts, which is now
// the template's file (HTOO-572).
const THEME_OPTIONS: { value: ThemeName; label: string }[] = [
  { value: 'hybrasyl', label: 'Hybrasyl' },
  { value: 'danaan', label: 'Danaan' },
  { value: 'chadul', label: 'Chadul' },
  { value: 'grinneal', label: 'Grinneal' },
  { value: 'mundanes', label: 'Mundanes' },
  { value: 'dubhaimid', label: 'Dubhaimid' }
]

interface ThemePickerProps {
  value: ThemeName
  onChange: (name: ThemeName) => void
}

/**
 * The theme control, now living on the Settings page rather than in the title
 * bar — a permanent control in the window chrome for something a user sets once.
 *
 * The `labelId` is wired to a real `InputLabel`, so the combobox gets an
 * accessible name and a spec can reach it with
 * `getByRole('combobox', { name: 'Theme' })`. The house E2E doc prefers that over
 * a testid: an MUI `Select` with no linked label leaves `aria-labelledby` null
 * and cannot be found by role at all. The `theme-select` testid is kept because
 * three specs already use it and because it survives the label being reworded.
 */
export default function ThemePicker({ value, onChange }: ThemePickerProps): ReactElement {
  return (
    <FormControl sx={{ minWidth: 220 }} size="small">
      <InputLabel id="settings-theme-label">Theme</InputLabel>
      <Select
        labelId="settings-theme-label"
        label="Theme"
        value={value}
        onChange={(e) => onChange(e.target.value as ThemeName)}
        data-testid="theme-select"
      >
        {THEME_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
