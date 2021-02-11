import {
  RepeatWrapping,
  BufferAttribute,
  Clock,
  Color,
  CylinderBufferGeometry,
  // DoubleSide,
  HalfFloatType,
  IcosahedronBufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector2,
  Vector3,
  DynamicDrawUsage,
  // FrontSide,
  DoubleSide,
  // AdditiveBlending,
} from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer";
import { Geometry } from "three/examples/jsm/deprecated/Geometry.js";
import { CurlNoise, CommonFunc, FBMNoise } from "./glsl";
import niceColors from "nice-color-palettes/1000.json";

export class NoodleSimulation {
  constructor({ renderer, tools }) {
    this.tools = tools;
    this.now = 0;
    this.last = 0;

    this.BLOOM_SCENE = 3;

    this.SPACE_BBOUND = 10;
    this.SPAC_BOUND_HALF = this.SPACE_BBOUND / 2;
    this.WIDTH = 23;
    this.INSTANCE_COUNT = this.WIDTH * this.WIDTH;
    this.renderer = renderer;
    this.object3d = new Object3D();

    this.initComputeRenderer();
    this.prepareObjectShader();
  }

  prepareObjectShader() {
    let subdivisions = 70;
    let count = this.INSTANCE_COUNT;
    let numSides = 3;
    let thickness = 1.0;
    let ballSize = 1.33;

    let geo = new NoodleGeometry({
      count,
      numSides,
      subdivisions,
      openEnded: true,
      ballSize,
      WIDTH: this.WIDTH,
      tools: this.tools,
    });

    let lineMat = (this.lineMat = new NoodleLineMaterial(
      new MeshStandardMaterial({
        // color: new Color("#ffffff"),
        // vertexColors: true,
        // blending: AdditiveBlending,
        side: DoubleSide,
        transparent: true,
        metalness: 0.5,
        roughness: 0.5,
        opacity: 0.5,
      }),
      { subdivisions, thickness, WIDTH: this.WIDTH }
    ));

    let ballMat = (this.ballMat = new NoodleBallMaterial(
      new MeshStandardMaterial({
        // color: new Color("#ffffff"),
        // vertexColors: true,
        // blending: AdditiveBlending,
        side: DoubleSide,
        transparent: true,
        metalness: 0.5,
        roughness: 0.5,
        opacity: 1.0,
      }),
      {
        WIDTH: this.WIDTH,
      }
    ));

    if (this.tools && this.tools.onUserData) {
      this.tools.onUserData(({ opacityBall, opacityLines }) => {
        ballMat.opacity = Math.abs(opacityBall / 100.0);
        lineMat.opacity = Math.abs(opacityLines / 100.0);
      });
    }

    let tail = new Mesh(geo.lineGeo, lineMat);
    tail.scale.set(30, 30, 30);
    tail.frustumCulled = false;

    let ball = new Mesh(geo.ballGeo, ballMat);
    ball.scale.set(30, 30, 30);
    ball.frustumCulled = false;

    tail.layers.enable(this.BLOOM_SCENE);
    ball.layers.enable(this.BLOOM_SCENE);

    this.object3d = new Object3D();
    this.object3d.add(tail);
    this.object3d.add(ball);

    // this.object3d.add(
    //   new Mesh(
    //     new BoxBufferGeometry(20, 20, 20),
    //     new MeshBasicMaterial({ color: 0xff0000 })
    //   )
    // );
  }

