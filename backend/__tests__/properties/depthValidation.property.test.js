// Feature: enhanced-family-tree, Property 2: Depth parameter validation
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateDepth } from '../../utils/validateDepth.js';

describe('Property 2: Depth parameter validation', () => {
  // **Validates: Requirements 1.2, 1.4**

  it('accepts all integer values between 1 and 10 inclusive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (depth) => {
          const result = validateDepth(depth);
          expect(result.valid).toBe(true);
          expect(result.depth).toBe(depth);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects all integer values outside the 1-10 range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }).filter((n) => n < 1 || n > 10),
        (depth) => {
          const result = validateDepth(depth);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Depth must be an integer between 1 and 10');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any integer in -100 to 100, accepts iff value is between 1 and 10', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        (depth) => {
          const result = validateDepth(depth);
          const shouldBeValid = depth >= 1 && depth <= 10;

          expect(result.valid).toBe(shouldBeValid);

          if (shouldBeValid) {
            expect(result.depth).toBe(depth);
          } else {
            expect(result.error).toBe('Depth must be an integer between 1 and 10');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects values that parseInt cannot parse to a valid integer', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('abc'),
          fc.constant(''),
          fc.constant('NaN'),
          fc.constant('null'),
          fc.constant('undefined'),
          fc.constant('true'),
          fc.constant('foo123')
        ),
        (value) => {
          const result = validateDepth(value);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Depth must be an integer between 1 and 10');
        }
      ),
      { numRuns: 100 }
    );
  });
});
