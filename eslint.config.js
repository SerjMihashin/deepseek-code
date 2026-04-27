// @ts-check
import neostandard from 'neostandard';

export default neostandard({
  ts: true,
  ignores: [
    'dist/',
    'node_modules/',
    '.github/',
    '.husky/',
    '*.test.ts',
  ],
});
