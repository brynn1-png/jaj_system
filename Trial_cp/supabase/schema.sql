-- RFID Attendance System - Supabase schema
-- Run in Supabase SQL editor to provision a fresh database for this app.
-- This script is idempotent and safe to re-run.

--
-- Schema setup
--
set search_path = public;

-- ==========================
-- Tables
-- ==========================
create table if not exists public.students (
  id bigint generated always as identity primary key,
  rfid text not null unique,
  name text not null,
  email text,
  parent_phone text,
  grade varchar(255),
  avatar text,
  archived boolean not null default false,
  archived_at timestamp without time zone,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_students_rfid on public.students(rfid);
create index if not exists idx_students_grade on public.students(grade);

create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  rfid_tag text,
  date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  student_name text,
  grade varchar(255),
  time time without time zone not null default (now()::time),
  timestamp timestamp without time zone not null default now(),
  constraint attendance_unique_per_day unique (student_id, date)
);

create index if not exists idx_attendance_date on public.attendance(date);
create index if not exists idx_attendance_section on public.attendance(section);
create index if not exists idx_attendance_student on public.attendance(student_id);

create table if not exists public.rfid_scans (
  rfid_tag text not null,
  scanned_at timestamp without time zone not null default now(),
  student_id bigint null,
  processed boolean not null default false,
  created_at timestamp without time zone not null default now(),
  constraint rfid_scans_student_id_fkey foreign key (student_id) references students (id) on delete set null
) TABLESPACE pg_default;

create index if not exists idx_rfid_scans_rfid_tag on public.rfid_scans using btree (rfid_tag) TABLESPACE pg_default;

create index if not exists idx_rfid_scans_scanned_at on public.rfid_scans using btree (scanned_at) TABLESPACE pg_default;

create index if not exists idx_rfid_scans_processed on public.rfid_scans using btree (processed) TABLESPACE pg_default;

ALTER TABLE public.rfid_scans ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;

create table if not exists public.student_sms (
  id bigint generated always as identity primary key,
  student_rfid text,
  student_name text,
  parent_phone text,
  message text,
  timestamp timestamp without time zone not null default now(),
  status text default 'sent',
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_student_sms_created_at on public.student_sms(created_at);

-- ==========================
-- Triggers / functions
-- ==========================
create or replace function public.populate_attendance_fields()
returns trigger as $$
begin
  if new.student_name is null then
    select s.name into new.student_name from public.students s where s.id = new.student_id;
  end if;
  if new.grade is null then
    select s.grade into new.grade from public.students s where s.id = new.student_id;
  end if;
  if new.timestamp is null then
    new.timestamp := now();
  end if;
  if new.time is null then
    new.time := now()::time;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_populate_attendance on public.attendance;
create trigger trg_populate_attendance
before insert on public.attendance
for each row execute function public.populate_attendance_fields();

-- ==========================
-- Storage bucket setup (Manual Setup Required)
-- ==========================
-- NOTE: Due to permission restrictions, you need to set up storage manually:
--
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create a new bucket named 'avatars'
-- 3. Make it public
-- 4. Set the following policies in the bucket's Policies tab:
--
-- Policy 1 (Read Access):
--   - Operation: SELECT
--   - Target roles: anon, authenticated
--   - Using expression: bucket_id = 'avatars'
--
-- Policy 2 (Upload Access):
--   - Operation: INSERT
--   - Target roles: anon, authenticated
--   - Using expression: bucket_id = 'avatars'
--
-- Policy 3 (Update Access):
--   - Operation: UPDATE
--   - Target roles: authenticated
--   - Using expression: bucket_id = 'avatars'
--
-- Policy 4 (Delete Access):
--   - Operation: DELETE
--   - Target roles: authenticated
--   - Using expression: bucket_id = 'avatars'
--
-- Alternative: Use the Supabase CLI if you have it installed:
-- supabase storage create avatars --public

-- ==========================
-- Row Level Security (RLS)
-- NOTE: Policies below are permissive for development (anon can read/write).
--       Lock these down for production.
-- ==========================
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.rfid_scans enable row level security;
alter table public.student_sms enable row level security;

-- Students policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'students' AND policyname = 'students_select_anon'
  ) THEN
    CREATE POLICY students_select_anon ON public.students FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'students' AND policyname = 'students_insert_anon'
  ) THEN
    CREATE POLICY students_insert_anon ON public.students FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'students' AND policyname = 'students_update_anon'
  ) THEN
    CREATE POLICY students_update_anon ON public.students FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Attendance policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance' AND policyname = 'attendance_select_anon'
  ) THEN
    CREATE POLICY attendance_select_anon ON public.attendance FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance' AND policyname = 'attendance_insert_anon'
  ) THEN
    CREATE POLICY attendance_insert_anon ON public.attendance FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance' AND policyname = 'attendance_update_anon'
  ) THEN
    CREATE POLICY attendance_update_anon ON public.attendance FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END$$;

-- RFID Scans policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rfid_scans' AND policyname = 'rfid_scans_select_anon'
  ) THEN
    CREATE POLICY rfid_scans_select_anon ON public.rfid_scans FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rfid_scans' AND policyname = 'rfid_scans_insert_anon'
  ) THEN
    CREATE POLICY rfid_scans_insert_anon ON public.rfid_scans FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rfid_scans' AND policyname = 'rfid_scans_update_anon'
  ) THEN
    CREATE POLICY rfid_scans_update_anon ON public.rfid_scans FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rfid_scans' AND policyname = 'rfid_scans_delete_anon'
  ) THEN
    CREATE POLICY rfid_scans_delete_anon ON public.rfid_scans FOR DELETE USING (true);
  END IF;
END$$;

-- Student SMS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_sms' AND policyname = 'student_sms_select_anon'
  ) THEN
    CREATE POLICY student_sms_select_anon ON public.student_sms FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_sms' AND policyname = 'student_sms_insert_anon'
  ) THEN
    CREATE POLICY student_sms_insert_anon ON public.student_sms FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_sms' AND policyname = 'student_sms_update_anon'
  ) THEN
    CREATE POLICY student_sms_update_anon ON public.student_sms FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END$$;

-- ==========================
-- Realtime publication
-- ==========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rfid_scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rfid_scans;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_sms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_sms;
  END IF;
END$$;

-- ==========================
-- Optional sample data (comment out in production)
-- ==========================
-- insert into public.students (rfid, name, email, parent_phone, grade, section, avatar)
-- values ('STU001','John Doe','john@example.com','+1 555 111 2222','10','A','JD'),
--        ('STU002','ane Smith','jane@example.com','+1 555 333 4444','11','B','JS');
--
-- insert into public.attendance (student_id, date, status)
-- values (1, current_date, 'present'), (2, current_date, 'absent');
