import { createHmac } from 'node:crypto';
import { CommandError } from './updates.js';
export function createBrowserAccounts({secretKeyBase,url='http://accounts:3003',fetchImpl=fetch}) {
 const authorization='Bearer '+createHmac('sha256',secretKeyBase).update('walltaker:accounts:commands:v1').digest('hex');
 return async(operation,input)=>{
  const response=await fetchImpl(`${url}/_internal/accounts/${operation}`,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(25000),redirect:'error'});
  const data=await response.json();
  if(!response.ok){const error=new CommandError(response.status,data.message || 'Account request failed.');error.errors=data.errors;throw error;}
  return data;
 };
}
