-- R2-5 (#44): per-account branded email signatures.
-- Every outbound email gets a signature chosen by the SENDING ACCOUNT
-- (sasa@nisria.co -> Nisria branding, maisha@nisria.co -> Maisha). The
-- signature is editable from Settings and stored here. The logo is referenced
-- by URL (https://command.nisria.co/logo.png) rather than inlined, so the
-- signature row stays small and the image is served from the public asset.
--
-- Applied to the live project (ptvhqudonvvszupzhcfl) via the Management API on
-- 2026-05-26. This file is the reproducible record.

alter table email_accounts add column if not exists signature_html text;

-- Seed sensible defaults per account (only where none set yet).
update email_accounts set signature_html =
'<table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid #e3e5e8;padding-top:14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a2d31;font-size:13px;line-height:1.5"><tr><td style="vertical-align:top;padding-right:14px"><img src="https://command.nisria.co/logo.png" alt="Nisria" width="52" height="52" style="display:block;border-radius:10px"/></td><td style="vertical-align:top"><div style="font-weight:700;font-size:14px;color:#15171a">By Nisria Inc</div><div style="color:#00A8A6;font-size:12px;font-weight:600">Helping children and families in Kenya</div><div style="margin-top:6px;color:#667;font-size:11.5px">sasa@nisria.co &nbsp;|&nbsp; nisria.co</div><div style="color:#889;font-size:11px;margin-top:2px">501(c)(3) nonprofit &middot; EIN 88-3508268</div></td></tr></table>'
where address = 'sasa@nisria.co' and (signature_html is null or signature_html = '');

update email_accounts set signature_html =
'<table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid #e3e5e8;padding-top:14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a2d31;font-size:13px;line-height:1.5"><tr><td style="vertical-align:top;padding-right:14px"><img src="https://command.nisria.co/logo.png" alt="Maisha" width="52" height="52" style="display:block;border-radius:10px"/></td><td style="vertical-align:top"><div style="font-weight:700;font-size:14px;color:#15171a">Maisha</div><div style="color:#F0746B;font-size:12px;font-weight:600">A By Nisria Inc initiative</div><div style="margin-top:6px;color:#667;font-size:11.5px">maisha@nisria.co &nbsp;|&nbsp; nisria.co</div><div style="color:#889;font-size:11px;margin-top:2px">a By Nisria Inc brand &middot; EIN 88-3508268</div></td></tr></table>'
where address = 'maisha@nisria.co' and (signature_html is null or signature_html = '');