  fillVelocityTexture(texture) {
    const theArray = texture.image.data;

    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      const x = Math.random() - 0.5;
      const y = Math.random() - 0.5;
      const z = Math.random() - 0.5;

      theArray[k + 0] = x * 10;
      theArray[k + 1] = y * 10;
      theArray[k + 2] = z * 10;
      theArray[k + 3] = 1;
    }
  }

  fillPositionTexture(texture) {
    const theArray = texture.image.data;

    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      const x = Math.random() * this.SPACE_BBOUND - this.SPAC_BOUND_HALF;
      const y = Math.random() * this.SPACE_BBOUND - this.SPAC_BOUND_HALF;
      const z = Math.random() * this.SPACE_BBOUND - this.SPAC_BOUND_HALF;

      theArray[k + 0] = x;
      theArray[k + 1] = y;
      theArray[k + 2] = z;
      theArray[k + 3] = 1;
    }
  }

  initComputeRenderer() {
    this.gpuCompute = new GPUComputationRenderer(
      this.WIDTH,
      this.WIDTH,
      this.renderer
    );

    // if (this.isSafari()) {
    //   this.gpuCompute.setDataType(HalfFloatType);
    // }

    this.gpuCompute.setDataType(HalfFloatType);

    const dtPosition = this.gpuCompute.createTexture();
    const dtVelocity = this.gpuCompute.createTexture();
    this.fillPositionTexture(dtPosition);
    this.fillVelocityTexture(dtVelocity);

    this.velocityVariable = this.gpuCompute.addVariable(
      "textureVelocity",
      NoodleSimulation.velocityShader(),
      dtVelocity
    );

    this.positionVariable = this.gpuCompute.addVariable(
      "texturePosition",
      NoodleSimulation.positionShader(),
      dtPosition
    );

    this.gpuCompute.setVariableDependencies(this.velocityVariable, [
      this.positionVariable,
      this.velocityVariable,
    ]);
    this.gpuCompute.setVariableDependencies(this.positionVariable, [
      this.positionVariable,
      this.velocityVariable,
    ]);

    this.positionUniforms = this.positionVariable.material.uniforms;
    this.velocityUniforms = this.velocityVariable.material.uniforms;

    this.positionUniforms["time"] = { value: 0.0 };
    this.positionUniforms["delta"] = { value: 0.0 };
    this.positionUniforms["mouse"] = { value: new Vector3(0, 0, 0) };

    this.velocityUniforms["time"] = { value: 1.0 };
    this.velocityUniforms["delta"] = { value: 0.0 };
    this.velocityUniforms["mouse"] = { value: new Vector3(0, 0, 0) };

    this.velocityVariable.material.defines.SPACE_BBOUND = this.SPACE_BBOUND.toFixed(
      2
    );

    this.velocityVariable.wrapS = RepeatWrapping;
    this.velocityVariable.wrapT = RepeatWrapping;
    this.positionVariable.wrapS = RepeatWrapping;
    this.positionVariable.wrapT = RepeatWrapping;

    const error = this.gpuCompute.init();

    if (error !== null) {
      console.error(error);
    }
  }

  render({ asepct, mouse, viewport }) {
    // const vp = viewport();
    // console.log(viewport());
    const now = performance.now();
    let delta = (now - this.last) / 1000;

    if (delta > 1) {
      delta = 1;
    } // safety cap on large deltas
    this.last = now;

    this.positionUniforms["time"].value = now;
    this.positionUniforms["delta"].value = delta;

    if (this.positionUniforms["mouse"]) {
      this.positionUniforms["mouse"].value.set(
        mouse.x, // * vp.width,
        mouse.y, // * vp.height,
        0
      );
      // console.log(this.positionUniforms["mouse"].value);
    }

    this.velocityUniforms["time"].value = now;
    this.velocityUniforms["delta"].value = delta;

    if (this.velocityUniforms["mouse"]) {
      this.velocityUniforms["mouse"].value.set(
        mouse.x, // * vp.width,
        mouse.y, // * vp.height,
        0
      );
    }

    if (this.lineMat && this.lineMat.userData.shader) {
      this.lineMat.userData.shader.uniforms["time"].value = now / 1000;
    }
    if (this.lineMat && this.lineMat.userData.shader) {
      this.lineMat.userData.shader.uniforms["delta"].value = delta;
    }

    if (this.ballMat && this.ballMat.userData.shader) {
      this.ballMat.userData.shader.uniforms["time"].value = now / 1000;
    }
    if (this.ballMat && this.ballMat.userData.shader) {
      this.ballMat.userData.shader.uniforms["delta"].value = delta;
    }

    this.gpuCompute.compute();

    if (this.lineMat && this.lineMat.userData.shader) {
      this.lineMat.userData.shader.uniforms[
        "texturePosition"
      ].value = this.gpuCompute.getCurrentRenderTarget(
        this.positionVariable
      ).texture;
    }
    if (this.lineMat && this.lineMat.userData.shader) {
      this.lineMat.userData.shader.uniforms[
        "textureVelocity"
      ].value = this.gpuCompute.getCurrentRenderTarget(
        this.velocityVariable
      ).texture;
    }

    if (this.ballMat && this.ballMat.userData.shader) {
      this.ballMat.userData.shader.uniforms[
        "texturePosition"
      ].value = this.gpuCompute.getCurrentRenderTarget(
        this.positionVariable
      ).texture;
    }
    if (this.ballMat && this.ballMat.userData.shader) {
      this.ballMat.userData.shader.uniforms[
        "textureVelocity"
      ].value = this.gpuCompute.getCurrentRenderTarget(
        this.velocityVariable
      ).texture;
    }
  }

  isSafari() {
    return (
      !!navigator.userAgent.match(/Safari/i) &&
      !navigator.userAgent.match(/Chrome/i)
    );
  }

  static positionShader() {
    return /* glsl */ `
      uniform float time;
			uniform float delta;

			void main()	{

				vec2 uv = gl_FragCoord.xy / resolution.xy;
				vec4 tmpPos = texture2D( texturePosition, uv );
				vec3 position = tmpPos.xyz;
				vec3 velocity = texture2D( textureVelocity, uv ).xyz;

				gl_FragColor = vec4( position + velocity * 0.015 * delta, 1.0 );

			}
    `;
  }

  static velocityShader() {
    return /* glsl */ `
      uniform float time;
			uniform float delta; // about 0.016
			uniform vec3 mouse; // about 0.016

			const float PI = 3.141592653589793;
			const float PI_2 = PI * 2.0;

			float rand (vec2 co){
				return fract( sin( dot( co.xy, vec2(12.9898,78.233) ) ) * 43758.5453 );
			}

      float constrain(float val, float min, float max) {
          if (val < min) {
              return min;
          } else if (val > max) {
              return max;
          } else {
              return val;
          }
      }

      vec3 getDiff (in vec3 lastPos, in vec3 mousePos) {
        vec3 diff = lastPos.xyz - mousePos;
        float distance = constrain(length(diff), 10.0, 1500.0);
        float strength = 5.35 / (distance * distance);

        diff = normalize(diff);
        // delta
        diff = diff * strength * -2.0;
        // diff = diff * strength * (-20.83) * (1.0 / delta) * 0.0183;

        return diff;
      }

			void main() {
        vec3 birdPosition, birdVelocity;
        vec2 uv = gl_FragCoord.xy / resolution.xy;

				vec3 selfPosition = texture2D( texturePosition, uv ).xyz;
				vec3 selfVelocity = texture2D( textureVelocity, uv ).xyz;

        vec3 outputVelocity = vec3(selfVelocity);

        const float width = resolution.x;
        const float height = resolution.y;

        for (float y = 0.0; y < height; y++ ) {
					for (float x = 0.0; x < width; x++ ) {
            vec2 ref = vec2(x, y) / resolution.xy;
						birdPosition = texture2D( texturePosition, ref ).xyz;
						birdVelocity = texture2D( textureVelocity, ref ).xyz;

            vec3 diff1 = getDiff(birdPosition, selfPosition);
            outputVelocity += diff1 / width / height * -1.0;
          }
        }

        gl_FragColor = vec4(outputVelocity, 1.0);
			}
    `;
  }
}

