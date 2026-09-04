import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/services/apiClient'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loginError, setLoginError] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } })

  async function onSubmit(values) {
    setLoginError(null)
    try {
      await login(values.email, values.password)
      // Always land on "/" and let HomeRoute pick the right page for this
      // role. Returning to the URL that triggered the login sent whoever
      // logged in next to a page the *previous* session was on - a stale or
      // bookmarked address the new user often had no permission for, which
      // surfaced as a 403 immediately after a successful sign-in.
      navigate('/', { replace: true })
    } catch (error) {
      setLoginError(getApiErrorMessage(error))
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-center text-lg font-semibold text-slate-900">Sign in</h1>
      <p className="mb-6 text-center text-sm text-slate-500">Welcome back. Please enter your details.</p>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <ErrorMessage message={loginError} />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email', { required: 'Email is required' })}
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password', { required: 'Password is required' })}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
