import { TextInput, MultiSelect, Group } from '@mantine/core';

interface TaskFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  tagsFilter: string[];
  setTagsFilter: (tags: string[]) => void;
  allTags: string[];
}

export function TaskFilters({
  searchQuery,
  setSearchQuery,
  tagsFilter,
  setTagsFilter,
  allTags,
}: TaskFiltersProps) {
  return (
    <Group>
      <TextInput
        placeholder="Search tasks..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        style={{ flex: 1 }}
      />
      <MultiSelect
        data={allTags}
        value={tagsFilter}
        onChange={setTagsFilter}
        placeholder="Filter by tags"
        clearable
      />
    </Group>
  );
}
