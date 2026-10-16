import { Button, Card, Drawer, Modal, createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 7, dark: 7 },
  colors: {
    brand: [
      '#ecfdf7',
      '#d0f4e7',
      '#a2e7d1',
      '#6dd6b7',
      '#3abe99',
      '#18a682',
      '#07876b',
      '#06735c',
      '#075c4b',
      '#064c3e',
    ],
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '0.9375rem',
    lg: '1.0625rem',
    xl: '1.25rem',
  },
  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.2' },
      h2: { fontSize: '1.5rem', lineHeight: '1.3' },
      h3: { fontSize: '1.125rem', lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  components: {
    Button: Button.extend({ defaultProps: { size: 'sm', fw: 600 } }),
    Card: Card.extend({
      defaultProps: { withBorder: true, radius: 'lg', shadow: 'none' },
    }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.4, blur: 2 },
        padding: 'xl',
        radius: 'lg',
      },
    }),
    Drawer: Drawer.extend({
      defaultProps: { padding: 'xl', overlayProps: { backgroundOpacity: 0.4 } },
    }),
  },
});

export const cssVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': 'var(--ui-canvas)',
    '--mantine-color-text': 'var(--ui-text)',
    '--mantine-color-dimmed': 'var(--ui-muted)',
  },
  dark: {
    '--mantine-color-body': 'var(--ui-canvas)',
    '--mantine-color-text': 'var(--ui-text)',
    '--mantine-color-dimmed': 'var(--ui-muted)',
  },
});
