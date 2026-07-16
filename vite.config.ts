import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function sourcePropertyContracts(directory: string): string[] {
  const identifiers = new Set<string>();
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(target, 'utf8');
        for (const match of source.matchAll(/\.\s*([A-Za-z_$][\w$]*)/g)) if (match[1]) identifiers.add(match[1]);
        for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)) if (match[1]) identifiers.add(match[1]);
        for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:class|function|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/g)) {
          if (match[1]) identifiers.add(match[1]);
        }
      }
    }
  };
  visit(directory);
  return [...identifiers];
}

const reservedApplicationProperties = sourcePropertyContracts('src');

const THREE_SHADER_ROOT = resolve('node_modules/three/src/renderers/shaders');
const DISABLED_SHADER_FEATURES = new Set([
  'alphahash_fragment', 'alphahash_pars_fragment',
  'alphamap_fragment', 'alphamap_pars_fragment',
  'aomap_fragment', 'aomap_pars_fragment',
  'batching_pars_vertex', 'batching_vertex',
  'clearcoat_normal_fragment_begin', 'clearcoat_normal_fragment_maps', 'clearcoat_pars_fragment',
  'clipping_planes_fragment', 'clipping_planes_pars_fragment', 'clipping_planes_pars_vertex', 'clipping_planes_vertex',
  'cube_uv_reflection_fragment',
  'displacementmap_pars_vertex', 'displacementmap_vertex',
  'envmap_fragment', 'envmap_common_pars_fragment', 'envmap_pars_fragment', 'envmap_pars_vertex',
  'envmap_physical_pars_fragment', 'envmap_vertex',
  'iridescence_fragment', 'iridescence_pars_fragment',
  'lightmap_pars_fragment',
  'logdepthbuf_fragment', 'logdepthbuf_pars_fragment', 'logdepthbuf_pars_vertex', 'logdepthbuf_vertex',
  'morphinstance_vertex', 'morphcolor_vertex', 'morphnormal_vertex', 'morphtarget_pars_vertex', 'morphtarget_vertex',
  'normalmap_pars_fragment',
  'skinbase_vertex', 'skinning_pars_vertex', 'skinning_vertex', 'skinnormal_vertex',
  'specularmap_fragment', 'specularmap_pars_fragment',
  'transmission_fragment', 'transmission_pars_fragment',
]);

const DISABLED_SHADER_DEFINES = new Set([
  'USE_ALPHAMAP', 'USE_ALPHAHASH', 'USE_AOMAP', 'USE_BATCHING', 'USE_CLEARCOAT',
  'USE_DISPLACEMENTMAP', 'USE_ENVMAP', 'USE_IRIDESCENCE', 'USE_LIGHTMAP', 'USE_LOGDEPTHBUF',
  'USE_MORPHCOLORS', 'USE_MORPHNORMALS', 'USE_MORPHTARGETS',
  'USE_NORMALMAP', 'USE_SHEEN', 'USE_SKINNING', 'USE_SPECULARMAP', 'USE_TRANSMISSION',
  'USE_ANISOTROPY',
]);

