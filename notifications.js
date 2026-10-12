'use strict';
// Opt-in email delivery with Node 22 fetch; no patient files sent by email.
async function send(to, subject, content) {
  const key=process.env.RESEND_API_KEY;
  const from=process.env.MAIL_FROM;
  if (!key || !from || !to) return false;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[to],subject,text:content})
  });
  if(!response.ok) throw Error('Mail provider HTTP '+response.status);
  return true;
}
async function notifyNewJob({jobId,title,service}) {
  return send(process.env.NOTIFY_ADMIN_EMAIL || process.env.ADMIN_EMAIL,
    'Artidentia Studio - yeni iş',
    'Yeni iş kaydedildi.\nİş: '+title+'\nHizmet: '+service+'\nİş no: '+jobId+'\nYönetim: https://artidentiastudio.com/');
}
async function notifyDeliveredJob({email,jobId}) {
  return send(email,'Artidentia Studio - tasarım teslim edildi',
    'Tasarım dosyalarınız portalda hazır.\nİş no: '+jobId+'\nGiriş: https://artidentiastudio.com/');
}
module.exports={notifyNewJob,notifyDeliveredJob};
