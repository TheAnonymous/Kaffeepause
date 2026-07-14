// Public compatibility boundary. The old monolithic Canvas renderer has been
// replaced by a physical WebGL diorama while application and simulation APIs stay stable.
export { DioramaRenderer as CafeRenderer, RENDER_SCALE } from './diorama/DioramaRenderer';
