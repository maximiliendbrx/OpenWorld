# Génère les modèles d'e-mails Supabase (HTML + sujet) aux couleurs de HorizonsGPX.
# Usage : python3 build.py   -> écrit un fichier .html par modèle + subjects.txt
import json
GREEN, GOLD, INK, MUTED, BG, LINE, SOFT = '#28583e', '#a79058', '#243d34', '#687b6c', '#edf2e8', '#dfe8db', '#f0f3e9'
HEAD = "font-family:Manrope,'Helvetica Neue',Arial,sans-serif"
BODY = "font-family:'DM Sans','Helvetica Neue',Arial,sans-serif"

def layout(preheader, title, intro, button=None, code=None, outro='', note=''):
    btn = ''
    if button:
        label, url = button
        btn = f'''<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="background:{GREEN};border-radius:8px"><a href="{url}" style="display:inline-block;padding:15px 30px;{BODY};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">{label}</a></td></tr></table>
<p style="margin:14px 0 0;{BODY};font-size:12px;line-height:1.6;color:{MUTED}">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="{url}" style="color:{GREEN};word-break:break-all">{url}</a></p>'''
    if code:
        btn = f'''<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td style="background:{SOFT};border:1px solid {LINE};border-radius:10px;padding:16px 28px;{HEAD};font-size:34px;font-weight:800;letter-spacing:10px;color:{GREEN}">{code}</td></tr></table>'''
    out = f'<p style="margin:22px 0 0;{BODY};font-size:15px;line-height:1.7;color:{INK}">{outro}</p>' if outro else ''
    nt = f'<p style="margin:26px 0 0;padding:14px 16px;background:{SOFT};border-radius:8px;{BODY};font-size:13px;line-height:1.6;color:{MUTED}">{note}</p>' if note else ''
    return f'''<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{title}</title></head>
<body style="margin:0;padding:0;background:{BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px;{HEAD};font-size:26px;font-weight:800;letter-spacing:-1px;color:#24533d">&#9651; horizonsgpx<span style="color:{GOLD}">.</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid {LINE};border-radius:16px;padding:40px 36px">
<h1 style="margin:0 0 16px;{HEAD};font-size:27px;line-height:1.2;letter-spacing:-1px;font-weight:700;color:{INK}">{title}</h1>
<p style="margin:0;{BODY};font-size:15px;line-height:1.7;color:{INK}">{intro}</p>
{btn}{out}{nt}
</td></tr>
<tr><td style="padding:22px 8px 0;text-align:center;{BODY};font-size:12px;line-height:1.7;color:#8a9a8c">
HorizonsGPX &middot; Cr&eacute;ez et exportez vos itin&eacute;raires v&eacute;lo, gravel et VTT.<br>
<a href="{{{{ .SiteURL }}}}" style="color:#8a9a8c">horizonsgpx.com</a> &middot; <a href="{{{{ .SiteURL }}}}/legal.html" style="color:#8a9a8c">Mentions l&eacute;gales</a><br>
Vous recevez cet e-mail car il concerne le compte associ&eacute; &agrave; {{{{ .Email }}}}.
</td></tr>
</table></td></tr></table></body></html>'''

T = {}
T['confirmation'] = ('Confirmez votre adresse e-mail pour activer votre compte HorizonsGPX',
  layout('Un dernier clic pour activer votre compte et créer votre premier parcours.',
    'Bienvenue sur HorizonsGPX',
    'Merci de vous être inscrit. Confirmez votre adresse e-mail pour activer votre compte, puis créez votre premier parcours : route, gravel ou VTT, avec profil de dénivelé et export GPX.',
    button=('Confirmer mon adresse e-mail', '{{ .ConfirmationURL }}'),
    note="Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail : aucun compte ne sera activé."))
