import {newStudy} from './simple.mjs';
import {sanitizeProperty} from './model.mjs';
export const STORAGE_KEY='tideland.fieldbook.v1';
export function freshBook(){const p=newStudy();return {version:1,active:p.id,properties:[p]};}
export function serializeBook(book){return JSON.stringify(book,null,2);}
export function parseBackup(text){
 if(typeof text!=='string'||text.length>5000000)throw new Error('Backup must be a JSON file smaller than 5 MB.');
 let raw;try{raw=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
 if(raw?.version!==1)throw new Error('This is not a supported rental property calculator backup (version 1).');
 if(!Array.isArray(raw.properties)||!raw.properties.length||raw.properties.length>50)throw new Error('A backup must contain between 1 and 50 properties.');
 const properties=raw.properties.map(sanitizeProperty);
 const ids=properties.map(p=>p.id);
 if(new Set(ids).size!==ids.length)throw new Error('Backup contains duplicate property identifiers.');
 if(!ids.includes(raw.active))throw new Error('Selected property is missing from the backup.');
 return {version:1,active:raw.active,properties};
}
export function loadBook(storage){
 try{
  storage=storage??globalThis.localStorage;
  const raw=storage.getItem(STORAGE_KEY);
  return {book:raw?parseBackup(raw):freshBook(),error:null};
 }catch(error){return {book:freshBook(),error:`Saved data could not be loaded: ${error.message}. Your prior storage has not been overwritten. Export a backup before resetting anything.`};}
}
export function saveBook(book,storage){
 try{
  storage=storage??globalThis.localStorage;
  storage.setItem(STORAGE_KEY,serializeBook(book));return null;
 }catch{return 'This browser could not save your changes. Keep this page open and export a JSON backup. Private browsing or full storage can prevent saving.';}
}
