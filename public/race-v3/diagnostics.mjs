const LIMIT=16000;
const MIB=1048576;
const numeric=value=>Number.isFinite(value)?Math.round(value*1000)/1000:null;
const percentile=(values,q)=>{
  if(!values.length)return null;
  const ordered=values.slice().sort((a,b)=>a-b);
  return numeric(ordered[Math.floor((ordered.length-1)*q)]);
};
function save(data,format) {
  const rows=[['kind','time_ms','frame_ms','js_ms','render_submit_ms','draw_calls','triangles','heap_mib',
    'snapshot_bytes','arrival_gap_ms','server_gap_ms','decode_ms','rtt_ms','gpu_ms','long_task_ms','metric','value']];
  for(const [key,value] of Object.entries({...data.session,...data.summary}))
    rows.push(['summary',...Array(14).fill(null),key,value]);
  const row=(kind,time,offset,values)=>{
    const entry=Array(17).fill(null);
    entry[0]=kind;entry[1]=time;
    values.forEach((value,i)=>{entry[offset+i]=value});
    rows.push(entry);
  };
  for(const f of data.frames)row('frame',f[0],2,f.slice(1));
  for(const s of data.snapshots)row('snapshot',s[0],8,s.slice(1));
  for(const [t,v] of data.rtt)row('rtt',t,12,[v]);
  for(const [t,v] of data.gpu)row('gpu',t,13,[v]);
  for(const [t,v] of data.longTasks)row('long_task',t,14,[v]);
  const csv=rows.map(r=>r.map(v=>v===null?'':typeof v==='number'?v:'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
  const href=URL.createObjectURL(new Blob([format==='json'?JSON.stringify(data,null,2):csv],
    {type:format==='json'?'application/json':'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=href;
  link.download='party-clash-'+data.session.city+'-'+data.session.players+'p-'+Date.now()+'.'+format;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),30000);
}

export function diagnosticsPanel(getData, {floating=false,city}={}) {
  const panel=document.createElement('details');
  panel.className='race-diagnostics'+(floating?' race-diagnostics-result':'');
  const title=document.createElement('summary');
  title.textContent='性能诊断'+(city?' · 街景 '+(city==='legacy'?'A':'B'):'');
  const status=document.createElement('p');
  status.textContent='数据保存在当前页面。请在离开前导出。';
  panel.append(title,status);
  for(const format of ['json','csv']){
    const button=document.createElement('button');
    button.type='button';
    button.textContent='导出 '+format.toUpperCase();
    button.onclick=()=>{
      const data=getData();
      if(!data?.frames.length){
        status.textContent='暂无比赛数据。请先进入比赛。';
        return;
      }
      save(data,format);
      const seconds=(data.summary.recordedMs/1000).toFixed(1);
      status.textContent='已导出 '+seconds+' 秒记录 · 街景 '+(data.session.city==='legacy'?'A':'B');
    };
    panel.append(button);
  }
  document.body.append(panel);
  return panel;
}

export function createDiagnostics({city,multiplayer}) {
  let started=null, end=null, priorFrame=null, priorPacket=null, offset=null, lastHeapAt=-Infinity;
  let players=multiplayer?null:1, coveredEnd=false, calls=null, triangles=null, submit=null;
  const frames=[],snapshots=[],rtt=[],gpu=[],longTasks=[];
  const navigationTime=performance.timeOrigin;
  function active(t=performance.now()){return started!==null&&end===null&&t>=started}
  let observer;
  if(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
    observer=new PerformanceObserver(list=>{
      for(const e of list.getEntries())if(started!==null&&e.startTime>=started&&(end===null||e.startTime<=end)&&longTasks.length<LIMIT)
        longTasks.push([numeric(e.startTime-started),numeric(e.duration)]);
    });
    observer.observe({type:'longtask'});
  }
  function finish(full=false){
    if(!active())return;
    coveredEnd=full;
    end=performance.now();
  }
  return {
    begin(now, state) {
      if(started!==null||multiplayer&&(!state||state.clock<state.startsAt))return;
      started=now;
      if(state){
        players=state.runners?.length??null;
        offset=numeric(Math.max(0,state.clock-state.startsAt));
      }
    },
    get active(){return active()},
    beginFrame(){calls=triangles=submit=null},
    render(stats,ms){calls=stats.calls;triangles=stats.triangles;submit=ms},
    gpu(ms){if(active()&&gpu.length<LIMIT)gpu.push([numeric(performance.now()-started),numeric(ms)])},
    frame(now, elapsed) {
      if(started===null||end!==null||now<started||frames.length>=LIMIT)return;
      let heap=null;
      if(now-lastHeapAt>=1000){
        lastHeapAt=now;
        if(Number.isFinite(performance.memory?.usedJSHeapSize))heap=numeric(performance.memory.usedJSHeapSize/MIB);
      }
      frames.push([numeric(now-started),priorFrame===null?null:numeric(now-priorFrame),
        numeric(Math.max(0,elapsed-(submit??0))),numeric(submit),calls,triangles,heap]);
      priorFrame=now;
    },
    snapshot(now,serverNow,bytes,decode) {
      if(!active(now)||snapshots.length>=LIMIT)return;
      snapshots.push([numeric(now-started),bytes,priorPacket?numeric(now-priorPacket[0]):null,
        priorPacket?numeric(serverNow-priorPacket[1]):null,numeric(decode)]);
      priorPacket=[now,serverNow];
    },
    rtt(ms){if(active()&&rtt.length<LIMIT)rtt.push([numeric(performance.now()-started),numeric(ms)])},
    finish,
    dispose(){observer?.disconnect()},
    export() {
      const gaps=frames.map(f=>f[1]).filter(g=>g>0);
      const sum=gaps.reduce((a,b)=>a+b,0);
      const worst=gaps.slice().sort((a,b)=>b-a).slice(0,Math.ceil(gaps.length*.01));
      const low=worst.length?1000*worst.length/worst.reduce((a,b)=>a+b,0):null;
      const column=(rows,i)=>rows.map(r=>r[i]).filter(Number.isFinite);
      return {
        session:{version:1, city, multiplayer,players,nominalMs:45000,startsAfterServerMs:offset,
          capturedAt:started===null?null:new Date(navigationTime+started).toISOString(),reachedScheduledEnd:coveredEnd,
          width:innerWidth,height:innerHeight,devicePixelRatio},
        summary:{recordedMs:started===null?0:numeric((end??performance.now())-started),frames:frames.length,
          fps:sum?numeric(1000*gaps.length/sum):null,low1Fps:numeric(low),
          longFrames:gaps.filter(g=>g>=50).length,frameP95Ms:percentile(gaps,.95),
          jsP95Ms:percentile(column(frames,2),.95),renderSubmitP95Ms:percentile(column(frames,3),.95),
          gpuP95Ms:percentile(column(gpu,1),.95),drawCallsP50:percentile(column(frames,4),.5),
          heapP95MiB:percentile(column(frames,6),.95),snapshotCount:snapshots.length,
          snapshotBytesP50:percentile(column(snapshots,1),.5),snapshotGapP95Ms:percentile(column(snapshots,2),.95),
          serverSnapshotGapP95Ms:percentile(column(snapshots,3),.95),snapshotDecodeP95Ms:percentile(column(snapshots,4),.95),
          rttP95Ms:percentile(column(rtt,1),.95),
          longTaskCount:observer?longTasks.length:null,capped:frames.length===LIMIT},
        frames,snapshots,rtt,gpu,longTasks
      };
    }
  };
}
