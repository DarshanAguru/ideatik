import React, { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Text,
} from 'react-native';
import { X, Filter, Search } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../theme/theme';
import { SearchFilters } from '../services/search/SearchService';
import { Tag as TagType } from '../services/database/tagTypes';

interface FilterBarProps {
  themeMode: 'light' | 'dark';
  onFiltersChange: (filters: SearchFilters) => void;
  tags: TagType[];
}

/**
 * Filter bar for search/filtering with multiple criteria
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  themeMode,
  onFiltersChange,
  tags,
}) => {
  const colors = COLORS[themeMode];
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<'note' | 'list' | 'finance' | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'alphabetical'>('recent');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Compute dateFrom from dateRange selection
  const getDateFrom = (range: typeof dateRange): number | undefined => {
    const now = Date.now();
    if (range === 'today') return new Date().setHours(0, 0, 0, 0);
    if (range === 'week') return now - 7 * 24 * 60 * 60 * 1000;
    if (range === 'month') return now - 30 * 24 * 60 * 60 * 1000;
    return undefined;
  };

  // Live search: fires immediately as user types
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    const filters: SearchFilters = {};
    if (text) filters.query = text;
    if (selectedTags.length > 0) filters.tags = selectedTags;
    if (selectedType) filters.type = selectedType;
    filters.sortBy = sortBy;
    const df = getDateFrom(dateRange);
    if (df !== undefined) filters.dateFrom = df;
    onFiltersChange(filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags, selectedType, sortBy, dateRange]);

  const handleApplyFilters = () => {
    const filters: SearchFilters = {};
    if (query) filters.query = query;
    if (selectedTags.length > 0) filters.tags = selectedTags;
    if (selectedType) filters.type = selectedType;
    filters.sortBy = sortBy;
    const df = getDateFrom(dateRange);
    if (df !== undefined) filters.dateFrom = df;
    onFiltersChange(filters);
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    setQuery('');
    setSelectedTags([]);
    setSelectedType(null);
    setSortBy('recent');
    setDateRange('all');
    onFiltersChange({});
  };

  const hasActiveFilters = query || selectedTags.length > 0 || selectedType || dateRange !== 'all';

  return (
    <>
      {/* Search Input */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.md,
          gap: SPACING.sm,
        }}
      >
        <View style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: RADIUS.sm,
          paddingHorizontal: SPACING.md,
        }}>
          <Search size={15} color={colors.muted} style={{ marginRight: SPACING.xs }} />
          <TextInput
            style={{
              flex: 1,
              paddingVertical: SPACING.sm,
              color: colors.foreground,
              fontSize: TYPOGRAPHY.sizes.sm,
            }}
            placeholder="Search notes..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={handleQueryChange}
          />
          {query ? (
            <TouchableOpacity onPress={() => handleQueryChange('')}>
              <X size={14} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          style={{
            padding: SPACING.sm,
            backgroundColor: hasActiveFilters ? colors.foreground : colors.surface,
            borderRadius: 8,
          }}
        >
          <Filter
            size={20}
            color={hasActiveFilters ? colors.background : colors.foreground}
          />
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal visible={showFilters} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: SPACING.lg,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: SPACING.lg,
              paddingBottom: SPACING.lg,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: TYPOGRAPHY.sizes.lg,
                fontWeight: TYPOGRAPHY.weights.bold,
                color: colors.foreground,
              }}
            >
              Filters
            </Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <X size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg }}
          >
            {/* Type Filter */}
            <View style={{ marginBottom: SPACING.lg }}>
              <Text
                style={{
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  color: colors.foreground,
                  marginBottom: SPACING.sm,
                }}
              >
                Type
              </Text>
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                {['note', 'list', 'finance'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() =>
                      setSelectedType(selectedType === type ? null : (type as any))
                    }
                    style={{
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                      borderRadius: 8,
                      backgroundColor:
                        selectedType === type ? colors.foreground : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          selectedType === type ? colors.background : colors.foreground,
                        fontSize: TYPOGRAPHY.sizes.xs,
                        fontWeight: TYPOGRAPHY.weights.bold,
                      }}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tag Filter */}
            {tags.length > 0 && (
              <View style={{ marginBottom: SPACING.lg }}>
                <Text
                  style={{
                    fontSize: TYPOGRAPHY.sizes.sm,
                    fontWeight: TYPOGRAPHY.weights.bold,
                    color: colors.foreground,
                    marginBottom: SPACING.sm,
                  }}
                >
                  Tags
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                  {tags.map((tag) => (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => {
                        setSelectedTags(
                          selectedTags.includes(tag.id)
                            ? selectedTags.filter((t) => t !== tag.id)
                            : [...selectedTags, tag.id]
                        );
                      }}
                      style={{
                        paddingHorizontal: SPACING.md,
                        paddingVertical: SPACING.sm,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: tag.color,
                        backgroundColor: selectedTags.includes(tag.id)
                          ? tag.color + '30'
                          : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          color: tag.color,
                          fontSize: TYPOGRAPHY.sizes.xs,
                          fontWeight: TYPOGRAPHY.weights.bold,
                        }}
                      >
                        {tag.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Date Range Filter */}
            <View style={{ marginBottom: SPACING.lg }}>
              <Text
                style={{
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  color: colors.foreground,
                  marginBottom: SPACING.sm,
                }}
              >
                Date Range
              </Text>
              <View style={{ flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' }}>
                {(['all', 'today', 'week', 'month'] as const).map((range) => (
                  <TouchableOpacity
                    key={range}
                    onPress={() => setDateRange(range)}
                    style={{
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                      borderRadius: 8,
                      backgroundColor:
                        dateRange === range ? colors.foreground : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        color: dateRange === range ? colors.background : colors.foreground,
                        fontSize: TYPOGRAPHY.sizes.xs,
                        fontWeight: TYPOGRAPHY.weights.bold,
                      }}
                    >
                      {range === 'all' ? 'All Time' : range === 'today' ? 'Today' : range === 'week' ? 'This Week' : 'This Month'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Sort By */}
            <View style={{ marginBottom: SPACING.lg }}>
              <Text
                style={{
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  color: colors.foreground,
                  marginBottom: SPACING.sm,
                }}
              >
                Sort By
              </Text>
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                {['recent', 'oldest', 'alphabetical'].map((sort) => (
                  <TouchableOpacity
                    key={sort}
                    onPress={() => setSortBy(sort as any)}
                    style={{
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                      borderRadius: 8,
                      backgroundColor:
                        sortBy === sort ? colors.foreground : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        color: sortBy === sort ? colors.background : colors.foreground,
                        fontSize: TYPOGRAPHY.sizes.xs,
                        fontWeight: TYPOGRAPHY.weights.bold,
                      }}
                    >
                      {sort.charAt(0).toUpperCase() + sort.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View
            style={{
              flexDirection: 'row',
              gap: SPACING.md,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={handleClearFilters}
              style={{
                flex: 1,
                paddingVertical: SPACING.md,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  textAlign: 'center',
                }}
              >
                Clear
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleApplyFilters}
              style={{
                flex: 1,
                paddingVertical: SPACING.md,
                borderRadius: 8,
                backgroundColor: colors.foreground,
              }}
            >
              <Text
                style={{
                  color: colors.background,
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  textAlign: 'center',
                }}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};
