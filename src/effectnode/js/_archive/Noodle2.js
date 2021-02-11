import React from "react";
import { useEffect } from "react";
import { useMemo, useRef } from "react";
import { useFrame } from "react-three-fiber";
// import { CylinderBufferGeometry } from "three";
// import * as THREE from "three/build/three";
import {
  BufferAttribute,
  Color,
  CylinderBufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  RawShaderMaterial,
  IcosahedronBufferGeometry,
  Object3D,
  Vector2,
  Vector3,
} from "three";
import { Geometry } from "three/examples/jsm/deprecated/Geometry.js";

class NoodleGeometry {
  constructor({
    parent,
    count = 100,
    numSides = 8,
    subdivisions = 50,
    openEnded = true,
  }) {
    this.parent = parent;
    // create a base CylinderGeometry which handles UVs, end caps and faces
    // const radius = 1;
    // const length = 1;
    // const baseGeometry = new CylinderGeometry(
    //   radius,
    //   radius,
    //   length,
    //   numSides,
    //   subdivisions,
    //   openEnded
    // );

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
    cylinderBufferGeo.rotateZ(Math.PI / 2);

    let baseGeometry = new Geometry();
    baseGeometry = baseGeometry.fromBufferGeometry(cylinderBufferGeo);

    // fix the orientation so X can act as arc length

    // compute the radial angle for each position for later extrusion
    const tmpVec = new Vector2();
    const xPositions = [];
    const angles = [];
    const uvs = [];
    const vertices = baseGeometry.vertices;
    const faceVertexUvs = baseGeometry.faceVertexUvs[0];

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

        // copy over the UV for this vertex
        uvs.push(faceUvs[j].toArray());
      });
    });

    // build typed arrays for our attributes
    const posArray = new Float32Array(xPositions);
    const angleArray = new Float32Array(angles);
    const uvArray = new Float32Array(uvs.length * 2);

    // unroll UVs
    for (let i = 0; i < posArray.length; i++) {
      const [u, v] = uvs[i];
      uvArray[i * 2 + 0] = u;
      uvArray[i * 2 + 1] = v;
    }

    const lineGeo = new InstancedBufferGeometry();
    lineGeo.instanceCount = count;
    lineGeo.setAttribute("position", new BufferAttribute(posArray, 1));
    lineGeo.setAttribute("angle", new BufferAttribute(angleArray, 1));
    lineGeo.setAttribute("uv", new BufferAttribute(uvArray, 2));

    let offsets = [];
    let ddxyz = Math.ceil(Math.pow(count, 1 / 3));
    for (let z = 0; z < ddxyz; z++) {
      for (let y = 0; y < ddxyz; y++) {
        for (let x = 0; x < ddxyz; x++) {
          offsets.push(x / ddxyz, y / ddxyz, z / ddxyz);
        }
      }
    }

    for (let i = 0; i < this.parent.ctrlPts; i++) {
      lineGeo.setAttribute(
        "controlPoint" + i,
        new InstancedBufferAttribute(
          new Float32Array(this.parent[`controlPoint${i}`]),
          3
        )
      );
    }
    lineGeo.setAttribute(
      "offset",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    // this.parent.controlPoint0
    // this.parent.controlPoint1
    // this.parent.controlPoint2
    // this.parent.controlPoint3
    // this.parent.controlPoint4
    // this.parent.controlPoint5
    // this.parent.controlPoint6
    // this.parent.controlPoint7

    // dispose old lineGeo since we no longer need it
    baseGeometry.dispose();

    // let ballBaseGeo = new SphereBufferGeometry(0.025, 32, 32)
    // ballBaseGeo = new BoxBufferGeometry(0.03, 0.03, 0.03, 1.0, 1.0, 1.0)
    let ballBaseGeo = new IcosahedronBufferGeometry(
      0.03 * this.parent.momoScale,
      1
    );

    let ballGeo = new InstancedBufferGeometry();
    ballGeo.instanceCount = count;
    ballGeo.setAttribute(
      "position",
      new BufferAttribute(ballBaseGeo.attributes.position.array, 3)
    );
    ballGeo.setAttribute(
      "uv",
      new BufferAttribute(ballBaseGeo.attributes.uv.array, 2)
    );
    ballGeo.setAttribute(
      "normal",
      new BufferAttribute(ballBaseGeo.attributes.normal.array, 3)
    );

    for (let i = 0; i < this.parent.ctrlPts; i++) {
      ballGeo.setAttribute(
        "controlPoint" + i,
        new InstancedBufferAttribute(
          new Float32Array(this.parent[`controlPoint${i}`]),
          3
        )
      );
    }
    ballGeo.setAttribute(
      "offset",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    return {
      line: lineGeo,
      ball: ballGeo,
    };
  }
}

