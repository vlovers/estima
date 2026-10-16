import { AuthScreen } from '../components/AuthScreen';
import { useRegisterMutation } from '../features/auth/hooks/auth.hooks';

export function RegisterPage() {
  const mutation = useRegisterMutation();
  return (
    <AuthScreen
      mode="register"
      onSubmit={(credentials) => mutation.mutate(credentials)}
      isPending={mutation.isPending}
      error={mutation.error}
    />
  );
}
