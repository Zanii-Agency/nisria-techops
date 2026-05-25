-- Clean slate: clear queued email replies + re-open individual mail so the
-- stricter agent (no_reply detection) re-triages. Keeps donor thank-yous.
update action_intents set status = 'cancelled'
where id in (select intent_id from approvals where kind = 'email_reply' and status = 'pending' and intent_id is not null);

delete from approvals where kind = 'email_reply' and status = 'pending';

update messages set status = 'new'
where direction = 'in' and sender_type = 'individual' and status = 'drafted';

select (select count(*) from approvals where status = 'pending') pending,
       (select count(*) from messages where direction = 'in' and status = 'new' and sender_type = 'individual') to_process;
