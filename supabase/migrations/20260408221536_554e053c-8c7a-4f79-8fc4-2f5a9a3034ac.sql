CREATE TYPE public.payment_category AS ENUM ('mao_de_obra_projeto', 'mao_de_obra_extras', 'insumos_extras');
ALTER TABLE public.payments ADD COLUMN category public.payment_category NOT NULL DEFAULT 'mao_de_obra_projeto';
