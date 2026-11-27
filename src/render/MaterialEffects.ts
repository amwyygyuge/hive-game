import { Color, type MeshStandardMaterial, Vector3 } from 'three';

export interface ActorFxUniforms {
  flashColor: { value: Color };
  flashStrength: { value: number };
  rimColor: { value: Color };
  rimStrength: { value: number };
  tint: { value: Color };
}

const VERTEX_INJECT = `#include <common>\nvarying vec3 vFxNormal;\nvarying vec3 vFxView;`;
const VERTEX_MAIN_INJECT = `#include <project_vertex>\nvFxNormal = normalize(normalMatrix * objectNormal);\nvFxView = normalize(-mvPosition.xyz);`;
const FRAGMENT_INJECT = `#include <common>
varying vec3 vFxNormal;
varying vec3 vFxView;
uniform vec3 fxFlashColor;
uniform float fxFlashStrength;
uniform vec3 fxRimColor;
uniform float fxRimStrength;
uniform vec3 fxTint;`;
const FRAGMENT_MAIN_INJECT = `#include <dithering_fragment>
float fxRim = pow(1.0 - max(dot(normalize(vFxNormal), normalize(vFxView)), 0.0), 2.2);
gl_FragColor.rgb = mix(gl_FragColor.rgb * fxTint, fxFlashColor, fxFlashStrength);
gl_FragColor.rgb += fxRimColor * fxRim * fxRimStrength;`;

/** Patches a cloned material with per-actor hit-flash and night-vision rim outline, applied after skinning/lighting. */
export function applyActorFx(material: MeshStandardMaterial): ActorFxUniforms {
  const uniforms: ActorFxUniforms = {
    flashColor: { value: new Color(0xffffff) }, flashStrength: { value: 0 },
    rimColor: { value: new Color(0x3bf7c0) }, rimStrength: { value: 0 },
    tint: { value: new Color(0xffffff) },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fxFlashColor = uniforms.flashColor;
    shader.uniforms.fxFlashStrength = uniforms.flashStrength;
    shader.uniforms.fxRimColor = uniforms.rimColor;
    shader.uniforms.fxRimStrength = uniforms.rimStrength;
    shader.uniforms.fxTint = uniforms.tint;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERTEX_INJECT).replace('#include <project_vertex>', VERTEX_MAIN_INJECT);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FRAGMENT_INJECT).replace('#include <dithering_fragment>', FRAGMENT_MAIN_INJECT);
  };
  material.customProgramCacheKey = () => 'actor-fx';
  material.needsUpdate = true;
  return uniforms;
}

const WALL_VERTEX_INJECT = `#include <common>\nvarying vec3 vWallWorld;`;
const WALL_VERTEX_MAIN_INJECT = `#include <worldpos_vertex>
vec4 wallVertex = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wallVertex = instanceMatrix * wallVertex;
#endif
vWallWorld = (modelMatrix * wallVertex).xyz;`;
const WALL_FRAGMENT_INJECT = `#include <common>
varying vec3 vWallWorld;
uniform vec3 wallPlayer;
uniform vec3 wallCamera;
uniform float wallCutHeight;`;
const WALL_FRAGMENT_MAIN_INJECT = `#include <dithering_fragment>
vec2 toPlayer = wallPlayer.xz - wallCamera.xz;
float along = dot(vWallWorld.xz - wallCamera.xz, normalize(toPlayer));
float playerAlong = length(toPlayer);
float lateral = abs(dot(vWallWorld.xz - wallCamera.xz, normalize(vec2(-toPlayer.y, toPlayer.x))));
bool inCorridor = along > 0.6 && along < playerAlong + 2.2 && lateral < 3.1;
if (inCorridor && vWallWorld.y > wallCutHeight) discard;`;

export interface WallFxUniforms { player: { value: Vector3 }; camera: { value: Vector3 }; cutHeight: { value: number } }

/** Patches the shared wall material so the slab between the camera and player sinks below a cut height, keeping the player readable from the oblique view without hiding occluded enemies elsewhere. */
export function applyWallCutaway(material: MeshStandardMaterial, cutHeight: number): WallFxUniforms {
  const uniforms: WallFxUniforms = { player: { value: new Vector3() }, camera: { value: new Vector3() }, cutHeight: { value: cutHeight } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wallPlayer = uniforms.player;
    shader.uniforms.wallCamera = uniforms.camera;
    shader.uniforms.wallCutHeight = uniforms.cutHeight;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', WALL_VERTEX_INJECT).replace('#include <worldpos_vertex>', WALL_VERTEX_MAIN_INJECT);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', WALL_FRAGMENT_INJECT).replace('#include <dithering_fragment>', WALL_FRAGMENT_MAIN_INJECT);
  };
  material.customProgramCacheKey = () => 'wall-cutaway';
  material.needsUpdate = true;
  return uniforms;
}
