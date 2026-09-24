'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const { autenticar } = require('../../middleware/autenticacao');
const EventoConta = require('../../models/eventos/EventoConta');
const EventoParticipante = require('../../models/eventos/EventoParticipante');
const EventoInscricao = require('../../models/eventos/EventoInscricao');
const EventoAnalyticsEvent = require('../../models/eventos/EventoAnalyticsEvent');

const router = express.Router();
const EVENT_SLUG = 'corrida-cmdpii-2026';
const COOKIE_NAME = 'ax_evento_token';

function jwtSecret(){
  const s=process.env.EVENTOS_JWT_SECRET||process.env.JWT_SECRET||process.env.SECRET_KEY;
  if(s)return s;
  if(process.env.NODE_ENV==='production')throw new Error('EVENTOS_JWT_SECRET/JWT_SECRET ausente em produção.');
  return 'axoriin-eventos-dev-only-change-me';
}
function safe(v,max=160){return String(v||'').replace(/[<>]/g,'').trim().slice(0,max)}
function tokenFromReq(req){const a=String(req.headers.authorization||'');return req.cookies?.[COOKIE_NAME]||(a.startsWith('Bearer ')?a.slice(7):'')}
async function participantAuth(req,res,next){
  try{
    const raw=tokenFromReq(req);if(!raw)return res.status(401).json({mensagem:'Faça login para continuar.'});
    const p=jwt.verify(raw,jwtSecret());
    if(p.scope!=='evento-participante'||p.eventSlug!==EVENT_SLUG)return res.status(401).json({mensagem:'Sessão inválida.'});
    const account=await EventoConta.findOne({_id:p.accountId,eventSlug:EVENT_SLUG,ativo:true}).lean();
    if(!account)return res.status(401).json({mensagem:'Conta não encontrada.'});req.eventAccount=account;next();
  }catch{return res.status(401).json({mensagem:'Sessão expirada. Entre novamente.'})}
}
function adminRole(req,res,next){const u=req.usuario||{};const role=String(u.tipo||u.perfil||u.role||u.cargo||'').toLowerCase();const ok=['admin','master','superadmin','coorden','diretor','direção','direcao'].some(k=>role.includes(k));if(!ok)return res.status(403).json({mensagem:'Acesso administrativo necessário.'});next()}
function baseUrl(req){const explicit=String(process.env.EVENTOS_PUBLIC_URL||process.env.PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'');return explicit||`${req.protocol}://${req.get('host')}`}
function device(v){return ['desktop','mobile','tablet'].includes(v)?v:'outro'}
function pageName(v){return safe(v,80).replace(/[^a-zA-Z0-9_\-/. ]/g,'')}
function targetName(v){return safe(v,100).replace(/[^a-zA-Z0-9_\-/. :]/g,'')}

// Analytics sem PII: usa somente um id aleatório local de sessão, página, clique e tipo de dispositivo.
router.post('/analytics/event', express.json({limit:'12kb'}), async(req,res)=>{
  try{
    const tipo=['pageview','click','heartbeat'].includes(req.body.tipo)?req.body.tipo:null;
    const sessionId=safe(req.body.sessionId,80).replace(/[^a-zA-Z0-9_-]/g,'');
    if(!tipo||sessionId.length<8)return res.status(400).json({mensagem:'Evento inválido.'});
    await EventoAnalyticsEvent.create({eventSlug:EVENT_SLUG,sessionId,tipo,pagina:pageName(req.body.pagina),alvo:targetName(req.body.alvo),device:device(req.body.device),referrer:safe(req.body.referrer,250)});
    res.status(204).end();
  }catch(e){console.error('[eventos/analytics/event]',e);res.status(204).end()}
});

router.get('/analytics/public-summary',async(_req,res)=>{
  try{
    const liveSince=new Date(Date.now()-70*1000);
    const [pageViews,live]=await Promise.all([
      EventoAnalyticsEvent.countDocuments({eventSlug:EVENT_SLUG,tipo:'pageview'}),
      EventoAnalyticsEvent.distinct('sessionId',{eventSlug:EVENT_SLUG,createdAt:{$gte:liveSince}}),
    ]);
    res.json({pageViews,live:live.length});
  }catch{res.json({pageViews:0,live:0})}
});

