import {Controller} from '@hotwired/stimulus';
import Chartkick from 'chartkick';
import 'chartkick/chart.js';
const token=()=>document.querySelector('meta[name="csrf-token"]')?.content;
async function request(path,input,signal){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token()},body:JSON.stringify(input),signal});
  const body=await response.text();if(!response.ok)throw Error(response.status===503?'This service is temporarily unavailable. Please try again.':response.status===403?'Access denied.':response.status===422?'Your form expired or could not be completed. Please reload and try again.':'Unable to complete this request.');return body;
}
export class BlazerEditor extends Controller {
  static targets=['editor','tables','results','variables'];static values={variables:Object};
  connect(){
    this.editor=window.ace.edit(this.editorTarget);this.editor.setTheme('ace/theme/twilight');this.editor.session.setMode('ace/mode/sql');this.editor.setOptions({fontSize:12,minLines:10,maxLines:35,showPrintMargin:false,highlightActiveLine:false,wrap:true});
    this.editor.commands.addCommand({name:'run',bindKey:{win:'Ctrl-Enter',mac:'Command-Enter'},exec:()=>this.run()});this.editor.session.on('change',()=>this.sync());this.sync();
    this.loadTables();
  }
  async loadTables(){try{const r=await fetch('/blazer/queries/tables');if(!r.ok)return;for(const table of await r.json()){const option=document.createElement('option');option.value=table;option.textContent=table;this.tablesTarget.append(option);}}catch{}}
  sync(){
    const statement=this.editor.getValue();this.element.querySelector('[name="query[statement]"]').value=statement;
    const values={...this.variablesValue,...this.variableValues()};
    // This detects fields for the editor UI only. The SQL service parses and binds all values.
    const names=[...new Set([...statement.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,'').matchAll(/\{([A-Za-z_]\w*)\}/g)].map(m=>m[1]))];
    this.variablesTarget.replaceChildren();
    for(const name of names){const label=document.createElement('label'),input=document.createElement('input');label.textContent=name;input.className='form-control';input.type='text';input.name='variables['+name+']';input.dataset.blazerVariable=name;input.value=values[name] || '';label.append(input);this.variablesTarget.append(label);}
  }
  variableValues(){return Object.fromEntries([...this.variablesTarget.querySelectorAll('input')].map(input=>[input.dataset.blazerVariable,input.value]));}
  async preview(event){if(!event.target.value)return;this.editor.setValue('SELECT * FROM "'+event.target.value.replaceAll('"','""')+'" LIMIT 10',1);await this.run();event.target.value='';}
  confirmDelete(event){if(!window.confirm('Are you sure?'))event.preventDefault();}
  async run(){
    await this.cancel();this.runId=crypto.randomUUID();this.abort=new AbortController();this.resultsTarget.textContent='Loading...';
    const selected=this.editor.getSelectedText(),statement=selected.length>=10?selected:this.editor.getValue();
    try{const html=await request('/blazer/queries/run',{statement,data_source:'main',variables:{...this.variablesValue,...this.variableValues()},run_id:this.runId},this.abort.signal);this.resultsTarget.innerHTML=html;}
    catch(error){if(error.name!=='AbortError')this.resultsTarget.textContent=error.message;}
    finally{this.abort=null;}
  }
  async cancel(){if(!this.abort)return;const id=this.runId;this.abort.abort();this.abort=null;try{await request('/blazer/queries/cancel',{run_id:id});}catch{}}
  disconnect(){this.abort?.abort();this.editor?.destroy();}
}
export class BlazerRunner extends Controller {
  static values={id:String,variables:Object};
  async connect(){this.abort=new AbortController();try{this.element.innerHTML=await request('/blazer/queries/run',{query_id:this.idValue,variables:this.variablesValue},this.abort.signal);}catch(error){if(error.name!=='AbortError')this.element.textContent=error.message;}}
  disconnect(){this.abort?.abort();}
}
export class BlazerBoard extends Controller {
  static targets=['query'];static values={variables:Object};
  async connect(){this.abort=new AbortController();for(const el of this.queryTargets){try{el.innerHTML=await request('/blazer/queries/run',{query_id:el.dataset.queryId,variables:this.variablesValue},this.abort.signal);}catch(error){if(error.name==='AbortError')break;el.textContent=error.message;}}}
  disconnect(){this.abort?.abort();}
}
export class BlazerChart extends Controller {
  static values={result:Object};
  connect(){
    const r=this.resultValue;if(r.columns.length<2||!r.rows.length)return;
    const numeric=i=>[20,21,23,700,701,1700].includes(r.column_types?.[i])||r.rows.every(row=>row[i]==null||typeof row[i]==='number');
    const timed=[1082,1114,1184].includes(r.column_types?.[0]);let data,Chart,options={height:'300px',legend:false};
    if(numeric(0)&&numeric(1)&&r.columns.length===2){Chart=Chartkick.ScatterChart;data=r.rows.map(row=>[Number(row[0]),Number(row[1])]);}
    else if(r.columns.length===2&&numeric(1)){Chart=r.columns[1]==='pie'?Chartkick.PieChart:timed?Chartkick.LineChart:Chartkick.ColumnChart;data=r.rows.map(row=>[row[0],row[1]==null?null:Number(row[1])]);}
    else if(r.columns.length===3&&!numeric(1)&&numeric(2)){Chart=timed?Chartkick.LineChart:Chartkick.ColumnChart;const series=new Map();for(const row of r.rows){if(!series.has(String(row[1])))series.set(String(row[1]),[]);series.get(String(row[1])).push([row[0],Number(row[2])]);}data=[...series.entries()].map(([name,data])=>({name,data}));options.legend=true;}
    else if(r.columns.slice(1).every((_,i)=>numeric(i+1))){Chart=timed?Chartkick.LineChart:Chartkick.ColumnChart;data=r.columns.slice(1).map((name,i)=>({name,data:r.rows.map(row=>[row[0],row[i+1]==null?null:Number(row[i+1])]),...(name==='target'?{library:{type:'line',borderDash:[5,5],pointRadius:0}}:{})}));options.legend=true;}
    if(Chart){this.chart=new Chart(this.element,data,options);}
  }
  disconnect(){this.chart?.destroy();}
}
export class BlazerList extends Controller {
  static targets=['row'];
  filter(event){const q=event.target.value.toLowerCase();for(const row of this.rowTargets)row.hidden=!row.textContent.toLowerCase().includes(q);}
  filterChecks(event){const q=event.target.value.toLowerCase();for(const row of document.querySelectorAll('#checks tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(q);}
}
export class BlazerTable extends Controller {
  sort(event){const i=Number(event.currentTarget.dataset.column),body=this.element.tBodies[0],direction=this.column===i?-this.direction:1;this.column=i;this.direction=direction;const rows=[...body.rows];rows.sort((a,b)=>a.cells[i].textContent.localeCompare(b.cells[i].textContent,undefined,{numeric:true})*direction);body.append(...rows);}
}
export class BlazerDashboard extends Controller {
  static targets=['list'];
  add(event){const option=event.target.selectedOptions[0];if(!option.value)return;this.listTarget.querySelectorAll('input').forEach(input=>{if(input.value===option.value)input.closest('li').remove();});const li=document.createElement('li');li.className='list-group-item';const input=document.createElement('input');input.type='hidden';input.name='query_ids[]';input.value=option.value;li.append(input,document.createTextNode(option.textContent));for(const [action,label] of [['up','↑'],['down','↓'],['remove','×']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.action='click->blazer-dashboard#'+action;li.append(button);}this.listTarget.append(li);event.target.value='';}
  remove(event){event.target.closest('li').remove();}
  up(event){const li=event.target.closest('li');if(li.previousElementSibling)li.before(li.previousElementSibling);}
  down(event){const li=event.target.closest('li');if(li.nextElementSibling)li.after(li.nextElementSibling);}
}
export class ActivityChart extends Controller {
  static values={data:Array};connect(){this.chart=new Chartkick.LineChart(this.element,this.dataValue,{colors:['#30AA65'],legend:false,height:'240px'});}disconnect(){this.chart?.destroy();}
}
