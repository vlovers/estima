import { useLoginMutation } from '../features/auth/hooks/auth.hooks';
import { Link } from 'react-router-dom';
import { useState } from 'react';

import {
  LoadingOverlay,
  PasswordInput,
  TextInput,
  Anchor,
  Button,
  Paper,
  Stack,
  Text,
  Flex,
  Title,
} from '@mantine/core';

function EstimaLogo() {
  return (
    <Title
      order={1}
      ta="center"
      style={{
        fontFamily: 'Greycliff CF, sans-serif',
        fontWeight: 900,
      }}
    >
      Estima
    </Title>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending } = useLoginMutation();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    login({ email, password });
  };

  return (
    <Flex mih="100vh" align="center" justify="center" p="md">
      <Stack gap="xl" w={420}>
        <EstimaLogo />
        <Paper
          withBorder
          shadow="md"
          p={30}
          radius="md"
          component="form"
          onSubmit={handleSubmit}
        >
          <LoadingOverlay visible={isPending} />
          <TextInput
            label="Email"
            placeholder="you@mantine.dev"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            mt="md"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Button type="submit" fullWidth mt="xl">
            Sign in
          </Button>
        </Paper>
        <Text c="dimmed" size="sm" ta="center">
          Do not have an account yet?{' '}
          <Anchor size="sm" component={Link} to="/register">
            Create account
          </Anchor>
        </Text>
      </Stack>
    </Flex>
  );
}
