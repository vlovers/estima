import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter } from 'react-router-dom';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import '@mantine/core/styles.css';
import { store } from './app/store';
import { App } from './app/app';
import React from 'react';

const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider
          theme={theme}
          withGlobalStyles
          withNormalizeCSS
          defaultColorScheme="auto"
        >
          <Notifications />
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </MantineProvider>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
);
