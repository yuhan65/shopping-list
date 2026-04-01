/**
 * Icon wrapper around react-native-heroicons.
 * Maps simple string names to Heroicon components so we can use
 * <Icon name="plus" size={24} color="red" /> anywhere in the app.
 */
import React from 'react';
import { View } from 'react-native';
import {
  PlusIcon,
  PlusCircleIcon,
  ArrowLeftIcon,
  BoltIcon,
  CalendarDaysIcon,
  CameraIcon,
  ChevronRightIcon,
  XMarkIcon,
  XCircleIcon,
  PencilSquareIcon,
  CubeIcon,
  FireIcon,
  PhotoIcon,
  HeartIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ScaleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  ClockIcon,
  TrashIcon,
} from 'react-native-heroicons/outline';
import {
  CheckCircleIcon,
  ShoppingCartIcon,
} from 'react-native-heroicons/solid';

const iconMap = {
  'plus': PlusIcon,
  'plus-circle': PlusCircleIcon,
  'arrow-left': ArrowLeftIcon,
  'bolt': BoltIcon,
  'calendar': CalendarDaysIcon,
  'camera': CameraIcon,
  'shopping-cart': ShoppingCartIcon,
  'check-circle': CheckCircleIcon,
  'chevron-right': ChevronRightIcon,
  'x-mark': XMarkIcon,
  'x-circle': XCircleIcon,
  'pencil-square': PencilSquareIcon,
  'cube': CubeIcon,
  'fire': FireIcon,
  'photo': PhotoIcon,
  'heart': HeartIcon,
  'users': UserGroupIcon,
  'arrow-path': ArrowPathIcon,
  'scale': ScaleIcon,
  'magnifying-glass': MagnifyingGlassIcon,
  'sparkles': SparklesIcon,
  'clock': ClockIcon,
  'trash': TrashIcon,
} as const;

export type IconName = keyof typeof iconMap;

interface IconProps {
  name: IconName | 'circle';
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color = '#000' }: IconProps) {
  // "circle" renders a simple outlined circle (used for unchecked items)
  if (name === 'circle') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
    );
  }

  const IconComponent = iconMap[name];
  if (!IconComponent) return null;
  return <IconComponent size={size} color={color} />;
}
