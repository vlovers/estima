import { IconSun, IconMoon } from '@tabler/icons-react';
import {
  ActionIcon,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';

export function ThemeSwitcher() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const label =
    scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <Tooltip label={label}>
      <ActionIcon
        onClick={() => setColorScheme(scheme === 'light' ? 'dark' : 'light')}
        variant="subtle"
        color="gray"
        size="lg"
        aria-label={label}
      >
        {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}
