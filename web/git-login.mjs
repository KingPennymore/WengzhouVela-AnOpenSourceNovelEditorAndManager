import {t,say} from './i18n.mjs';
import {GitHub} from './github.mjs';
import {Gitee} from './gitee.mjs';
import {Gitea} from './gitea.mjs';
import {gitIdentity} from './git-host.mjs';

export function createGitClient(transport,provider='github',server='https://gitea.com'){
  if(provider==='gitea') return new Gitea(transport,server);
  return provider==='gitee'?new Gitee(transport):new GitHub(transport);
}

export function providerOptions(provider){
  return [
    ['github','GitHub'],
    ['gitee','Gitee'],
    ['gitea','Gitea']
  ]
    .map(
      ([value,label])=>
        `<option value="${value}" ${value===provider?'selected':''}>${label}</option>`
    )
    .join('');
}

export function serverField(provider,server,escape,name='server'){
  return (
    `<label data-gitea-server ${provider==='gitea'?'':'hidden'}>${t('Gitea 服务器地址')}` +
    `<input id="gitea-${name}" name="${name}" type="url" value="${escape(server||'https://gitea.com')}" ` +
    `placeholder="https://git.example.com" ${provider==='gitea'?'required':'disabled'}>` +
    `<small>${t('填写 HTTPS 站点地址，可包含端口和部署子目录。')}</small></label>`
  );
}

export function showTokenLogin({client,server,transport,openModal,escape,signedIn}){
  openModal(
    t('使用访问令牌登录'),
    `<label>${t('代码托管平台')}<select name="provider">${providerOptions(client.provider)}</select></label>` +
      serverField(client.provider,server,escape) +
      `<label>${t('个人访问令牌')}<input name="token" type="password" autocomplete="off" required></label>` +
      '<small data-git-permissions></small>',
    async form=>{
      const next=createGitClient(transport,form.get('provider'),form.get('server')||server);
      const token=form.get('token').trim();
      if(!token) throw Error(t('请输入令牌。'));
      const user=await transport('login',{...gitIdentity(next),token});
      document.querySelector('#dialog-body [name=token]').value='';
      await signedIn(user,next);
    },
    {label:t('验证并登录')}
  );
  const root=document.querySelector('#dialog-body');
  const update=()=>{
    const provider=root.querySelector('[name=provider]').value;
    const label=root.querySelector('[data-gitea-server]'),
      input=label.querySelector('input');
    label.hidden=provider!=='gitea';
    input.disabled=provider!=='gitea';
    input.required=provider==='gitea';
    root.querySelector('[data-git-permissions]').textContent=
      (provider==='gitea'
        ?t(
            '在该 Gitea 站点的用户设置中生成令牌，授予用户信息读取和仓库读写权限；在应用内新建仓库还需用户写权限。'
          )
        :provider==='gitee'
          ?t('Gitee 私人令牌需授予 user_info 和 projects 权限。')
          :t('GitHub 令牌需授予仓库 Contents 读写和 Metadata 读取权限。')) +
      say('',' ') + t('令牌由平台安全存储保存，不会写入文稿或日志。');
  };
  root.querySelector('[name=provider]').onchange=update;
  update();
}
