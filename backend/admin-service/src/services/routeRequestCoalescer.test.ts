import { AsyncRequestCoalescer } from './routeRequestCoalescer';

describe('AsyncRequestCoalescer', () => {
  it('shares one in-flight provider request for concurrent identical keys', async () => {
    const coalescer = new AsyncRequestCoalescer<string>();
    let calls = 0;
    let resolve!: (value: string) => void;
    const providerRequest = () => {
      calls += 1;
      return new Promise<string>((complete) => {
        resolve = complete;
      });
    };

    const first = coalescer.run('same-route', providerRequest);
    const second = coalescer.run('same-route', providerRequest);
    expect(calls).toBe(0);

    await Promise.resolve();
    expect(calls).toBe(1);
    resolve('route-snapshot');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'route-snapshot',
      'route-snapshot',
    ]);
    expect(calls).toBe(1);
  });

  it('removes a rejected request so the next request can retry', async () => {
    const coalescer = new AsyncRequestCoalescer<string>();
    let calls = 0;
    const providerRequest = async () => {
      calls += 1;
      if (calls === 1) throw new Error('provider unavailable');
      return 'recovered';
    };

    await expect(coalescer.run('same-route', providerRequest)).rejects.toThrow('provider unavailable');
    await expect(coalescer.run('same-route', providerRequest)).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });
});
