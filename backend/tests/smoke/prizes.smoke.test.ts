import { PrizeService } from '@/modules/prizes';

describe('PrizeService smoke', () => {
  it('exposes read/list endpoints', () => {
    expect(typeof PrizeService.getNearbyPrizes).toBe('function');
    expect(typeof PrizeService.searchPrizes).toBe('function');
    expect(typeof PrizeService.getPrizeDetails).toBe('function');
  });
});