async function analyticsReport(days=30){
  const clamped=Math.min(180,Math.max(1,Number(days)||30));
  const start=new Date(Date.now()-clamped*24*60*60*1000);start.setHours(0,0,0,0);
  const today=new Date();today.setHours(0,0,0,0);
  const liveSince=new Date(Date.now()-70*1000);
  const [pageViews,totalClicks,todayViews,liveSessions,daily,topPages,topClicks,devices]=await Promise.all([
    EventoAnalyticsEvent.countDocuments({eventSlug:EVENT_SLUG,tipo:'pageview'}),
    EventoAnalyticsEvent.countDocuments({eventSlug:EVENT_SLUG,tipo:'click'}),
    EventoAnalyticsEvent.countDocuments({eventSlug:EVENT_SLUG,tipo:'pageview',createdAt:{$gte:today}}),
    EventoAnalyticsEvent.distinct('sessionId',{eventSlug:EVENT_SLUG,createdAt:{$gte:liveSince}}),
    EventoAnalyticsEvent.aggregate([{$match:{eventSlug:EVENT_SLUG,tipo:'pageview',createdAt:{$gte:start}}},{$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt'}},value:{$sum:1}}},{$sort:{_id:1}}]),
    EventoAnalyticsEvent.aggregate([{$match:{eventSlug:EVENT_SLUG,tipo:'pageview'}},{$group:{_id:'$pagina',value:{$sum:1}}},{$sort:{value:-1}},{$limit:10}]),
    EventoAnalyticsEvent.aggregate([{$match:{eventSlug:EVENT_SLUG,tipo:'click'}},{$group:{_id:'$alvo',value:{$sum:1}}},{$sort:{value:-1}},{$limit:15}]),
    EventoAnalyticsEvent.aggregate([{$match:{eventSlug:EVENT_SLUG,tipo:'pageview'}},{$group:{_id:'$device',value:{$sum:1}}},{$sort:{value:-1}}]),
  ]);
  const unique=await EventoAnalyticsEvent.distinct('sessionId',{eventSlug:EVENT_SLUG,tipo:'pageview'});
  return {pageViews,totalClicks,todayViews,live:liveSessions.length,uniqueVisitors:unique.length,daily:daily.map(x=>({date:x._id,value:x.value})),topPages:topPages.map(x=>({name:x._id||'/',value:x.value})),topClicks:topClicks.map(x=>({name:x._id||'outro',value:x.value})),devices:devices.map(x=>({name:x._id||'outro',value:x.value}))};
}
router.get('/admin/analytics',autenticar,adminRole,async(req,res)=>{try{res.json(await analyticsReport(req.query.days))}catch(e){console.error('[eventos/admin/analytics]',e);res.status(500).json({mensagem:'Não foi possível gerar as métricas.'})}});

function confirmationToken(ins){return jwt.sign({scope:'evento-confirmacao',eventSlug:EVENT_SLUG,inscriptionId:String(ins._id)},jwtSecret(),{expiresIn:'365d'})}
async function confirmedData(inscriptionId,accountId=null){
  const filter={_id:inscriptionId,eventSlug:EVENT_SLUG,status:'confirmada'};if(accountId)filter.accountId=accountId;
  const ins=await EventoInscricao.findOne(filter).lean();if(!ins)return null;
  const p=await EventoParticipante.findOne({_id:ins.participantId,eventSlug:EVENT_SLUG,ativo:true}).lean();if(!p)return null;
  return {ins,p};
}
function brandFiles(){const root=path.join(__dirname,'../../public/eventos/corrida-cmdpii-2026/assets/img/brand');return {cb:path.join(root,'brasao-cbmac-cmdpii.png'),school:path.join(root,'brasao-colegio.png')}}
async function confirmationPayload(req,data){const token=confirmationToken(data.ins);const verifyUrl=`${baseUrl(req)}/eventos/${EVENT_SLUG}/confirmacao.html?t=${encodeURIComponent(token)}`;const qr=await QRCode.toBuffer(verifyUrl,{width:360,margin:1,errorCorrectionLevel:'M'});return {...data,token,verifyUrl,qr}}

router.get('/confirmacao/validar',async(req,res)=>{
  try{const p=jwt.verify(String(req.query.token||''),jwtSecret());if(p.scope!=='evento-confirmacao'||p.eventSlug!==EVENT_SLUG)throw new Error('token');const data=await confirmedData(p.inscriptionId);if(!data)return res.status(404).json({valido:false,mensagem:'Inscrição não localizada ou não deferida.'});res.json({valido:true,nome:data.p.nome,numeroPeito:data.ins.numeroPeito,categoria:data.ins.categoriaNome,status:'Inscrição deferida',pagamento:data.ins.pagamento?.status==='aprovado'?'PIX confirmado':'Confirmado',kitStatus:data.ins.kit?.status||'aguardando'});}catch{res.status(400).json({valido:false,mensagem:'Cartão inválido ou expirado.'})}
});

router.get('/cartao-confirmacao/:id.pdf',participantAuth,async(req,res)=>{
  try{
    const data=await confirmedData(req.params.id,req.eventAccount._id);if(!data)return res.status(404).json({mensagem:'O cartão é liberado somente após o deferimento da inscrição.'});
    const c=await confirmationPayload(req,data);const logos=brandFiles();
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="cartao-confirmacao-${data.ins.numeroPeito}.pdf"`);
    const doc=new PDFDocument({size:[430,620],margin:28});doc.pipe(res);
    doc.rect(0,0,430,620).fill('#041326');doc.rect(0,0,430,115).fill('#07213d');
    try{if(fs.existsSync(logos.cb))doc.image(logos.cb,28,18,{width:68});if(fs.existsSync(logos.school))doc.image(logos.school,334,20,{width:66});}catch{}
    doc.fillColor('#36d8ff').fontSize(9).text('AXORIIN EVENTOS',112,24,{width:206,align:'center'});
    doc.fillColor('#ffffff').fontSize(24).text('CARTÃO DE CONFIRMAÇÃO',98,45,{width:234,align:'center'});
    doc.fillColor('#b7c8dc').fontSize(10).text('Corrida CMDPII-CZS 2ª edição',105,80,{width:220,align:'center'});
    doc.roundedRect(28,132,374,92,12).fillAndStroke('#09233f','#2fd7ff');doc.fillColor('#80dcff').fontSize(8).text('PARTICIPANTE',46,149);doc.fillColor('#fff').fontSize(17).text(data.p.nome,46,165,{width:330});
    const items=[['NÚMERO DE PEITO',data.ins.numeroPeito],['CATEGORIA',data.ins.categoriaNome],['STATUS','INSCRIÇÃO DEFERIDA'],['PAGAMENTO','PIX CONFIRMADO']];let y=240;
    items.forEach((it,i)=>{const x=i%2?220:28;if(i===2)y=318;doc.roundedRect(x,y,182,62,10).fillAndStroke(i>=2?'#063629':'#0a2645',i>=2?'#36e69b':'#286a96');doc.fillColor(i>=2?'#77f2ba':'#86d9ff').fontSize(7).text(it[0],x+14,y+12,{width:154});doc.fillColor('#fff').fontSize(i===1?10:14).text(it[1],x+14,y+28,{width:154});});
    doc.image(c.qr,42,400,{width:126,height:126});doc.fillColor('#77dfff').fontSize(7).text('QR DE CONFIRMAÇÃO',42,532,{width:126,align:'center'});
    doc.roundedRect(188,400,214,72,10).fillAndStroke('#3a2b08','#ffd23d');doc.fillColor('#ffd23d').fontSize(9).text('MEDALHA',202,414);doc.fillColor('#fff').fontSize(9).text('Entregue somente no dia da corrida, após a conclusão da prova.',202,432,{width:184});
    doc.roundedRect(188,486,214,60,10).fillAndStroke('#08253e','#2fd7ff');doc.fillColor('#2fd7ff').fontSize(8).text('RETIRADA DO KIT',202,499);doc.fillColor('#fff').fontSize(8).text('Apresente este cartão no celular ou impresso, com documento oficial com foto.',202,516,{width:184});
    doc.fillColor('#8299b1').fontSize(7).text('22/11/2026 • Colégio Militar Dom Pedro II • Cruzeiro do Sul - AC',28,575,{width:374,align:'center'});
    doc.end();
  }catch(e){console.error('[eventos/cartao-pdf]',e);if(!res.headersSent)res.status(500).json({mensagem:'Não foi possível gerar o cartão.'})}
});

router.get('/cartao-confirmacao/:id.png',participantAuth,async(req,res)=>{
  try{
    const data=await confirmedData(req.params.id,req.eventAccount._id);if(!data)return res.status(404).json({mensagem:'O cartão é liberado somente após o deferimento da inscrição.'});
    const c=await confirmationPayload(req,data);const logos=brandFiles();const cb=fs.existsSync(logos.cb)?fs.readFileSync(logos.cb).toString('base64'):'';const school=fs.existsSync(logos.school)?fs.readFileSync(logos.school).toString('base64'):'';const qr=c.qr.toString('base64');
    const svg=`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#031326"/><stop offset="1" stop-color="#071f3a"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><rect x="0" y="0" width="1080" height="245" fill="#08243f"/><image href="data:image/png;base64,${cb}" x="58" y="35" width="170" height="170"/><image href="data:image/png;base64,${school}" x="852" y="42" width="150" height="150"/><text x="540" y="76" text-anchor="middle" fill="#32d8ff" font-family="Arial" font-size="26" font-weight="700">AXORIIN EVENTOS</text><text x="540" y="135" text-anchor="middle" fill="#fff" font-family="Arial" font-size="48" font-weight="800">CARTÃO DE CONFIRMAÇÃO</text><text x="540" y="180" text-anchor="middle" fill="#b7c8dc" font-family="Arial" font-size="26">Corrida CMDPII-CZS 2ª edição</text><rect x="55" y="285" width="970" height="160" rx="26" fill="#09243f" stroke="#31d8ff" stroke-width="3"/><text x="90" y="332" fill="#72dfff" font-family="Arial" font-size="22">PARTICIPANTE</text><text x="90" y="392" fill="#fff" font-family="Arial" font-size="42" font-weight="700">${safe(data.p.nome,48)}</text><rect x="55" y="478" width="300" height="145" rx="22" fill="#0a2949"/><text x="82" y="520" fill="#73dcff" font-family="Arial" font-size="18">NÚMERO DE PEITO</text><text x="82" y="588" fill="#fff" font-family="Arial" font-size="56" font-weight="800">${safe(data.ins.numeroPeito,12)}</text><rect x="390" y="478" width="635" height="145" rx="22" fill="#0a2949"/><text x="420" y="520" fill="#73dcff" font-family="Arial" font-size="18">CATEGORIA</text><text x="420" y="576" fill="#fff" font-family="Arial" font-size="31" font-weight="700">${safe(data.ins.categoriaNome,42)}</text><rect x="55" y="655" width="470" height="130" rx="22" fill="#063629" stroke="#31e89b" stroke-width="3"/><text x="88" y="702" fill="#7cf0bc" font-family="Arial" font-size="18">STATUS</text><text x="88" y="756" fill="#fff" font-family="Arial" font-size="32" font-weight="700">INSCRIÇÃO DEFERIDA</text><rect x="555" y="655" width="470" height="130" rx="22" fill="#063629" stroke="#31e89b" stroke-width="3"/><text x="588" y="702" fill="#7cf0bc" font-family="Arial" font-size="18">PAGAMENTO</text><text x="588" y="756" fill="#fff" font-family="Arial" font-size="32" font-weight="700">PIX CONFIRMADO</text><image href="data:image/png;base64,${qr}" x="65" y="835" width="310" height="310"/><text x="220" y="1175" text-anchor="middle" fill="#63dcff" font-family="Arial" font-size="18" font-weight="700">QR DE CONFIRMAÇÃO</text><rect x="420" y="835" width="605" height="145" rx="22" fill="#382b08" stroke="#ffd23d" stroke-width="3"/><text x="450" y="884" fill="#ffd23d" font-family="Arial" font-size="23" font-weight="800">ENTREGA DA MEDALHA</text><text x="450" y="930" fill="#fff" font-family="Arial" font-size="22">Somente no dia da corrida, após a</text><text x="450" y="962" fill="#fff" font-family="Arial" font-size="22">conclusão da prova.</text><rect x="420" y="1008" width="605" height="164" rx="22" fill="#08253e" stroke="#31d8ff" stroke-width="3"/><text x="450" y="1054" fill="#31d8ff" font-family="Arial" font-size="23" font-weight="800">RETIRADA DO KIT</text><text x="450" y="1100" fill="#fff" font-family="Arial" font-size="20">Apresente este cartão no celular ou impresso</text><text x="450" y="1132" fill="#fff" font-family="Arial" font-size="20">com documento oficial com foto.</text><text x="540" y="1280" text-anchor="middle" fill="#b8c8d9" font-family="Arial" font-size="21">22/11/2026 • Colégio Militar Dom Pedro II • Cruzeiro do Sul - AC</text></svg>`;
    const png=await sharp(Buffer.from(svg)).png().toBuffer();res.setHeader('Content-Type','image/png');res.setHeader('Content-Disposition',`attachment; filename="cartao-confirmacao-${data.ins.numeroPeito}.png"`);res.send(png);
  }catch(e){console.error('[eventos/cartao-png]',e);res.status(500).json({mensagem:'Não foi possível gerar o cartão.'})}
});

module.exports=router;
