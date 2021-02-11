// import * as THREE from "three";
import {
  BufferAttribute,
  Clock,
  Color,
  CylinderBufferGeometry,
  DoubleSide,
  IcosahedronBufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector2,
} from "three";
import { Geometry } from "three/examples/jsm/deprecated/Geometry.js";
import { CurlNoise, CommonFunc, FBMNoise } from "./glsl";

export const BLOOM_SCENE = 3;

export class NoodleGeometry {
  constructor({
    count = 100,
    numSides = 8,
    subdivisions = 50,
    openEnded = true,
    ballSize = 1.0,
  }) {
    //
    const radius = 1;
    const length = 1;

    const cylinderBufferGeo = new CylinderBufferGeometry(
      radius,
      radius,
      length,
      numSides,
      subdivisions,
      openEnded
    );

    let baseGeometry = new Geometry();
    baseGeometry = baseGeometry.fromBufferGeometry(cylinderBufferGeo);

    baseGeometry.rotateZ(Math.PI / 2);

    // compute the radial angle for each position for later extrusion
    const tmpVec = new Vector2();
    const xPositions = [];
    const angles = [];
    const uvs = [];
    const vertices = baseGeometry.vertices;
    const faceVertexUvs = baseGeometry.faceVertexUvs[0];
    const oPositions = [];

    // Now go through each face and un-index the geometry.
    baseGeometry.faces.forEach((face, i) => {
      const { a, b, c } = face;
      const v0 = vertices[a];
      const v1 = vertices[b];
      const v2 = vertices[c];
      const verts = [v0, v1, v2];
      const faceUvs = faceVertexUvs[i];

      // For each vertex in this face...
      verts.forEach((v, j) => {
        tmpVec.set(v.y, v.z).normalize();

        // the radial angle around the tube
        const angle = Math.atan2(tmpVec.y, tmpVec.x);
        angles.push(angle);

        // "arc length" in range [-0.5 .. 0.5]
        xPositions.push(v.x);
        oPositions.push(v.x, v.y, v.z);

        // copy over the UV for this vertex
        uvs.push(faceUvs[j].toArray());
      });
    });

    // build typed arrays for our attributes
    const posArray = new Float32Array(xPositions);
    const angleArray = new Float32Array(angles);
    const uvArray = new Float32Array(uvs.length * 2);

    const origPosArray = new Float32Array(oPositions);

    // unroll UVs
    for (let i = 0; i < posArray.length; i++) {
      const [u, v] = uvs[i];
      uvArray[i * 2 + 0] = u;
      uvArray[i * 2 + 1] = v;
    }

    const lineGeo = new InstancedBufferGeometry();
    lineGeo.instanceCount = count;

    lineGeo.setAttribute("position", new BufferAttribute(origPosArray, 3));
    lineGeo.setAttribute("newPosition", new BufferAttribute(posArray, 1));
    lineGeo.setAttribute("angle", new BufferAttribute(angleArray, 1));
    lineGeo.setAttribute("uv", new BufferAttribute(uvArray, 2));

    let offsets = [];
    let ddxyz = Math.floor(Math.pow(count, 1 / 3));
    for (let z = 0; z < ddxyz; z++) {
      for (let y = 0; y < ddxyz; y++) {
        for (let x = 0; x < ddxyz; x++) {
          offsets.push(
            (x / ddxyz) * 2.0 - 1.0,
            (y / ddxyz) * 2.0 - 1.0,
            (z / ddxyz) * 2.0 - 1.0
          );
        }
      }
    }

    lineGeo.setAttribute(
      "offset",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    let isoGeo = new IcosahedronBufferGeometry(0.005 * ballSize, 1);

    let ballGeo = new InstancedBufferGeometry();
    ballGeo = ballGeo.copy(isoGeo);
    ballGeo.instanceCount = count;

    ballGeo.setAttribute(
      "offset",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    return {
      lineGeo,
      ballGeo,
    };
  }
}

export class Noodles {
  constructor({ tools }) {
    let subdivisions = 50;
    let count = 22 * 22;
    let numSides = 3;
    let thickness = 1;
    let ballSize = 1;

    let geo = new NoodleGeometry({
      count,
      numSides,
      subdivisions,
      openEnded: true,
      ballSize,
    });

    let lineMat = new NoodleLineMaterial(
      new MeshStandardMaterial({
        color: new Color("#ffffff"),
        side: DoubleSide,
        transparent: true,
        metalness: 0.5,
        roughness: 0.5,
        opacity: 0.5,
      }),
      { subdivisions, thickness, tools }
    );

    let ballMat = new NoodleBallMaterial(
      new MeshStandardMaterial({
        color: new Color("#ffffff"),
        side: DoubleSide,
        transparent: true,
        metalness: 0.5,
        roughness: 0.5,
        opacity: 0.5,
      }),
      { tools }
    );

    let tail = new Mesh(geo.lineGeo, lineMat);
    tail.scale.set(50, 50, 50);
    tail.frustumCulled = false;

    let ball = new Mesh(geo.ballGeo, ballMat);
    ball.scale.set(50, 50, 50);
    ball.frustumCulled = false;

    this.object3d = new Object3D();
    this.object3d.add(tail);
    this.object3d.add(ball);

    ball.layers.enable(BLOOM_SCENE);
    tail.layers.enable(BLOOM_SCENE);

    // let rAF = () => {
    //   window.requestAnimationFrame(rAF);
    //   // this.object3d.rotation.y += 0.001;
    // };
    // window.requestAnimationFrame(rAF);
  }
}

export class CommonShader {
  static UtilFunctions() {
    return `
    ${CommonFunc}
    ${CurlNoise}
    ${FBMNoise}

    vec3 catmullRom (vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
      vec3 v0 = (p2 - p0) * 0.5;
      vec3 v1 = (p3 - p1) * 0.5;
      float t2 = t * t;
      float t3 = t * t * t;

      return vec3((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);
    }

    #define M_PI 3.1415926535897932384626433832795

    float atan2(in float y, in float x) {
      bool xgty = (abs(x) > abs(y));
      return mix(M_PI / 2.0 - atan(x,y), atan(y,x), float(xgty));
    }

    vec3 fromBall(float r, float az, float el) {
      return vec3(
        r * cos(el) * cos(az),
        r * cos(el) * sin(az),
        r * sin(el)
      );
    }
    void toBall(vec3 pos, out float az, out float el) {
      az = atan2(pos.y, pos.x);
      el = atan2(pos.z, sqrt(pos.x * pos.x + pos.y * pos.y));
    }

    // float az = 0.0;
    // float el = 0.0;
    // vec3 noiser = vec3(lastVel);
    // toBall(noiser, az, el);
    // lastVel.xyz = fromBall(1.0, az, el);

    vec3 ballify (vec3 pos, float r) {
      float az = atan2(pos.y, pos.x);
      float el = atan2(pos.z, sqrt(pos.x * pos.x + pos.y * pos.y));
      return vec3(
        r * cos(el) * cos(az),
        r * cos(el) * sin(az),
        r * sin(el)
      );
    }

  `;
  }
  static CoordProcedure() {
    return /* glsl */ `
    // "t" is from 0 to 1
    // output "coord" variable

    vec3 p0 = vec3(0.0);
    vec3 p3 = ballify(vec3(offset * 2.0), 0.5);

    vec3 p1 = (p3 - p0) * 0.25;
    vec3 p2 = (p3 - p0) * 0.75;

    vec3 coord = catmullRom(p0, p1, p2, p3, t);

    coord += 0.06 * snoiseVec3(vec3(coord * 2.0 - 1.0 + time * 0.6));

    `;
  }
}

export class NoodleBallMaterial {
  constructor(args, { tools }) {
    this.material = new MeshStandardMaterial(args);
    this.tools = tools;
    this.setup();
    return this.material;
  }
  setup() {
    let onBeforeCompile = (shader, renderer) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.myColor = { value: new Color("#ffffff") };

      if (this.tools && this.tools.onUserData) {
        this.tools.onUserData(({ ballColor, opacityBall }) => {
          shader.uniforms.myColor.value = new Color(ballColor);
          this.material.opacity = Math.abs(opacityBall / 100);
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
attribute vec3 offset;
uniform float time;

${CommonShader.UtilFunctions()}

      `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        // vec3 p3 = ballify(vec3(offset * 2.0), 0.5);

        // vec3 coord = p3;

        // coord += 0.1 * snoiseVec3(vec3(coord + time * 0.6));

        // vec3 transformed = position + coord;

        float t = 1.0;

        ${CommonShader.CoordProcedure()}

        vec3 transformed = position + coord;


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

export class NoodleLineMaterial {
  constructor(material, { subdivisions, thickness, tools }) {
    this.material = material;
    this.subdivisions = subdivisions;
    this.thickness = thickness;
    this.tools = tools;

    this.setup();

    return this.material;
  }
  setup() {
    let onBeforeCompile = (shader, renderer) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.myColor = { value: new Color("#ffffff") };

      if (this.tools && this.tools.onUserData) {
        // tools.onUserData(({ tailColor, ballColor, opacityTail, opacityBall }) => {
        this.tools.onUserData(({ tailColor, opacityTail }) => {
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

attribute float angle;
attribute float newPosition;
attribute vec3 offset;
uniform float time;

${CommonShader.UtilFunctions()}

vec3 makeLine (float t) {
  // vec3 p0 = vec3(0.0);
  // vec3 p3 = ballify(vec3(offset * 2.0), 0.5);

  // vec3 p1 = (p3 - p0) * 0.25;
  // vec3 p2 = (p3 - p0) * 0.75;

  // vec3 coord = catmullRom(p0, p1, p2, p3, t);

  // coord += 0.1 * snoiseVec3(vec3(coord * 2.0 - 1.0 + time * 0.6));

  ${CommonShader.CoordProcedure()}

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

        uniform vec3 myColor;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
        /* glsl */ `
        outgoingLight = myColor;

        gl_FragColor = vec4( outgoingLight, diffuseColor.a );

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

if (module.hot) {
  module.hot.dispose(() => {
    window.location.reload();
  });
}