export class NoodleGeometry {
  constructor({
    count = 100,
    numSides = 8,
    subdivisions = 50,
    openEnded = true,
    ballSize = 1.0,
    WIDTH = 64,
    tools = false,
  }) {
    this.WIDTH = WIDTH;
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
      "offsets",
      new InstancedBufferAttribute(new Float32Array(offsets.slice()), 3)
    );

    let lookupData = [];
    for (let y = 0; y < this.WIDTH; y++) {
      for (let x = 0; x < this.WIDTH; x++) {
        lookupData.push(x / this.WIDTH, y / this.WIDTH, 0, 0);
      }
    }
    lineGeo.setAttribute(
      "lookup",
      new InstancedBufferAttribute(new Float32Array(lookupData), 4)
    );

    let isoGeo = new IcosahedronBufferGeometry(0.005 * ballSize, 1);

    let ballGeo = new InstancedBufferGeometry();
    ballGeo = ballGeo.copy(isoGeo);
    ballGeo.instanceCount = count;

    ballGeo.setAttribute(
      "offsets",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    ballGeo.setAttribute(
      "lookup",
      new InstancedBufferAttribute(new Float32Array(lookupData.slice()), 4)
    );

    // ----- Color Section

    //----
    // let idx = Math.floor(niceColors.length * Math.random());
    // console.log(idx);
    // 8
    // 39
    // 176
    // 50
    // 84
    //

    let colorArray = [];
    let RGBColor = new Color();
    let colorSet =
      niceColors[
        Math.floor(
          ((niceColors.length - 1) * Math.abs(-6.7 / 100.0)) % niceColors.length
        )
      ] || niceColors[5];

    for (let idx = 0; idx < count; idx++) {
      let colorCode = colorSet[Math.floor(Math.random() * colorSet.length)];
      RGBColor.set(colorCode);
      colorArray.push(RGBColor.r, RGBColor.g, RGBColor.b);
    }

    let colorAttrLineGeo = new InstancedBufferAttribute(
      new Float32Array(colorArray),
      3
    );
    colorAttrLineGeo.setUsage(DynamicDrawUsage);

    let colorAttrBallGeo = new InstancedBufferAttribute(
      new Float32Array(colorArray),
      3
    );
    colorAttrBallGeo.setUsage(DynamicDrawUsage);

    lineGeo.setAttribute("myColor", colorAttrLineGeo);
    ballGeo.setAttribute("myColor", colorAttrBallGeo);

    if (tools && tools.onUserData) {
      let lastSeed = false;
      let applySeed = ({ colorSeed }) => {
        if (lastSeed !== colorSeed && colorSeed) {
          let colorSet =
            niceColors[
              Math.floor(
                (niceColors.length - 1) * Math.abs(colorSeed / 100.0)
              ) % niceColors.length
            ] || niceColors[5];

          for (let idx = 0; idx < count; idx++) {
            let colorCode =
              colorSet[Math.floor(Math.random() * colorSet.length)];
            RGBColor.set(colorCode);
            colorAttrLineGeo.setXYZ(idx, RGBColor.r, RGBColor.g, RGBColor.b);
            colorAttrBallGeo.setXYZ(idx, RGBColor.r, RGBColor.g, RGBColor.b);
          }

          colorAttrLineGeo.needsUpdate = true;
          colorAttrBallGeo.needsUpdate = true;

          lastSeed = colorSeed;
        }
      };

      tools.onUserData(({ colorSeed }) => {
        if (process.env.NODE_ENV === "production") {
          applySeed({ colorSeed });
        }
        if (process.env.NODE_ENV === "development") {
          let tt = 0;
          clearTimeout(tt);
          tt = setTimeout(() => {
            applySeed({ colorSeed });
          }, 50);
        }
      });
    }

    return {
      lineGeo,
      ballGeo,
    };
  }
}

