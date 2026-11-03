/* Original animated plasma/star/dust composition; bounded display buffers. */
window.UOSBackground=(()=>{
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smoothstep=(a,b,x)=>{
  const t=clamp((x-a)/(b-a),0,1);
  return t*t*(3-2*t);
};

/* =========================================================
   Procedural animated space
========================================================= */

const space=document.getElementById("space");
const sctx=space.getContext("2d");
const dust=document.getElementById("dust");
const dctx=dust.getContext("2d");

let starLayers=[];
let dustParticles=[];
let shooters=[];
let lastShooter=0;
let nextShooter=3000+Math.random()*6000;

function resetSpace(){
  const dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(2500000/Math.max(1,innerWidth*innerHeight)));

  for(const c of [space,dust]){
    c.width=Math.floor(innerWidth*dpr);
    c.height=Math.floor(innerHeight*dpr);
    c.style.width=innerWidth+"px";
    c.style.height=innerHeight+"px";
    c.getContext("2d").setTransform(dpr,0,0,dpr,0,0);
  }

  const base=Math.min(600,Math.max(75,Math.floor(innerWidth*innerHeight/5200)));

  starLayers=[
    {speed:.010,size:[.25,.7],alpha:[.25,.55],count:Math.floor(base*1.1)},
    {speed:.026,size:[.35,1.0],alpha:[.35,.75],count:Math.floor(base*.72)},
    {speed:.060,size:[.55,1.5],alpha:[.45,.95],count:Math.floor(base*.34)}
  ].map((L,li)=>({
    ...L,
    stars:Array.from({length:L.count},()=>({
      x:Math.random()*innerWidth,
      y:Math.random()*innerHeight,
      r:mix(L.size[0],L.size[1],Math.random()),
      a:mix(L.alpha[0],L.alpha[1],Math.random()),
      tw:mix(.45,2.1,Math.random()),
      ph:Math.random()*Math.PI*2,
      hue:Math.random()
    }))
  }));

  dustParticles=Array.from({length:Math.floor(base*.18)},()=>({
    x:Math.random()*innerWidth,
    y:Math.random()*innerHeight,
    z:Math.random(),
    r:mix(.7,2.2,Math.random()),
    phase:Math.random()*Math.PI*2
  }));
}
resetSpace();

function spawnShooter(t){
  const fromLeft=Math.random()>.5;
  shooters.push({
    born:t,
    life:mix(650,1150,Math.random()),
    x:fromLeft ? -100 : innerWidth+100,
    y:Math.random()*innerHeight*.72,
    vx:(fromLeft?1:-1)*mix(.65,1.15,Math.random()),
    vy:mix(.18,.46,Math.random()),
    len:mix(70,150,Math.random())
  });
}

function drawNebula(t){
  // Glowing, turbulent aurora-plasma.
  // Multiple warped sine fields interfere so the pattern never simply loops
  // as a set of obvious bands or blobs.
  const time=t*.001;
  const pw=Math.max(110,Math.floor(innerWidth/5.5));
  const ph=Math.max(76,Math.floor(innerHeight/5.5));

  if(!drawNebula.buffer || drawNebula.buffer.width!==pw || drawNebula.buffer.height!==ph){
    drawNebula.buffer=document.createElement("canvas");
    drawNebula.buffer.width=pw;
    drawNebula.buffer.height=ph;
    drawNebula.ctx=drawNebula.buffer.getContext("2d");
    drawNebula.image=drawNebula.ctx.createImageData(pw,ph);
  }

  const data=drawNebula.image.data;

  for(let y=0;y<ph;y++){
    let ny=y/ph-.5;

    for(let x=0;x<pw;x++){
      let nx=x/pw-.5;

      // Domain warping.
      const w1=Math.sin(ny*8.3 + time*.31) + Math.cos(nx*6.1-time*.23);
      const w2=Math.sin(nx*10.7 - ny*5.2 + time*.17);
      const wx=nx + .095*Math.sin(ny*7.4 + w2 + time*.26);
      const wy=ny + .085*Math.cos(nx*8.1 - w1 - time*.21);

      // Interference fields.
      const a=Math.sin(wx*15.0 + time*.72);
      const b=Math.sin(wy*17.0 - time*.51);
      const c=Math.sin((wx+wy)*12.0 + time*.39);
      const d=Math.sin(Math.hypot(wx+.18,wy-.12)*31.0-time*.84);
      const e=Math.sin(wx*8.0-wy*14.0+Math.sin(time*.37)*2.0);

      let field=(a+b+c+d+e)/5;
      let n=(field+1)*.5;

      // Narrow luminous filaments with broad dim surrounding glow.
      const ridge=Math.pow(Math.max(0,1-Math.abs(field)*1.38),5.0);
      const haze=Math.pow(n,1.7)*.36;
      const energy=Math.min(1,ridge*1.18+haze*.72);

      // Slowly changing palette phase means filaments migrate between
      // aurora green, cyan, electric blue, violet and magenta.
      const phase=
        wx*3.4 + wy*2.1 +
        Math.sin(time*.19)*1.7 +
        d*.8;

      const green=.5+.5*Math.sin(phase);
      const cyan=.5+.5*Math.sin(phase+1.25);
      const violet=.5+.5*Math.sin(phase+2.55);
      const magenta=.5+.5*Math.sin(phase+3.55);

      let r=1 + energy*(10 + violet*48 + magenta*55);
      let g=2 + energy*(18 + green*95 + cyan*55);
      let bl=7 + energy*(35 + cyan*105 + violet*88);

      // Hot cores make selected plasma veins appear emissive.
      const core=Math.pow(ridge,1.85);
      r+=core*(35+magenta*55);
      g+=core*(55+green*75);
      bl+=core*(75+cyan*80);

      const i=(y*pw+x)*4;
      data[i]=Math.min(255,r);
      data[i+1]=Math.min(255,g);
      data[i+2]=Math.min(255,bl);
      data[i+3]=255;
    }
  }

  drawNebula.ctx.putImageData(drawNebula.image,0,0);

  // First pass: broad bloom.
  sctx.save();
  sctx.imageSmoothingEnabled=true;
  sctx.globalCompositeOperation="screen";
  sctx.globalAlpha=.62;
  sctx.filter="blur(32px)";
  sctx.drawImage(drawNebula.buffer,-18,-18,innerWidth+36,innerHeight+36);

  // Second pass: visible plasma structure.
  sctx.globalAlpha=1.0;
  sctx.filter="blur(3px)";
  sctx.drawImage(drawNebula.buffer,0,0,innerWidth,innerHeight);

  // Third pass: sharp glowing veins.
  sctx.globalAlpha=.72;
  sctx.filter="none";
  sctx.drawImage(drawNebula.buffer,0,0,innerWidth,innerHeight);
  sctx.restore();

  // Keep corners deep-space dark while retaining luminous central structure.
  const vg=sctx.createRadialGradient(
    innerWidth*.5,innerHeight*.48,0,
    innerWidth*.5,innerHeight*.48,Math.max(innerWidth,innerHeight)*.78
  );
  vg.addColorStop(0,"rgba(0,0,4,.02)");
  vg.addColorStop(.58,"rgba(0,0,5,.06)");
  vg.addColorStop(1,"rgba(0,0,7,.38)");
  sctx.fillStyle=vg;
  sctx.fillRect(0,0,innerWidth,innerHeight);
}

function drawSpace(t,ufoScreen){
  sctx.clearRect(0,0,innerWidth,innerHeight);
  sctx.fillStyle="#000106";
  sctx.fillRect(0,0,innerWidth,innerHeight);

  drawNebula(t);

  const cx=innerWidth/2,cy=innerHeight/2;
  const rot=t*.0000032;
  const cr=Math.cos(rot),sr=Math.sin(rot);

  for(const L of starLayers){
    for(const st of L.stars){
      let x=st.x-cx;
      let y=st.y-cy;

      const rx=x*cr-y*sr;
      const ry=x*sr+y*cr;

      x=rx + Math.sin(t*.00008+st.ph)*L.speed*90;
      y=ry + Math.cos(t*.00007+st.ph)*L.speed*60;

      let sx=x+cx, sy=y+cy;

      if(sx<-4)sx+=innerWidth+8;
      if(sx>innerWidth+4)sx-=innerWidth+8;
      if(sy<-4)sy+=innerHeight+8;
      if(sy>innerHeight+4)sy-=innerHeight+8;

      // subtle propulsion distortion near the UFO
      if(ufoScreen){
        const dx=sx-ufoScreen.x;
        const dy=sy-ufoScreen.y;
        const dist=Math.hypot(dx,dy);
        const field=150*ufoScreen.scale;
        if(dist<field && dist>1){
          const f=(1-dist/field)*10*ufoScreen.scale;
          sx+=dx/dist*f;
          sy+=dy/dist*f;
        }
      }

      const twinkle=.82+.18*Math.sin(t*.001*st.tw+st.ph);
      const alpha=st.a*twinkle;

      sctx.beginPath();
      sctx.arc(sx,sy,st.r,0,Math.PI*2);
      if(st.hue<.08) sctx.fillStyle=`rgba(115,150,220,${alpha*.68})`;
      else if(st.hue>.94) sctx.fillStyle=`rgba(190,150,185,${alpha*.58})`;
      else sctx.fillStyle=`rgba(210,220,255,${alpha*.72})`;
      sctx.fill();
    }
  }

  if(t-lastShooter>nextShooter){
    spawnShooter(t);
    lastShooter=t;
    nextShooter=5000+Math.random()*9000;
  }

  shooters=shooters.filter(s=>{
    const age=t-s.born;
    if(age>s.life)return false;

    const p=age/s.life;
    const x=s.x+s.vx*age;
    const y=s.y+s.vy*age;
    const fade=Math.sin(Math.PI*p);

    const g=sctx.createLinearGradient(x,y,x-s.vx*s.len,y-s.vy*s.len);
    g.addColorStop(0,`rgba(255,255,255,${.92*fade})`);
    g.addColorStop(1,"rgba(120,180,255,0)");
    sctx.strokeStyle=g;
    sctx.lineWidth=1.5;
    sctx.beginPath();
    sctx.moveTo(x,y);
    sctx.lineTo(x-s.vx*s.len,y-s.vy*s.len);
    sctx.stroke();
    return true;
  });
}

function drawForegroundDust(t){
  dctx.clearRect(0,0,innerWidth,innerHeight);

  for(const p of dustParticles){
    const speed=mix(.006,.022,p.z);
    let x=(p.x + t*speed)%(innerWidth+50)-25;
    let y=p.y + Math.sin(t*.0004+p.phase)*14*p.z;

    dctx.beginPath();
    dctx.arc(x,y,p.r*(.7+p.z),0,Math.PI*2);
    dctx.fillStyle=`rgba(130,165,255,${.025+.10*p.z})`;
    dctx.fill();
  }
}


return {resize:resetSpace,draw(t){drawSpace(t,null);drawForegroundDust(t)},release(){space.width=dust.width=1;space.height=dust.height=1}};
})();
