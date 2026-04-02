/**
 * Unit conversion helpers — keeps display formatting consistent across screens
 * while storing body/hydration values in canonical metric units.
 */
import type { MeasurementSystem } from '@/types/database';

const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 0.3937007874;
const ML_PER_FL_OZ = 29.5735295625;

export function formatWeightFromKg(
  weightKg: number | null | undefined,
  system: MeasurementSystem,
  options?: { decimals?: number; withUnit?: boolean }
): string {
  if (weightKg == null) return '--';
  const decimals = options?.decimals ?? 0;
  const withUnit = options?.withUnit ?? true;
  if (system === 'imperial') {
    const lbs = weightKg * KG_TO_LB;
    return `${lbs.toFixed(decimals)}${withUnit ? ' lbs' : ''}`;
  }
  return `${weightKg.toFixed(decimals)}${withUnit ? ' kg' : ''}`;
}

export function formatHeightFromCm(
  heightCm: number | null | undefined,
  system: MeasurementSystem
): string {
  if (heightCm == null) return '--';
  if (system === 'imperial') {
    const totalInches = Math.round(heightCm * CM_TO_IN);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  }
  const meters = heightCm / 100;
  return `${meters.toFixed(2)} m`;
}

export function formatHydrationFromMl(
  hydrationMl: number | null | undefined,
  system: MeasurementSystem
): string {
  if (hydrationMl == null) {
    return system === 'imperial' ? '101 fl oz' : '3.0 L';
  }
  if (system === 'imperial') {
    const flOz = hydrationMl / ML_PER_FL_OZ;
    return `${Math.round(flOz)} fl oz`;
  }
  return `${(hydrationMl / 1000).toFixed(1)} L`;
}
