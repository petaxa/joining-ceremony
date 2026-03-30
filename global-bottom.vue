<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { useNav } from "@slidev/client";
import { colors } from "./theme-colors";

const hexToGlsl = (hex: string, max = 1.0): string => {
  const h = hex.replace("#", "");
  const r = (parseInt(h.slice(0, 2), 16) / 255) * max;
  const g = (parseInt(h.slice(2, 4), 16) / 255) * max;
  const b = (parseInt(h.slice(4, 6), 16) / 255) * max;
  return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
};

const accentGlsl = hexToGlsl(colors.accent.DEFAULT, 0.3);

type BgCenter = {
  x: number;
  y: number;
  deg?: number;
};
type SlideFrontmatter = {
  bgCenter?: BgCenter;
};
const { currentSlideRoute } = useNav();
const frontmatter = computed<SlideFrontmatter>(
  () => ((currentSlideRoute.value.meta?.slide as any)?.frontmatter ?? {}) as SlideFrontmatter,
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let animationFrameId: number | null = null;

const bgCenterX = computed<number>(() => frontmatter.value.bgCenter?.x ?? 0.5);
const bgCenterY = computed<number>(() => frontmatter.value.bgCenter?.y ?? 0.5);
// const bgCenterX = computed < number > (() => 50);
// const bgCenterY = computed < number > (() => 50);

// -----------------------------------------------------------
// Shader Sources (変更なし)
// -----------------------------------------------------------

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;
const fragmentShaderSource = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_center; // 0〜100

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  #define NUM_OCTAVES 5
  float fbm ( in vec2 _st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5),
                    -sin(0.5), cos(0.50));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
      v += a * (snoise(_st) * 0.5 + 0.5);
      _st = rot * _st * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  vec2 culcCenter ( vec2 u_center, float aspect ) {
    vec2 centerPos = u_center / 100.0;
    centerPos.y = 1.0 - centerPos.y;
    centerPos.x = 1.0 - centerPos.x;
    centerPos.x *= aspect;
    return centerPos;
  }

  void main() {
    vec2 st = gl_FragCoord.xy/u_resolution.xy;
    float aspect = u_resolution.x/u_resolution.y;

    st.x = 1.0 - st.x;
    st.x *= aspect;

    vec2 centerPos = culcCenter(u_center, aspect);
    float dist = length(st - centerPos);

    const float fogRadius = 0.8;
    const float richRadius = 0.1;
    float mask = smoothstep(fogRadius, richRadius, dist);
    mask = pow(mask, 1.5);

    const float speed = 0.18;
    float t = u_time * 0.1 * speed;

    vec2 q = vec2(0.);
    q.x = fbm( st + 0.00 * t );
    q.y = fbm( st + vec2(1.0));

    vec2 r = vec2(0.);
    r.x = fbm( st + 1.0*q + vec2(1.7,9.2) + t );
    r.y = fbm( st + 1.0*q + vec2(8.3,2.8) + t );

    vec3 bgColor = vec3(0.0, 0.0, 0.0);
    vec3 fogColor = vec3(0.2, 0.2, 0.2);
    vec3 highlightColor = ${accentGlsl};
    vec3 haze = mix(fogColor, highlightColor, length(q));

    const float contrast = 1.5;
    const float baseLevel = 0.3;
    float f = fbm(st+r);
    float alpha = f * mask;
    vec3 finalColor = mix(bgColor, haze, clamp(alpha * contrast, baseLevel, 1.0));

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// -----------------------------------------------------------
// WebGL Helpers (変更なし)
// -----------------------------------------------------------

const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
) => {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

// -----------------------------------------------------------
// Lifecycle & Render Loop
// -----------------------------------------------------------

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  gl = canvas.getContext("webgl");
  if (!gl) return;

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return;
  program = createProgram(gl, vertexShader, fragmentShader);

  if (!program) return;

  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  const timeUniformLocation = gl.getUniformLocation(program, "u_time");
  const centerUniformLocation = gl.getUniformLocation(program, "u_center");

  const resize = () => {
    if (!gl) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  };

  window.addEventListener("resize", resize);
  resize();

  // === 変更点: 補間用の変数を初期化 ===
  // 現在描画に使われている座標（初期値はフロントマターの値にしておく）
  let currentSmoothX = bgCenterX.value;
  let currentSmoothY = bgCenterY.value;

  // 追従速度 (0.01: 遅い 〜 0.1: 速い)。0.05くらいがちょうどよい粘り気になります。
  const lerpFactor = 0.006;

  const render = (time: number) => {
    time *= 0.001;

    if (!gl) return;

    // === 変更点: Lerp (線形補間) 処理 ===
    // 目標値（フロントマターの値）
    const targetX = bgCenterX.value;
    const targetY = bgCenterY.value;
    console.log("target", targetX, targetY, "currentSmooth", currentSmoothX, currentSmoothY);

    // 現在値 = 現在値 + (目標値 - 現在値) * 係数
    // これにより、目標値に近づくほど変化量が小さくなり、スムーズに減速して止まります
    currentSmoothX += (targetX - currentSmoothX) * lerpFactor;
    currentSmoothY += (targetY - currentSmoothY) * lerpFactor;

    gl.useProgram(program);

    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(timeUniformLocation, time);

    // 補間されたスムーズな値をシェーダーに渡す
    gl.uniform2f(centerUniformLocation, currentSmoothX, currentSmoothY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationFrameId = requestAnimationFrame(render);
  };

  animationFrameId = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  window.removeEventListener("resize", () => {});

  if (gl && program) gl.deleteProgram(program);
});
</script>

<template>
  <div class="canvas-container">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<style scoped>
.canvas-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #000;
  position: absolute;
  /* Slidevの背景として使うならabsoluteが良い場合が多い */
  top: 0;
  left: 0;
  z-index: -1;
  /* コンテンツの後ろに配置 */
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
