/* eero-card.js — 키오스크(index.html)와 휴대폰 저장 페이지(card.html)가 함께 쓰는 카드 렌더러 */
(function (G) {
'use strict';

/* ================= 그래픽 설정 ================= */
const CARD = {
  MERGE: 2.5,              // Metaball 병합 강도
  SOFT: 0,                 // Metaball 가장자리 부드러움 (0 = 번짐 없이 또렷하게)
  R_MIN: 0.045,            // '완전히 그래요'일 때 입자 반지름 (카드 너비 대비)
  R_MAX: 0.23,             // '전혀 아니에요'일 때 입자 반지름
  GLOSS: 0.60,             // Shape 3D 광택
  TINT: 0.95,              // Shape 3D 색농도
  SQUISH: 0.75,            // 말랑함 (누를 때 출렁임 · 표면 일렁임)
  REFR: 0.45,              // 굴절 (원본 기본값)
  CY: 0.79,                // 입자 무리의 세로 중심 (카드 너비 대비)
  RATIO: 1.48,             // 카드 세로/가로 비율 (1080 × 1598)
  SHOW_PCT: true,          // 카드에 속성별 퍼센트 표시
};

/* 질문 ↔ eero 변수 (Droplet Day의 색·도형) */
const QS = [
  { q:'지금 나는 내 일정의 시작과 끝을 조율할 수 있나요?',      name:'시간 조정 자율성', hex:'#D2F05E', ui:'#A5DA32', g:['#A5DA32','#DDF56E','#F8F53D'], sg:['#A5DA32','#D9F57A','#F8F53D'], sh:0 },
  { q:'지금 나는 내가 하고 싶은 행동을 선택할 수 있나요?',      name:'행동 선택 가능성', hex:'#4FD0CC', ui:'#1FC8C9', g:['#1FC8C9','#A6E4DE','#A9E9C6'], sg:['#1FC8C9','#5FD6CF','#B2EBCB'], sh:1 },
  { q:'지금 나는 업무/과제에 신경을 끄고 있나요?',             name:'심리적 분리',     hex:'#B98CFF', ui:'#A27BFF', g:['#A27BFF','#D9A6FF','#D3BCFF'], sg:['#9A7BFF','#B592FF','#F2B6FF'], sh:2 },
  { q:'지금 나는 꼭 일을 하지 않고 쉬어도 괜찮다고 느끼나요?',  name:'생산성 압박 자유', hex:'#5FBDFF', ui:'#5FBDFF', g:['#8C9BFF','#5FBDFF','#C3E3FF'], sg:['#8F9CFF','#5FBDFF','#C4E3FF'], sh:3 },
  { q:'지금 나는 타인에게 방해받지 않을 수 있나요?',           name:'외부 개입 자유',   hex:'#F39B4A', ui:'#F39B4A', g:['#F4504F','#F39B4A','#FCC75E'], sg:['#F4504F','#F3A04B','#FCC75E'], sh:4 },
];
/* 카드 배경: 아래쪽에서 은은하게 번지는 그라디언트 (eero_svg_shapes 배경과 같은 색) */
const BG = { stops:[[0,'#E2EDF9'],[0.35,'#E9F1F2'],[0.6,'#EFF4F0'],[0.82,'#F5F8F6'],[1,'#F6F8F7']], ink:'#111111' };
// 영문은 Articulat, 한글은 Asta Sans로 자동으로 나뉘어 그려져요
const SANS = '"articulat-cf","Asta Sans","Noto Sans KR",sans-serif', MONO = SANS;

/* ================= 유틸 ================= */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hexRGB(hex){ const n=parseInt(hex.slice(1),16); return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255]; }
function rgba(hex,a){ const n=parseInt(hex.slice(1),16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function hexToLab(hex){
  const lin=c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
  const [r,g,b]=hexRGB(hex).map(lin);
  const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b), m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b), s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s];
}

/* ================= 상태 · 입자 ================= */
function newState(seed){
  return { seed: seed==null ? Math.floor(Math.random()*65536) : seed, q:[80,80,80,80,80], theme:'metaball', name:'', text:'', off:[[0,0],[0,0],[0,0],[0,0],[0,0]], yaw:0.25, pitch:-0.1 };
}
function buildBase(seed){
  const R=mulberry32(seed*7919+13), a0=R()*TAU;
  return QS.map((_,k)=>({ a:a0+k*TAU/5+(R()-.5)*0.55, j:0.85+R()*0.3, p1:R()*TAU, p2:R()*TAU, f1:0.7+R()*0.6, f2:0.7+R()*0.6, rot:(R()-.5)*0.7, ph:R()*TAU, vr:0.75+0.5*R() }));
}
/* 입자의 기본 위치 (드래그 오프셋 제외, 카드 너비 1 기준) */
function homeOf(st,b,k,t){
  const neg=clamp(st.q[k]/100,0,1), dist=(0.27-0.06*neg)*b.j;
  return [0.5+Math.cos(b.a)*dist+Math.sin(t*0.33*b.f1+b.p1)*0.022, CARD.CY+Math.sin(b.a)*dist*1.08+Math.cos(t*0.29*b.f2+b.p2)*0.022];
}
/* 카드 너비 W(px) 기준 입자 목록. jig(k) → 누름 출렁임 값 */
function particles(st,base,t,W,jig){
  return base.map((b,k)=>{
    const neg=clamp(st.q[k]/100,0,1), h=homeOf(st,b,k,t);
    const rN=Math.sqrt(CARD.R_MIN**2+(CARD.R_MAX**2-CARD.R_MIN**2)*neg);
    // 위쪽은 문구·영문 문장 자리라 입자 윗부분이 넘어오지 않게 해요
    const x=clamp(h[0]+st.off[k][0],0.05,0.95), y=clamp(h[1]+st.off[k][1],Math.max(0.44,0.43+rN*0.95),1.18);
    const r=W*rN*(1+0.03*Math.sin(t*0.8+b.p1));
    return { k, x:x*W, y:y*W, r, q: jig ? jig(k) : 0 };
  });
}
const ownOf = (st,k) => 100 - Math.round(st.q[k]);

