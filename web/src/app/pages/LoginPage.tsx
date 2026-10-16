import { AuthScreen } from '../components/AuthScreen';
import { useLoginMutation } from '../features/auth/hooks/auth.hooks';

export function LoginPage() {
  const mutation = useLoginMutation();
  return (
    <AuthScreen
      mode="login"
      onSubmit={(credentials) => mutation.mutate(credentials)}
      isPending={mutation.isPending}
      error={mutation.error}
    />
  );
}
