import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Hall } from "@/lib/db";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const rotateHallsFromRandomStart = (halls: Hall[]) => {
  if (halls.length === 0) return [];

  const startIndex = Math.floor(Math.random() * halls.length);

  return [
    ...halls.slice(startIndex),
    ...halls.slice(0, startIndex),
  ];
};
