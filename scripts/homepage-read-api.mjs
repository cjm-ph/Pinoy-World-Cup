// Optional same-origin reader. Does not initialize or alter homepage presentation.
export async function readHomepage({sort='popular',period='month',limit=24,offset=0,fetchImpl=fetch}={}) {
 if(!['popular','latest'].includes(sort)||!['today','week','month'].includes(period)||!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000)throw Error('Invalid homepage parameters');
 const response=await fetchImpl('/play-statistics/homepage?'+new URLSearchParams({sort,period,limit:String(limit),offset:String(offset)}),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Homepage data unavailable');
 const data=await response.json();
 if(!data||!Array.isArray(data.items)||data.items.length>limit)throw Error('Invalid homepage response');
 return data;
}
