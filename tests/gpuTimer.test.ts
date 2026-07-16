import { describe, expect, it } from 'vitest';
import { GpuFrameTimer } from '../src/diorama/gpuTimer';

describe('nichtblockierende GPU-Zeitmessung', () => {
  it('fällt ohne EXT_disjoint_timer_query_webgl2 ohne Fehler auf CPU-/Frame-Metriken zurück', () => {
    const context = {
      getExtension: () => null,
    } as unknown as WebGLRenderingContext;
    const timer = new GpuFrameTimer(context);
    expect(timer.supported).toBe(false);
    expect(timer.begin()).toBeUndefined();
    expect(timer.end()).toBeUndefined();
    expect(timer.poll()).toBeUndefined();
  });

  it('liest Query-Ergebnisse erst nach QUERY_RESULT_AVAILABLE und verwirft disjoint Ergebnisse', () => {
    let available = false;
    let disjoint = false;
    const query = {} as WebGLQuery;
    const context = {
      QUERY_RESULT_AVAILABLE: 1,
      QUERY_RESULT: 2,
      getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
      createQuery: () => query,
      beginQuery: () => undefined,
      endQuery: () => undefined,
      deleteQuery: () => undefined,
      getQueryParameter: (_query: WebGLQuery, key: number) => key === 1 ? available : 8_000_000,
      getParameter: () => disjoint,
    } as unknown as WebGL2RenderingContext;
    const timer = new GpuFrameTimer(context);
    timer.begin();
    timer.end();
    expect(timer.poll()).toBeUndefined();
    available = true;
    expect(timer.poll()).toBe(8);
    timer.begin();
    timer.end();
    disjoint = true;
    expect(timer.poll()).toBeUndefined();
  });
});
