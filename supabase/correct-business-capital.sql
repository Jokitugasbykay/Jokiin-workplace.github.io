-- Already executed on 26 October 2026 (WIB). Re-running does not add funding.
UPDATE public.business_bookkeeping_records
SET gross_amount=500000,net_amount=400000,updated_at=now(),
 description=description || E'\nKoreksi 26 Oktober 2026: dana awal kakak Rp500.000, pribadi Kayla Rp100.000, pendanaan bisnis Rp400.000. Bukan omzet atau bukti saldo kas tersedia.'
WHERE category='capital_injection' AND gross_amount=400000 AND net_amount=300000
RETURNING id,category,gross_amount,net_amount;
