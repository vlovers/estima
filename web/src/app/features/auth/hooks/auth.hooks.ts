import { LoginCredentials, RegisterCredentials } from '../../../types';
import * as authApi from '../../../services/authApiService';
import { setAuth, clearAuth } from '../../../store/authSlice';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { isAxiosError } from 'axios';

export const useLoginMutation = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      dispatch(setAuth(data));
      navigate('/');
      notifications.show({
        title: 'Login Successful',
        message: 'Welcome back!',
        color: 'green',
      });
    },
    onError: (error: unknown) => {
      const message = isAxiosError(error)
        ? error.response?.data?.message
        : 'An unknown error occurred';
      notifications.show({
        title: 'Login Failed',
        message,
        color: 'red',
      });
    },
  });
};

export const useRegisterMutation = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (credentials: RegisterCredentials) =>
      authApi.register(credentials),
    onSuccess: (data) => {
      dispatch(setAuth(data));
      navigate('/');
      notifications.show({
        title: 'Registration Successful',
        message: 'Your account has been created.',
        color: 'green',
      });
    },
    onError: (error: unknown) => {
      const message = isAxiosError(error)
        ? error.response?.data?.message
        : 'An unknown error occurred';
      notifications.show({
        title: 'Registration Failed',
        message,
        color: 'red',
      });
    },
  });
};

export const useLogoutMutation = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      dispatch(clearAuth());
      localStorage.clear();
      navigate('/login');
      notifications.show({
        title: 'Logged Out',
        message: 'You have been successfully logged out.',
        color: 'blue',
      });
    },
    onError: (error: unknown) => {
      const message = isAxiosError(error)
        ? error.response?.data?.message
        : 'An unknown error occurred';
      notifications.show({
        title: 'Logout Failed',
        message,
        color: 'red',
      });
    },
  });
};
