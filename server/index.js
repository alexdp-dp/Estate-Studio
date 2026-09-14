import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
const app=express();
app.use(express.json({limit:'10mb'})); app.use(cookieParser());

const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET=process.env.JWT_SECRET || 'estate-studio-test-build-change-later';
if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const supabase=createClient(SUPABASE_URL||'http://localhost',SUPABASE_SERVICE_ROLE_KEY||'missing',{auth:{persistSession:false,autoRefreshToken:false}});

const ADMIN_USER='alexdarie';
const ADMIN_HASH='pbkdf2_sha256$210000$lM6qBN+L6b1Vqcj0u9nnOQ==$BU5Pfss01ik6AKY7wxWg9MTlN1NTqZfVkejYPpBDMVY=';

function verifyPassword(password, record){
  const [,it,salt64,hash64]=record.split('$');
  const got=crypto.pbkdf2Sync(password,Buffer.from(salt64,'base64'),Number(it),32,'sha256');
  return crypto.timingSafeEqual(got,Buffer.from(hash64,'base64'));
}
function auth(req,res,next){
  try{req.user=jwt.verify(req.cookies.es_token,JWT_SECRET);next();}
  catch{res.status(401).json({error:'Unauthorized'});}
}
function ok(res,promise){
  promise.then(({data,error})=>error?res.status(500).json({error:error.message}):res.json(data)).catch(e=>res.status(500).json({error:e.message}));
}
app.get('/api/health', async(req,res)=>{
  const {error}=await supabase.from('projects').select('id',{head:true,count:'exact'});
  res.status(error?500:200).json({ok:!error,supabase:!error,error:error?.message});
});
app.post('/api/login',(req,res)=>{
  if(req.body?.username===ADMIN_USER && verifyPassword(String(req.body?.password||''),ADMIN_HASH)){
    const token=jwt.sign({sub:ADMIN_USER},JWT_SECRET,{expiresIn:'12h'});
    res.cookie('es_token',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:43200000});
    return res.json({ok:true});
  }
  res.status(401).json({error:'Date de autentificare incorecte'});
});
app.post('/api/logout',(req,res)=>{res.clearCookie('es_token');res.json({ok:true})});

async function getProjectTree(slug='demo-residence'){
  let {data:project,error}=await supabase.from('projects').select('*').eq('slug',slug).maybeSingle();
  if(error) throw error;
  if(!project) return null;
  const {data:buildings,error:be}=await supabase.from('buildings').select('*').eq('project_id',project.id).order('sort_order');
  if(be) throw be;
  for(const b of buildings){
    const {data:floors,error:fe}=await supabase.from('floors').select('*').eq('building_id',b.id).order('floor_number');
    if(fe) throw fe;
    for(const f of floors){
      const {data:apartments,error:ae}=await supabase.from('apartments').select('*, apartment_polygons(points)').eq('floor_id',f.id).order('code');
      if(ae) throw ae;
      f.apartments=apartments||[];
    }
    b.floors=floors||[];
  }
  return {...project,buildings};
}
app.get('/api/project/:slug?',async(req,res)=>{
  try{const data=await getProjectTree(req.params.slug||'demo-residence'); data?res.json(data):res.status(404).json({error:'Project not found'});}
  catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/admin/projects',auth,(req,res)=>ok(res,supabase.from('projects').insert(req.body).select().single()));
app.patch('/api/admin/projects/:id',auth,(req,res)=>ok(res,supabase.from('projects').update(req.body).eq('id',req.params.id).select().single()));
app.post('/api/admin/buildings',auth,(req,res)=>ok(res,supabase.from('buildings').insert(req.body).select().single()));
app.patch('/api/admin/buildings/:id',auth,(req,res)=>ok(res,supabase.from('buildings').update(req.body).eq('id',req.params.id).select().single()));
app.post('/api/admin/floors',auth,(req,res)=>ok(res,supabase.from('floors').insert(req.body).select().single()));
app.patch('/api/admin/floors/:id',auth,(req,res)=>ok(res,supabase.from('floors').update(req.body).eq('id',req.params.id).select().single()));
app.post('/api/admin/apartments',auth,(req,res)=>ok(res,supabase.from('apartments').insert(req.body).select().single()));
app.patch('/api/admin/apartments/:id',auth,(req,res)=>ok(res,supabase.from('apartments').update(req.body).eq('id',req.params.id).select().single()));
app.put('/api/admin/apartments/:id/polygon',auth,async(req,res)=>{
  const {data,error}=await supabase.from('apartment_polygons').upsert({apartment_id:req.params.id,points:req.body.points},{onConflict:'apartment_id'}).select().single();
  error?res.status(500).json({error:error.message}):res.json(data);
});
app.delete('/api/admin/apartments/:id',auth,(req,res)=>ok(res,supabase.from('apartments').delete().eq('id',req.params.id).select()));

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024}});
const allowedBuckets=new Set(['models','floor-plans','project-images','apartment-images']);
app.post('/api/admin/upload/:bucket',auth,upload.single('file'),async(req,res)=>{
  try{
    const bucket=req.params.bucket;
    if(!allowedBuckets.has(bucket)) return res.status(400).json({error:'Bucket invalid'});
    if(!req.file) return res.status(400).json({error:'Fișier lipsă'});
    const clean=req.file.originalname.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const objectPath=`${Date.now()}-${clean}`;
    const {error}=await supabase.storage.from(bucket).upload(objectPath,req.file.buffer,{contentType:req.file.mimetype,upsert:false});
    if(error) throw error;
    const {data}=supabase.storage.from(bucket).getPublicUrl(objectPath);
    res.json({bucket,path:objectPath,url:data.publicUrl});
  }catch(e){res.status(500).json({error:e.message});}
});

const clientDist=path.join(__dirname,'../client/dist');
app.use(express.static(clientDist));
app.get('*',(req,res)=>res.sendFile(path.join(clientDist,'index.html')));
const PORT=process.env.PORT||3000;
app.listen(PORT,'0.0.0.0',()=>console.log(`Estate Studio Build 02 on ${PORT}`));
