import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'local-data-store';

type TableData = Record<string, unknown>[];

interface LocalDataState {
  tables: Record<string, TableData>;
  _hydrated: boolean;
  hydrate: () => Promise<void>;
  insert: (table: string, row: Record<string, unknown>) => void;
  upsert: (table: string, row: Record<string, unknown>, matchKey?: string) => void;
  update: (table: string, id: string, values: Record<string, unknown>) => void;
  remove: (table: string, id: string) => void;
  query: (table: string, filter?: Record<string, unknown>) => TableData;
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function persistTables(tables: Record<string, TableData>) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tables)).catch(() => {});
}

export const useLocalDataStore = create<LocalDataState>((set, get) => ({
  tables: {},
  _hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        set({ tables: JSON.parse(raw), _hydrated: true });
        return;
      }
    } catch {}
    set({ _hydrated: true });
  },

  insert: (table, row) =>
    set((state) => {
      const existing = state.tables[table] ?? [];
      const newRow = { ...row, id: row.id ?? generateId(), created_at: new Date().toISOString() };
      const tables = { ...state.tables, [table]: [...existing, newRow] };
      persistTables(tables);
      return { tables };
    }),

  upsert: (table, row, matchKey = 'user_id') =>
    set((state) => {
      const existing = state.tables[table] ?? [];
      const idx = existing.findIndex((r) => r[matchKey] === row[matchKey]);
      const updated = [...existing];
      const newRow = { ...row, id: row.id ?? generateId(), updated_at: new Date().toISOString() };
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], ...newRow };
      } else {
        updated.push({ ...newRow, created_at: new Date().toISOString() });
      }
      const tables = { ...state.tables, [table]: updated };
      persistTables(tables);
      return { tables };
    }),

  update: (table, id, values) =>
    set((state) => {
      const existing = state.tables[table] ?? [];
      const tables = {
        ...state.tables,
        [table]: existing.map((r) =>
          r.id === id ? { ...r, ...values, updated_at: new Date().toISOString() } : r
        ),
      };
      persistTables(tables);
      return { tables };
    }),

  remove: (table, id) =>
    set((state) => {
      const existing = state.tables[table] ?? [];
      const tables = { ...state.tables, [table]: existing.filter((r) => r.id !== id) };
      persistTables(tables);
      return { tables };
    }),

  query: (table, filter) => {
    const rows = get().tables[table] ?? [];
    if (!filter) return rows;
    return rows.filter((row) =>
      Object.entries(filter).every(([key, val]) => val === undefined || row[key] === val)
    );
  },
}));