export class CommonShader {
  static UtilFunctions() {
    return /* glsl */ `
    ${CommonFunc}
    ${CurlNoise}
    ${FBMNoise}

    attribute vec4 lookup;
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;

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

    vec3 gpuPos = texture2D(texturePosition, lookup.xy).rgb;
    // vec3 gpuVel = texture2D(textureVelocity, lookup.xy).rgb;

    vec3 start = vec3(0.0);
    vec3 end = vec3(ballify(offsets * t, 1.0));

    vec3 p1 = vec3(end * 0.1);
    vec3 p2 = vec3(end * 0.25);
    vec3 p3 = vec3(end * 0.75);
    vec3 p4 = vec3(end);

    vec3 coord = catmullRom(p1, p2, p3, p4, t);

    // // vec3 coord = catmullRom(p0, p1, p2, p3, t);

    coord += 0.12 * snoiseVec3(vec3(coord * 2.0 - 1.0 + time * 0.6));

    // coord = gpuPos * 0.1;

    `;
  }
}

export class NoodleBallMaterial {
  constructor(args, { WIDTH }) {
    this.WIDTH = WIDTH;
    this.material = args;
    this.setup();
    return this.material;
  }
  setup() {
    let onBeforeCompile = (shader, renderer) => {
      shader.defines.resolution = `vec2(${this.WIDTH.toFixed(
        1
      )}, ${this.WIDTH.toFixed(1)})`;

      shader.uniforms.time = { value: 0 };
      shader.uniforms.delta = { value: 0 };
      shader.uniforms.texturePosition = { value: null };
      shader.uniforms.textureVelocity = { value: null };

      this.material.userData.shader = shader;

      let clock = new Clock();
      setInterval(() => {
        shader.uniforms.time.value = clock.getElapsedTime();
      });

      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        /* glsl */ `
#include <common>
attribute vec3 offsets;
uniform float time;

attribute vec3 myColor;
varying vec3 myColorV;

${CommonShader.UtilFunctions()}
      `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `

        float t = 1.0;

        ${CommonShader.CoordProcedure()}

        vec3 transformed = position + coord;
        myColorV = myColor;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_pars_fragment>",
        /* glsl */ `#include <color_pars_fragment>

        varying vec3 myColorV;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
        /* glsl */ `
        outgoingLight = myColorV;

        gl_FragColor = vec4( outgoingLight, diffuseColor.a );

        // diffuseColor.rgb *= myColorV;
        `
      );

      this.material.userData.shader = shader;
    };

