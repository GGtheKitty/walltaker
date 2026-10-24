import nodemailer from'nodemailer';
import{reference}from'./rendering/graph.js';
import{escape}from'./rendering/values.js';
export function createResetMailer({renderer,baseUrl,env=process.env,transport}){
 const client=transport || nodemailer.createTransport({host:env.RESEND_SMTP_ADDRESS || 'smtp.resend.com',port:Number(env.RESEND_SMTP_PORT || 587),secure:Number(env.RESEND_SMTP_PORT || 587)===465,
  requireTLS:env.RESEND_SMTP_ENABLE_STARTTLS_AUTO!=='false',ignoreTLS:env.RESEND_SMTP_ENABLE_STARTTLS_AUTO==='false',
  auth:{user:env.RESEND_SMTP_USER_NAME || 'resend',pass:env.RESEND_API_KEY || env.RESEND_SMTP_PASSWORD || ''},authMethod:env.RESEND_SMTP_AUTHENTICATION?.toUpperCase(),
  connectionTimeout:5000,greetingTimeout:5000,socketTimeout:15000});
 return async(delivery,event)=>{
  const user={...delivery.user,password_reset_token:delivery.token};const key='User:'+user.id;
  const html=await renderer.render({template:'password_reset_mailer/reset_password',layout:'mailer',assigns:{user:{$ref:key},node_issued_token:true},records:{[key]:{type:'User',attributes:user}},context:{base_url:baseUrl,path:'/'}});
  const link=baseUrl.replace(/\/$/,'')+'/i-forgor/commit/'+encodeURIComponent(delivery.token);
  await client.sendMail({from:env.WALLTAKER_MAIL_FROM || 'walltaker@'+new URL(baseUrl).hostname,to:user.email,subject:'Walltaker Password Reset',
   messageId:`<walltaker-reset-${event.id}@${new URL(baseUrl).hostname}>`,html,text:`Reset your Walltaker password: ${link}\nThis link expires one hour after it was requested. If you did not request this reset, ignore this email.`});
 };
}
