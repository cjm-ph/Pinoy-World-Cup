// Presentation-only rules. Never modifies RPC results or collected events.
const idOrder=(a,b)=>String(a.participant_id)<String(b.participant_id)?-1:String(a.participant_id)>String(b.participant_id)?1:0;
const rated=p=>Number.isFinite(p.appearances)&&p.appearances>0&&Number.isFinite(p.wins);
function matchOrder(a,b){if(rated(a)!==rated(b))return rated(a)?-1:1;if(rated(a)){const delta=b.wins*a.appearances-a.wins*b.appearances;if(delta)return delta;}return (b.wins||0)-(a.wins||0)||idOrder(a,b);}
export const publicOrder=rows=>[...rows].sort(matchOrder);
export const adminOrder=rows=>[...rows].sort((a,b)=>(b.titles||0)-(a.titles||0)||matchOrder(a,b));
export function pageRows(rows,page,size=10){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(pages,Math.max(1,page));return {rows:rows.slice((current-1)*size,current*size),page:current,pages,offset:(current-1)*size};}
export function percentage(value){return value===null||value===undefined||!Number.isFinite(Number(value))?'—':Number(value).toFixed(2)+'%';}
export function utcRange(days,now=new Date()){const end=now.toISOString().slice(0,10),start=new Date(end+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);return {from:start.toISOString().slice(0,10),until:end};}
export function rangeArgs(from,until){const a=new Date(from+'T00:00:00Z'),b=new Date(until+'T00:00:00Z');if(!Number.isFinite(+a)||!Number.isFinite(+b)||a>b||(+b-+a)/86400000>=366)throw Error('Invalid dates');b.setUTCDate(b.getUTCDate()+1);return {since_at:a.toISOString(),until_at:b.toISOString()};}