    this.material.onBeforeCompile = onBeforeCompile;

    this.material.needsUpdate = true;
  }
}

export class NoodleLineMaterial {
  constructor(material, { subdivisions, thickness, WIDTH }) {
    this.material = material;
    this.subdivisions = subdivisions;
    this.thickness = thickness;
    this.WIDTH = WIDTH;

    this.setup();

    return this.material;
  }
  setup() {
    let onBeforeCompile = (shader, renderer) => {
      shader.defines.resolution = `vec2(${this.WIDTH.toFixed(
        1
      )}, ${this.WIDTH.toFixed(1)})`;

      shader.uniforms.time = { value: 0 };
      shader.uniforms.delta = { value: 0 };
      shader.uniforms.texturePosition = { value: null };
      shader.uniforms.textureVelocity = { value: null };

      this.material.userData.shader = shader;

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
attribute vec3 offsets;

attribute vec3 myColor;
varying vec3 myColorV;

varying float tailV;

uniform float time;

${CommonShader.UtilFunctions()}

vec3 makeLine (float t) {
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

  tailV = t;

  vec2 volume = vec2(thickness);
  createTube(t, volume, transformed, objectNormal);
}
      `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        vec3 transformed;

        transformedNormal = vec3(normal);

        makeGeo(transformed, transformedNormal);

        // transformedNormal = vec3(normal);

        myColorV = myColor;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_pars_fragment>",

        /* glsl */ `#include <color_pars_fragment>
        varying float tailV;
        varying vec3 myColorV;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",

        /* glsl */ `
        outgoingLight = myColorV;
        float fade = (tailV * tailV) - 0.24;
        if (fade < 0.0) {
          fade = 0.0;
        }
        gl_FragColor = vec4( outgoingLight, diffuseColor.a * fade);

        // diffuseColor.rgb *= myColorV;
        `
      );

      // console.log(shader.fragmentShader);
      //

      this.material.userData.shader = shader;
    };

    this.material.onBeforeCompile = onBeforeCompile;

    this.material.needsUpdate = true;
  }
}
