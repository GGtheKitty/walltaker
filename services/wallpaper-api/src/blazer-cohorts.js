export const isCohort=statement=>/\/\*\s*cohort analysis\s*\*\//i.test(statement);
export function cohortStatement(source,period='week'){
  if(!['day','week','month'].includes(period))period='week';
  const days={day:1,week:7,month:30}[period],column=/\bcohort_time\b/.test(source.statement)?'cohort_time':'conversion_time';
  const date=`date_trunc('${period}',cohorts.cohort_time::timestamptz AT TIME ZONE 'UTC')::date`;
  return {...source,statement:`WITH query AS (${source.statement.replace(/;\s*$/,'')}\n), cohorts AS (SELECT user_id,MIN(${column}) AS cohort_time FROM query WHERE user_id IS NOT NULL AND ${column} IS NOT NULL GROUP BY 1)
    SELECT ${date} AS period,0 AS bucket,COUNT(DISTINCT cohorts.user_id) FROM cohorts GROUP BY 1
    UNION ALL SELECT ${date} AS period,CEIL(EXTRACT(EPOCH FROM query.conversion_time-cohorts.cohort_time)/${days*86400})::int AS bucket,COUNT(DISTINCT query.user_id)
    FROM cohorts JOIN query ON query.user_id=cohorts.user_id WHERE query.conversion_time IS NOT NULL AND query.conversion_time>=cohorts.cohort_time ${column==='conversion_time'?'AND query.conversion_time<>cohorts.cohort_time':''} GROUP BY 1,2`};
}
export function cohortResults(rows,period='week',now=Date.now()){
  if(!['day','week','month'].includes(period))period='week';
  const dates=rows.map(row=>new Date(row[0]).toISOString().slice(0,10)).sort(),buckets=new Map(rows.map(row=>[new Date(row[0]).toISOString().slice(0,10)+':'+row[1],Number(row[2])]));
  const output=[],cursor=new Date(dates.at(-1)+'T00:00:00Z'),min=dates[0],days={day:1,week:7,month:30}[period];
  while(dates.length&&cursor.toISOString().slice(0,10)>=min&&output.length<1000){
    const key=cursor.toISOString().slice(0,10),label=new Intl.DateTimeFormat('en-US',{month:'short',...(period==='month'?{}:{day:'numeric'}),year:'numeric',timeZone:'UTC'}).format(cursor);
    output.push([label,buckets.get(key+':0') || 0,...Array.from({length:12},(_,i)=>now>=cursor.getTime()+days*i*86400000?buckets.get(key+':'+(i+1)) || 0:null)]);
    if(period==='month')cursor.setUTCMonth(cursor.getUTCMonth()-1);else cursor.setUTCDate(cursor.getUTCDate()-days);
  }
  return {columns:['Cohort','Users',...Array.from({length:12},(_,i)=>period[0].toUpperCase()+period.slice(1)+' '+(i+1))],rows:output,cohort:true};
}
