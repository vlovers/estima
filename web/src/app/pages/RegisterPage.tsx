import { useRegisterMutation } from '../features/auth/hooks/auth.hooks';
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
  Title,
  Flex,
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

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: register, isPending } = useRegisterMutation();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    register({ email, password });
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
          <Title order={2} ta="center" mb="lg">
            Create an account
          </Title>
          <LoadingOverlay visible={isPending} />
          <TextInput
            label="Email"
            placeholder="you@mantine.dev"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            mt="md"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <Button type="submit" fullWidth mt="xl">
            Register
          </Button>
        </Paper>
        <Text c="dimmed" size="sm" ta="center">
          Already have an account?{' '}
          <Anchor size="sm" component={Link} to="/login">
            Sign in
          </Anchor>
        </Text>
      </Stack>
    </Flex>
  );
}
