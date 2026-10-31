// IDs only. Rebuild the original randomized bracket; never shuffle or count a start.
export function rebuildCheckpoint(s){
 if(!s||!Array.isArray(s.initial_ids)||![4,8,16,32].includes(s.initial_ids.length)||new Set(s.initial_ids).size!==s.initial_ids.length||!Array.isArray(s.choices)||s.choices.length!==s.sequence||s.sequence>=s.initial_ids.length-1)throw Error('Invalid saved game');
 let current=[...s.initial_ids],next=[],index=0;
 for(const event of s.choices){const pair=current.slice(index,index+2);if(pair.length!==2||!pair.includes(event.winner)||!pair.includes(event.loser)||event.winner===event.loser)throw Error('Invalid saved bracket');next.push(event.winner);index+=2;if(index===current.length){current=next;next=[];index=0;}}
 if(JSON.stringify(current)!==JSON.stringify(s.current_ids)||JSON.stringify(next)!==JSON.stringify(s.next_ids)||index!==s.index)throw Error('Saved bracket does not match');
 return {current,next,index};
}
