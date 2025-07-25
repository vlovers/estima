import { createAsyncThunk } from '@reduxjs/toolkit';
import * as authApi from '../services/authApiService';
import { LoginCredentials, RegisterCredentials } from '../types';

export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const data = await authApi.login(credentials);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response.data.message || 'Login failed');
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async (credentials: RegisterCredentials, { rejectWithValue }) => {
    try {
      const data = await authApi.register(credentials);
      return data;
    } catch (error: any) {
      return rejectWithValue(
        error.response.data.message || 'Registration failed'
      );
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authApi.logout();
    } catch (error: any) {
      return rejectWithValue(error.response.data.message || 'Logout failed');
    }
  }
);
