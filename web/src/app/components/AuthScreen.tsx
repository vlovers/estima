import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Button,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { LoginCredentials } from '../types';
import { errorMessage } from '../utils/errors';
import { Brand } from './Brand';
import { ThemeSwitcher } from './ThemeSwitcher';

export function AuthScreen({
  mode,
  onSubmit,
  isPending,
  error,
}: {
  mode: 'login' | 'register';
  onSubmit: (credentials: LoginCredentials) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const registering = mode === 'register';
  useEffect(() => {
    document.title = `${registering ? 'Create account' : 'Sign in'} · Estima`;
  }, [registering]);
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <div className="auth-kicker">Clarity before commitment</div>
          <h2>
            Better context.
            <br />
            Better estimates.
          </h2>
          <p>
            Turn project scope into considered estimates. Keep the work, the
            reasoning and your own judgment together.
          </p>
          <div className="auth-steps">
            <span>
              <b>01</b> Define the scope
            </span>
            <span>
              <b>02</b> Explore the estimate
            </span>
            <span>
              <b>03</b> Plan with context
            </span>
          </div>
        </div>
        <div className="auth-footer">
          Estima · A clearer view of the work ahead
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-tools">
          <ThemeSwitcher />
        </div>
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <p className="page-eyebrow">Your estimation workspace</p>
          <Title order={1}>
            {registering ? 'Create your account' : 'Welcome back'}
          </Title>
          <Text c="dimmed" size="sm" mt="sm" mb="xl">
            {registering
              ? 'Give your next project a thoughtful starting point.'
              : 'Sign in to pick up where you left off.'}
          </Text>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!isPending) onSubmit({ email, password });
            }}
            aria-busy={isPending}
          >
            <Stack gap="lg">
              {!!error && (
                <Alert
                  color="red"
                  title={
                    registering
                      ? 'Could not create account'
                      : 'Could not sign in'
                  }
                  role="alert"
                >
                  {errorMessage(error, 'Please try again.')}
                </Alert>
              )}
              <TextInput
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                disabled={isPending}
              />
              <PasswordInput
                label="Password"
                placeholder={
                  registering ? 'Create a password' : 'Enter your password'
                }
                autoComplete={registering ? 'new-password' : 'current-password'}
                required
                minLength={registering ? 8 : undefined}
                maxLength={registering ? 128 : undefined}
                description={registering ? 'Use 8–128 characters.' : undefined}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                disabled={isPending}
              />
              <Button
                type="submit"
                fullWidth
                loading={isPending}
                rightSection={<IconArrowRight size={16} />}
              >
                {registering ? 'Create account' : 'Sign in'}
              </Button>
            </Stack>
          </form>
          <p className="auth-switch">
            {registering ? 'Already have an account?' : 'New to Estima?'}{' '}
            <Anchor
              size="xs"
              fw={600}
              component={Link}
              to={registering ? '/login' : '/register'}
            >
              {registering ? 'Sign in' : 'Create an account'}
            </Anchor>
          </p>
          <p className="auth-help">
            A dedicated space for your projects, tasks
            <br />
            and the estimates behind them.
          </p>
        </div>
      </main>
    </div>
  );
}
