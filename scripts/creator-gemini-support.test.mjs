import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCandidatePrompt,GEMINI_URL} from './creator-gemini-support.mjs';
const input={title:'Best Filipino Dishes',category:'Food',requested_size:16,description:'Traditional dishes, without drinks.'};
test('manual prompt includes every creator field and paste-ready output instructions',()=>{
 const result=buildCandidatePrompt(input,'en');
 for(const value of [input.title,input.category,input.description,'exactly 16','one name per line','Remove duplicates','Photo usage rights'])assert.ok(result.includes(value),value);
 assert.equal(GEMINI_URL,'https://gemini.google.com/');
 assert.equal(new URL(GEMINI_URL).search,'');
});
test('Korean prompt uses the same candidate count and retains actual creator content',()=>{
 const result=buildCandidatePrompt(input,'ko');
 for(const value of [input.title,input.category,input.description,'16개','한 줄에 이름 하나씩','중복','사진 사용 권한'])assert.ok(result.includes(value),value);
});
test('invalid sizes and missing titles do not produce a misleading recommendation request',()=>{
 assert.throws(()=>buildCandidatePrompt({...input,title:'  '}));
 assert.throws(()=>buildCandidatePrompt({...input,requested_size:5}));
});

test('Philippine evidence and title-specific candidate types are required in both languages',()=>{
 const en=buildCandidatePrompt({...input,title:'My favorite anime of all time'});
 for(const text of ['Filipino users','within the Philippines','local search interest','fandoms','global popularity','anime titles, not characters','do not invent a ranking','exactly 16','exclude uncertain candidates'])assert.ok(en.includes(text),text);
 const ko=buildCandidatePrompt(input,'ko');
 for(const text of ['필리핀','검색 관심도','팬덤','글로벌','작품명을','근거가 부족','후보 16개'])assert.ok(ko.includes(text),text);
 assert.ok(!ko.includes('16명'));
});

test('changed title category count and description replace previous prompt context',()=>{
 const updated={title:'Favorite anime',category:'Animation',requested_size:32,description:'TV series only'};
 for(const language of ['en','ko']){
  const text=buildCandidatePrompt(updated,language);
  for(const value of [updated.title,updated.category,updated.description,'32'])assert.ok(text.includes(value));
  assert.ok(!text.includes(input.title));assert.ok(!text.includes(input.description));
 }
});
