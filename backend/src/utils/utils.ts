// src/utils.ts

/**
 * Delays execution for a specified number of milliseconds.
 * @param m - s The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
