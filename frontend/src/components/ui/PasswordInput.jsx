import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/Input'

// A password field with the eye that reveals it.
//
// Typing a secret you cannot read is a guess you only find out about at the
// next sign-in - and worse for one that is being typed *for somebody else*,
// like the temporary password on a new user, where the person who has to use
// it isn't there to correct it. So the toggle lives here rather than being
// rebuilt per form, and sits in the same place in every one.
export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [revealed, setRevealed] = useState(false)
  return (
    <Input
      {...props}
      ref={ref}
      type={revealed ? 'text' : 'password'}
      rightElement={
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          className="text-slate-400 transition-colors hover:text-slate-600"
          aria-label={revealed ? 'Hide password' : 'Show password'}
          // Out of the tab order: Tab from the field goes to the next field or
          // to Save, which is where somebody filling the form is headed. The
          // eye is there for the moment you stop and check.
          tabIndex={-1}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  )
})
