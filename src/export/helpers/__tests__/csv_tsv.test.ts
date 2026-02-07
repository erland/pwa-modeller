import { tabularToCsv } from '../csv';
import { tabularToTsv } from '../tsv';
import type { TabularData } from '../../contracts/ExportBundle';

describe('export helpers: CSV/TSV', () => {
  describe('tabularToCsv', () => {
    it('renders headers and rows, turning null/undefined into empty cells', () => {
      const data: TabularData = {
        headers: ['A', 'B', 'C'],
        rows: [
          ['x', null, undefined],
          [1, 2, 3]
        ]
      };

      expect(tabularToCsv(data)).toBe(['A,B,C', 'x,,', '1,2,3'].join('\n'));
    });

    it('quotes cells with commas and escapes quotes by doubling them', () => {
      const data: TabularData = {
        headers: ['h'],
        rows: [[',', 'He said "Hi"']]
      };

      // Note: rows can be longer than headers in practice; helper just joins.
      expect(tabularToCsv(data)).toBe(['h', '",","He said ""Hi"""'].join('\n'));
    });

    it('normalizes newlines to spaces and still quotes when original had a newline', () => {
      const data: TabularData = {
        headers: ['h'],
        rows: [['a\n b', 'c\r\nd']]
      };

      // newline => replaced with space, but quoting remains because the original matched /[\r\n]/
      expect(tabularToCsv(data)).toBe(['h', '"a  b","c d"'].join('\n'));
    });
  });

  describe('tabularToTsv', () => {
    it('renders headers/rows, turns null/undefined into empty cells, and uses tabs', () => {
      const data: TabularData = {
        headers: ['A', 'B'],
        rows: [[null, undefined], ['x', 1]]
      };

      expect(tabularToTsv(data)).toBe(['A\tB', '\t', 'x\t1'].join('\n'));
    });

    it('replaces tabs and newlines with spaces (no quoting)', () => {
      const data: TabularData = {
        headers: ['H'],
        rows: [['a\tb', 'c\n d', 'e\r\nf']]
      };

      expect(tabularToTsv(data)).toBe(['H', 'a b\tc  d\te f'].join('\n'));
    });
  });
});
