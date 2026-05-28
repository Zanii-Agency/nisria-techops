-- Allow our richer message status vocabulary (new|drafted|replied|archived|closed...).
alter table messages drop constraint if exists messages_status_check;

-- Remove automated / outgoing approvals from Needs You; archive automated inbound.
update action_intents set status = 'cancelled'
where id in (
  select intent_id from approvals
  where kind = 'email_reply' and intent_id is not null and (
    proposed->>'to' ~* '(no-?reply|notify|notification|donorbox|givebutter|google|railway|kra\.go\.ke|accounts@|mailer|automated|updates@)'
    or proposed->>'to' = 'nur@nisria.co'
  )
);

delete from approvals
where status = 'pending' and kind = 'email_reply' and (
  proposed->>'to' ~* '(no-?reply|notify|notification|donorbox|givebutter|google|railway|kra\.go\.ke|accounts@|mailer|automated|updates@)'
  or proposed->>'to' = 'nur@nisria.co'
);

update messages set status = 'archived'
where direction = 'in' and sender_type = 'automated' and status in ('new', 'drafted');

select (select count(*) from approvals where status = 'pending') pending,
       (select count(*) from messages where direction = 'in' and status = 'new' and sender_type = 'individual') real_new;