/* ================= Metaball (WebGL2, Droplet Day 필드 셰이더) ================= */
const META_FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec4 uB[5];
uniform vec3 uGC[5]; uniform vec3 uGM[5]; uniform vec3 uGB[5];
uniform float uK; uniform float uAA; uniform float uSoftG;
out vec4 outColor;
vec3 labToLinear(vec3 c){
  float l_=c.x+0.3963377774*c.y+0.2158037573*c.z, m_=c.x-0.1055613458*c.y-0.0638541728*c.z, s_=c.x-0.0894841775*c.y-1.2914855480*c.z;
  float l=l_*l_*l_, m=m_*m_*m_, s=s_*s_*s_;
  return vec3(4.0767416621*l-3.3077115913*m+0.2309699292*s, -1.2684380046*l+2.6097574011*m-0.3413193965*s, -0.0041960863*l-0.7034186147*m+1.7076147010*s);
}
vec3 toSRGB(vec3 c){ c=clamp(c,0.0,1.0); vec3 lo=c*12.92; vec3 hi=1.055*pow(c,vec3(1.0/2.4))-0.055; return mix(hi,lo,step(c,vec3(0.0031308))); }
void main(){
  vec2 p=vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  float Wr=1.0-1.0/(uK*uK); Wr*=Wr;
  float F=0.0; vec2 G=vec2(0.0); vec3 labSum=vec3(0.0); float chromaSum=0.0, wSum=0.0, rSum=0.0;
  for(int k=0;k<5;k++){
    vec4 d=uB[k]; float r=d.z;
    if(r<0.5) continue;
    vec2 v=p-d.xy; float d2=dot(v,v)+0.001;
    float Rc=r*uK; float q=1.0-d2/(Rc*Rc);
    if(q<=0.0) continue;
    float f=(r*r/d2)*q*q/Wr;
    F+=f;
    G-=((r*r/Wr)*(2.0*q*q/(d2*d2)+4.0*q/(d2*Rc*Rc)))*v;
    float w=pow(f,0.7);
    vec2 u=v/r;
    vec3 g=mix(uGM[k],uGB[k],smoothstep(-0.1,0.95,u.y));
    vec2 hq=(u-vec2(0.0,-0.5))*vec2(0.78,1.0);
    float hs=1.0-smoothstep(0.0,0.95,length(hq));
    g=mix(g,uGC[k],hs*hs*(3.0-2.0*hs));
    labSum+=w*g; chromaSum+=w*length(g.yz); wSum+=w; rSum+=w*r;
  }
  if(wSum<=0.0){ outColor=vec4(0.0); return; }
  vec3 labOut=labSum/wSum;
  float c0=length(labOut.yz), cT=chromaSum/wSum;
  if(c0>0.0001){ labOut.yz*=mix(1.0,clamp(cT/c0,1.0,1.8),0.7); }
  vec3 rgb=toSRGB(labToLinear(labOut));
  float Fs=max(F,0.00000001); float h=inversesqrt(Fs);
  float gh=0.5*length(G)/(Fs*sqrt(Fs));
  float sd=mix((F-1.0)/max(length(G),0.0001), (1.0-h)/max(gh,0.0001), step(1.0,F));
  float aaE=max(uAA,uSoftG*rSum/wSum);
  float a=smoothstep(-aaE,aaE,sd); a=a*a*(3.0-2.0*a);
  outColor=vec4(rgb*a,a);
}`;
function compileProgram(gl,vs,fs){
  const sh=(type,src)=>{ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function makeMetaGL(canvas){
  const gl=canvas.getContext('webgl2',{antialias:false,alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
  if(!gl) return null;
  let prog; try{ prog=compileProgram(gl,'#version 300 es\nin vec2 aPos;\nvoid main(){gl_Position=vec4(aPos,0.0,1.0);}',META_FS); }catch(e){ console.error(e); return null; }
  gl.useProgram(prog);
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(prog,'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  const L={}; ['uRes','uB','uGC','uGM','uGB','uK','uAA','uSoftG'].forEach(n=>L[n]=gl.getUniformLocation(prog,n));
  const GC=new Float32Array(15), GM=new Float32Array(15), GB=new Float32Array(15);
  QS.forEach((v,k)=>{ GC.set(hexToLab(v.g[0]),k*3); GM.set(hexToLab(v.g[1]),k*3); GB.set(hexToLab(v.g[2]),k*3); });
  gl.uniform3fv(L.uGC,GC); gl.uniform3fv(L.uGM,GM); gl.uniform3fv(L.uGB,GB);
  const B=new Float32Array(20);
  return function render(parts){
    gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    B.fill(0); parts.forEach(p=>B.set([p.x,p.y,p.r*(1+p.q*0.9),1],p.k*4));
    gl.uniform4fv(L.uB,B); gl.uniform2f(L.uRes,canvas.width,canvas.height);
    gl.uniform1f(L.uK,CARD.MERGE);
    gl.uniform1f(L.uSoftG,0.9*Math.pow(CARD.SOFT,1.3));
    gl.uniform1f(L.uAA,Math.max(0.8,canvas.width*0.0011));
    gl.drawArrays(gl.TRIANGLES,0,3);
  };
}
function drawMetaFallback(ctx,parts){
  parts.slice().sort((a,b)=>b.r-a.r).forEach(p=>{
    const G=QS[p.k].g, r=p.r*(1+p.q*0.9), gr=ctx.createRadialGradient(p.x,p.y-r*0.5,0,p.x,p.y,r*1.05);
    gr.addColorStop(0,G[0]); gr.addColorStop(0.55,G[1]); gr.addColorStop(1,G[2]);
    ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.fill();
  });
}

/* ================= Shape 3D — eero_svg_shapes_smooth_inflate의 SVG 도형 · 굴절 · 눌림을 WebGL로 옮김 ================= */
const SVGS=[
 {name:'Autonomy',rect:{w:94.357,rx:14.4454,m:[0.707091,0.707123,-0.707091,0.707123,76.5327,6.354]},c:[76.53,73.08],
  grad:{t:[28.5045,-9.14953],a:74.9315,s:[112.38,145.994],local:true},stops:[[0.365192,'#A5DA32'],[0.617747,'#C8E688'],[1,'#FFFD6C']]},
 {name:'Possibility',d:'M69.6045 24.1235C86.3604 11.1921 106.683 8.38146 117.154 18.2915C128.27 28.8112 124.237 49.8339 108.347 66.1753C124.189 82.3874 128.29 103.256 117.295 113.802C106.884 123.788 86.5145 121.091 69.6582 108.236C52.9032 121.164 32.5846 123.974 22.1143 114.065C10.9996 103.546 15.0299 82.5249 30.917 66.1841C15.0803 49.9731 10.9822 29.1089 21.9756 18.564C32.3844 8.5801 52.7498 11.2734 69.6045 24.1235Z',c:[69.63,66.18],
  grad:{t:[69.6355,36.473],a:90,s:[83.5454,108.531]},stops:[[0.102239,'#1BCAC7'],[0.509615,'#ABDBDA'],[1,'#AAE4D1']]},
 {name:'Detachment',d:'M71.665 13.5351C73.2329 11.938 75.8061 11.938 77.3739 13.5351L88.4992 24.8679C89.4144 25.8002 90.7273 26.2268 92.0157 26.0105L107.677 23.3817C109.884 23.0112 111.966 24.5236 112.296 26.7372L114.635 42.4455C114.828 43.7377 115.639 44.8544 116.809 45.4368L131.024 52.5162C133.028 53.5138 133.823 55.9608 132.788 57.9454L125.448 72.0291C124.845 73.1876 124.845 74.568 125.448 75.7265L132.788 89.8102C133.823 91.7948 133.028 94.2418 131.024 95.2395L116.809 102.319C115.639 102.901 114.828 104.018 114.635 105.31L112.296 121.018C111.966 123.232 109.884 124.744 107.677 124.374L92.0157 121.745C90.7273 121.529 89.4144 121.955 88.4992 122.888L77.3739 134.221C75.8061 135.818 73.2329 135.818 71.665 134.221L60.5398 122.888C59.6246 121.955 58.3117 121.529 57.0232 121.745L41.3618 124.374C39.1547 124.744 37.073 123.232 36.7433 121.018L34.4036 105.31C34.2112 104.018 33.3998 102.901 32.2304 102.319L18.0146 95.2395C16.0113 94.2418 15.2162 91.7948 16.2505 89.8102L23.5905 75.7265C24.1943 74.568 24.1943 73.1876 23.5905 72.0291L16.2505 57.9454C15.2162 55.9608 16.0113 53.5138 18.0146 52.5162L32.2304 45.4368C33.3998 44.8544 34.2112 43.7377 34.4036 42.4455L36.7433 26.7372C37.073 24.5236 39.1547 23.0112 41.3618 23.3817L57.0232 26.0105C58.3117 26.2268 59.6246 25.8002 60.5398 24.8679L71.665 13.5351Z',c:[74.52,73.88],
  grad:{t:[74.5195,38.9813],a:90,s:[98.1469,127.498]},stops:[[0.102239,'#A27AFF'],[0.697115,'#F8B6FF'],[1,'#B5B9FF']]},
 {name:'Permission',d:'M100.28 28.8376C100.28 30.6254 101.73 32.0747 103.517 32.0747H121.681C123.469 32.0747 124.918 33.524 124.918 35.3118V97.0505C124.918 98.8383 123.469 100.288 121.681 100.288H103.517C101.73 100.288 100.28 101.737 100.28 103.525V116.782C100.28 118.57 98.831 120.019 97.0431 120.019H43.6717C41.8839 120.019 40.4346 118.57 40.4346 116.782V103.525C40.4346 101.737 38.9853 100.288 37.1974 100.288H19.034C17.2462 100.288 15.7969 98.8383 15.7969 97.0505V35.3118C15.7969 33.524 17.2462 32.0747 19.034 32.0747H37.1974C38.9853 32.0747 40.4346 30.6254 40.4346 28.8376V15.5745C40.4346 13.7867 41.8839 12.3374 43.6717 12.3374H97.0431C98.831 12.3374 100.28 13.7867 100.28 15.5745V28.8376Z',c:[70.36,66.18],
  grad:{t:[70.3574,36.4732],a:90,s:[83.5459,109.986]},stops:[[0,'#8398FF'],[0.341346,'#60C2FF'],[1,'#CDE2FF']]},
 {name:'Protection',d:'M65.0716 13.4941C67.7426 11.952 71.0333 11.952 73.7043 13.4941L118.663 39.4522C121.334 40.9942 122.979 43.8439 122.979 46.9279V98.8447C122.979 101.929 121.334 104.778 118.663 106.321L73.7043 132.279C71.0333 133.821 67.7425 133.821 65.0716 132.279L20.1129 106.321C17.4422 104.778 15.7969 101.929 15.7969 98.8447V46.9279C15.7969 43.8439 17.4422 40.9942 20.1129 39.4522L65.0716 13.4941Z',c:[69.39,72.89],
  grad:{t:[69.3879,38.7435],a:90,s:[96.0272,124.745]},stops:[[0,'#F44E4B'],[0.341346,'#F49D4B'],[1,'#FFCF5F']]}
];
const SH_COL=['#A5DA32','#1BCAC7','#A27AFF','#60C2FF','#F49D4B'];
const DNT=256, DM=60, THICK=0.46;
let DGEO=null;
function buildDropGeos(){
  if(DGEO) return DGEO;
  const pc=document.createElement('canvas').getContext('2d');
  SVGS.forEach(S=>{
    if(S.rect){ const w=S.rect.w,r=S.rect.rx,p=new Path2D(); p.moveTo(r,0); p.arcTo(w,0,w,w,r); p.arcTo(w,w,0,w,r); p.arcTo(0,w,0,0,r); p.arcTo(0,0,w,0,r); p.closePath(); S.path=p; S.m=S.rect.m; }
    else { S.path=new Path2D(S.d); S.m=[1,0,0,1,0,0]; }
    const inside=(x,y)=>{ pc.setTransform(S.m[0],S.m[1],S.m[2],S.m[3],S.m[4],S.m[5]); const v=pc.isPointInPath(S.path,x,y); pc.setTransform(1,0,0,1,0,0); return v; };
    const cast=(cx,cy)=>{ const rs=[]; for(let i=0;i<DNT;i++){ const th=i/DNT*TAU, dx=Math.cos(th), dy=-Math.sin(th); let lo=0,hi=110; for(let k=0;k<24;k++){ const mid=(lo+hi)/2; if(inside(cx+dx*mid,cy+dy*mid)) lo=mid; else hi=mid; } rs.push(lo); } return rs; };
    const rs0=cast(S.c[0],S.c[1]);
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    rs0.forEach((r,i)=>{ const th=i/DNT*TAU, x=S.c[0]+Math.cos(th)*r, y=S.c[1]-Math.sin(th)*r; x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); });
    S.c=[(x0+x1)/2,(y0+y1)/2]; S.raw=cast(S.c[0],S.c[1]);
    S.stops.forEach(st=>st[2]=hexRGB(st[1]));
  });
  const UMAX=Math.max(...SVGS.map(S=>Math.max(...S.raw)));
  const blur=(rs)=>{ const o=rs.slice(); for(let i=0;i<DNT;i++) rs[i]=(o[(i-1+DNT)%DNT]+2*o[i]+o[(i+1)%DNT])/4; };
  function levelsOf(raw){ const L=[]; const rs=raw.map(r=>r/UMAX); for(let b=0;b<4;b++) blur(rs); L.push(rs.slice()); let done=4; [12,40,120,360,900].forEach(n=>{ for(let b=done;b<n;b++) blur(rs); done=n; L.push(rs.slice()); }); return L; }
  function ringProf(L,g){ const u=Math.pow(Math.max(0,1-g),0.5)*(L.length-1), k=Math.min(Math.floor(u),L.length-2), f=u-k, a=L[k], b=L[k+1]; return a.map((v,i)=>v+(b[i]-v)*f); }
  function gradColor(S,lx,ly){
    let X=S.c[0]+lx*UMAX, Y=S.c[1]-ly*UMAX;
    if(S.grad.local){ const m=S.m, det=m[0]*m[3]-m[1]*m[2], px=X-m[4], py=Y-m[5]; X=(m[3]*px-m[2]*py)/det; Y=(-m[1]*px+m[0]*py)/det; }
    const g=S.grad, a=g.a*Math.PI/180, qx=X-g.t[0], qy=Y-g.t[1];
    const rx=qx*Math.cos(a)+qy*Math.sin(a), ry=-qx*Math.sin(a)+qy*Math.cos(a);
    const t=Math.hypot(rx/g.s[0],ry/g.s[1]), st=S.stops;
    if(t<=st[0][0]) return st[0][2];
    if(t>=st[st.length-1][0]) return st[st.length-1][2];
    for(let i=0;i<st.length-1;i++) if(t<=st[i+1][0]){ const f=(t-st[i][0])/(st[i+1][0]-st[i][0]), A=st[i][2], B=st[i+1][2]; return [A[0]+(B[0]-A[0])*f, A[1]+(B[1]-A[1])*f, A[2]+(B[2]-A[2])*f]; }
    return st[st.length-1][2];
  }
  const mk=(DNT,DM)=>SVGS.map(S=>{
    const L=levelsOf(S.raw), nv=(DM+1)*DNT;
    const pos=new Float32Array(nv*3), col=new Float32Array(nv*3), nor=new Float32Array(nv*3), idx=new Uint16Array(DM*DNT*6);
    for(let j=0;j<=DM;j++){
      const ph=-Math.PI/2+Math.PI*j/DM, c=Math.cos(ph), s=Math.sin(ph), g=Math.pow(Math.max(c,0),0.42), z=THICK*Math.sign(s)*Math.pow(Math.abs(s),0.75), rs=ringProf(L,g);
      for(let i=0;i<DNT;i++){ const th=i/DNT*TAU, r=rs[i*(256/DNT)]*g, x=r*Math.cos(th), y=r*Math.sin(th), q=(j*DNT+i)*3; pos[q]=x; pos[q+1]=y; pos[q+2]=z; const cc=gradColor(S,x,y); col[q]=cc[0]; col[q+1]=cc[1]; col[q+2]=cc[2]; }
    }
    let n=0;
    for(let j=0;j<DM;j++) for(let i=0;i<DNT;i++){ const a=j*DNT+i, b=j*DNT+(i+1)%DNT, c=(j+1)*DNT+i, e=(j+1)*DNT+(i+1)%DNT; idx[n++]=a; idx[n++]=b; idx[n++]=c; idx[n++]=b; idx[n++]=e; idx[n++]=c; }
    for(let f=0;f<idx.length;f+=3){
      const ia=idx[f]*3, ib=idx[f+1]*3, ic=idx[f+2]*3;
      const ux=pos[ib]-pos[ia], uy=pos[ib+1]-pos[ia+1], uz=pos[ib+2]-pos[ia+2], vx=pos[ic]-pos[ia], vy=pos[ic+1]-pos[ia+1], vz=pos[ic+2]-pos[ia+2];
      const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      for(const v of [ia,ib,ic]){ nor[v]+=nx; nor[v+1]+=ny; nor[v+2]+=nz; }
    }
    let zs=0; for(let v=(DM-3)*DNT; v<(DM-1)*DNT; v++) zs+=nor[v*3+2];
    const fl=zs<0?-1:1;
    for(let v=0;v<nv;v++){ const q=v*3, l=Math.hypot(nor[q],nor[q+1],nor[q+2])||1; nor[q]*=fl/l; nor[q+1]*=fl/l; nor[q+2]*=fl/l; }
    return { pos, nor, col, idx, maxR: Math.max(...L[0]) };
  });
  DGEO=mk(256,60); DGEO.lo=mk(64,16);
  return DGEO;
}
const DROP_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform vec2 uRes; uniform vec2 uC; uniform vec3 uS; uniform mat3 uR;
uniform float uTime; uniform float uSeed; uniform vec3 uHit; uniform float uHitT; uniform float uAmp; uniform float uSoft;
varying vec3 vN; varying vec3 vC; varying vec3 vP; varying float vW;
void main(){
  vec3 p=aPos; vec3 n=aNor;
  float d=distance(p,uHit);
  float decay=exp(-uHitT*(2.6/max(uSoft,0.2)));
  float wave=uAmp*decay*sin(uHitT*13.0-d*7.0)*exp(-d*0.7);
  float dent=-uAmp*exp(-uHitT*5.0)*exp(-d*d*3.5);
  float idle=0.03*uSoft*sin(uTime*1.9+p.x*2.6+uSeed)*sin(uTime*1.5+p.y*2.8+uSeed*0.7);
  float disp=(wave*0.3+dent*0.45)*uSoft+idle;
  p+=n*disp; vW=disp;
  vec3 wp=uR*(p*uS);
  vN=normalize(uR*(n/uS)); vC=aCol; vP=p;
  vec2 sp=vec2(uC.x+wp.x, uC.y-wp.y);
  gl_Position=vec4(sp.x/uRes.x*2.0-1.0, 1.0-sp.y/uRes.y*2.0, 0.0, 1.0);
}`;
const DROP_FS = `
precision highp float;
uniform sampler2D uBg; uniform vec2 uRes; uniform float uRefr; uniform float uTint; uniform float uBack; uniform float uTime; uniform float uGloss;
varying vec3 vN; varying vec3 vC; varying vec3 vP; varying float vW;
vec3 pal(float t){ return vec3(0.75,0.75,0.78)+vec3(0.3,0.3,0.28)*cos(6.28318*(t+vec3(0.0,0.33,0.62))); }
void main(){
  vec3 N=normalize(vN); vec3 V=vec3(0.0,0.0,1.0);
  if(uBack>0.5){ if(N.z>0.0) discard; } else { if(N.z<0.0) discard; }
  float ndv=clamp(dot(N,V),0.0,1.0); float fr=1.0-ndv;
  vec3 c=vC;
  vec3 iri=pal(fr*1.6+vP.y*0.3+vW*3.0+uTime*0.03);
  if(uBack>0.5){ float e=smoothstep(0.5,1.0,fr); gl_FragColor=vec4(mix(mix(c,vec3(1.0),0.15),iri,0.25),e*(0.15+0.35*uTint)); return; }
  vec2 uv=gl_FragCoord.xy/uRes;
  float lens=uRefr*0.09;
  vec2 off=-N.xy*lens*(0.35+1.4*fr*fr)-N.xy*lens*0.6*(1.0-fr);
  float ca=uRefr*0.006*(0.2+fr*2.0);
  vec3 refr;
  refr.r=texture2D(uBg,uv+off*(1.0+ca*6.0)).r;
  refr.g=texture2D(uBg,uv+off).g;
  refr.b=texture2D(uBg,uv+off*(1.0-ca*6.0)).b;
  float edge=smoothstep(0.4,1.0,fr);
  vec3 col=refr;
  col=mix(col,col*c*1.08,clamp(uTint*(0.75+edge*0.5),0.0,1.0));
  col=mix(col,c,clamp(uTint*(0.22+edge*0.55),0.0,1.0));
  col=mix(col,mix(iri,c,0.65),edge*edge*0.1*(0.3+uGloss));
  vec3 R=reflect(-V,N);
  vec3 L1=normalize(vec3(-0.55,0.75,0.6)); vec3 L2=normalize(vec3(0.7,-0.45,0.55)); vec3 L3=normalize(vec3(0.2,0.9,0.3));
  float wrapL=clamp((dot(N,L1)+0.6)/1.6,0.0,1.0);
  col*=mix(0.9,1.04,wrapL);
  col=mix(col,c*1.06+0.04,0.12*(1.0-fr));
  col=mix(col,vec3(1.0),smoothstep(0.45,1.0,fr)*0.16);
  float shin=mix(14.0,140.0,uGloss*uGloss);
  float s1=pow(max(dot(R,L1),0.0),shin)*(0.22+1.18*uGloss);
  float s2=pow(max(dot(R,L2),0.0),shin*0.4)*0.6*uGloss;
  float s3=pow(max(dot(R,L3),0.0),shin*0.6)*0.45*uGloss;
  float win=smoothstep(0.0,0.03,R.y-0.45)*smoothstep(0.03,0.0,R.y-0.8)*smoothstep(0.03,0.0,abs(R.x+0.35)-0.18)*0.5*uGloss*uGloss;
  float rim=smoothstep(0.84,0.97,fr)*0.45*uGloss;
  float spec=s1+s2+s3+win+rim;
  col+=vec3(spec);
  float alpha=mix(0.65+0.25*uTint,1.0,smoothstep(0.2,0.8,fr));
  gl_FragColor=vec4(min(col,vec3(1.0)),clamp(alpha+spec*0.6,0.0,1.0));
}`;
/* 회전 행렬 R = Rx(x)·Ry(y), column-major */
function rotMat(x,y){ const cx=Math.cos(x), sx=Math.sin(x), cy=Math.cos(y), sy=Math.sin(y); return [ cy, sx*sy, -cx*sy,  0, cx, sx,  sy, -sx*cy, cx*cy ]; }
/* 도형 하나의 현재 자세 (회전 · 떠오름 · 출렁임) */
function dropPose(p,t,view,f){
  const ph=p.k*0.9+(p.ph||0), soft=CARD.SQUISH;
  const j = f ? f.sq*Math.exp(-f.sqT*2.4/Math.max(soft,0.2))*Math.sin(f.sqT*11)*0.14*soft : 0;
  return { rx: view.rx+Math.cos(t*0.6+ph)*0.14, ry: view.ry+Math.sin(t*0.7+ph)*0.4, fy: Math.sin(t*1.1+ph)*0.07, j };
}
function makeDropGL(canvas){
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
  if(!gl) return null;
  let prog; try{ prog=compileProgram(gl,DROP_VS,DROP_FS); }catch(e){ console.error(e); return null; }
  gl.useProgram(prog);
  const geosAll=[buildDropGeos(),buildDropGeos().lo];
  const bufsAll=geosAll.map(geos=>geos.map(g=>{
    const mk=(data,target)=>{ const b=gl.createBuffer(); gl.bindBuffer(target,b); gl.bufferData(target,data,gl.STATIC_DRAW); return b; };
    return { pos:mk(g.pos,gl.ARRAY_BUFFER), nor:mk(g.nor,gl.ARRAY_BUFFER), col:mk(g.col,gl.ARRAY_BUFFER), idx:mk(g.idx,gl.ELEMENT_ARRAY_BUFFER), n:g.idx.length };
  }));
  const bufs=bufsAll[0], bufsLo=bufsAll[1];
  const A={ pos:gl.getAttribLocation(prog,'aPos'), nor:gl.getAttribLocation(prog,'aNor'), col:gl.getAttribLocation(prog,'aCol') };
  const L={}; ['uRes','uC','uS','uR','uTime','uSeed','uHit','uHitT','uAmp','uSoft','uBg','uRefr','uTint','uBack','uGloss'].forEach(n=>L[n]=gl.getUniformLocation(prog,n));
  const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
  [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(w=>gl.texParameteri(gl.TEXTURE_2D,w,gl.CLAMP_TO_EDGE));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.uniform1i(L.uBg,0);
  // 굴절로 비쳐 보일 배경 (카드 배경 그라디언트)
  const bgCv=document.createElement('canvas'); let bgKey='';
  function syncBg(){
    const key=canvas.width+'x'+canvas.height; if(key===bgKey) return; bgKey=key;
    bgCv.width=canvas.width; bgCv.height=canvas.height; paintBG(bgCv.getContext('2d'),bgCv.width,bgCv.height);
    gl.bindTexture(gl.TEXTURE_2D,tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bgCv);
  }
  function render(parts,t,view,fx){
    syncBg();
    gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.uniform2f(L.uRes,canvas.width,canvas.height); gl.uniform1f(L.uTime,t);
    gl.uniform1f(L.uTint,CARD.TINT); gl.uniform1f(L.uGloss,CARD.GLOSS); gl.uniform1f(L.uSoft,CARD.SQUISH); gl.uniform1f(L.uRefr,CARD.REFR);
    const list=parts.slice().sort((a,b)=>(a.y+0.3*a.r)-(b.y+0.3*b.r));
    for(const p of list){
      const b=(p.lod?bufsLo:bufs)[p.k], f=('fx' in p)?p.fx:(fx&&fx[p.k]), pose=dropPose(p,t,view,f);
      gl.bindBuffer(gl.ARRAY_BUFFER,b.pos); gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,b.nor); gl.enableVertexAttribArray(A.nor); gl.vertexAttribPointer(A.nor,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,b.col); gl.enableVertexAttribArray(A.col); gl.vertexAttribPointer(A.col,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.idx);
      gl.uniformMatrix3fv(L.uR,false,new Float32Array(rotMat(pose.rx,pose.ry)));
      gl.uniform2f(L.uC,p.x,p.y-pose.fy*p.r);
      gl.uniform3f(L.uS,p.r*(1+pose.j*0.7),p.r*(1-pose.j),p.r*(1+pose.j*0.4));
      gl.uniform1f(L.uSeed,p.k*1.7);
      gl.uniform3f(L.uHit, f?f.hit[0]:0, f?f.hit[1]:0, f?f.hit[2]:0.5);
      gl.uniform1f(L.uHitT, f?f.hitT:99); gl.uniform1f(L.uAmp, f?f.amp:0);
      gl.uniform1f(L.uBack,1); gl.drawElements(gl.TRIANGLES,b.n,gl.UNSIGNED_SHORT,0);
      gl.uniform1f(L.uBack,0); gl.drawElements(gl.TRIANGLES,b.n,gl.UNSIGNED_SHORT,0);
    }
  }
  return render;
}
/* 바닥 그림자 (원본: 도형 색으로 물든 부드러운 타원) */
function drawDropShadows(ctx,parts,t,view,fx){
  for(const p of parts){
    const pose=dropPose(p,t,view,fx&&fx[p.k]), op=clamp(0.32-pose.fy*0.6,0,1);
    ctx.save(); ctx.translate(p.x,p.y+1.38*p.r); ctx.scale(1.2*p.r*(1-pose.fy+pose.j*0.5),0.45*p.r*(1-pose.fy));
    const g=ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,rgba(SH_COL[p.k],0.9*op)); g.addColorStop(0.5,rgba(SH_COL[p.k],0.3*op)); g.addColorStop(1,rgba(SH_COL[p.k],0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,1,0,TAU); ctx.fill(); ctx.restore();
  }
}
/* 화면 좌표 → 도형 로컬 좌표 (누른 자리 계산용) */
function dropLocalHit(p,px,py,t,view,f){
  const pose=dropPose(p,t,view,f), vx=(px-p.x)/p.r, vy=-(py-(p.y-pose.fy*p.r))/p.r, vz=0.42;
  const m=rotMat(pose.rx,pose.ry); // column-major → R^T·v
  return [ m[0]*vx+m[1]*vy+m[2]*vz, m[3]*vx+m[4]*vy+m[5]*vz, m[6]*vx+m[7]*vy+m[8]*vz ];
}
function dropRadius(k){ return buildDropGeos()[k].maxR; }
function drawShapesFlat(ctx,parts){
  parts.forEach(p=>{ ctx.fillStyle=SH_COL[p.k]; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*0.85,0,TAU); ctx.fill(); });
}

