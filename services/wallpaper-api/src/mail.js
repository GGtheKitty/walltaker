import nodemailer from'nodemailer';
import{escape}from'./html.js';
export function createResetMailer({baseUrl,env=process.env,transport}){
 const client=transport || nodemailer.createTransport({host:env.RESEND_SMTP_ADDRESS || 'smtp.resend.com',port:Number(env.RESEND_SMTP_PORT || 587),secure:Number(env.RESEND_SMTP_PORT || 587)===465,
  requireTLS:env.RESEND_SMTP_ENABLE_STARTTLS_AUTO!=='false',ignoreTLS:env.RESEND_SMTP_ENABLE_STARTTLS_AUTO==='false',
  auth:{user:env.RESEND_SMTP_USER_NAME || 'resend',pass:env.RESEND_API_KEY || env.RESEND_SMTP_PASSWORD || ''},authMethod:env.RESEND_SMTP_AUTHENTICATION?.toUpperCase(),
  connectionTimeout:5000,greetingTimeout:5000,socketTimeout:15000});
 return async(delivery,event)=>{
  const user=delivery.user;
  const link=baseUrl.replace(/\/$/,'')+'/i-forgor/commit/'+encodeURIComponent(delivery.token);
  const html=`<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style>/* Email styles need to be inline */</style></head><body>
<h1>Reset your password</h1>
<p>A password reset was requested for <strong>${escape(user.username)}</strong> on
<a href="${escape(baseUrl)}">walltaker</a>, an adult site for furries. If this was not you, simply ignore this
email. If you did request this password reset, press the large button below to change your password now.</p>
<p>This link expires one hour after the reset was requested.</p>
<a href="${escape(link)}">Reset Password Now</a><hr><small>Thanks &lt;3</small></body></html>`;
  await client.sendMail({from:env.WALLTAKER_MAIL_FROM || 'walltaker@'+new URL(baseUrl).hostname,to:user.email,subject:'Walltaker Password Reset',
   messageId:`<walltaker-reset-${event.id}@${new URL(baseUrl).hostname}>`,html,text:`Reset your Walltaker password: ${link}\nThis link expires one hour after it was requested. If you did not request this reset, ignore this email.`});
 };
}
