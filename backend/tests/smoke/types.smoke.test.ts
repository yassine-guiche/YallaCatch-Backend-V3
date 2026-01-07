import { PrizeCategory, RewardCategory } from '@/types';

describe('Enums smoke', () => {
  it('has prize categories aligned with current schema', () => {
    expect(Object.values(PrizeCategory)).toEqual(
      expect.arrayContaining(['shopping', 'food', 'entertainment'])
    );
  });

  it('has reward categories aligned with current schema', () => {
    expect(Object.values(RewardCategory)).toEqual(
      expect.arrayContaining(['voucher', 'gift_card', 'physical'])
    );
  });
});
