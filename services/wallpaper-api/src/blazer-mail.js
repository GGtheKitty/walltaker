import nodemailer from 'nodemailer';
import {escape} from './html.js';
export function createCheckNotifier({baseUrl,env=process.env,transport}){
  const client=transport || nodemailer.createTransport({host:env.RESEND_SMTP_ADDRESS || 'smtp.resend.com',port:Number(env.RESEND_SMTP_PORT || 587),secure:Number(env.RESEND_SMTP_PORT || 587)===465,requireTLS:env.RESEND_SMTP_ENABLE_STARTTLS_AUTO!=='false',ignoreTLS:env.RESEND_SMTP_ENABLE_STARTTLS_AUTO==='false',auth:{user:env.RESEND_SMTP_USER_NAME || 'resend',pass:env.RESEND_API_KEY || env.RESEND_SMTP_PASSWORD || ''},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:15000});
  return async(check,result)=>{
    if(!check.emails?.trim())return;
    const link=baseUrl.replace(/\/$/,'')+'/blazer/queries/'+check.query_id;
    const message=`Check ${check.id} is ${check.state}.\n${check.message || ''}\n${link}`;
    await client.sendMail({from:env.WALLTAKER_MAIL_FROM || 'walltaker@'+new URL(baseUrl).hostname,to:check.emails.split(',').map(e=>e.trim()),subject:`[Blazer] Check ${check.id}: ${check.state}`,text:message,html:`<p>${escape(message).replaceAll('\n','<br>')}</p><p>${result.rows.length} rows</p>`});
  };
}
