// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { matchRoute, type Route } from '../../../src/client/router.ts';

const page = () => Promise.resolve(() => null);
const table: Route[] = [
  { path: '/cases/start', page },
  { path: '/cases/:id', page },
  { path: '/cases/:id/tasks/:taskId', page },
  { path: '/', page },
];

describe('matchRoute', () => {
  it('matches fixed paths before parameters, in table order', () => {
    expect(matchRoute(table, '/cases/start')?.route.path).toBe('/cases/start');
  });

  it('reads path parameters', () => {
    const match = matchRoute(table, '/cases/2b1c-9f/tasks/t_1/');
    expect(match?.route.path).toBe('/cases/:id/tasks/:taskId');
    expect(match?.params).toEqual({ id: '2b1c-9f', taskId: 't_1' });
  });

  it.each(['/cases/a%2Fb', '/cases/..', '/cases/<x>', '/cases/a/b'])('refuses %s', (path) => {
    expect(matchRoute(table, path)?.route.path).not.toBe('/cases/:id');
  });

  it('matches the root', () => {
    expect(matchRoute(table, '/')?.route.path).toBe('/');
  });
});

describe('popstate', () => {
  it('re-renders on back and forward, but not when only the hash changes (skip link)', async () => {
    const { startRouter } = await import('../../../src/client/router.ts');
    let renders = 0;
    const counted = () =>
      Promise.resolve(() => {
        renders += 1;
        return null;
      });
    window.history.replaceState(null, '', '/');
    startRouter(document.createElement('div'), [{ path: '/', page: counted }], counted);
    await new Promise((r) => setTimeout(r, 0));
    expect(renders).toBe(1);

    window.history.pushState(null, '', '/#main');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 0));
    expect(renders).toBe(1);

    window.history.pushState(null, '', '/other');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 0));
    expect(renders).toBe(2);
  });
});