T['recovery'] = ('Réinitialisez votre mot de passe HorizonsGPX',
  layout('Choisissez un nouveau mot de passe pour votre compte.',
    'Réinitialiser votre mot de passe',
    'Vous avez demandé à réinitialiser le mot de passe de votre compte HorizonsGPX. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
    button=('Choisir un nouveau mot de passe', '{{ .ConfirmationURL }}'),
    note="Ce lien est valable une heure. Si vous n'avez rien demandé, ignorez cet e-mail : votre mot de passe actuel reste inchangé."))
T['magic_link'] = ('Votre lien de connexion HorizonsGPX',
  layout('Connectez-vous en un clic, sans mot de passe.',
    'Votre lien de connexion',
    'Utilisez le bouton ci-dessous pour vous connecter à votre compte HorizonsGPX. Aucun mot de passe n\'est nécessaire.',
    button=('Me connecter', '{{ .ConfirmationURL }}'),
    note="Ce lien est à usage unique et expire rapidement. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail."))
T['email_change'] = ('Confirmez votre nouvelle adresse e-mail HorizonsGPX',
  layout('Confirmez le changement d\'adresse e-mail de votre compte.',
    'Confirmer votre nouvelle adresse',
    'Vous avez demandé à remplacer l\'adresse e-mail de votre compte HorizonsGPX par <strong>{{ .NewEmail }}</strong>. Confirmez ce changement pour qu\'il soit pris en compte.',
    button=('Confirmer la nouvelle adresse', '{{ .ConfirmationURL }}'),
    note="Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail et pensez à changer votre mot de passe par sécurité."))
T['invite'] = ('Vous êtes invité à rejoindre HorizonsGPX',
  layout('Acceptez l\'invitation pour créer votre compte.',
    'Vous êtes invité',
    'Vous avez été invité à rejoindre HorizonsGPX, l\'outil pour créer vos itinéraires vélo, gravel et VTT et les exporter en GPX. Acceptez l\'invitation pour créer votre compte.',
    button=('Accepter l\'invitation', '{{ .ConfirmationURL }}'),
    note="Si vous ne connaissez pas l'expéditeur de cette invitation, ignorez cet e-mail."))
T['reauthentication'] = ('Votre code de confirmation HorizonsGPX',
  layout('Votre code de confirmation, valable quelques minutes.',
    'Code de confirmation',
    'Pour confirmer cette opération sensible sur votre compte HorizonsGPX, saisissez le code ci-dessous.',
    code='{{ .Token }}',
    note="Ce code expire rapidement. Ne le communiquez à personne : l'équipe HorizonsGPX ne vous le demandera jamais."))
T['password_changed_notification'] = ('Votre mot de passe HorizonsGPX a été modifié',
  layout('Le mot de passe de votre compte vient d\'être modifié.',
    'Mot de passe modifié',
    'Le mot de passe de votre compte HorizonsGPX vient d\'être modifié. Si c\'est bien vous, aucune action n\'est nécessaire.',
    outro='Si vous n\'êtes pas à l\'origine de ce changement, réinitialisez immédiatement votre mot de passe depuis la page de connexion (« Mot de passe oublié ») ou contactez-nous.'))
T['email_changed_notification'] = ('L\'adresse e-mail de votre compte HorizonsGPX a été modifiée',
  layout('L\'adresse e-mail de votre compte vient d\'être modifiée.',
    'Adresse e-mail modifiée',
    'L\'adresse e-mail de votre compte HorizonsGPX vient d\'être modifiée. Si c\'est bien vous, aucune action n\'est nécessaire.',
    outro='Si vous n\'êtes pas à l\'origine de ce changement, réinitialisez immédiatement votre mot de passe depuis la page de connexion (« Mot de passe oublié ») ou contactez-nous.'))
subjects = {}
for k, (subj, html) in T.items():
    open(f'{k}.html', 'w', encoding='utf-8').write(html)
    subjects[k] = subj
open('subjects.json', 'w', encoding='utf-8').write(json.dumps(subjects, ensure_ascii=False, indent=2))
print(len(T), 'modèles générés')
