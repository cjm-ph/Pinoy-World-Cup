// Reuses the manual research flow from creator_admin_v3.js. No API or network calls.
export const GEMINI_URL = 'https://gemini.google.com/';
export function buildCandidatePrompt({title='',category='',requested_size=8,description=''},language='en') {
 const count=Number(requested_size);
 if(!title.trim()||![8,16,32].includes(count))throw Error('Enter a title and a supported candidate count before generating a prompt.');
 if(language==='ko')return [
  '주요 대상은 필리핀 이용자입니다. 필리핀 현지 인지도·인기도·검색 관심도·팬덤의 열정과 참여도·대중문화 영향력을 우선 고려해 주세요.',
  '글로벌 인기 순위만으로 선정하지 말고 필리핀 이용자가 공감하고 투표하고 싶어 할 후보를 추천해 주세요.',
  '제목이 요구하는 후보 유형(작품·인물·음식·캐릭터 등)을 일관되게 유지하세요. 애니메이션 작품 주제라면 캐릭터가 아닌 작품명을 추천하세요.',
  '필리핀 현지 인기도 근거가 부족하면 추측으로 순위를 단정하지 말고, 확인이 필요한 점은 코드 블록 밖에 명시하세요.',
  'Pinoy World Cup의 월드컵 후보 추천을 도와주세요.',
  `제목: ${title.trim()}`,`카테고리: ${category || '미지정'}`,`후보 ${count}개`,
  `설명: ${description.trim() || '없음'}`,
  `위 주제에 맞는 실제 후보를 정확히 ${count}개 추천해 주세요.`,
  '중복을 제외하고 실제 존재 여부와 주제 적합성을 확인해 주세요. 불확실한 후보는 제외해 주세요.',
  '붙여넣기용 후보 목록을 코드 블록 하나에 작성해 주세요. 한 줄에 이름 하나씩, 번호·글머리표·URL·설명 없이 이름만 작성해 주세요.',
  '추가 설명이나 확인이 필요한 내용이 있다면 코드 블록 밖에 별도로 작성해 주세요.',
  '추천 결과는 제작자가 직접 검토합니다. 사진 사용 권한은 별도로 확인합니다.'
 ].join('\n');
 return [
  'Help me recommend candidates for a Pinoy World Cup tournament.',
  'The primary audience is Filipino users. Prioritize popularity and recognition within the Philippines, local search interest, passionate and active fandoms, and influence on Philippine popular culture.',
  'Do not select candidates solely from global popularity rankings. Favor choices Filipino users will recognize and want to vote for.',
  'Keep the candidate type required by the title consistent: works, people, food, characters, etc. For an anime-series topic, recommend anime titles, not characters.',
  'If evidence of Philippine popularity is insufficient, do not invent a ranking or state guesses as facts. Note any uncertainty outside the code block.',
  `Title: ${title.trim()}`,`Category: ${category || 'Not specified'}`,`Candidate count: ${count}`,
  `Description: ${description.trim() || 'None'}`,
  `Recommend exactly ${count} real candidates suitable for this topic.`,
  'Remove duplicates. Check that each candidate exists and fits the topic; exclude uncertain candidates.',
  'Put the paste-ready candidate list in one code block: one name per line, names only, without numbering, bullets, URLs or descriptions.',
  'Place any additional notes or uncertainties outside that code block.',
  'The creator will review the recommendations. Photo usage rights will be checked separately.'
 ].join('\n');
}

// No admin, Auth or database dependencies: future member creators can reuse this component.
export function createGeminiSupport({getContext,getLanguage=()=> 'en',onCandidates}) {
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 const section=node('section');section.className='gemini-support';section.dataset.geminiSupport='';
 section.append(node('h3','Get candidate ideas with Gemini'),node('p','Generate a prompt from your title, category, candidate count and description. Copy it, open Gemini, and paste it there yourself.'));
 const label=node('label','Candidate recommendation prompt'),prompt=node('textarea');
 prompt.readOnly=true;prompt.rows=9;prompt.setAttribute('aria-label','Candidate recommendation prompt');prompt.dataset.i18nSkip='';
 label.append(prompt);section.append(label);
 const actions=node('div');actions.className='row';
 const generate=node('button','Generate prompt'),copy=node('button','Copy prompt'),open=node('a','Open Gemini'),candidates=node('button','Go to candidate bulk input');
 for(const button of [generate,copy,candidates]){button.type='button';button.className='btn small';}
 generate.classList.add('primary');open.className='btn small';open.href=GEMINI_URL;open.target='_blank';open.rel='noopener noreferrer';open.referrerPolicy='no-referrer';
 const status=node('p');status.className='help';status.setAttribute('role','status');
 let generated=false;
 function refreshPrompt(){if(generated)prompt.value=buildCandidatePrompt(getContext(),getLanguage());}
 generate.onclick=()=>{try{prompt.value=buildCandidatePrompt(getContext(),getLanguage());generated=true;status.textContent='Prompt ready. Copy it and paste it into Gemini.';}catch(error){status.textContent=error.message;}};
 copy.onclick=async()=>{
  if(!prompt.value){status.textContent='Generate a prompt first.';return;}
  try{await navigator.clipboard.writeText(prompt.value);status.textContent='Prompt copied. Paste it into Gemini to ask your question.';}
  catch{prompt.focus();prompt.select();status.textContent='Automatic copy failed. Copy the selected prompt manually.';}
 };
 candidates.onclick=()=>onCandidates?.();
 actions.append(generate,copy,open);if(onCandidates)actions.append(candidates);section.append(actions,status,node('p','In Gemini, copy only the suggested names, then paste them into bulk input below and apply them. Review the candidates before saving. No data is sent automatically; no Gemini API is used.'));
 section.refreshPrompt=()=>{try{refreshPrompt();}catch{generated=false;prompt.value='';status.textContent='Enter a title and a supported candidate count before generating a prompt.';}};
 return section;
}
