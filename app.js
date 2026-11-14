'use strict';
// MILO ADMIN — only data source. No Apps Script, secondary endpoints, local credentials or cookies.
const CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vRWTsbSDKAGwrI46TDK0rlwGmDy7gah_127NW-DaUzFffUFv9eK2f1X90HryjUMYU3aR8wPnK2UE_2B/pub?output=csv";
const ALLOW_FIELDS = new Map(Object.entries({
 barcode:'الباركود',sku:'رمز المنتج',name:'الاسم',product_name:'اسم المنتج',product:'المنتج',
 category:'التصنيف',price:'السعر',sale_price:'سعر البيع',cost_price:'سعر التكلفة',
 stock:'الكمية',unit:'الوحدة',min_stock:'الحد الأدنى',description:'الوصف',image_url:'الصورة',
 store_name:'اسم المتجر',status:'الحالة',date:'التاريخ',invoice_count:'عدد الفواتير',
 sales_total:'إجمالي المبيعات',total:'الإجمالي',vat:'الضريبة',discount:'الخصم'
}));
// Every field must be explicitly allowlisted to avoid exposing passwords, usernames,
// customer records, access tokens, employee details and other private columns.
const DANGEROUS=/(pass(word)?|كلمة.?المرور|user(name)?|اسم.?المستخدم|token|secret|credential|cookie|private|auth|email|phone|جوال|هاتف|عنوان|address|owner|مالك|بريد|iban|account|حساب|api.?key|access|session|vat_number|client|customer|employee|موظف|عميل|id_number)/i;
const byId=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={columns:[],rows:[],sort:'',ready:false};
function parseCsv(input){
 const text=String(input||'').replace(/^\uFEFF/,'');const rows=[];
 let row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quote=false;}else{cell+=c;}}
  else if(c==='"'&&cell===''){quote=true;}
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[];}
  else{cell+=c;}
 }
 if(cell||row.length){row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);}
 return rows;
}
function normalize(x){return String(x||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}
function notice(msg){const n=byId('notice');n.textContent=msg;n.classList.remove('hide');}
function clearNotice(){byId('notice').classList.add('hide');byId('notice').textContent='';}
function render(){
 const q=byId('search').value.trim().toLowerCase();let rows=state.rows.filter(row=>!q||row.some(v=>String(v).toLowerCase().includes(q)));
 if(state.sort){const idx=state.columns.findIndex(c=>c.key===state.sort);if(idx>=0)rows=rows.slice().sort((a,b)=>String(a[idx]??'').localeCompare(String(b[idx]??''),'ar',{numeric:true}));}
 const displayed=rows.slice(0,250);
 const region=byId('tableRegion');
 if(!state.columns.length){region.innerHTML='<div class="empty">لا توجد أعمدة عامة مسموح بعرضها في هذه الورقة. إذا كان CSV يحتوي حسابات وكلمات مرور، فلا يمكن استخدامه كواجهة إدارة عامة.</div>';}
 else if(!rows.length){region.innerHTML='<div class="empty">لا توجد سجلات مطابقة للبحث.</div>';}
 else{region.innerHTML='<table class="table"><thead><tr>'+state.columns.map(c=>'<th>'+escapeHtml(c.label)+'</th>').join('')+'</tr></thead><tbody>'+displayed.map(row=>'<tr>'+row.map(v=>'<td>'+escapeHtml(String(v??'').slice(0,500))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
 byId('tableInfo').textContent='عدد النتائج المطابقة: '+rows.length+' — يتم عرض أول '+Math.min(rows.length,250)+' صف. الحقول الحساسة لا تُعرض ولا تدخل في البحث أو التصدير.';
 byId('export').disabled=!state.ready||!displayed.length;
}
function downloadSafeCsv(){
 const q=byId('search').value.trim().toLowerCase();
 const rows=state.rows.filter(row=>!q||row.some(v=>String(v).toLowerCase().includes(q)));
 const csv=[state.columns.map(c=>c.label),...rows].map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const object=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=object;a.download='MILO_READONLY_PUBLIC_DATA.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(object),1000);
}
async function reload(){
 state.ready=false;byId('export').disabled=true;byId('reload').disabled=true;byId('status').textContent='جارٍ الاتصال';
 byId('tableRegion').innerHTML='<div class="skeleton"><div class="sk-head"></div><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div></div>';
 clearNotice();
 try{
  const res=await fetch(CSV_URL,{mode:'cors',credentials:'omit',cache:'no-store',redirect:'follow'});
  if(!res.ok)throw Error('رمز الاستجابة '+res.status);
  const content=await res.text();if(content.length>7*1024*1024)throw Error('حجم المصدر أكبر من حد العرض (7 MB)');
  const table=parseCsv(content);if(table.length===0)throw Error('المصدر لا يحتوي على صفوف');
  // The published sheet must have named headers. Fail closed on a CSV of secrets.
  const headers=table[0];const safe=headers.map((name,i)=>({name,key:normalize(name),i})).filter(h=>ALLOW_FIELDS.has(h.key)&&!DANGEROUS.test(h.name));
  state.columns=safe.map(h=>({key:h.key,label:ALLOW_FIELDS.get(h.key)}));
  state.rows=table.slice(1,5001).map(row=>safe.map(h=>String(row[h.i]??'').trim()));
  state.ready=true;
  byId('status').textContent='تم الاتصال';byId('count').textContent=String(state.rows.length);byId('columns').textContent=String(state.columns.length);
  byId('sort').innerHTML='<option value="">الترتيب الأصلي</option>'+state.columns.map(c=>'<option value="'+escapeHtml(c.key)+'">'+escapeHtml(c.label)+'</option>').join('');
  byId('sort').value='';state.sort='';render();
  if(safe.length===0)notice('تم الوصول للمصدر، لكن لا توجد أعمدة عامة مناسبة للعرض. تسجيل الدخول من كلمات مرور منشورة للعامة غير آمن.');
  else if(table.length>5001)notice('يعرض الموقع أول 5000 سجل من المصدر لحماية سرعة المتصفح.');
 }catch(err){state.ready=false;state.columns=[];state.rows=[];byId('count').textContent='—';byId('columns').textContent='—';byId('status').textContent='تعذر الاتصال';
  byId('tableRegion').innerHTML='<div class="empty">تعذر قراءة المصدر من المتصفح. قد يكون رابط النشر غير متاح، أو يمنع المتصفح طلبات CORS المباشرة. افتح المصدر من الرابط أدناه للتأكد، ولا تستخدم وسيطًا غير موثوق يعرض كلمات المرور.</div>';
  notice('تعذر جلب CSV مباشرة: '+err.message+'. لا توجد خدمة أو رابط احتياطي في هذه النسخة.');
 }finally{byId('reload').disabled=false;}
}
byId('reload').addEventListener('click',reload);
byId('search').addEventListener('input',render);
byId('sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
byId('export').addEventListener('click',downloadSafeCsv);
byId('sourceLink').href=CSV_URL;
reload();
