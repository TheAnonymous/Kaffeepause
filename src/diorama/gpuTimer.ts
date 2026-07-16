interface DisjointTimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

type TimerContext = WebGL2RenderingContext;

/** Non-blocking GPU timer. Results are consumed only after WebGL marks them available. */
export class GpuFrameTimer {
  private extension?: DisjointTimerQueryExtension;
  private active?: WebGLQuery;
  private readonly pending: WebGLQuery[] = [];

  constructor(private readonly gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.extension = this.loadExtension();
  }

  get supported(): boolean { return this.extension !== undefined; }

  begin(): void {
    const gl = this.webgl2();
    if (!this.extension || this.active || !gl) return;
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    const gl = this.webgl2();
    if (!this.extension || !this.active || !gl) return;
    gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = undefined;
  }

  poll(): number | undefined {
    const gl = this.webgl2();
    if (!this.extension || !gl) return undefined;
    let latest: number | undefined;
    while (this.pending.length > 0) {
      const query = this.pending[0];
      if (!query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = Boolean(gl.getParameter(this.extension.GPU_DISJOINT_EXT));
      const nanoseconds = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
      gl.deleteQuery(query);
      if (!disjoint && Number.isFinite(nanoseconds) && nanoseconds >= 0) latest = nanoseconds / 1_000_000;
    }
    return latest;
  }

  reset(): void {
    const gl = this.webgl2();
    if (gl) {
      if (this.active) gl.deleteQuery(this.active);
      for (const query of this.pending) gl.deleteQuery(query);
    }
    this.active = undefined;
    this.pending.length = 0;
    this.extension = this.loadExtension();
  }

  dispose(): void { this.reset(); }

  private webgl2(): TimerContext | undefined {
    return 'createQuery' in this.gl && typeof this.gl.createQuery === 'function'
      ? this.gl as TimerContext
      : undefined;
  }

  private loadExtension(): DisjointTimerQueryExtension | undefined {
    const gl = this.webgl2();
    if (!gl) return undefined;
    return gl.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerQueryExtension | null ?? undefined;
  }
}
