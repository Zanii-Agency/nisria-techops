-- Our own outgoing (@nisria.co) + government (.go.ke) are never "individuals needing reply".
update messages m set sender_type = 'automated'
from contacts c
where m.contact_id = c.id and m.direction = 'in'
  and (lower(c.email) like '%@nisria.co' or lower(c.email) like '%.go.ke' or lower(c.email) like '%.gov%');

-- archive everything now reclassified automated that's still sitting in new/drafted
update messages set status = 'archived'
where direction = 'in' and sender_type = 'automated' and status in ('new', 'drafted');

select (select count(*) from messages where status = 'archived') archived,
       (select count(*) from messages where direction = 'in' and status = 'new' and sender_type = 'individual') indiv_new;
