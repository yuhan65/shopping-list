/**
 * Meal-plan generation store keeps real progress state shared between screens.
 */
import { create } from 'zustand';

export type MealPlanGenerationPhase =
  | 'idle'
  | 'reading_profile'
  | 'matching_preferences'
  | 'generating_weekly_meals'
  | 'saving_plan'
  | 'done'
  | 'failed';

interface MealPlanGenerationState {
  phase: MealPlanGenerationPhase;
  isRunning: boolean;
  errorMessage: string | null;
  startGeneration: () => void;
  setPhase: (phase: Exclude<MealPlanGenerationPhase, 'idle' | 'done' | 'failed'>) => void;
  completeGeneration: () => void;
  failGeneration: (message: string) => void;
  resetGeneration: () => void;
}

export const useMealPlanGenerationStore = create<MealPlanGenerationState>((set) => ({
  phase: 'idle',
  isRunning: false,
  errorMessage: null,
  startGeneration: () =>
    set({
      phase: 'reading_profile',
      isRunning: true,
      errorMessage: null,
    }),
  setPhase: (phase) =>
    set((state) => ({
      phase,
      isRunning: state.isRunning,
      errorMessage: state.errorMessage,
    })),
  completeGeneration: () =>
    set({
      phase: 'done',
      isRunning: false,
      errorMessage: null,
    }),
  failGeneration: (message) =>
    set({
      phase: 'failed',
      isRunning: false,
      errorMessage: message || 'Something went wrong while generating your meal plan.',
    }),
  resetGeneration: () =>
    set({
      phase: 'idle',
      isRunning: false,
      errorMessage: null,
    }),
}));
