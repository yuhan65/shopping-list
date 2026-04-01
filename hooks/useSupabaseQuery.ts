import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';

/**
 * Parses Supabase-style join patterns from a select string like '*, recipe:recipes(*)'.
 * Returns an array of { alias, table, foreignKey } objects so we can manually
 * attach related rows in demo mode (where there's no real database to do joins).
 */
function parseJoins(select?: string): { alias: string; table: string; foreignKey: string }[] {
  if (!select) return [];
  const joinPattern = /(\w+):(\w+)\(\*\)/g;
  const joins: { alias: string; table: string; foreignKey: string }[] = [];
  let match;
  while ((match = joinPattern.exec(select)) !== null) {
    joins.push({
      alias: match[1],         // e.g. "recipe"
      table: match[2],         // e.g. "recipes"
      foreignKey: match[1] + '_id',  // e.g. "recipe_id"
    });
  }
  return joins;
}

export function useSupabaseQuery<T>(
  key: string[],
  tableName: string,
  options?: {
    select?: string;
    filter?: Record<string, unknown>;
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
    enabled?: boolean;
    staleTime?: number;
  }
) {
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localQuery = useLocalDataStore((s) => s.query);

  return useQuery<T[]>({
    queryKey: [...key, user?.id],
    ...(options?.staleTime !== undefined && { staleTime: options.staleTime }),
    queryFn: async () => {
      if (isDemoMode) {
        let results = localQuery(tableName, options?.filter) as T[];

        // Manually attach joined/related data (e.g. recipe:recipes(*))
        const joins = parseJoins(options?.select);
        if (joins.length > 0) {
          results = results.map((row: any) => {
            const enriched = { ...row };
            for (const join of joins) {
              const foreignId = row[join.foreignKey];
              if (foreignId) {
                const related = localQuery(join.table, { id: foreignId });
                enriched[join.alias] = related[0] ?? null;
              }
            }
            return enriched;
          }) as T[];
        }

        if (options?.orderBy) {
          const col = options.orderBy.column;
          const asc = options.orderBy.ascending ?? true;
          results = [...results].sort((a: any, b: any) => {
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
            return 0;
          });
        }
        if (options?.limit) {
          results = results.slice(0, options.limit);
        }
        return results;
      }

      let query = supabase
        .from(tableName)
        .select(options?.select ?? '*');

      if (options?.filter) {
        Object.entries(options.filter).forEach(([col, val]) => {
          query = query.eq(col, val);
        });
      }

      if (options?.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending ?? true,
        });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as T[]) ?? [];
    },
    enabled: (options?.enabled ?? true) && !!user,
  });
}

export function useSupabaseInsert<T extends Record<string, unknown>>(
  tableName: string,
  invalidateKeys: string[][]
) {
  const queryClient = useQueryClient();
  const isDemoMode = useAuthStore.getState().isDemoMode;
  const localInsert = useLocalDataStore.getState().insert;

  return useMutation({
    mutationFn: async (values: T) => {
      if (isDemoMode) {
        const row = { ...values, id: Math.random().toString(36).slice(2) + Date.now().toString(36) };
        localInsert(tableName, row);
        return row;
      }
      const { data, error } = await supabase
        .from(tableName)
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useSupabaseUpdate<T extends Record<string, unknown>>(
  tableName: string,
  invalidateKeys: string[][]
) {
  const queryClient = useQueryClient();
  const isDemoMode = useAuthStore.getState().isDemoMode;
  const localUpdate = useLocalDataStore.getState().update;

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<T> }) => {
      if (isDemoMode) {
        localUpdate(tableName, id, values as Record<string, unknown>);
        return { id, ...values };
      }
      const { data, error } = await supabase
        .from(tableName)
        .update(values)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useSupabaseDelete(
  tableName: string,
  invalidateKeys: string[][]
) {
  const queryClient = useQueryClient();
  const isDemoMode = useAuthStore.getState().isDemoMode;
  const localRemove = useLocalDataStore.getState().remove;

  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        localRemove(tableName, id);
        return;
      }
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}
