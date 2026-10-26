import {installMemberCreator} from './member-creator-ui.mjs';
const STAGING_URL = 'https://cmnomqsurdwhdbjgnsvw.supabase.co';
export const MEMBER_REDIRECT = 'https://pinoy-worldcup-staging.onrender.com/';
let client;
export function getMemberClient() {
  const config = window.PWC_STAGING;
  if (config?.supabaseUrl !== STAGING_URL || !/^sb_publishable_/.test(config.publishableKey || '')) {
    throw Error('Staging configuration unavailable.');
  }
  return client ||= window.supabase.createClient(STAGING_URL, config.publishableKey, {
    db: {schema: 'pwc41_api'},
    auth: {storageKey: 'pwc-staging-member-auth', flowType: 'pkce',
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
  });
}

export function safeProfileDiagnostic(response={}) {
 const status=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:0;
 const raw=response.error?.code;
 const code=typeof raw==='string'&&/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(raw)?raw:'UNKNOWN';
 const message=response.error?.message;
 const points={'Confirmed Google member session required':'GOOGLE_IDENTITY_GUARD','permission denied for schema pwc41_api':'API_SCHEMA_USAGE','permission denied for function ensure_google_member_profile':'PROFILE_RPC_EXECUTE','permission denied for table profiles':'PROFILE_TABLE_ACCESS','permission denied for table users':'AUTH_USERS_ACCESS','permission denied for table identities':'AUTH_IDENTITIES_ACCESS'};
 return {status,code,...(Object.hasOwn(points,message)?{point:points[message]}:{})};
}

// Explicit operator diagnostic only; never called automatically or used to bypass auth.
export async function readProfileConditionDiagnostics(){
 const response=await getMemberClient().rpc('profile_google_conditions_v1');
 if(response.error)return safeProfileDiagnostic(response);
 const keys=['uid_present','auth_user_exists','google_identity_exists','email_confirmed','not_anonymous','jwt_provider_google','profile_exists'];
 return Object.fromEntries(keys.map(k=>[k,typeof response.data?.[k]==='boolean'?response.data[k]:'UNKNOWN']));
}

export async function initializeMemberAuth() {
  const login = document.getElementById('memberGoogle');
  const logout = document.getElementById('memberLogout');
  const status = document.getElementById('memberStatus');
  let revision = 0;
  try {
    const authClient = getMemberClient();
    const creator=installMemberCreator({client:authClient,account:status.parentElement});
    async function render(session) {
      const current = ++revision;
      login.hidden = !!session; logout.hidden = !session;login.disabled=false;
      delete status.dataset.profileHttp;delete status.dataset.profileCode;delete status.dataset.profilePoint;creator.setIdentity(null);
      if (!session) { status.textContent = 'Play as a guest, or sign in with Google.'; return; }
      status.textContent = 'Preparing your member profile…';
      let response;try{response=await authClient.rpc('ensure_google_member_profile');}catch{response={status:0,error:{code:'UNKNOWN'}};}
      const {error}=response;
      if (current !== revision) return;
      if(error){const diagnostic=safeProfileDiagnostic(response);status.dataset.profileHttp=String(diagnostic.status);status.dataset.profileCode=diagnostic.code;if(diagnostic.point)status.dataset.profilePoint=diagnostic.point;}
      else creator.setIdentity(session.user);
      status.textContent = error
        ? 'Member profile unavailable. Please sign out and try again. Guest play is still available.'
        : 'Signed in with Google.';
    }
    login.onclick = async () => {
      if (location.origin !== new URL(MEMBER_REDIRECT).origin) {
        status.textContent = 'Google login is available on the Staging site.'; return;
      }
      login.disabled = true;
      try {
        const {error} = await authClient.auth.signInWithOAuth({provider: 'google',
          options: {redirectTo: MEMBER_REDIRECT, scopes: 'openid email profile', queryParams: {prompt: 'select_account'}}});
        if (error) throw error;
      } catch {
        status.textContent = 'Google login could not start. Please try again.';
        login.disabled = false;
      }
    };
    logout.onclick = async () => {
      const {error} = await authClient.auth.signOut({scope: 'local'});
      if (error) status.textContent = 'Sign out failed. Please try again.';
      else await render(null);
    };
    // Never await another Auth operation inside the Auth state callback.
    authClient.auth.onAuthStateChange((event, session) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION'].includes(event)) {
        setTimeout(() => render(session).catch(() => {
          status.textContent = 'Member session unavailable. Guest play is still available.';
        }), 0);
      }
    });
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const oauthError = params.has('error') || fragment.has('error');
    const {data, error} = await authClient.auth.getSession();
    // SDK finishes PKCE exchange before getSession resolves. Remove callback data.
    if (params.has('code') || oauthError) {
      for (const key of ['code', 'error', 'error_code', 'error_description']) params.delete(key);
      history.replaceState(history.state, '', location.pathname + (params.size ? '?' + params : '') + (oauthError ? '' : location.hash));
    }
    if (error) throw error;
    await render(data.session);
    if (oauthError) status.textContent = 'Google login was cancelled or failed. Please try again.';
  } catch {
    status.textContent = 'Member login unavailable. You can still play as a guest.';
  }
}

if (typeof document !== 'undefined' && document.getElementById('memberGoogle')) {
  void initializeMemberAuth();
}
