import { AuthService } from '@/modules/auth';

describe('AuthService smoke', () => {
  it('exposes current auth entrypoints', () => {
    expect(typeof AuthService.guestLogin).toBe('function');
    expect(typeof AuthService.emailRegister).toBe('function');
  });
});
