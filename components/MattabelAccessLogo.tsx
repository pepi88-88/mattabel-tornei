import BrandLogo from './BrandLogo'

/** Shared login and welcome logo, always following the Admin's active choice. */
export default function MattabelAccessLogo({size='home'}:{size?:'home'|'staff'}){
 return <div className={'mt-access-logo'+(size==='staff'?' mt-access-login-logo':'')}>
   <BrandLogo width={size==='staff'?210:245} height={size==='staff'?210:245}
    alt="Mattabel Beach Volley — logo attivo" />
 </div>
}