class Wire {
  constructor({ o3d, onLoop }) {
    this.momoScale = 4.0;
    this.group = new Object3D();
    this.onLoop = onLoop;
    this.o3d = o3d;
    this.qualityFactor = 2;
    this.scaleFactor = 5;
    this.amountFactor = 100;
    this.noiseLevel = 1.0;
    this.cylinderSides = 3 * this.qualityFactor;
    this.segments = 12 * this.qualityFactor;
    this.ctrlPts = 9;
    this.restartDelay = 0;
    this.duration = 4.125 * 3; // seconds
    this.group.scale.set(2.5, 2.5, 2.5);

    for (let i = 0; i < this.ctrlPts; i++) {
      this[`controlPoint${i}`] = [];
    }

    this.prepAnimation({ o3d });
    this.setupScene({ o3d });
    this.setupProgressValue({ o3d });
  }

  setupScene({ o3d }) {
    o3d.add(this.group);
  }

  cleanUpScene() {
    this.o3d.remove(this.group);
    this.group.remove(this.lanCurve);
    this.group.remove(this.lanBall);
    this.lanCurve.geometry.dispose();
    this.lanBall.geometry.dispose();
    this.lanCurve.material.dispose();
    this.lanBall.material.dispose();
  }

  prepAnimation() {
    let count = this.amountFactor;
    let numSides = this.cylinderSides;
    let subdivisions = this.segments;
    let ctrlPts = this.ctrlPts;
    let openEnded = false;

    // let sine = val => Math.sin(val * Math.PI * 2.0)
    // let cosine = val => Math.cos(val * Math.PI * 2.0)
    // let rVal = () => 0.75 * (Math.random() - 0.5)
    // let radius = val => val * 10 + 2

    // let sphereV3 = new Vector3(0, 0, 0)
    let cylinder = new Vector3(0, 0, 0);

    let updateCtrlPts = () => {
      for (let eachLine = 0; eachLine < count; eachLine++) {
        for (let i = 0; i < ctrlPts; i++) {
          let ee = eachLine / count;
          let cp = i / ctrlPts;

          // let xx = radius(cp) * (sine(ee) * sine(ee) - 0.5) + rVal()
          // let yy = radius(cp) * (cosine(ee) * sine(ee)) + rVal()
          // let zz = (cp - 0.5) * 10.;// + (cp) * 20.0

          let rr = 2 + 1.5 * Math.random();
          let angle =
            (ee * Math.PI * 2.0 +
              cp * Math.PI * 1.0 +
              (1.0 - cp) * 1.4 * Math.PI * 2.0) *
              2.0 +
            0.5 * Math.random() * this.noiseLevel;
          let hh = Math.random() * 2.3 * this.noiseLevel * 0.5;
          cylinder.setFromCylindricalCoords(rr, angle, hh);
          cylinder.multiplyScalar(5);

          this[`controlPoint${i}`].push(cylinder.x, cylinder.y, cylinder.z);
        }
      }
    };

    updateCtrlPts();

    let makeLib = () => {
      return `
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

      const mat2 m = mat2(0.80,  0.60, -0.60,  0.80);

      float noise(in vec2 p) {
        return sin(p.x)*sin(p.y);
      }

      float fbm4( vec2 p ) {
          float f = 0.0;
          f += 0.5000 * noise( p ); p = m * p * 2.02;
          f += 0.2500 * noise( p ); p = m * p * 2.03;
          f += 0.1250 * noise( p ); p = m * p * 2.01;
          f += 0.0625 * noise( p );
          return f / 0.9375;
      }

      float fbm6( vec2 p ) {
          float f = 0.0;
          f += 0.500000*(0.5+0.5 * noise( p )); p = m*p*2.02;
          f += 0.250000*(0.5+0.5 * noise( p )); p = m*p*2.03;
          f += 0.125000*(0.5+0.5 * noise( p )); p = m*p*2.01;
          f += 0.062500*(0.5+0.5 * noise( p )); p = m*p*2.04;
          f += 0.031250*(0.5+0.5 * noise( p )); p = m*p*2.01;
          f += 0.015625*(0.5+0.5 * noise( p ));
          return f/0.96875;
      }

      float pattern (vec2 p, float time) {
        float vout = fbm4( p + time + fbm6( p + fbm4( p + time )) );
        return (vout);
      }

      mat3 calcLookAtMatrix (vec3 origin, vec3 target, float roll) {
        vec3 rr = vec3(sin(roll), cos(roll), 0.0);
        vec3 ww = normalize(target - origin);
        vec3 uu = normalize(cross(ww, rr));
        vec3 vv = normalize(cross(uu, ww));

        return mat3(uu, vv, ww);
      }

      float rand (vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }
      `;
    };

    let getCodeLooper = () => {
      return `
      float getLooper (float t) {
        float maxLife = 0.9;
        float tailLength = 0.08;
        return min((t * tailLength + linearProgress * (maxLife - tailLength)), maxLife);
      }

      void makeNoise (inout vec3 coord, inout float t) {
        float az = 0.0;
        float el = 0.0;
        toBall(coord, az, el);

        float speed = 0.35;

        float randOffset = noise(offset.xy + offset.yz + offset.zx);

        az += pattern(vec2(az * randOffset * t, az * randOffset * t), time * speed);
        el += pattern(vec2(el * randOffset * t, el * randOffset * t), time * speed);

        coord += t * fromBall(t * pattern(t * vec2(offset.xy), 0.5), az, el);
      }
      `;
    };

    let makeTubeGLSL = () => {
      let item = `
      // dough nut
      // vec3 doughNut (float t) {
      //   float angle = t * 2.0 * PI;
      //   vec2 rot = vec2(cos(angle), sin(angle));
      //   return vec3(rot, 0.0) * 1.0;
      // }

      vec3 makeLine (float t) {
        return vec3(t, t * 2.0 - 1.0, 0.0);
      }

      ${getCodeLooper()}

      // line
      vec3 sample (float t) {
        float looper = getLooper(t);
        vec3 coord = getPointAt(looper);

        makeNoise(coord, t);

        return coord;
      }

      void createTube (float t, vec2 volume, out vec3 pos, out vec3 normal) {
        // find next sample along curve
        float nextT = t + (1.0 / lengthSegments);

        // sample the curve in two places
        vec3 cur = sample(t);
        vec3 next = sample(nextT);

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

      vec3 makeGeo () {
        float thickness = 0.01 * ${this.momoScale.toFixed(3)};
        float t = (position * 2.0) * 0.5 + 0.5;

        vec2 volume = vec2(thickness);
        vec3 transformed;
        vec3 objectNormal;
        createTube(t, volume, transformed, objectNormal);

        // vec3 transformedNormal = normalMatrix * objectNormal;

        return transformed;
      }
      `;

      return item;
    };

    let getRollGLSL = ({ name = "CONTROL_POINTS" }) => {
      let ifthenelse = ``;

      // let intval = `${Number(this.ctrlPts).toFixed(0)}`
      let floatval = `${Number(this.ctrlPts).toFixed(1)}`;

      for (let idx = 0; idx < this.ctrlPts; idx++) {
        ifthenelse += `
        else if (index == ${idx.toFixed(1)}) {
          result = controlPoint${idx.toFixed(0)};
        }
        `;
      }

      let attrs = `
      `;
      for (let idx = 0; idx < this.ctrlPts; idx++) {
        attrs += `
        attribute vec3 controlPoint${idx};
        `;
      }

      let res = `

      ${attrs}

      vec3 pointIDX_${name} (float index) {
        vec3 result = controlPoint0;

        if (false) {
        } ${ifthenelse}

        return result;
      }

      vec3 catmullRom (vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
          vec3 v0 = (p2 - p0) * 0.5;
          vec3 v1 = (p3 - p1) * 0.5;
          float t2 = t * t;
          float t3 = t * t * t;

          return vec3((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);
      }

      vec3 getPointAt (float t) {
        bool closed = false;
        float ll = ${floatval};
        float minusOne = 1.0;
        if (closed) {
          minusOne = 0.0;
        }

        float p = (ll - minusOne) * t;
        float intPoint = floor(p);
        float weight = p - intPoint;

        float idx0 = intPoint + -1.0;
        float idx1 = intPoint +  0.0;
        float idx2 = intPoint +  1.0;
        float idx3 = intPoint +  2.0;

        vec3 pt0 = pointIDX_${name}(idx0);
        vec3 pt1 = pointIDX_${name}(idx1);
        vec3 pt2 = pointIDX_${name}(idx2);
        vec3 pt3 = pointIDX_${name}(idx3);

        // pt0 = controlPoint0;
        // pt1 = controlPoint1;
        // pt2 = controlPoint2;
        // pt3 = controlPoint3;

        vec3 pointoutput = catmullRom(pt0, pt1, pt2, pt3, weight);

        return pointoutput;
      }
      `;
      // console.log(res);
      return res;
    };

    let makeGLSLVertexLines = () => {
      return `
        precision highp float;
        #define PI 3.1415926535897932384626433832795

        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        uniform mat3 normalMatrix;

        uniform float time;
        uniform float linearProgress;

        attribute float position;
        attribute float angle;
        attribute vec2 uv;
        attribute vec3 offset;

        ${makeLib()}
        ${getRollGLSL({ name: "CTRL" })}
        ${makeTubeGLSL()}

        varying float vT;

        void main (void) {
          vec3 nPos = makeGeo();

          // nPos += (offset * 2.0 - 1.0) * 10.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(nPos, 1.0);


          float t = (position * 2.0) * 0.5 + 0.5;
          float looper = getLooper(t);

          vT = t;

          if (!(looper >= 0.01 && looper <= 0.99)) {
            gl_Position.w = 0.0;
          }
        }
      `;
    };

    let makeGLSLVertexBall = () => {
      return `
        precision highp float;
        #define PI 3.1415926535897932384626433832795

        // uniform mat4 projectionMatrix;
        // uniform mat4 modelViewMatrix;
        // uniform mat3 normalMatrix;

        // attribute vec3 position;
        // attribute float angle;
        // attribute vec2 uv;

        attribute vec3 offset;

        uniform float time;
        uniform float linearProgress;

        ${makeLib()}
        ${getRollGLSL({ name: "CTRL" })}
        ${getCodeLooper()}

        mat4 translate (float x, float y, float z){
            return mat4(
                vec4(1.0, 0.0, 0.0, 0.0),
                vec4(0.0, 1.0, 0.0, 0.0),
                vec4(0.0, 0.0, 1.0, 0.0),
                vec4(x,   y,   z,   1.0)
            );
        }

        void main (void) {
          vec3 nPos = position;

          float looper = getLooper(1.0);
          vec3 coord = getPointAt(looper);

          float noise = 1.0;
          makeNoise(coord, noise);

          gl_Position = projectionMatrix * modelViewMatrix * translate(coord.x, coord.y, coord.z) * vec4(nPos, 1.0);

          // float t = 0.0 ; // (0.0 * 2.0) * 0.5 + 0.5;
          // if (!(looper >= 0.01 && looper <= 0.99)) {
          //   gl_Position.w = 0.0;
          // }
        }
      `;
    };

    let getLineMat = () => {
      return new RawShaderMaterial({
        uniforms: {
          baseColor: { value: new Color("#ffcf0f") },
          time: { value: 0 },
          linearProgress: { value: 0 },
        },
        transparent: true,
        side: DoubleSide,
        vertexShader: makeGLSLVertexLines(),
        fragmentShader: `
          precision highp float;
          varying float vT;
          uniform vec3 baseColor;

          void main (void) {
            gl_FragColor = vec4(baseColor, 0.5 * vT);
          }
        `,
        defines: {
          lengthSegments: subdivisions.toFixed(1),
        },
      });
    };

    let getBallMat = () => {
      return new ShaderMaterial({
        uniforms: {
          baseColor: { value: new Color("#ffcf0f") },
          time: { value: 0 },
          linearProgress: { value: 0 },
        },
        transparent: true,
        side: DoubleSide,
        vertexShader: makeGLSLVertexBall(),
        fragmentShader: `
          uniform vec3 baseColor;

          void main (void) {
            gl_FragColor = vec4(baseColor, 0.5);
          }
        `,
        defines: {
          // lengthSegments: subdivisions.toFixed(1)
        },
      });
    };

    let { line, ball } = new NoodleGeometry({
      parent: this,
      count,
      numSides,
      subdivisions,
      openEnded,
    });

    this.onLoop(() => {
      let time = window.performance.now() * 0.001;

      if (lanCurve) {
        lanCurve.material.uniforms.time.value = time;
      }

      if (lanBall) {
        lanBall.material.uniforms.time.value = time;
      }
      line.instanceCount = Math.floor((100 / 100.0) * count);
      ball.instanceCount = Math.floor((100 / 100.0) * count);
    });

    let lanBall = new Mesh(ball, getBallMat(), count);
    lanBall.frustumCulled = false;
    // lanBall.scale.set(100.0, 100.0, 100.0)
    this.lanBall = lanBall;

    let lanCurve = new Mesh(line, getLineMat(), count);
    this.lanCurve = lanCurve;
    lanCurve.frustumCulled = false;

    // lanCurve.scale.set(1.0, 1.0, 1.0);
    // lanCurve.layers.enable(3)
    // lanCurve.layers.enable(4)
    // lanCurve.userData.bloom = true

    lanCurve.userData.bloom = true;
    lanBall.userData.bloom = true;

    this.lanCurve.userData.bloom = true;
    this.lanBall.userData.bloom = true;

    this.group.add(this.lanCurve);
    this.group.add(this.lanBall);
  }

