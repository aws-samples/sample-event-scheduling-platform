/**
 * Defines project root paths and utility functions for path creation.
 */

import * as path from 'path';

/** The root directory of the utility files */
export const UTILS_ROOT = __dirname;

/** The root directory of the entire project */
export const PROJECT_ROOT = path.resolve(UTILS_ROOT, '..', '..', '..');

/** The directory containing state machine definitions */
export const STATE_MACHINES_ROOT = path.join(PROJECT_ROOT, 'cdk', 'state-machines');

/** The directory containing Lambda function source code */
export const FUNCTIONS_ROOT = path.join(PROJECT_ROOT, 'backend', 'src', 'functions');

/**
 * Creates a path relative to the project root.
 * @param segment - s Path segments to append to the project root.
 * @returns The full path.
 */
export function createPath(...segments: string[]): string {
  return path.join(PROJECT_ROOT, ...segments);
}
