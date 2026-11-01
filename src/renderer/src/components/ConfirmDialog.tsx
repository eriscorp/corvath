import { Button, Dialog, DialogActions, DialogContent, DialogContentText } from '@mui/material'
import DialogTitle from '@mui/material/DialogTitle'
import type { JSX, ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  /** A question, not a label. "Delete this reading?" */
  title: string
  /** What happens if they say yes. Name the thing where you can. */
  message: ReactNode
  /** The affirmative button. Say the verb — "Delete", not "OK". */
  confirmLabel?: string
  cancelLabel?: string
  /** Colours the confirm button as an error and keeps focus on Cancel. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A themed confirmation, replacing `window.confirm`.
 *
 * **Why not `window.confirm`.** Corvath is frameless, draws its own title bar and
 * ships eight themes; the browser dialog is unstyled OS chrome that ignores all of
 * it, and it blocks the renderer thread while open. There was exactly one
 * `window.confirm` in the app (applying a layout over a filled reading) and
 * HTOO-409 needed a second, which is the point at which one shared component is
 * cheaper than two divergent ones.
 *
 * **Cancel is the default action on a destructive prompt, and that is the whole
 * point of the component.** `autoFocus` sits on Cancel rather than Confirm, so
 * Return and Space — and a user still typing when the dialog appears — take the
 * safe branch. MUI's `Dialog` already maps Escape to `onClose`. A confirmation
 * whose default answer is "yes" is a speed bump, not a guard.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby="confirm-dialog-title"
      data-testid="confirm-dialog"
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} autoFocus data-testid="confirm-cancel">
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          color={destructive ? 'error' : 'primary'}
          variant="contained"
          data-testid="confirm-accept"
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