  setupProgressValue() {
    this.onLoop(() => {
      let time = window.performance.now() * 0.0001;
      this.lanCurve.material.uniforms.linearProgress.value = time % 1;
      this.lanBall.material.uniforms.linearProgress.value = time % 1;
    });

    // let animes = {}
    // window.addEventListener('start-tween', () => {
    //   // var clip = AnimationClip.findByName(gltf.animations, 'All Animations' );
    //   let tempLinear = { value: 0 }
    //   if (animes['linear']) {
    //     animes['linear'].pause()
    //   }

    //   animes['linear'] = anime({
    //     targets: [
    //       tempLinear
    //     ],
    //     value: 1,
    //     easing: 'linear',
    //     duration: this.duration * 1000,
    //     update: () => {
    //       this.lanCurve.material.uniforms.linearProgress.value = tempLinear.value
    //       this.lanBall.material.uniforms.linearProgress.value = tempLinear.value
    //     },
    //     loopComplete: () => {
    //       setTimeout(() => {
    //         animes['linear'].play()
    //       }, this.restartDelay * 1000)
    //     }
    //   })
    // })
    // window.dispatchEvent(new CustomEvent('start-tween', { detail: {} }))
  }
}

export function Noodles({ ...props }) {
  let o3d = useMemo(() => new Object3D());
  let tasks = useRef([]);
  useFrame(() => {
    tasks.current.forEach((e) => e());
  });
  useEffect(() => {
    tasks.current = [];
    let wires = new Wire({ o3d, onLoop: (fn) => tasks.current.push(fn) });

    return () => {
      wires.cleanUpScene();
    };
  });

  return (
    <group {...props}>
      <primitive object={o3d}></primitive>
      {/* <mesh>
      <boxBufferGeometry args={[8, 18, 8]}></boxBufferGeometry>
      <shaderMaterial transparent vertexShader={vs}></shaderMaterial>
    </mesh> */}
    </group>
  );
}
