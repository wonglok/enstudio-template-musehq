/* "noodle-material" */

import { Clock, Color, DoubleSide, MeshStandardMaterial } from "three";

export class NoodleLineMaterial {
  constructor({ subdivisions, thickness, relay, CommonShader }) {
    this.material = new MeshStandardMaterial({
      color: new Color("#ffffff"),
      side: DoubleSide,
      transparent: true,
      metalness: 0.5,
      roughness: 0.5,
      opacity: 0.5,
    });

    this.subdivisions = subdivisions;
    this.thickness = thickness;
    this.relay = relay;
    this.CommonShader = CommonShader;

    this.setup();

    return this.material;
  }
  setup() {
    let onBeforeCompile = (shader, renderer) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.myColor = { value: new Color("#ff0000") };

      if (this.relay && this.relay.onUserData) {
        // relay.onUserData(({ tailColor, ballColor, opacityTail, opacityBall }) => {
        this.relay.onUserData(({ tailColor, opacityTail }) => {
          shader.uniforms.myColor.value = new Color(tailColor);
          this.material.opacity = Math.abs(opacityTail / 100);
        });
      }

      let clock = new Clock();
      setInterval(() => {
        shader.uniforms.time.value = clock.getElapsedTime();
      });

      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        /* glsl */ `
#include <common>
#define lengthSegments ${this.subdivisions.toFixed(1)}

varying float vT;

attribute float angle;
attribute float newPosition;
attribute vec3 offset;
uniform float time;

${this.CommonShader.UtilFunctions()}

vec3 makeLine (float t) {
  // vec3 p0 = vec3(0.0);
  // vec3 p3 = ballify(vec3(offset * 2.0), 0.5);

  // vec3 p1 = (p3 - p0) * 0.25;
  // vec3 p2 = (p3 - p0) * 0.75;

  // vec3 coord = catmullRom(p0, p1, p2, p3, t);

  // coord += 0.1 * snoiseVec3(vec3(coord * 2.0 - 1.0 + time * 0.6));

  ${this.CommonShader.CoordProcedure()}

  return coord;
}

vec3 sampleFnc (float t) {
  return makeLine(t);
}

void createTube (float t, vec2 volume, out vec3 pos, out vec3 normal) {
  // find next sample along curve
  float nextT = t + (1.0 / lengthSegments);

  // sample the curve in two places
  vec3 cur = sampleFnc(t);
  vec3 next = sampleFnc(nextT);

  // compute the Frenet-Serret frame
  vec3 T = normalize(next - cur);
  vec3 B = normalize(cross(T, next + cur));
  vec3 N = -normalize(cross(B, T));

  // extrude outward to create a tube
  float tubeAngle = angle;
  float circX = cos(tubeAngle);
  float circY = sin(tubeAngle);

  // compute position and normal
  normal.xyz = normalize(B * circX + N * circY);
  pos.xyz = cur + B * volume.x * circX + N * volume.y * circY;
}

void makeGeo (out vec3 transformed, out vec3 objectNormal) {
  float thickness = 0.0025 * 0.5 * ${this.thickness.toFixed(7)};
  float t = (newPosition * 2.0) * 0.5 + 0.5;

  vT = t;

  vec2 volume = vec2(thickness);
  createTube(t, volume, transformed, objectNormal);
}
      `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        vec3 transformed;

        // vec3 objectNormalNoodle;// = vec3( normal );
        transformedNormal = vec3(normal);

        makeGeo(transformed, transformedNormal);

        transformedNormal = vec3(normal);
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_pars_fragment>",
        /* glsl */ `#include <color_pars_fragment>

        varying float vT;

        uniform vec3 myColor;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
        /* glsl */ `
        outgoingLight = myColor * (vT);

        gl_FragColor = vec4( outgoingLight, diffuseColor.a * vT );

        // diffuseColor.rgb *= myColorV;
        `
      );

      // shader.vertexShader = shader.vertexShader.replace(
      //   `#include <defaultnormal_vertex>`,
      //   `
      //   `
      // );

      this.material.userData.shader = shader;
      // console.log(this.material.userData.shader.vertexShader);
    };

    this.material.onBeforeCompile = onBeforeCompile;

    this.material.needsUpdate = true;
  }
}

export const box = async (relay) => {
  let { spec } = await relay.waitFor(0);
  let { CommonShader } = await relay.waitFor(1);
  let lineMaterial = new NoodleLineMaterial({ ...spec, relay, CommonShader });
  console.log(lineMaterial);
  relay.pulse({ lineMaterial });
};
