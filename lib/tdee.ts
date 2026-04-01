type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type GoalType = 'lose' | 'maintain' | 'gain';
type Sex = 'male' | 'female';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateBMR(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
}): number {
  // Mifflin-St Jeor Equation
  const base = 10 * params.weightKg + 6.25 * params.heightCm - 5 * params.ageYears;
  return params.sex === 'male' ? base + 5 : base - 161;
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateDailyCalories(tdee: number, goalType: GoalType): number {
  switch (goalType) {
    case 'lose':
      return Math.round(tdee * 0.8); // 20% deficit
    case 'gain':
      return Math.round(tdee * 1.15); // 15% surplus
    case 'maintain':
    default:
      return tdee;
  }
}

export function calculateMacros(
  dailyCalories: number,
  goalType: GoalType,
  weightKg: number
): { proteinG: number; carbsG: number; fatG: number } {
  let proteinPerKg: number;
  let fatPercent: number;

  switch (goalType) {
    case 'lose':
      proteinPerKg = 2.2; // higher protein to preserve muscle
      fatPercent = 0.25;
      break;
    case 'gain':
      proteinPerKg = 1.8;
      fatPercent = 0.25;
      break;
    case 'maintain':
    default:
      proteinPerKg = 1.6;
      fatPercent = 0.3;
      break;
  }

  const proteinG = Math.round(weightKg * proteinPerKg);
  const fatG = Math.round((dailyCalories * fatPercent) / 9);
  const carbsG = Math.round((dailyCalories - proteinG * 4 - fatG * 9) / 4);

  return { proteinG, carbsG: Math.max(carbsG, 50), fatG };
}
