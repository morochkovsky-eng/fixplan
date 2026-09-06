alter type public.cleaning_status add value if not exists 'offered' after 'draft';
alter type public.cleaning_status add value if not exists 'declined' after 'accepted';
