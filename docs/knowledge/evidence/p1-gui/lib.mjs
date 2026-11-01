export const PW='/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
export async function open(url,{w=1440,h=900}={}){
  const { chromium } = await import(PW)
  const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']})
  const p=await b.newPage({viewport:{width:w,height:h}})
  await p.goto(url,{waitUntil:'domcontentloaded'})
  await p.waitForTimeout(6000)
  return {b,p}
}
export async function dismissNotice(p){
  const c=p.getByRole('button',{name:'Continue'})
  if(await c.count()){ await c.first().click().catch(()=>{}); await p.waitForTimeout(1200) }
}
export async function send(p,text){
  const box=p.locator('[contenteditable="true"]').first()
  await box.click()
  await p.keyboard.insertText(text)
  await p.waitForTimeout(400)
  await p.keyboard.press('Enter')
}
