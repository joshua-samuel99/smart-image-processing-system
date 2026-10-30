
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const S = {
    file:null, buffer:null, original:null, output:null, gray:false,
    metrics:null, lineage:[], results:{}, history:[], hashes:{}
  };

  const clamp = n => Math.max(0, Math.min(255, n));
  const canvas = (w,h) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const ctx = c => c.getContext("2d", {willReadFrequently:true});
  const getPixels = c => ctx(c).getImageData(0,0,c.width,c.height);
  const copyCanvas = c => {
    const n = canvas(c.width,c.height);
    ctx(n).drawImage(c,0,0);
    return n;
  };
  const escapeHTML = s => String(s).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);

  function toast(text) {
    $("toast").textContent = text;
    $("toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("toast").classList.remove("show"), 3000);
  }

  function say(text, bad=false) {
    $("status").textContent = text;
    $("status").className = "sm " + (bad ? "bad" : "mut");
  }

  function log(text) {
    S.history.unshift({time:new Date().toLocaleTimeString(),text});
    S.history = S.history.slice(0,15);
    $("history").innerHTML = S.history.map(x =>
      `<div><span class="mut">${escapeHTML(x.time)}</span> — ${escapeHTML(x.text)}</div>`
    ).join("");
    updateReportPreview();
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === name)
    );
    document.querySelectorAll(".view").forEach(v =>
      v.classList.toggle("active", v.id === "view-" + name)
    );
  }

  document.querySelectorAll(".tab").forEach(b =>
    b.addEventListener("click", () => showTab(b.dataset.tab))
  );

  function loadImage(file) {
    return new Promise((resolve,reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The browser could not decode this image."));
      };
      im.src = url;
    });
  }

  function drawPreview(id, c) {
    const box = $(id);
    box.replaceChildren();
    if (!c) {
      box.textContent = "No image loaded";
      return;
    }
    const im = new Image();
    im.alt = "Image preview";
    im.src = c.toDataURL("image/png");
    box.appendChild(im);
  }

  async function upload(file) {
    if (!file) return;
    if (!["image/png","image/jpeg","image/webp"].includes(file.type)) {
      say("Choose a PNG, JPEG or WebP image.", true);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      say("Choose an image smaller than 25 MB.", true);
      return;
    }

    try {
      say("Loading image…");
      const im = await loadImage(file);
      if (im.naturalWidth > 12000 || im.naturalHeight > 12000) {
        throw new Error("Image dimensions exceed the 12000-pixel limit.");
      }

      const scale = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = canvas(im.naturalWidth * scale, im.naturalHeight * scale);
      ctx(c).drawImage(im,0,0,c.width,c.height);

      // Store original file bytes separately from the analysis canvas.
      S.file = file;
      S.buffer = await file.arrayBuffer();
      S.original = c;
      S.output = copyCanvas(c);
      S.gray = false;
      S.metrics = null;
      S.lineage = [];
      S.results = {};
      S.hashes = {};

      ["brightness","contrast","sharpen","smooth"].forEach(id => $(id).value = 0);
      $("gamma").value = 100;
      updateSliderLabels();

      $("meta").textContent =
        `${file.name} · ${im.naturalWidth} × ${im.naturalHeight} · ${(file.size/1024).toFixed(1)} KB` +
        (scale < 1 ? ` · analysis scaled to ${c.width} × ${c.height}` : "");
      $("go").disabled = false;
      $("tamperResult").textContent = "Analyse the image first to create a lineage.";
      $("lineage").textContent = "No lineage yet.";
      $("forensicSummary").textContent = "Run the forensic tests to inspect possible anomalies.";
      ["ela","noise","copy"].forEach(k => {
        $(k+"Result").textContent = "Not run";
        $(k+"Preview").textContent = k.toUpperCase() + " MAP";
      });

      updateAll();
      log("Loaded image: " + file.name);
      say("Image loaded successfully. Click Analyse and enhance.");
      toast("Image uploaded.");
    } catch (e) {
      console.error(e);
      say("Image upload failed: " + e.message, true);
      toast(e.message);
    }
  }

  const drop = $("drop");
  ["dragenter","dragover"].forEach(ev => drop.addEventListener(ev,e => {
    e.preventDefault();
    drop.classList.add("drag");
  }));
  ["dragleave","drop"].forEach(ev => drop.addEventListener(ev,e => {
    e.preventDefault();
    drop.classList.remove("drag");
  }));
  drop.addEventListener("drop",e => upload(e.dataTransfer.files[0]));
  $("file").addEventListener("change",e => {
    upload(e.target.files[0]);
    e.target.value = "";
  });

  function calculateMetrics(c) {
    const d = getPixels(c).data;
    const n = c.width*c.height;
    const gray = new Float32Array(n);
    let sum=0,sum2=0,dark=0,bright=0;
    for(let i=0,p=0;i<d.length;i+=4,p++) {
      const y=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
      gray[p]=y; sum+=y; sum2+=y*y;
      if(y<5)dark++;
      if(y>250)bright++;
    }
    const mean=sum/n;
    const contrast=Math.sqrt(Math.max(0,sum2/n-mean*mean));
    let lap=0,lap2=0,count=0;
    for(let y=1;y<c.height-1;y++)for(let x=1;x<c.width-1;x++) {
      const i=y*c.width+x;
      const v=gray[i-1]+gray[i+1]+gray[i-c.width]+gray[i+c.width]-4*gray[i];
      lap+=v;lap2+=v*v;count++;
    }
    const sharpness=count?Math.max(0,lap2/count-(lap/count)**2):0;
    return {width:c.width,height:c.height,mean,contrast,sharpness,
      darkPercent:100*dark/n,brightPercent:100*bright/n};
  }

  function diagnosisText(m) {
    const notes=[];
    if(m.mean<75)notes.push("The image is relatively dark.");
    else if(m.mean>190)notes.push("The image is relatively bright.");
    else notes.push("Average brightness is in a moderate range.");
    if(m.contrast<35)notes.push("Contrast is relatively low.");
    if(m.sharpness<100)notes.push("The sharpness indicator is low; inspect visually.");
    if(m.darkPercent+m.brightPercent>5)notes.push("Some pixels may be clipped near black or white.");
    if(notes.length===1)notes.push("No obvious issue was flagged by these simple metrics.");
    return notes.join(" ") + "\nThese thresholds are heuristics, not a trained quality classifier.";
  }

  function renderMetrics(m) {
    $("mBrightness").textContent=m.mean.toFixed(1);
    $("mContrast").textContent=m.contrast.toFixed(1);
    $("mSharpness").textContent=m.sharpness.toFixed(1);
    $("mClipping").textContent=(m.darkPercent+m.brightPercent).toFixed(2)+"%";
    $("mResolution").textContent=`${m.width} × ${m.height}`;
    $("mSize").textContent=(S.file.size/1024).toFixed(1)+" KB";
    $("diagnosisText").textContent =
      `Mean luminance: ${m.mean.toFixed(2)} / 255\n`+
      `Contrast standard deviation: ${m.contrast.toFixed(2)}\n`+
      `Laplacian variance: ${m.sharpness.toFixed(2)}\n`+
      `Near-black pixels: ${m.darkPercent.toFixed(2)}%\n`+
      `Near-white pixels: ${m.brightPercent.toFixed(2)}%\n\n`+
      diagnosisText(m);
  }

  function updateSliderLabels() {
    $("brightnessVal").textContent=$("brightness").value;
    $("contrastVal").textContent=$("contrast").value;
    $("gammaVal").textContent=(+$("gamma").value/100).toFixed(2);
    $("sharpenVal").textContent=$("sharpen").value;
    $("smoothVal").textContent=$("smooth").value;
  }

  function boxBlur(src,w,h,r) {
    const out=new Uint8ClampedArray(src.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const p=(y*w+x)*4;
      for(let ch=0;ch<3;ch++) {
        let sum=0,count=0;
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {
          const xx=x+dx,yy=y+dy;
          if(xx>=0&&xx<w&&yy>=0&&yy<h) {
            sum+=src[(yy*w+xx)*4+ch];count++;
          }
        }
        out[p+ch]=sum/count;
      }
      out[p+3]=src[p+3];
    }
    return out;
  }

  function processImage() {
    if(!S.original)return;
    const c=copyCanvas(S.original);
    const image=getPixels(c),d=image.data,w=c.width,h=c.height;
    const mode=document.querySelector('input[name="mode"]:checked').value;
    let source=new Uint8ClampedArray(d);
    const radius=mode==="strict"?0:+$("smooth").value;
    if(radius)source=boxBlur(source,w,h,radius);
    const sharp=mode==="strict"?0:+$("sharpen").value/100;
    const blurred=sharp?boxBlur(source,w,h,1):null;
    const b=mode==="strict"?+$("brightness").value*.5:+$("brightness").value;
    const contrast=mode==="strict"?+$("contrast").value*.5:+$("contrast").value;
    const factor=259*(contrast+255)/(255*(259-contrast));
    const gamma=mode==="strict"?1:+$("gamma").value/100;

    for(let i=0;i<d.length;i+=4) {
      const lum=.2126*source[i]+.7152*source[i+1]+.0722*source[i+2];
      for(let ch=0;ch<3;ch++) {
        let v=S.gray?lum:source[i+ch];
        if(blurred)v+=sharp*1.5*(v-blurred[i+ch]);
        v=factor*(v-128)+128+b;
        v=255*Math.pow(clamp(v)/255,1/gamma);
        d[i+ch]=clamp(v);
      }
      d[i+3]=source[i+3];
    }
    ctx(c).putImageData(image,0,0);
    S.output=c;
    S.metrics=calculateMetrics(S.original);
    updateAll();
  }

  function updateCompare() {
    if(!S.original||!S.output)return;
    const box=$("comparePreview");
    box.replaceChildren();
    const a=new Image(),b=new Image();
    a.src=S.original.toDataURL();b.src=S.output.toDataURL();
    a.alt="Original image";b.alt="Processed image";
    b.style.clipPath=`inset(0 0 0 ${$("slider").value}%)`;
    box.append(a,b);
  }

  function updateAll() {
    if(!S.original)return;
    drawPreview("originalPreview",S.original);
    drawPreview("processedPreview",S.output);
    S.metrics=calculateMetrics(S.original);
    renderMetrics(S.metrics);
    updateCompare();
    updateReportPreview();
  }

  $("go").addEventListener("click",async()=>{
    if(!S.original)return;
    $("go").disabled=true;
    try {
      say("Analysing image…");
      processImage();
      await createLineage();
      say("Analysis and enhancement completed.");
      log("Image analysis and enhancement completed.");
      toast("Analysis complete.");
    } catch(e) {
      console.error(e);say("Analysis error: "+e.message,true);
    } finally {$("go").disabled=false;}
  });

  ["brightness","contrast","gamma","sharpen","smooth"].forEach(id=>
    $(id).addEventListener("input",()=>{
      updateSliderLabels();
      if(S.original)processImage();
    })
  );
  document.querySelectorAll('input[name="mode"]').forEach(r=>
    r.addEventListener("change",()=>{if(S.original)processImage();})
  );
  $("slider").addEventListener("input",updateCompare);
  $("reset").addEventListener("click",()=>{
    if(!S.original)return;
    ["brightness","contrast","sharpen","smooth"].forEach(id=>$(id).value=0);
    $("gamma").value=100;S.gray=false;updateSliderLabels();processImage();
    log("Enhancement settings reset.");
  });
  $("gray").addEventListener("click",()=>{
    if(!S.original)return toast("Upload an image first.");
    S.gray=!S.gray;processImage();log("Grayscale "+(S.gray?"enabled":"disabled")+".");
  });

  $("demo").addEventListener("click",()=>{
    const c=canvas(420,280),g=ctx(c);
    g.fillStyle="#b8d2e5";g.fillRect(0,0,c.width,c.height);
    g.fillStyle="#78916d";g.fillRect(0,205,c.width,75);
    g.fillStyle="#d7c39f";g.fillRect(70,95,110,110);
    g.fillStyle="#956b55";g.fillRect(57,83,137,20);
    g.fillStyle="#405970";g.fillRect(112,142,30,63);
    g.fillStyle="#edcf83";g.beginPath();g.arc(325,60,27,0,Math.PI*2);g.fill();
    c.toBlob(blob=>{
      if(blob)upload(new File([blob],"SIPES-demo.png",{type:"image/png"}));
    },"image/png");
  });

  async function sha256(blob) {
    if(!crypto.subtle)throw new Error("SHA-256 requires HTTPS or localhost.");
    const bytes=blob instanceof Blob?await blob.arrayBuffer():blob;
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }

  async function canvasBlob(c) {
    return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("Could not encode image.")),"image/png"));
  }

  // Hash-chain design: each record includes the previous record's hash.
  async function hashRecord(record) {
    const canonical=JSON.stringify({
      index:record.index,time:record.time,action:record.action,
      details:record.details,previousHash:record.previousHash
    });
    return sha256(new Blob([canonical],{type:"text/plain"}));
  }

  async function createLineage() {
    const originalHash=await sha256(S.buffer);
    const outputBlob=await canvasBlob(S.output);
    const outputHash=await sha256(outputBlob);
    S.hashes={original:originalHash,processed:outputHash};
    S.lineage=[];

    const entries=[
      {action:"IMAGE_IMPORTED",details:{name:S.file.name,size:S.file.size,sha256:originalHash}},
      {action:"IMAGE_DIAGNOSED",details:{metrics:S.metrics}},
      {action:"ENHANCEMENT_APPLIED",details:{
        mode:document.querySelector('input[name="mode"]:checked').value,
        brightness:+$("brightness").value,contrast:+$("contrast").value,
        gamma:+$("gamma").value/100,sharpen:+$("sharpen").value,
        smoothing:+$("smooth").value,grayscale:S.gray
      }},
      {action:"OUTPUT_CREATED",details:{sha256:outputHash,width:S.output.width,height:S.output.height}}
    ];

    let previousHash="GENESIS";
    for(let i=0;i<entries.length;i++) {
      const record={
        index:i,time:new Date().toISOString(),
        action:entries[i].action,details:entries[i].details,
        previousHash
      };
      record.hash=await hashRecord(record);
      S.lineage.push(record);
      previousHash=record.hash;
    }
    renderLineage();
    updateReportPreview();
  }

  async function verifyChain(chain) {
    let expectedPrevious="GENESIS";
    for(let i=0;i<chain.length;i++) {
      const r=chain[i];
      if(r.index!==i)return {valid:false,index:i,reason:"Record index mismatch"};
      if(r.previousHash!==expectedPrevious)return {valid:false,index:i,reason:"Previous hash mismatch"};
      const calculated=await hashRecord(r);
      if(calculated!==r.hash)return {valid:false,index:i,reason:"Record hash mismatch"};
      expectedPrevious=r.hash;
    }
    return {valid:true,index:-1,reason:"All records verified"};
  }

  function renderLineage() {
    $("lineage").innerHTML=S.lineage.map(r=>
      `<div class="lineage-item"><b>${r.index+1}. ${escapeHTML(r.action)}</b><br>`+
      `<span class="mut sm">${escapeHTML(r.time)}</span><br>`+
      `<code>${escapeHTML(r.hash)}</code></div>`
    ).join("");
  }

  $("tamperBtn").addEventListener("click",async()=>{
    const button=$("tamperBtn");
    const out=$("tamperResult");
    if(!S.lineage.length) {
      out.innerHTML='<span class="bad">TEST NOT RUN:</span> Upload an image and click Analyse and enhance first.';
      return;
    }
    button.disabled=true;
    out.textContent="Verifying original chain and testing a modified copy…";
    try {
      // Test 1: the real chain should verify successfully.
      const originalCheck=await verifyChain(S.lineage);

      // Test 2: change a copied record without recalculating its hash.
      const tampered=JSON.parse(JSON.stringify(S.lineage));
      tampered[1].details={...tampered[1].details,tamperTest:"UNAUTHORISED CHANGE"};
      const tamperCheck=await verifyChain(tampered);
      const detected=!tamperCheck.valid;

      out.innerHTML=
        `<b>LINEAGE TAMPER TEST</b><br><br>`+
        `<span class="${originalCheck.valid?"good":"bad"}">${originalCheck.valid?"PASS":"FAIL"} — Original chain verification</span><br>`+
        `${escapeHTML(originalCheck.reason)}<br><br>`+
        `<span class="${detected?"good":"bad"}">${detected?"PASS":"FAIL"} — Deliberate alteration detection</span><br>`+
        `${detected?"The altered copy was rejected at record "+(tamperCheck.index+1)+".": "The alteration was not detected."}<br><br>`+
        `<b>Overall: ${originalCheck.valid&&detected?"PASS — tampering detected":"FAIL — investigate the checks above"}</b><br><br>`+
        `<span class="mut">The real lineage was not altered. This tests hash-chain consistency, not image authenticity.</span>`;
      log("Tamper test: original "+(originalCheck.valid?"valid":"invalid")+", modified copy "+(detected?"detected":"not detected")+".");
    } catch(e) {
      out.textContent="Tamper test error: "+e.message;
    } finally {button.disabled=false;}
  });

  $("hashBtn").addEventListener("click",async()=>{
    if(!S.original)return toast("Upload and analyse an image first.");
    try {
      if(!S.hashes.original||!S.hashes.processed)await createLineage();
      $("originalHash").textContent=S.hashes.original;
      $("processedHash").textContent=S.hashes.processed;
      log("SHA-256 fingerprints calculated.");
      toast("Fingerprints calculated.");
    } catch(e) {toast(e.message);}
  });

  function sampleGray(c,maxSide=180) {
    const scale=Math.min(1,maxSide/Math.max(c.width,c.height));
    const small=canvas(c.width*scale,c.height*scale);
    ctx(small).drawImage(c,0,0,small.width,small.height);
    const d=getPixels(small).data,g=new Float32Array(small.width*small.height);
    for(let i=0,p=0;i<d.length;i+=4,p++)g[p]=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    return {g,w:small.width,h:small.height};
  }

  function showMap(id,c) {
    const box=$(id);box.replaceChildren();
    const im=new Image();im.src=c.toDataURL("image/png");im.alt="Forensic visualisation";box.appendChild(im);
  }

  async function runELA() {
    if(!S.original)return toast("Upload an image first.");
    $("elaResult").textContent="Calculating recompression difference…";
    try {
      const blob=await new Promise((resolve,reject)=>S.original.toBlob(b=>b?resolve(b):reject(new Error("JPEG conversion failed")),"image/jpeg",.75));
      const im=await loadImage(blob),rec=canvas(S.original.width,S.original.height);
      ctx(rec).drawImage(im,0,0,rec.width,rec.height);
      const a=getPixels(S.original).data,b=getPixels(rec).data,out=canvas(rec.width,rec.height),od=ctx(out).createImageData(out.width,out.height);
      let total=0,max=0;
      for(let i=0;i<a.length;i+=4) {
        const v=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;
        const z=clamp(v*8);total+=v;max=Math.max(max,v);
        od.data[i]=z;od.data[i+1]=z*.45;od.data[i+2]=z;od.data[i+3]=255;
      }
      ctx(out).putImageData(od,0,0);showMap("elaPreview",out);
      const mean=total/(a.length/4);
      S.results.ela={meanDifference:mean,maxDifference:max};
      $("elaResult").textContent=`Mean RGB difference: ${mean.toFixed(2)}/255 · Maximum: ${max.toFixed(2)}. Differences amplified 8× for display.`;
      log("ELA-style recompression map completed.");
    } catch(e) {$("elaResult").textContent="ELA failed: "+e.message;}
  }

  function runNoise() {
    if(!S.original)return toast("Upload an image first.");
    const {g,w,h}=sampleGray(S.original),res=new Float32Array(g.length);
    let max=0,sum=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
      const i=y*w+x;
      const v=Math.abs(g[i]-(g[i-1]+g[i+1]+g[i-w]+g[i+w])/4);
      res[i]=v;max=Math.max(max,v);sum+=v;
    }
    const out=canvas(w,h),od=ctx(out).createImageData(w,h);
    for(let i=0;i<res.length;i++) {
      const v=clamp(res[i]/Math.max(1,max)*255);
      od.data[i*4]=v;od.data[i*4+1]=v*.35;od.data[i*4+2]=255-v*.6;od.data[i*4+3]=255;
    }
    ctx(out).putImageData(od,0,0);showMap("noisePreview",out);
    const mean=sum/res.length;
    S.results.noise={meanResidual:mean,maxResidual:max};
    $("noiseResult").textContent=`Mean residual: ${mean.toFixed(2)} · Maximum: ${max.toFixed(2)}. This is a simple local residual map.`;
    log("Noise residual map completed.");
  }

  function runCopyMove() {
    if(!S.original)return toast("Upload an image first.");
    const {g,w,h}=sampleGray(S.original,160),size=8,step=4,patches=[];
    for(let y=0;y<=h-size;y+=step) {
      for(let x=0;x<=w-size;x+=step) {
        const values=[];let sum=0,sum2=0;
        for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++) {
          const v=g[(y+dy)*w+x+dx];values.push(v);sum+=v;sum2+=v*v;
        }
        const mean=sum/values.length,variance=Math.max(0,sum2/values.length-mean*mean);
        if(variance<18)continue;
        const sd=Math.sqrt(variance+1);
        patches.push({x,y,v:values.map(v=>(v-mean)/sd)});
        if(patches.length>=350)break;
      }
      if(patches.length>=350)break;
    }
    const matches=[];
    outer:for(let i=0;i<patches.length;i++)for(let j=i+1;j<patches.length;j++) {
      const a=patches[i],b=patches[j];
      if((a.x-b.x)**2+(a.y-b.y)**2<144)continue;
      let error=0;
      for(let k=0;k<a.v.length;k++)error+=Math.abs(a.v[k]-b.v[k]);
      error/=a.v.length;
      if(error<.12) {
        matches.push({a,b});
        if(matches.length>=40)break outer;
      }
    }
    const out=canvas(w,h);ctx(out).drawImage(S.original,0,0,w,h);
    const c=ctx(out);c.lineWidth=1.5;
    matches.forEach((m,i)=>{
      c.strokeStyle=i%2?"#f28ac5":"#71e5db";
      c.strokeRect(m.a.x,m.a.y,size,size);c.strokeRect(m.b.x,m.b.y,size,size);
    });
    showMap("copyPreview",out);
    S.results.copyMove={candidatePairs:matches.length,sampledPatches:patches.length};
    $("copyResult").textContent=`${matches.length} similar patch pairs found among ${patches.length} sampled patches. Natural repeated textures can produce false matches.`;
    log("Copy-move candidate scan completed.");
  }

  $("runELA").addEventListener("click",runELA);
  $("runNoise").addEventListener("click",runNoise);
  $("runCopy").addEventListener("click",runCopyMove);
  $("runAll").addEventListener("click",async()=>{
    if(!S.original)return toast("Upload an image first.");
    await runELA();runNoise();runCopyMove();
    $("forensicSummary").textContent=
      "Forensic screening completed.\n"+
      "ELA: "+(S.results.ela?"completed":"not available")+"\n"+
      "Noise residual: "+(S.results.noise?"completed":"not available")+"\n"+
      "Copy-move scan: "+(S.results.copyMove?"completed":"not available")+"\n\n"+
      "These are preliminary indicators. A flagged anomaly is not proof of manipulation; no flagged anomaly is not proof of authenticity.";
    updateReportPreview();
  });

  function makeReport() {
    return {
      project:"Smart Image Processing and Enhancement System",
      generatedAt:new Date().toISOString(),
      disclaimer:"Browser prototype. Forensic indicators are not proof of authenticity or manipulation.",
      file:S.file?{name:S.file.name,sizeBytes:S.file.size,type:S.file.type}:null,
      metrics:S.metrics,
      settings:{
        mode:document.querySelector('input[name="mode"]:checked').value,
        brightness:+$("brightness").value,contrast:+$("contrast").value,
        gamma:+$("gamma").value/100,sharpen:+$("sharpen").value,
        smoothing:+$("smooth").value,grayscale:S.gray
      },
      hashes:S.hashes,
      lineage:S.lineage,
      forensicResults:S.results,
      activity:S.history
    };
  }
  function updateReportPreview() {
    const box=$("reportPreview");
    if(box)box.textContent=JSON.stringify(makeReport(),null,2);
  }
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function downloadCanvas(c,name) {
    c.toBlob(b=>b?downloadBlob(b,name):toast("Image export failed."),"image/png");
  }
  $("downloadImage").addEventListener("click",()=>{
    if(!S.output)return toast("Upload an image first.");
    downloadCanvas(S.output,"SIPES-processed.png");
  });
  $("downloadJSON").addEventListener("click",()=>{
    downloadBlob(new Blob([JSON.stringify(makeReport(),null,2)],{type:"application/json"}),"SIPES-report.json");
    log("JSON report exported.");
  });
  $("downloadHTML").addEventListener("click",()=>{
    const html="<!doctype html><html><head><meta charset='utf-8'><title>SIPES Report</title>"+
      "<style>body{font:15px system-ui;max-width:900px;margin:35px auto;padding:20px;color:#182333}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6fa;padding:20px;border-radius:8px}.warning{padding:14px;background:#fff0cc}</style></head><body>"+
      "<h1>SIPES Analysis Report</h1><p class='warning'>Preliminary screening only. These results do not independently establish authenticity or manipulation.</p><pre>"+
      escapeHTML(JSON.stringify(makeReport(),null,2))+"</pre></body></html>";
    downloadBlob(new Blob([html],{type:"text/html"}),"SIPES-report.html");
    log("HTML report exported.");
  });
  $("copyReport").addEventListener("click",async()=>{
    try {
      await navigator.clipboard.writeText(JSON.stringify(makeReport(),null,2));
      toast("Report copied.");
    } catch(e) {toast("Clipboard unavailable. Use Download JSON report.");}
  });

  $("selfTest").addEventListener("click",async()=>{
    const tests=[];
    const check=(name,ok)=>tests.push({name,ok:!!ok});
    try {
      const c=canvas(4,4);ctx(c).fillStyle="rgb(100,100,100)";ctx(c).fillRect(0,0,4,4);
      check("Canvas creation",c.width===4&&c.height===4);
      const px=getPixels(c);px.data[0]=150;ctx(c).putImageData(px,0,0);
      check("Pixel modification",getPixels(c).data[0]===150);
      const blob=await canvasBlob(c);
      check("PNG export",blob.size>0);
      const hash=await sha256(new Blob(["SIPES self-test"]));
      check("SHA-256 output",/^[a-f0-9]{64}$/.test(hash));
    } catch(e) {check("Runtime: "+e.message,false);}
    $("selfTestResult").innerHTML=tests.map(t=>
      `<div class="${t.ok?"good":"bad"}">${t.ok?"PASS":"FAIL"} — ${escapeHTML(t.name)}</div>`
    ).join("")+`<p>${tests.filter(t=>t.ok).length}/${tests.length} basic functional checks passed. This does not test forensic accuracy.</p>`;
    log("Self-tests completed.");
  });

  updateSliderLabels();
  updateReportPreview();
})();