/* ================= 배경 · 카드 텍스트 ================= */
function paintBG(ctx,W,H){
  const g=ctx.createRadialGradient(W/2,H*1.05,0,W/2,H*1.05,Math.max(W*0.75,H));
  BG.stops.forEach(([o,c])=>g.addColorStop(o,c));
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
const BG_CSS = `radial-gradient(${CARD.RATIO*100}% 100% at 50% 105%, ${BG.stops.map(([o,c])=>c+' '+o*100+'%').join(', ')})`;

/* 하단 eero 로고 (첨부 SVG, viewBox 1033.07 × 271.04) */
const LOGO_PATHS = [
  "M897.55,271.04c-38.68,0-74.88-16.19-100.59-44.71-25.71,28.51-61.91,44.71-100.59,44.71-74.73,0-135.52-60.79-135.52-135.52S621.65,0,696.38,0c38.68,0,74.88,16.19,100.59,44.71,25.71-28.51,61.91-44.71,100.59-44.71,74.73,0,135.52,60.79,135.52,135.52s-60.79,135.52-135.52,135.52ZM796.96,204.27l5.48,6.88c23.22,29.16,57.89,45.89,95.11,45.89,67.01,0,121.52-54.51,121.52-121.52s-54.51-121.52-121.52-121.52c-37.22,0-71.89,16.73-95.11,45.89l-5.48,6.88-5.48-6.88c-23.22-29.16-57.89-45.89-95.11-45.89-67.01,0-121.52,54.51-121.52,121.52s54.51,121.52,121.52,121.52c37.22,0,71.89-16.73,95.11-45.89l5.48-6.88Z",
  "M336.7,271.04c-38.68,0-74.88-16.19-100.59-44.71-25.71,28.51-61.91,44.71-100.59,44.71C60.79,271.04,0,210.25,0,135.52S60.79,0,135.52,0c38.68,0,74.88,16.19,100.59,44.71C261.81,16.19,298.02,0,336.7,0c74.73,0,135.52,60.79,135.52,135.52s-60.79,135.52-135.52,135.52ZM236.11,204.27l5.48,6.88c23.22,29.16,57.89,45.89,95.11,45.89,67.01,0,121.52-54.51,121.52-121.52S403.7,14,336.7,14c-37.22,0-71.89,16.73-95.11,45.89l-5.48,6.88-5.48-6.88c-23.22-29.16-57.89-45.89-95.11-45.89-67.01,0-121.52,54.51-121.52,121.52s54.51,121.52,121.52,121.52c37.22,0,71.89-16.73,95.11-45.89l5.48-6.88Z",
  "M206.01,154.07c-2.52,11.03-9.48,23.03-19.16,32.7-29.22,29.22-74.31,29.42-103.14.58-28.83-28.83-28.64-74.31.39-103.33,29.03-29.03,74.31-29.03,102.95-.39,15.87,15.87,23.41,36.96,21.48,58.63H79.26c1.55,12.38,6.77,23.8,16.25,33.28,21.67,21.67,55.54,21.48,78.57-1.55,5.81-5.81,10.25-12.19,13.16-19.74l18.77-.2ZM80.81,125.62h110.3c-1.55-11.22-7.55-21.87-15.87-30.19-21.67-21.67-55.73-21.28-78.37,1.36-8.52,8.52-13.74,18.38-16.06,28.83Z",
  "M399.77,98.69c6.02,9.58,9.58,22.99,9.58,36.67,0,41.32-31.74,73.34-72.52,73.34-40.77,0-72.79-32.29-72.79-73.34,0-41.05,32.02-73.07,72.52-73.07,22.44,0,42.69,9.58,56.65,26.27l-91.4,91.4c9.85,7.66,21.62,12.04,35.03,12.04,30.65,0,54.46-24.09,54.46-56.65,0-8.21-1.37-15.87-4.65-23.26l13.13-13.41ZM291.13,167.1l78-77.99c-9.03-6.84-20.8-10.13-32.57-10.13-30.65,0-54.46,24.36-54.46,56.38,0,12.04,3.28,22.71,9.03,31.74Z",
  "M970.89,135.36c0,41.32-32.02,73.34-73.34,73.34s-73.34-32.29-73.34-73.34,32.02-73.07,73.34-73.07,73.34,32.02,73.34,73.07ZM952.83,135.36c0-32.29-23.53-56.38-55.28-56.38s-55.28,24.09-55.28,56.38,23.53,56.65,55.28,56.65,55.28-24.09,55.28-56.65Z",
  "M674.1,202.65v-111.73h-22.67v-17.77h40.44l.7,17.53c6.78-10.29,18-17.53,32.02-17.53h30.8v17.77h-30.8c-17.53,0-31.79,10.99-31.79,29.45v82.28h-18.7Z"
  ];
const LOGO_W=1033.07, LOGO_H=271.04;
let LOGO2D=null;
function drawLogo(ctx,cx,cy,w,color){
  if(!LOGO2D){ LOGO2D=LOGO_PATHS.map(d=>new Path2D(d)); const c=new Path2D(); c.arc(516.54,79.1,14.62,0,TAU); c.moveTo(531.16,191.89); c.arc(516.54,191.89,14.62,0,TAU); LOGO2D.push(c); }
  const sc=w/LOGO_W;
  ctx.save(); ctx.translate(cx-w/2,cy-LOGO_H*sc/2); ctx.scale(sc,sc); ctx.fillStyle=color||'#000';
  LOGO2D.forEach(p=>ctx.fill(p)); ctx.restore();
}

/* ================= 추천 문장 =================
   가장 큰 입자(지금 가장 부족한 속성)에 맞춰 한 문장을 골라요. 모두 고르게 작으면 기본 문장. */
const HEADLINES = [
  [['Your Clock,\nYour Call.','내 시간의 시작은 내가 정해봐요'], ['Own the Hours.\nSet Your Pace.','시간을 내 것으로, 속도도 내 마음대로']],                                  // 시간 조정 자율성
  [['Choose What\nFeels Right.','마음이 가는 쪽을 골라요'], ['Not a Must.\nJust a Maybe.','해야 하는 일 말고, 하고 싶은 일을 해봐요!'], ['Pick Your Own\nNext Move.','다음은 내 뜻대로 움직여볼까요?']], // 행동 선택 가능성
  [['Log Off.\nYour Mind, Too.','지금은 잠시 로그아웃!'], ['Leave Work\nat the Door.','일은 문 앞에 두고 와요']],                                                            // 심리적 분리
  [['Rest Is Not\na Waste of Time.','쉬는 건 시간 낭비가 아니에요'], ['Doing Nothing\nIs Doing Something.','아무것도 안 하는 것조차 이 시간을 보내는 방법이에요']],             // 생산성 압박 자유
  [['Do Not Disturb.\nThis Time Is Mine.','방해 금지! 지금 시간은 나의 것'], ['Guard Your Hours.\nThey Are Yours.','나의 시간을 지켜요'], ['Mute the Noise.\nKeep the Moment.','소음을 끄고 이 순간을 지켜봐요']], // 외부 개입 자유
];
const HEADLINE_FREE = [['No Score. No Goal.\nJust Time!','점수도, 목표도 필요 없어요. 그냥 시간을 즐겨봐요!'], ['This Moment\nBelongs to You.','이 순간은 온전히 당신의 것이에요']];
const HEADLINE_MIN = 40;   // 가장 큰 값이 이보다 작으면(모두 충분히 소유) 기본 문장
/* [영문, 한글 번역] */
function headlineOf(st){
  const mx=Math.max(...st.q);
  if(mx<HEADLINE_MIN) return HEADLINE_FREE[st.seed%HEADLINE_FREE.length];
  const k=st.q.indexOf(mx), L=HEADLINES[k];
  return L[st.seed%L.length];
}
/* 문구 '지금 서현은 여유롭게 티타임하는 시간' → ['지금 서현은','여유롭게 티타임하는 시간'] */
function splitPhrase(text){
  const m=/^(지금 \S*?[은는])\s+(.*)$/.exec((text||'').trim());
  return m ? [m[1],m[2]] : ['',(text||'').trim()];
}
function dateStr(){ const d=new Date(); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }

/* 카드 위 글자: 상단 한 줄 문구 · 큰 영문 문장 · (속성별 %) · 하단 eero 로고 */
function drawLabels(ctx,W,H,st,opt){
  opt=opt||{};
  const s=W/1080;
  ctx.save(); ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  // 상단: 지금 서현은 + (굵게) 문구
  let [who,phrase]=splitPhrase(st.text);
  let ghost=false;
  if(!phrase && opt.who){ who=opt.who; phrase=opt.placeholder||''; ghost=true; }
  if(who||phrase){
    const f1=`400 ${40*s}px ${SANS}`, f2=`700 ${40*s}px ${SANS}`, gap=12*s;
    ctx.font=f1; const w1=who?ctx.measureText(who).width:0;
    ctx.font=f2; const w2=phrase?ctx.measureText(phrase).width:0;
    const tw=w1+(who&&phrase?gap:0)+w2; let x=(W-tw)/2; const y=148*s;
    ctx.fillStyle='#8A8A8A'; ctx.font=f1; if(who){ ctx.fillText(who,x,y); x+=w1+gap; }
    ctx.fillStyle=ghost?'#C8C8C8':'#7A7A7A'; ctx.font=f2; if(phrase) ctx.fillText(phrase,x,y);
  }
  // 큰 영문 문장 (마지막 카드에만)
  if(opt.headline!==false){
    const [en,ko]=headlineOf(st);
    ctx.fillStyle=BG.ink; ctx.textAlign='center'; ctx.font=`500 ${80*s}px ${SANS}`;
    en.split('\n').forEach((line,i)=>ctx.fillText(line,W/2,(272+88*i)*s,W-120*s));   // 행간 88
    ctx.fillStyle='#8A8A8A'; ctx.font=`400 ${30*s}px ${SANS}`; ctx.fillText(ko,W/2,446*s,W-120*s);   // 영문 아래 여백
  }
  // 속성별 퍼센트
  if(CARD.SHOW_PCT){
    const colW=172*s, x0=W/2-colW*2.5, y=H-226*s;
    QS.forEach((v,k)=>{
      const cx=x0+colW*(k+0.5);
      ctx.font=`600 ${30*s}px ${SANS}`; const t=ownOf(st,k)+'%', tw=ctx.measureText(t).width;
      ctx.fillStyle=v.hex; ctx.beginPath(); ctx.arc(cx-tw/2-10*s,y-10*s,9*s,0,TAU); ctx.fill();
      ctx.fillStyle='#3A3A3A'; ctx.textAlign='center'; ctx.fillText(t,cx+9*s,y);
      ctx.fillStyle='#9A9A9A'; ctx.font=`400 ${19*s}px ${SANS}`; ctx.fillText(v.name,cx,y+34*s,colW-8*s);
    });
  }
  ctx.restore();
  drawLogo(ctx,W/2,H-82*s,262*s,'#000');
}
async function fontsReady(){
  try{ await Promise.all([ document.fonts.load(`400 40px "Asta Sans"`,'지금 서현은 Time'), document.fonts.load(`500 80px "articulat-cf"`,'No Score'), document.fonts.load(`600 30px "articulat-cf"`,'80%'), document.fonts.load(`700 40px "Asta Sans"`,'여유로운') ]); }catch(e){}
}

/* ================= 카드 한 장 그리기 (저장용 1080×1350) ================= */
const EXP={};
async function renderCard(st,W){
  W=W||1080; const H=Math.round(W*CARD.RATIO);
  await fontsReady();
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  paintBG(ctx,W,H);
  const T=st.t||0, parts=particles(st,buildBase(st.seed),T,W);
  const key=st.theme+W;
  if(!EXP[key]){ const cv=document.createElement('canvas'); cv.width=W; cv.height=H; EXP[key]={ cv, r: st.theme==='metaball' ? makeMetaGL(cv) : makeDropGL(cv) }; }
  const E=EXP[key];
  if(st.theme==='metaball'){ if(E.r){ E.r(parts); ctx.drawImage(E.cv,0,0); } else drawMetaFallback(ctx,parts); }
  else { const view={rx:st.pitch, ry:st.yaw}; drawDropShadows(ctx,parts,T,view); if(E.r){ E.r(parts,T,view); ctx.drawImage(E.cv,0,0); } else drawShapesFlat(ctx,parts); }
  drawLabels(ctx,W,H,st);
  return c;
}


/* ================= 움직이는 GIF 만들기 =================
   카드를 짧게 여러 장 그려서(앞으로 → 뒤로 되감기) 끊김 없이 반복되는 GIF로 묶어요.
   팔레트 255색 + 순서 디더링, 바뀐 부분만 저장해서 용량을 줄여요. */
const GIF_OPT = { W: 480, FRAMES: 24, STEP: 0.2, DELAY: 9 };   // 9 = 0.09초
function buildPalette(frames,W,H){
  const hist=new Uint32Array(32768);
  frames.forEach(d=>{ for(let i=0;i<d.length;i+=8){ hist[((d[i]>>3)<<10)|((d[i+1]>>3)<<5)|(d[i+2]>>3)]++; } });
  // 배경처럼 넓은 색이 팔레트를 독차지하지 않도록 개수의 제곱근으로 가중치를 줘요
  const wt=new Float32Array(32768); for(let k=0;k<32768;k++) wt[k]=Math.sqrt(hist[k]);
  const keys=[]; for(let k=0;k<32768;k++) if(hist[k]) keys.push(k);
  const ch=(k,c)=> c===0 ? k>>10 : c===1 ? (k>>5)&31 : k&31;
  const boxStat=b=>{ let mn=[31,31,31], mx=[0,0,0], cnt=0; for(const k of b){ for(let c=0;c<3;c++){ const v=ch(k,c); if(v<mn[c]) mn[c]=v; if(v>mx[c]) mx[c]=v; } cnt+=wt[k]; } return {mn,mx,cnt}; };
  let boxes=[keys];
  while(boxes.length<255){
    let bi=-1, best=-1, axis=0;
    boxes.forEach((b,i)=>{ if(b.length<2) return; const st=boxStat(b); for(let c=0;c<3;c++){ const sc=(st.mx[c]-st.mn[c])*(st.mx[c]-st.mn[c])*Math.sqrt(st.cnt); if(sc>best){ best=sc; bi=i; axis=c; } } });
    if(bi<0) break;
    const b=boxes[bi].slice().sort((x,y)=>ch(x,axis)-ch(y,axis));
    let tot=0; b.forEach(k=>tot+=wt[k]); let acc=0, cut=1;
    for(let i=0;i<b.length-1;i++){ acc+=wt[b[i]]; if(acc>=tot/2){ cut=i+1; break; } }
    boxes.splice(bi,1,b.slice(0,cut),b.slice(cut));
  }
  const pal=new Uint8Array(256*3);
  boxes.forEach((b,i)=>{ let r=0,g=0,bl=0,n=0; for(const k of b){ const w=wt[k]; r+=ch(k,0)*w; g+=ch(k,1)*w; bl+=ch(k,2)*w; n+=w; } pal[i*3]=Math.round(r/n*8.226); pal[i*3+1]=Math.round(g/n*8.226); pal[i*3+2]=Math.round(bl/n*8.226); });
  return { pal, n: boxes.length };
}
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function indexFrame(d,W,H,P,cache){
  const out=new Uint8Array(W*H);
  for(let y=0,i=0;y<H;y++) for(let x=0;x<W;x++,i++){
    const o=(BAYER[(y&3)*4+(x&3)]/16-0.47)*7, q=i*4;
    const r=clamp(d[q]+o,0,255)>>3, g=clamp(d[q+1]+o,0,255)>>3, b=clamp(d[q+2]+o,0,255)>>3, key=(r<<10)|(g<<5)|b;
    let v=cache[key];
    if(v<0){ let best=1e9; const R=r*8.226, G=g*8.226, B=b*8.226; for(let p=0;p<P.n;p++){ const dr=P.pal[p*3]-R, dg=P.pal[p*3+1]-G, db=P.pal[p*3+2]-B, e=dr*dr*2+dg*dg*4+db*db*3; if(e<best){ best=e; v=p; } } cache[key]=v; }
    out[i]=v;
  }
  return out;
}
function lzwEncode(ix,out){
  const minCode=8, clear=256, eoi=257; let size=9, next=258;
  const dict=new Map(); let cur=0, bits=0, blk=[];
  const flushBlk=()=>{ if(blk.length){ out.push(blk.length,...blk); blk=[]; } };
  const emit=code=>{ cur|=code<<bits; bits+=size; while(bits>=8){ blk.push(cur&255); cur>>>=8; bits-=8; if(blk.length===255) flushBlk(); } };
  out.push(minCode); emit(clear);
  let prefix=ix[0];
  for(let i=1;i<ix.length;i++){
    const k=ix[i], key=prefix*256+k, v=dict.get(key);
    if(v!==undefined){ prefix=v; continue; }
    emit(prefix);
    if(next<4096){ dict.set(key,next++); if(next>(1<<size) && size<12) size++; }
    else { emit(clear); dict.clear(); size=9; next=258; }
    prefix=k;
  }
  emit(prefix); if(next>=(1<<size) && size<12) size++;
  emit(eoi);
  if(bits>0) blk.push(cur&255);
  flushBlk(); out.push(0);
}
async function makeCardGif(st,onProgress){
  const W=GIF_OPT.W, H=Math.round(W*CARD.RATIO), N=GIF_OPT.FRAMES, t0=st.t||0, frames=[];
  for(let i=0;i<N;i++){
    const c=await renderCard(Object.assign({},st,{t:t0+i*GIF_OPT.STEP}),W);
    frames.push(c.getContext('2d').getImageData(0,0,W,H).data);
    onProgress && onProgress(0.6*(i+1)/N); await new Promise(r=>setTimeout(r,0));
  }
  const P=buildPalette(frames,W,H), cache=new Int16Array(32768).fill(-1), TR=255;
  const idx=[]; for(let i=0;i<N;i++){ idx.push(indexFrame(frames[i],W,H,P,cache)); onProgress && onProgress(0.6+0.2*(i+1)/N); await new Promise(r=>setTimeout(r,0)); }
  const order=[]; for(let i=0;i<N;i++) order.push(i); for(let i=N-2;i>0;i--) order.push(i);
  const out=[]; const w16=v=>out.push(v&255,(v>>8)&255);
  [...'GIF89a'].forEach(c=>out.push(c.charCodeAt(0))); w16(W); w16(H); out.push(0xF7,0,0);
  for(let i=0;i<256*3;i++) out.push(P.pal[i]);
  out.push(0x21,0xFF,0x0B,...[...'NETSCAPE2.0'].map(c=>c.charCodeAt(0)),0x03,0x01,0,0,0);
  let prev=null;
  for(let f=0;f<order.length;f++){
    const cur=idx[order[f]];
    let x0=0,y0=0,x1=W-1,y1=H-1, sub;
    if(prev){
      x0=W; y0=H; x1=-1; y1=-1;
      for(let y=0,i=0;y<H;y++) for(let x=0;x<W;x++,i++) if(cur[i]!==prev[i]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
      if(x1<0){ x0=0; y0=0; x1=0; y1=0; }
    }
    const w=x1-x0+1, h=y1-y0+1; sub=new Uint8Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(y+y0)*W+(x+x0); sub[y*w+x] = (prev && cur[i]===prev[i]) ? TR : cur[i]; }
    out.push(0x21,0xF9,0x04,(1<<2)|1); w16(GIF_OPT.DELAY); out.push(TR,0);
    out.push(0x2C); w16(x0); w16(y0); w16(w); w16(h); out.push(0);
    lzwEncode(sub,out);
    prev=cur;
    onProgress && onProgress(0.8+0.2*(f+1)/order.length); await new Promise(r=>setTimeout(r,0));
  }
  out.push(0x3B);
  return new Blob([new Uint8Array(out)],{type:'image/gif'});
}

/* ================= QR 주소용 인코딩 ================= */
function b64uEncode(str){ const bytes=new TextEncoder().encode(str); let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b)); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64uDecode(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; const bin=atob(s); return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))); }
const h2=n=>clamp(Math.round(n),0,255).toString(16).padStart(2,'0');
const wrapA=a=>{ a=((a+Math.PI)%TAU+TAU)%TAU-Math.PI; return a; };
function encode(st){
  let s='c'+st.seed.toString(16).padStart(4,'0')+st.q.map(h2).join('')+(st.theme==='shape'?'s':'m');
  s+=st.off.map(o=>h2(o[0]*200+128)+h2(o[1]*200+128)).join('');
  s+=h2(wrapA(st.yaw)/Math.PI*127+128)+h2(clamp(st.pitch,-1.3,1.3)/1.3*127+128);
  s+=Math.round(((st.t||0)%600)*100).toString(16).padStart(4,'0');
  const t=(st.text||'').trim(); if(t) s+='.'+b64uEncode(t);
  return s;
}
function decode(hash){
  const m=/^#?c([0-9a-f]{4})([0-9a-f]{10})([ms])([0-9a-f]{20})([0-9a-f]{4})([0-9a-f]{4})(?:\.([A-Za-z0-9_-]+))?$/.exec(hash||''); if(!m) return null;
  const hx=(str,i)=>parseInt(str.slice(i,i+2),16);
  const st=newState(parseInt(m[1],16));
  st.q=[0,2,4,6,8].map(i=>clamp(hx(m[2],i),0,100));
  st.theme=m[3]==='s'?'shape':'metaball';
  st.off=[0,1,2,3,4].map(k=>[(hx(m[4],k*4)-128)/200,(hx(m[4],k*4+2)-128)/200]);
  st.yaw=(hx(m[5],0)-128)/127*Math.PI; st.pitch=(hx(m[5],2)-128)/127*1.3;
  st.t=parseInt(m[6],16)/100;
  if(m[7]){ try{ st.text=b64uDecode(m[7]); }catch(e){} }
  return st;
}

G.EeroCard = { CARD, QS, BG, BG_CSS, clamp, newState, buildBase, homeOf, particles, ownOf, makeMetaGL, makeDropGL, drawMetaFallback, drawDropShadows, dropLocalHit, dropRadius, drawShapesFlat, paintBG, drawLabels, fontsReady, renderCard, makeCardGif, encode, decode, headlineOf, splitPhrase, drawLogo };
})(window);