function stripDisabledShaderBranches(source: string): string {
  interface Branch { readonly parentDropped: boolean; readonly targeted: boolean; dropped: boolean }
  const branches: Branch[] = [];
  const output: string[] = [];
  const isDropped = (): boolean => branches.at(-1)?.dropped ?? false;
  for (const line of source.split('\n')) {
    const directive = line.match(/^\s*#(ifdef|ifndef|if)\s+(.+)$/);
    if (directive) {
      const parentDropped = isDropped();
      const kind = directive[1];
      const condition = directive[2] ?? '';
      const directMacro = condition.trim();
      const definedMacros = [...condition.matchAll(/defined\s*\(\s*(\w+)\s*\)/g)].map((match) => match[1] ?? '');
      const disabled = kind === 'ifdef'
        ? DISABLED_SHADER_DEFINES.has(directMacro)
        : kind === 'ifndef'
          ? false
          : condition.includes('NUM_RECT_AREA_LIGHTS') || (definedMacros.length > 0 && (condition.includes('||')
            ? definedMacros.every((macro) => DISABLED_SHADER_DEFINES.has(macro))
            : definedMacros.some((macro) => DISABLED_SHADER_DEFINES.has(macro))));
      const enabledNot = kind === 'ifndef' && DISABLED_SHADER_DEFINES.has(directMacro);
      const targeted = disabled || enabledNot;
      branches.push({ parentDropped, targeted, dropped: parentDropped || (disabled && !enabledNot) });
      if (!targeted && !parentDropped) output.push(line);
      continue;
    }
    if (/^\s*#else\b/.test(line)) {
      const branch = branches.at(-1);
      if (branch) {
        if (branch.targeted) branch.dropped = branch.parentDropped || !branch.dropped;
        else if (!branch.parentDropped) output.push(line);
      }
      continue;
    }
    if (/^\s*#endif\b/.test(line)) {
      const branch = branches.pop();
      if (branch && !branch.targeted && !branch.parentDropped) output.push(line);
      continue;
    }
    if (!isDropped()) output.push(line);
  }
  return output.join('\n');
}

function glslExport(file: string, name?: 'vertex' | 'fragment'): string {
  const source = readFileSync(file, 'utf8');
  const pattern = name
    ? new RegExp(`export const ${name} = [^\\x60]*\\x60([\\s\\S]*?)\\x60;`)
    : /export default[^\x60]*\x60([\s\S]*?)\x60;/;
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error(`Unable to read Three shader source: ${file}`);
  let shader = stripDisabledShaderBranches(match[1]);
  if (file.endsWith('/lights_physical_pars_fragment.glsl.js')) {
    shader = shader
      .replace(/\/\/ temporary[\s\S]*?\/\/ Moving Frostbite/, '// Moving Frostbite')
      .replace(/\/\/ Rect Area Light[\s\S]*?\/\/ End Rect Area Light/, '')
      .replace(/\/\/ This is a curve-fit approximation[\s\S]*?\/\/ GGX BRDF with multi-scattering energy compensation/, '// GGX BRDF with multi-scattering energy compensation')
      .replace(/void RE_IndirectSpecular_Physical[\s\S]*?\n}\n\n#define RE_Direct/, '#define RE_Direct')
      .replace(/^#define RE_Direct_RectArea.*$/gm, '')
      .replace(/^#define RE_IndirectSpecular.*$/gm, '');
  }
  return shader
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/[ \t]+\/\/.*$/gm, '')
    .replace(/\n{2,}/g, '\n');
}

function fixedShaderChunkModule(): string {
  const chunks: Record<string, string> = {};
  const queue: string[] = [];
  const roots = ['meshbasic', 'meshphysical', 'points', 'depth', 'distance'] as const;
  for (const root of roots) {
    const file = join(THREE_SHADER_ROOT, 'ShaderLib', `${root}.glsl.js`);
    for (const stage of ['vertex', 'fragment'] as const) {
      const source = glslExport(file, stage);
      chunks[`${root}_${stage === 'vertex' ? 'vert' : 'frag'}`] = source;
      for (const match of source.matchAll(/#include <([\w]+)>/g)) if (match[1]) queue.push(match[1]);
    }
  }
  queue.push('tonemapping_pars_fragment', 'colorspace_pars_fragment');
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name || name in chunks) continue;
    const source = DISABLED_SHADER_FEATURES.has(name)
      ? ''
      : glslExport(join(THREE_SHADER_ROOT, 'ShaderChunk', `${name}.glsl.js`));
    chunks[name] = source;
    for (const match of source.matchAll(/#include <([\w]+)>/g)) if (match[1]) queue.push(match[1]);
  }
  return `export const ShaderChunk=${JSON.stringify(chunks)};`;
}

function fixedShaderLibModule(): string {
  const utils = JSON.stringify(join(THREE_SHADER_ROOT, 'UniformsUtils.js'));
  const uniforms = JSON.stringify(join(THREE_SHADER_ROOT, 'UniformsLib.js'));
  const color = JSON.stringify(resolve('node_modules/three/src/math/Color.js'));
  const vector3 = JSON.stringify(resolve('node_modules/three/src/math/Vector3.js'));
  return `
    import { ShaderChunk } from 'virtual:kaffeepause-three-shader-chunk';
    import { mergeUniforms } from ${utils};
    import { UniformsLib } from ${uniforms};
    import { Color } from ${color};
    import { Vector3 } from ${vector3};
    const ShaderLib={
      basic:{uniforms:mergeUniforms([UniformsLib.common,UniformsLib.specularmap,UniformsLib.envmap,UniformsLib.aomap,UniformsLib.lightmap,UniformsLib.fog]),vertexShader:ShaderChunk.meshbasic_vert,fragmentShader:ShaderChunk.meshbasic_frag},
      standard:{uniforms:mergeUniforms([UniformsLib.common,UniformsLib.envmap,UniformsLib.aomap,UniformsLib.lightmap,UniformsLib.emissivemap,UniformsLib.bumpmap,UniformsLib.normalmap,UniformsLib.displacementmap,UniformsLib.roughnessmap,UniformsLib.metalnessmap,UniformsLib.fog,UniformsLib.lights,{emissive:{value:new Color(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ShaderChunk.meshphysical_vert,fragmentShader:ShaderChunk.meshphysical_frag},
      points:{uniforms:mergeUniforms([UniformsLib.points,UniformsLib.fog]),vertexShader:ShaderChunk.points_vert,fragmentShader:ShaderChunk.points_frag},
      depth:{uniforms:mergeUniforms([UniformsLib.common,UniformsLib.displacementmap]),vertexShader:ShaderChunk.depth_vert,fragmentShader:ShaderChunk.depth_frag},
      distance:{uniforms:mergeUniforms([UniformsLib.common,UniformsLib.displacementmap,{referencePosition:{value:new Vector3()},nearDistance:{value:1},farDistance:{value:1000}}]),vertexShader:ShaderChunk.distance_vert,fragmentShader:ShaderChunk.distance_frag}
    };
    ShaderLib.physical=ShaderLib.standard;
    export { ShaderLib };
  `;
}

function fixedThreeShaderGraph(): Plugin {
  const shaderLib = resolve(THREE_SHADER_ROOT, 'ShaderLib.js');
  const shaderChunk = resolve(THREE_SHADER_ROOT, 'ShaderChunk.js');
  return {
    name: 'kaffeepause-fixed-three-shader-graph',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'virtual:kaffeepause-three-shader-chunk') return '\0kaffeepause-three-shader-chunk';
      if (!importer) return undefined;
      const target = resolve(importer.slice(0, importer.lastIndexOf('/')), source);
      if (target === shaderLib) return '\0kaffeepause-three-shader-lib';
      if (target === shaderChunk) return '\0kaffeepause-three-shader-chunk';
      return undefined;
    },
    load(id) {
      if (id === '\0kaffeepause-three-shader-lib') return fixedShaderLibModule();
      if (id === '\0kaffeepause-three-shader-chunk') return fixedShaderChunkModule();
      return undefined;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [fixedThreeShaderGraph()],
  resolve: {
    // Source modules let Rollup remove unused Three subsystems instead of
    // retaining the broad prebuilt module registry.
    alias: [{ find: /^three$/, replacement: resolve('node_modules/three/src/Three.js') }],
  },
  build: {
    target: 'esnext',
    manifest: true,
    chunkSizeWarningLimit: 650,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 3 },
      format: { comments: false },
      mangle: {
        // Renderer and simulation live in separate chunks. Preserve every
        // application-side object contract while compacting Three internals.
        properties: { regex: /^_/, keep_quoted: true, reserved: reservedApplicationProperties },
      },
    },
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
