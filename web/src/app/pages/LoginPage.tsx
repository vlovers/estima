import { useEffect, useState } from 'react';
import {
  Title,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Text,
  Anchor,
  LoadingOverlay,
  Flex,
  Stack,
} from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store';
import { loginUser } from '../store/authThunks';
import { notifications } from '@mantine/notifications';

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
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const { loading, error, token } = useSelector(
    (state: RootState) => state.auth
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    dispatch(loginUser({ email, password }));
  };

  useEffect(() => {
    if (token) {
      navigate('/');
    }
  }, [token, navigate]);

  useEffect(() => {
    if (error) {
      notifications.show({
        title: 'Login Failed',
        message: error,
        color: 'red',
      });
    }
  }, [error]);

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
          <LoadingOverlay visible={loading} />
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
